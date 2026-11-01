// The door iPad's gate (#/checkin/kiosk), on the client. The server checks every scan
// (convex/checkin/prof.ts requireScanner, convex/staff.ts); these parts only pick what the iPad
// shows. prof.tsx re-exports all four, so `import { DoorGate } from "./prof"` keeps working.
//   readDeviceToken() / newDeviceToken()   this browser's device token: 64 hex characters in
//                localStorage (in memory when localStorage is off).
//   <DoorGate>{(device) => <Scanner device={device} />}</DoorGate>   #/checkin/kiosk. A paired
//                iPad scans with its device token; a scanner signed in (on #/admin, on their own
//                phone) scans as themselves (device is undefined). The kiosk shows no Google
//                button: Google keeps its own sign-in in Safari after the app's Sign out, and its
//                account list would sign anyone in line back in as that staff member with one tap.
//                A professor or admin is never left signed in on a door iPad that anyone in line
//                can use to open #/admin or the attendance list: on an unpaired iPad they get the
//                pairing screen with Sign out (and are told to sign out of Google in Safari too),
//                and on a paired one they are signed out and told to sign out of Google in Safari
//                too, and the scanner opens when someone taps Open the scanner. Whenever a
//                scanner is signed in, the scanner shows who, when the sign-in ends (Google's
//                renewal never runs on the kiosk route) and a Sign out button.
//   <PairScreen me={me} token={token} status={status} />   the pairing code an unpaired iPad shows.
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { SignedInAs, useGoogleUser } from "../../blocks/auth";
import { Button } from "../../blocks/kit";
import { Big, Card, Screen, Status } from "../../blocks/ui";
import { isProfRole, KioskScreen, NotStaff, useStaff, type StaffMe } from "./prof";
import { clock, why } from "./util";

// A door iPad doesn't sign in. The first time it opens #/checkin/kiosk it makes a device token
// (32 random bytes from crypto.getRandomValues, as 64 lower-case hex characters) and keeps it in
// localStorage, so a reload keeps its pairing. It asks the server for a pairing code (6 digits,
// or 8 while open requests hold every 6-digit code); a professor or admin types that code on
// #/admin, and the iPad's status query flips to paired. The server keeps only the token's
// SHA-256. Unpairing on #/admin stops the token at once and brings this screen back.

const DEVICE = "rcc-live:door-device";
const TOKEN = /^[0-9a-f]{64}$/;
const deviceListeners = new Set<() => void>();
let unsaved: string | undefined; // the token when localStorage is off: it lasts until a reload

// This browser's device token, or undefined before it has one.
export function readDeviceToken(): string | undefined {
  try {
    const saved = localStorage.getItem(DEVICE);
    if (saved && TOKEN.test(saved)) return saved;
  } catch {
    /* localStorage is off: use the one in memory */
  }
  return unsaved;
}

// Makes this browser's device token and saves it. Returns it.
export function newDeviceToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const token = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  unsaved = token;
  try {
    localStorage.setItem(DEVICE, token);
  } catch {
    /* localStorage is off: kept in memory until a reload */
  }
  deviceListeners.forEach((l) => l());
  return token;
}

function subscribeDevice(l: () => void) {
  deviceListeners.add(l);
  return () => deviceListeners.delete(l);
}

function useDeviceToken() {
  return useSyncExternalStore(subscribeDevice, readDeviceToken, readDeviceToken);
}

// The professor or admin DoorGate signed out on this paired iPad, until someone taps Open the
// scanner. In sessionStorage, so it lasts through a reload and goes when the tab closes.
const SIGNED_OUT = "rcc-live:door-signed-out";
const signedOutListeners = new Set<() => void>();
let signedOutInMemory: string | null = null; // when sessionStorage is off: until a reload
function readSignedOut(): string | null {
  try {
    return sessionStorage.getItem(SIGNED_OUT);
  } catch {
    return signedOutInMemory;
  }
}
function saveSignedOut(email: string | null) {
  signedOutInMemory = email;
  try {
    if (email) sessionStorage.setItem(SIGNED_OUT, email);
    else sessionStorage.removeItem(SIGNED_OUT);
  } catch {
    /* sessionStorage is off: kept in memory */
  }
  signedOutListeners.forEach((l) => l());
}
function subscribeSignedOut(l: () => void) {
  signedOutListeners.add(l);
  return () => signedOutListeners.delete(l);
}

