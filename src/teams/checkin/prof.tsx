// Who may use the professor pages and the door scanner, on the client. The server checks every
// call (convex/checkin/prof.ts, convex/staff.ts); these parts only pick what a page shows. No page
// sends a key: the server reads who is calling from their sign-in.
//   useStaff()   the signed-in person: undefined while loading, null when signed out, else
//                { email, role, canHoldRole } from api.staff.me (role: "admin", "professor",
//                "scanner" or null).
//   <StaffGate title="Live quiz">...</StaffGate>   the page, for professors and admins. Anyone
//                else sees how to sign in, or why their sign-in doesn't open it.
//   <SignInEnding />   for the 5 minutes before a Google sign-in ends, its end time and Google's
//                button pinned to the bottom of the page (StaffGate and #/admin show it; #/live
//                and #/checkin/student show it with line={STUDENT_ENDING}).
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
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../../convex/_generated/api";
import { GoogleButton, SignedInAs, SignInButton, useGoogleUser } from "../../blocks/auth";
import { Banner, BannerStack, Button } from "../../blocks/kit";
import { Big, Card, Screen, Status } from "../../blocks/ui";
import { clock, why } from "./util";

export type StaffMe = FunctionReturnType<typeof api.staff.me>;
export type Role = NonNullable<StaffMe>["role"];

// Professors and admins: who the professor pages open for.
const isProfRole = (role: Role | undefined) => role === "professor" || role === "admin";

// The signed-in person as the server's staff checks see them. It waits for Convex to accept the
// sign-in first, so a page never shows the signed-out screen for a moment before the real one.
export function useStaff(): StaffMe | undefined {
  const { isLoading } = useConvexAuth();
  const me = useQuery(api.staff.me, isLoading ? "skip" : {});
  return isLoading ? undefined : me;
}

// True for a Google ID token whose email Google hasn't verified. The server gives such a sign-in
// no role (provenEmail in convex/checkin/prof.ts), and this is the same token Convex was sent.
const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];
function isUnverifiedGoogle(token: string | undefined) {
  if (!token) return false;
  try {
    const p = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return GOOGLE_ISSUERS.includes(p.iss) && p.email_verified !== true;
  } catch {
    return false;
  }
}

// What a staff page shows to someone it doesn't open for, and how they get in. A sign-in that
// can't hold a role gets Sign out, which brings back the Google button: Convex keeps using the
// token it has until it refreshes it, so a new sign-in made on top of the old one wouldn't reach
// the server before a reload. A Google account is told its email isn't verified; a typed
// sign-in (on prod, or on dev without a test email) is told to use Google.
export function NotStaff({ me }: { me: StaffMe }) {
  const { user, signOut } = useGoogleUser();
  if (me === null)
    return (
      <>
        <p>Sign in with the Google account your admin added.</p>
        <SignInButton />
      </>
    );
  if (!me.canHoldRole && isUnverifiedGoogle(user?.token))
    return (
      <>
        <p>Google hasn't verified {me.email}, so the app can't check that it's yours. Verify the email in your Google account, then sign out and sign in again.</p>
        <p>
          <Button variant="secondary" onClick={signOut}>Sign out</Button>
        </p>
      </>
    );
  if (!me.canHoldRole)
    return (
      <>
        <p>Staff sign in with Google, so the app can check that {me.email} is yours. Sign out, then sign in with Google.</p>
        <p>
          <Button variant="secondary" onClick={signOut}>Sign out</Button>
        </p>
      </>
    );
  return (
    <>
      <p>
        {me.role === "scanner"
          ? `${me.email} is on the staff list as a scanner, so you can scan passes at the door but can't open this page. Ask an admin to make you a professor on #/admin.`
          : `${me.email} isn't on the staff list. Ask an admin to add you on #/admin.`}
      </p>
      <p>
        <Button variant="secondary" onClick={signOut}>Sign out</Button>
      </p>
    </>
  );
}

// A professor page: its children for professors and admins, the sign-in or the reason for
// everyone else, under the page's title.
export function StaffGate({ title, children }: { title: string; children: ReactNode }) {
  const me = useStaff();
  if (me && isProfRole(me.role))
    return (
      <>
        <SignInEnding />
        {children}
      </>
    );
  return (
    <Screen title={title} wide>
      {me === undefined ? <Status kind="loading">Checking who is signed in…</Status> : <NotStaff me={me} />}
    </Screen>
  );
}