// When the scanner sign-in on this device ends (ms, the token's expiry less SIGN_IN_DROP_MS), kept
// while a scanner is signed in here, so a reload after it ran out (the tab closed or asleep, so
// auth's `ended` is off) still says "Your sign-in ended." instead of asking for a pairing code.
// No email. Cleared when nobody is signed in before that time (a sign-out), when someone who
// isn't a scanner signs in, and on Show a pairing code. In localStorage, so it outlasts the tab.
const SCANNER_ENDS = "rcc-live:kiosk-scanner-ends";
const scannerListeners = new Set<() => void>();
let scannerEndsInMemory: string | null = null; // when localStorage is off: until a reload
function readScannerEnds(): string | null {
  try {
    return localStorage.getItem(SCANNER_ENDS);
  } catch {
    return scannerEndsInMemory;
  }
}
function saveScannerEnds(at: number | null) {
  const value = at === null ? null : String(at);
  if (readScannerEnds() === value) return;
  scannerEndsInMemory = value;
  try {
    if (value) localStorage.setItem(SCANNER_ENDS, value);
    else localStorage.removeItem(SCANNER_ENDS);
  } catch {
    /* localStorage is off: kept in memory */
  }
  scannerListeners.forEach((l) => l());
}
function subscribeScannerEnds(l: () => void) {
  scannerListeners.add(l);
  return () => scannerListeners.delete(l);
}

export function DoorGate({ children }: { children: (device: string | undefined) => ReactNode }) {
  const me = useStaff();
  const { user, signOut, ended } = useGoogleUser();
  const [pairAnyway, setPairAnyway] = useState(false);
  const token = useDeviceToken();
  const status = useQuery(api.staff.deviceStatus, token ? { token } : "skip");
  useEffect(() => {
    if (!token) newDeviceToken();
  }, [token]);
  // A professor or admin still signed in on a paired iPad (say, after approving its code on its
  // own #/admin) is signed out: the iPad scans with its pairing, and their sign-in would let
  // anyone in line open #/admin or the attendance list.
  // The app's Sign out leaves Google's own sign-in in Safari, so #/admin on this iPad would offer
  // "Continue as" them to anyone in line. The step to sign out of Google stays on screen after the
  // sign-out (kept in sessionStorage, so a reload keeps it) until someone taps Open the scanner.
  const paired = !!token && status?.status === "paired";
  const staffOnPairedIPad = paired && !!me && isProfRole(me.role);
  const saved = useSyncExternalStore(subscribeSignedOut, readSignedOut, readSignedOut);
  const leaving = staffOnPairedIPad && me ? me.email : null;
  const left = leaving ?? saved;
  useEffect(() => {
    if (!leaving) return;
    saveSignedOut(leaving);
    signOut();
  }, [leaving, signOut]);
  const scannerEnds = Number(useSyncExternalStore(subscribeScannerEnds, readScannerEnds, readScannerEnds) ?? NaN);
  const exp = user?.exp;
  const ranOut = me === null && scannerEnds <= Date.now();
  useEffect(() => {
    if (paired) saveScannerEnds(null);
    else if (me?.role === "scanner" && typeof exp === "number") saveScannerEnds(exp - SIGN_IN_DROP_MS);
    else if (me || (me === null && !ranOut)) saveScannerEnds(null);
  }, [paired, me, exp, ranOut]);

  if (paired && left)
    return (
      <KioskScreen>
        {staffOnPairedIPad ? <Status kind="loading">Signing out {left}…</Status> : <p>Signed out {left} on this iPad.</p>}
        <p>This iPad is paired, so it scans passes with nobody signed in.</p>
        <p>
          Now sign out of Google in Safari too (google.com, your picture, Sign out): Google keeps its own sign-in, and anyone in line could pick your
          account from Google&apos;s list on #/admin to sign in as you.
        </p>
        <p>
          {staffOnPairedIPad ? (
            <Button variant="secondary" onClick={signOut}>Sign out</Button>
          ) : (
            <Button onClick={() => saveSignedOut(null)}>Open the scanner</Button>
          )}
        </p>
      </KioskScreen>
    );
  if (token && status?.status === "paired") return <WhoIsSignedIn>{children(token)}</WhoIsSignedIn>;
  if (me?.role === "scanner") return <WhoIsSignedIn ends>{children(undefined)}</WhoIsSignedIn>;
  // (status can't be "paired" here; saying so lets TypeScript narrow it for PairScreen.)
  if (me === undefined || !token || status === undefined || status.status === "paired")
    return (
      <KioskScreen>
        <Status kind="loading">Checking this iPad…</Status>
      </KioskScreen>
    );
  // A sign-in ran out here: on this page (`ended`), or a scanner's on this device before a reload
  // (ranOut). Google's renewal never runs on this route. This can be the scanner's own phone or
  // the door iPad (a scanner can sign in on an unpaired one), so it says to sign in on your own
  // phone, and the pairing code is one tap away for a door iPad. It shows over an open pairing
  // code too (status "waiting").
  if ((ended || ranOut) && me === null && !pairAnyway)
    return (
      <KioskScreen>
        <p>Your sign-in ended. On your own phone, sign in again on #/admin, then open #/checkin/kiosk there.</p>
        <p className="muted">Nobody signs in to Google on this iPad. Google keeps the account in Safari, and anyone in line could sign in with it.</p>
        <p>
          <Button
            variant="secondary"
            onClick={() => {
              saveScannerEnds(null);
              setPairAnyway(true);
            }}
          >
            Show a pairing code
          </Button>
        </p>
      </KioskScreen>
    );
  return <PairScreen me={me} token={token} status={status} />;
}

// The scanner, with "Signed in as …" and Sign out above it whenever someone is signed in on the
// iPad (a scanner, or anyone signed in on a paired iPad who isn't staff), so the next person at
// the door can see the sign-in and end it. `ends`: the scanner opened for this sign-in, so it also
// says when the sign-in ends. Google's renewal never runs on #/checkin/kiosk (auth.tsx noPromptHere),
// so the scanner closes then with no other warning.
function WhoIsSignedIn({ ends, children }: { ends?: boolean; children: ReactNode }) {
  const { user } = useGoogleUser();
  if (!user) return <>{children}</>;
  return (
    <>
      <div style={{ padding: "8px 24px 0" }}>
        <SignedInAs />
        {ends && typeof user.exp === "number" && (
          <p className="muted">Your sign-in ends at {clock(user.exp - SIGN_IN_DROP_MS)}. After that, sign in again on #/admin.</p>
        )}
      </div>
      {children}
    </>
  );
}

// A sign-in ends this long before its token runs out (DROP in src/blocks/auth.tsx).
const SIGN_IN_DROP_MS = 60_000;

type Code = { code: string; expiresAt: number };
type Unpaired = { status: "none" } | ({ status: "waiting" } & Code);

// "482913" as "482 913" and "48291305" as "4829 1305", easier to read across a room. #/admin
// ignores the space. A code has 8 digits only while open requests hold every 6-digit one.
const spaced = (code: string) => {
  const half = code.length / 2;
  return `${code.slice(0, half)} ${code.slice(half)}`;
};

// True once `at` has passed. Renders again at that moment.
function usePassed(at: number | undefined) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (at === undefined) return;
    const wait = at - Date.now();
    if (wait <= 0) {
      setNow(Date.now());
      return;
    }
    const t = setTimeout(() => setNow(Date.now()), wait);
    return () => clearTimeout(t);
  }, [at]);
  return at !== undefined && at <= now;
}

const CLOCK_TRIP_MS = 5_000;

// How far this screen's clock runs ahead of the server's, in ms (negative: behind), from one
// checkin.attendance.clock call when the screen opens, the same estimate LateBanner.tsx makes.
// 0 (the screen's own clock, as LateBanner uses) until the answer comes back, and when the call
// fails or took over 5 s, since an answer that slow could be off by minutes. `known` turns true
// once the answer is in, the call fails, or 5 s pass; until then `ahead` is only a placeholder.
function useClockAhead(): { ahead: number; known: boolean } {
  const serverClock = useMutation(api.checkin.attendance.clock);
  const [ahead, setAhead] = useState(0);
  const [known, setKnown] = useState(false);
  useEffect(() => {
    const sent = Date.now();
    let late = false;
    const timer = setTimeout(() => {
      late = true;
      setKnown(true);
    }, CLOCK_TRIP_MS);
    serverClock({}).then(
      (server) => {
        const back = Date.now();
        if (!late && typeof server === "number" && Number.isFinite(server) && back - sent <= CLOCK_TRIP_MS) setAhead((sent + back) / 2 - server);
        clearTimeout(timer);
        setKnown(true);
      },
      () => {
        clearTimeout(timer);
        setKnown(true);
      },
    );
    return () => clearTimeout(timer);
  }, [serverClock]);
  return { ahead, known };
}