// A Google sign-in ends a minute before its ID token runs out (an hour after sign-in). Chrome
// renews it with no click, but Safari and Firefox show Google's One Tap card, which needs one, so
// for the last 5 minutes this says when the sign-in ends and shows Google's button, which works in
// every browser. Signing in again keeps the page open; nothing shows once the new sign-in comes.
// Student pages (#/live, #/checkin/student) pass their own `line` (STUDENT_ENDING), since the
// page stays open for them but signs them out.
export const STUDENT_ENDING = "Sign in with Google again before then, or this page signs you out.";
export function SignInEnding({ line = "Sign in with Google again before then to keep this page open." }: { line?: string }) {
  const { endsAt } = useGoogleUser();
  if (endsAt == null) return null;
  return (
    <BannerStack>
      <Banner tone="warn" title={`Your sign-in ends at ${clock(endsAt)}.`} action={<GoogleButton />}>
        {line}
      </Banner>
    </BannerStack>
  );
}

// ---------- The door iPad ----------
// A door iPad doesn't sign in. The first time it opens #/checkin/kiosk it makes a device token
// (32 random bytes from crypto.getRandomValues, as 64 lower-case hex characters) and keeps it in
// localStorage, so a reload keeps its pairing. It asks the server for a 6-digit code; a professor
// or admin types that code on #/admin, and the iPad's status query flips to paired. The server
// keeps only the token's SHA-256. Unpairing on #/admin stops the token at once and brings this
// screen back.

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

export function DoorGate({ children }: { children: (device: string | undefined) => ReactNode }) {
  const me = useStaff();
  const { signOut, ended } = useGoogleUser();
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

  if (paired && left)
    return (
      <Screen title="Check-in kiosk" wide>
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
      </Screen>
    );
  if (token && status?.status === "paired") return <WhoIsSignedIn>{children(token)}</WhoIsSignedIn>;
  if (me?.role === "scanner") return <WhoIsSignedIn ends>{children(undefined)}</WhoIsSignedIn>;
  // (status can't be "paired" here; saying so lets TypeScript narrow it for PairScreen.)
  if (me === undefined || !token || status === undefined || status.status === "paired")
    return (
      <Screen title="Check-in kiosk" wide>
        <Status kind="loading">Checking this iPad…</Status>
      </Screen>
    );
  // A scanner's sign-in ran out here (most likely on their own phone: Google's renewal never runs
  // on this route). They sign in again; the pairing code is one tap away for a door iPad.
  if (ended && me === null && status.status === "none" && !pairAnyway)
    return (
      <Screen title="Check-in kiosk" wide>
        <p>Your sign-in ended. Sign in again on #/admin, then open #/checkin/kiosk.</p>
        <p>
          <Button variant="secondary" onClick={() => setPairAnyway(true)}>Show a pairing code</Button>
        </p>
      </Screen>
    );
  return <PairScreen me={me} token={token} status={status} />;
}

// The scanner, with "Signed in as …" and Sign out above it whenever someone is signed in on the
// iPad (a scanner, or anyone signed in on a paired iPad who isn't staff), so the next person at
// the door can see the sign-in and end it. `ends`: the scanner opened for this sign-in, so it also
// says when the sign-in ends. Google's renewal never runs on #/checkin/kiosk (auth.tsx onDoorIPad),
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

// "482913" as "482 913", easier to read across a room. #/admin ignores the space.
const spaced = (code: string) => `${code.slice(0, 3)} ${code.slice(3)}`;

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

  const expired = usePassed(status.status === "waiting" ? status.expiresAt : undefined);
  const live = status.status === "waiting" && !expired ? status : null;

  return (
    <Screen title="Pair this iPad" wide>
      {live ? (
        <>
          <Big value={spaced(live.code)} label="pairing code" />
          <p>A professor or admin types this code on #/admin, under Pair a door iPad. Then this iPad scans passes.</p>
          <p className="muted">The code works until {clock(live.expiresAt)}.</p>
        </>
      ) : phase === "error" ? (
        <>
          <Status kind="error">{error}</Status>
          <p>
            <Button onClick={() => void ask()}>Try again</Button>
          </p>
        </>
      ) : phase === "expired" || (phase === "showing" && status.status === "waiting") ? (
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