// The pairing screen, shown from the status query (api.staff.deviceStatus). It asks for a code
// when it opens, unless this iPad is waiting on one already (a reload shows the same code). The
// server ends a code only when its 10 minutes run out (approval shows "paired" instead), so a
// code that goes away always shows "The code expired." and waits for a press on "Get a new code",
// even when the iPad's clock is behind the server's. A tab left open somewhere doesn't keep
// making codes.
export function PairScreen({ me, token, status }: { me: StaffMe; token: string; status: Unpaired }) {
  const request = useMutation(api.staff.requestPairing);
  const { signOut } = useGoogleUser();
  const [phase, setPhase] = useState<"asking" | "showing" | "expired" | "error">(status.status === "waiting" ? "showing" : "asking");
  const [error, setError] = useState("");
  const asked = useRef(false);

  // The code comes back through the status query, as does "paired" (then DoorGate opens the scanner).
  const ask = useCallback(async () => {
    setPhase("asking");
    setError("");
    try {
      await request({ token });
    } catch (e) {
      setError(why(e));
      setPhase("error");
    }
  }, [request, token]);

  useEffect(() => {
    if (asked.current) return;
    asked.current = true;
    if (status.status !== "waiting") void ask();
  }, [ask, status.status]);

  useEffect(() => {
    if (status.status === "waiting") {
      setPhase("showing");
    } else if (phase === "showing") {
      setPhase("expired");
    }
  }, [status, phase]);

  // expiresAt is the server's time. On this iPad's clock the code ends `ahead` ms later, so an iPad
  // whose clock runs fast still shows a code the server takes, once the server's clock answers.
  // Until then, a waiting code already past by this iPad's clock shows "Getting a code…": on a
  // reload of a fast iPad it would otherwise flash "The code expired." before the code.
  const { ahead, known } = useClockAhead();
  const expired = usePassed(status.status === "waiting" ? status.expiresAt + ahead : undefined);
  const live = status.status === "waiting" && !expired ? status : null;
  const unsure = status.status === "waiting" && expired && !known;

  return (
    <Screen title="Pair this iPad" wide>
      {live ? (
        <>
          <Big value={spaced(live.code)} label="pairing code" />
          <p>A professor or admin types this code on #/admin, under Pair a door iPad. Then this iPad scans passes.</p>
          <p className="muted">The code works until {clock(live.expiresAt + ahead)}.</p>
        </>
      ) : phase === "error" ? (
        <>
          <Status kind="error">{error}</Status>
          <p>
            <Button onClick={() => void ask()}>Try again</Button>
          </p>
        </>
      ) : !unsure && (phase === "expired" || (phase === "showing" && status.status === "waiting")) ? (
        <>
          <p>The code expired.</p>
          <p>
            <Button onClick={() => void ask()}>Get a new code</Button>
          </p>
        </>
      ) : (
        <Status kind="loading">Getting a code…</Status>
      )}
      {me !== null && isProfRole(me.role) ? (
        <Card title="Signed in on this iPad">
          <p>
            {me.email} is signed in as {me.role === "admin" ? "an admin" : "a professor"}. The door iPad opens the scanner only once it's paired or a
            scanner signs in, so nobody in line can open #/admin or the attendance list on your account.
          </p>
          <p>
            Sign out here. Then sign out of Google in Safari too (google.com, your picture, Sign out): Google keeps its own sign-in, and anyone in line
            could pick your account from Google's list to sign in as you. Then type the code above on #/admin, under Pair a door iPad, from your own
            laptop or phone.
          </p>
          <p>
            <Button variant="secondary" onClick={signOut}>Sign out</Button>
          </p>
        </Card>
      ) : (
        <Card title="Scanners">
          {me === null ? (
            <>
              <p>On your own phone, sign in on #/admin, then open #/checkin/kiosk there.</p>
              <p className="muted">A scanner's sign-in ends in under an hour. A paired iPad scans for the whole class.</p>
              <p className="muted">Nobody signs in to Google on this iPad. Google keeps the account in Safari, and anyone in line could sign in with it.</p>
            </>
          ) : (
            <NotStaff me={me} />
          )}
        </Card>
      )}
    </Screen>
  );
}
