// Block: sign-in. src/main.tsx wraps the app in <AuthProvider>. Show <StudentSignIn /> (student
// screens) or <SignInButton /> (staff screens) to someone signed out and <SignedInAs /> to someone
// signed in; on the server, ctx.auth.getUserIdentity() says who is calling.
//
// Two ways to sign in:
// - Google, in every build and on every backend. Google Identity Services gives the browser an ID
//   token that lasts an hour, and Convex checks it against Google's keys (convex/auth.config.ts).
//   Students and staff sign in this way on the live site. Google's script loads only on a page that
//   shows Google's button or for someone signed in with Google (to renew the token), so the
//   projector, the team board, #/portal and Home don't load it for someone signed out.
// - Typed test sign-in, in `npm run dev` builds only: any name and email, signed in the browser
//   with the key in src/blocks/devLogin.ts. That key is public in this repo, so a typed sign-in
//   proves nothing about who someone is: `npm run build` leaves the form and devLogin.ts out of
//   the live site, Convex accepts typed tokens only on the dev backends in convex/auth.config.ts,
//   and a live build drops one left in the browser. It lasts 12 hours and holds a staff role only
//   as convex/checkin/prof.ts allows.
//
// <StudentSignIn /> and <SignInButton /> show the same thing: Google's button, with the typed form
// under it in dev builds. Students and staff sign in the same way, so a student is one identity
// wherever they sign in (a Google and a typed sign-in with the same email are two people to the
// server: two passes, two attendance rows). <GoogleButton /> is Google's button on its own.
//
// The sign-in is kept in localStorage, so every tab of this site has the same one: signing in or
// out in one tab does the same in the others, and Convex always gets the sign-in the tab shows.
// When the server refuses the sign-in (its token ran out, or the backend doesn't accept that kind),
// it's dropped and the sign-in shows again under "The server didn’t accept that sign-in." A lost
// connection never drops it. A sign-in's hour (or 12 hours, typed) runs from when this page got
// the token, so a phone whose clock is wrong keeps it as long as the server does.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { ConvexProviderWithAuth, ConvexReactClient, useConvexAuth } from "convex/react";
import { Status } from "./ui";

export const GOOGLE_CLIENT_ID = "954308885597-kmeh8q5gajj5mh2vhnkgtgfd89e8son4.apps.googleusercontent.com";
const KEY = "rcc-live:google-id-token";
const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

declare global {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Google's script has no types package here
  interface Window { google?: any }
}

type Stored = { token: string; exp: number; name: string; email: string; picture: string };

const MIN = 60_000;
const WARN = 5 * MIN; // how long before the token runs out Google is asked and the page says so
const DROP = MIN; // how long before the token runs out the sign-in ends

// The typed form's limits: a name fits on a pass and the late banner; an email is at most 254
// characters (RFC 5321).
const NAME_MAX = 60;
const EMAIL_MAX = 254;

// The claims in a token's middle part, read as UTF-8 so "José Núñez" stays as typed, or null.
function claims(token: string): Record<string, unknown> | null {
  try {
    const base64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const p: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return p && typeof p === "object" ? (p as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const text = (v: unknown) => (typeof v === "string" ? v : "");

function decode(token: string): Stored | null {
  const p = claims(token);
  if (!p || typeof p.exp !== "number") return null;
  return { token, exp: p.exp * 1000, name: text(p.name), email: text(p.email), picture: text(p.picture) };
}

// A token this page just got (Google's callback or the typed form), timed by this device's clock:
// it ends as long after now as the token lasts (exp - iat). exp and iat are by the issuer's clock,
// so on a phone whose clock is an hour fast, comparing exp with Date.now() would drop a fresh
// Google sign-in at once. The server still judges the token by its own clock (DropRefused).
function received(token: string): Stored | null {
  const s = decode(token);
  const iat = claims(token)?.iat;
  return s && typeof iat === "number" ? { ...s, exp: Date.now() + (s.exp - iat * 1000) } : s;
}

// Whether Google issued this token (the typed sign-in has its own issuer, src/blocks/devLogin.ts).
function isGoogle(token: string) {
  return GOOGLE_ISSUERS.includes(text(claims(token)?.iss));
}

// Who a token says it is: its issuer and subject (for a typed sign-in, the email). The server
// keys people the same way (tokenIdentifier), so two tokens with the same personOf are one person
// to it.
function personOf(token: string) {
  const p = claims(token);
  return p ? `${text(p.iss)}|${text(p.sub) || text(p.email)}` : token;
}

// The token saved in localStorage, as it is, or null.
function savedToken(): string | null {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || "null") as Partial<Stored> | null;
    return typeof s?.token === "string" ? s.token : null;
  } catch {
    return null;
  }
}

// The saved sign-in, or null when there is none, it can't be read, it ends within a minute, or it
// is a typed sign-in in a live build (the live site signs in with Google, and prod refuses typed
// tokens). The name and email are read from the token itself, so a name saved garbled by an older
// version reads right; the end is the saved one, timed by this device's clock (received).
function load(): Stored | null {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || "null") as Partial<Stored> | null;
    if (typeof saved?.token !== "string") return null;
    const d = decode(saved.token);
    const s = d ? { ...d, exp: typeof saved.exp === "number" ? saved.exp : d.exp } : (saved as Stored);
    if (!import.meta.env.DEV && !isGoogle(s.token)) return null;
    return s.exp - MIN > Date.now() ? s : null;
  } catch {
    return null;
  }
}

function save(s: Stored) {
  localStorage.setItem(KEY, JSON.stringify(s));
}

let gsiPromise: Promise<void> | null = null;
let gsiReady = false; // initialize() once per page, even when React runs effects twice in dev
function loadGsi() {
  gsiPromise ??= new Promise((resolve, reject) => {
    const el = document.createElement("script");
    el.src = "https://accounts.google.com/gsi/client";
    el.async = true;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error("Google sign-in didn't load"));
    document.head.appendChild(el);
  });
  return gsiPromise;
}

// A Google sign-in whose token runs out within 5 minutes.
function ending(s: Stored | null) {
  return !!s && isGoogle(s.token) && s.exp - WARN <= Date.now();
}

// The door iPad (#/checkin/kiosk): Google's prompt never shows there, since anyone in line could
// tap its "Continue as <staff email>" card.
function onDoorIPad() {
  return /^#\/?checkin\/kiosk(?:[/?]|$)/.test(window.location?.hash ?? "");
}

// ready: Google's script has loaded (or failed to), so its button can show. It loads once a page
// asks for the button (renderButton) or someone is signed in with Google.
// failed: Google's script didn't load (offline, or blocked), so its button can't show.
// endsAt: when a Google sign-in ends, from 5 minutes before its token runs out (null otherwise; the
// sign-in ends a minute before the token does), for SignInEnding (src/teams/checkin/prof.tsx) to say
// so with Google's button.
// refused: the server refused the last sign-in, so it was dropped (DropRefused). SignInButton says
// so until the next sign-in or sign-out.
type AuthState = {
  user: Stored | null;
  ready: boolean;
  failed: boolean;
  endsAt: number | null;
  refused: boolean;
  signOut: () => void;
  renderButton: (el: HTMLElement) => void;
  signInWithToken: (token: string) => void;
};
// What AuthProvider also hands Convex's provider (useAuthForConvex).
type Shared = AuthState & { switching: boolean; fetchAccessToken: () => Promise<string | null> };
const AuthContext = createContext<Shared | null>(null);

export function useGoogleUser(): AuthState {
  const a = useContext(AuthContext);
  if (!a) throw new Error("useGoogleUser needs <AuthProvider>");
  return a;
}

export function AuthProvider({ client, children }: { client: ConvexReactClient; children: ReactNode }) {
  const [user, setUser] = useState<Stored | null>(load);
  const [gsi, setGsi] = useState<"off" | "loading" | "ready" | "failed">("off");
  // The token whose sign-in is in its last 5 minutes, so the page can say when it ends.
  const [endingToken, setEndingToken] = useState<string | null>(() => {
    const s = load();
    return ending(s) ? s!.token : null;
  });
  // Whether the server refused the last sign-in (AuthState.refused).
  const [refused, setRefused] = useState(false);
  // The person Convex was last told about. When the signed-in person changes (a sign-in, or another
  // account in another tab), Convex is told "loading" for one render first (switching), so it drops
  // the old sign-in and checks the new one from the start; DropRefused then knows the server's
  // answer is about this sign-in. Pages get the new person only in the next render, the one where
  // Convex hears signed in: Convex's provider then calls client.setAuth, which holds back every
  // call until the server has the token, before the pages' effects run. A page that got the person
  // during the switching render would send its first calls signed out ("Sign in first.").
  const me = user ? personOf(user.token) : null;
  const [told, setTold] = useState(me);
  useEffect(() => setTold(me), [me]);
  const switching = me !== null && me !== told;

  // Convex asks for the token when it connects and when the server says the one it has ran out. It
  // gets this tab's sign-in, kept in step with `user` before Convex's own effects run.
  const token = user?.token ?? null;
  const tokenRef = useRef(token);
  useLayoutEffect(() => {
    tokenRef.current = token;
  }, [token]);
  const fetchAccessToken = useCallback(async () => tokenRef.current, []);

  // Signs in with a token made somewhere other than Google (the typed test sign-in). Google's
  // callback signs in the same way.
  const signInWithToken = useCallback((t: string) => {
    const s = received(t);
    if (!s) return;
    save(s);
    setRefused(false);
    setUser(s);
  }, []);

  const wantGoogle = useCallback(() => setGsi((s) => (s === "off" ? "loading" : s)), []);
  useEffect(() => {
    if (gsi !== "loading") return;
    let live = true;
    loadGsi()
      .then(() => {
        if (!gsiReady) {
          gsiReady = true;
          window.google.accounts.id.initialize({
            client_id: GOOGLE_CLIENT_ID,
            callback: (r: { credential: string }) => signInWithToken(r.credential),
            auto_select: true,
            itp_support: true,
          });
        }
        if (live) setGsi("ready");
      })
      .catch(() => {
        if (live) setGsi("failed");
      });
    return () => {
      live = false;
    };
  }, [gsi, signInWithToken]);
  useEffect(() => {
    if (user && isGoogle(user.token)) wantGoogle();
  }, [user, wantGoogle]);

  // Another tab signed in, signed out or renewed the sign-in: this tab follows it. pageshow covers
  // a tab coming back from the browser's back-forward cache, which misses those events.
  useEffect(() => {
    const sync = () => {
      const next = load();
      if (next) setRefused(false);
      setUser((u) => (u?.token === next?.token ? u : next));
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY || e.key === null) sync();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("pageshow", sync);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("pageshow", sync);
    };
  }, []);

  // Google ID tokens last an hour, and a class runs longer. The sign-in ends a minute before its
  // token runs out (so no call goes out with a token about to lapse), unless another tab saved a
  // newer one by then. 5 minutes before the token runs out, two things happen, and the callback
  // above saves any new token in the old one's place (Convex reads it on its next refresh, so the
  // page stays open):
  // - prompt() asks Google for a new token. In Chrome (FedCM) auto_select signs the same account
  //   back in with no click, unless it did so in the last 10 minutes. Safari and Firefox show a
  //   One Tap card instead, which needs a click; anyone who dismissed the card gets none for a
  //   while. If nothing comes, it asks once more 2 minutes before the token runs out. Never on the
  //   door iPad (onDoorIPad).
  // - endsAt turns on, and professor pages and #/admin show the end time with Google's button
  //   (SignInEnding), which works in every browser.
  // A typed sign-in never asks Google: that would swap the student for a Google identity, which
  // the server counts as a different person.
  useEffect(() => {
    if (!user) return;
    const left = user.exp - Date.now();
    const google = isGoogle(user.token);
    const asks = google && gsi === "ready" ? [left - WARN, left - 2 * MIN] : [];
    const timers = asks.map((ms) => setTimeout(() => onDoorIPad() || window.google?.accounts.id.prompt(), Math.max(0, ms)));
    if (google) timers.push(setTimeout(() => setEndingToken(user.token), Math.max(0, left - WARN)));
    timers.push(
      setTimeout(() => {
        if (savedToken() === user.token) localStorage.removeItem(KEY);
        setUser(load());
      }, Math.max(0, left - DROP)),
    );
    return () => timers.forEach(clearTimeout);
  }, [user, gsi]);
  const endsAt = user && endingToken === user.token ? user.exp - DROP : null;

  const signOut = useCallback(() => {
    localStorage.removeItem(KEY);
    window.google?.accounts.id.disableAutoSelect();
    setRefused(false);
    setUser(null);
  }, []);

  // Draws Google's button into `el`, loading Google's script first if it hasn't loaded yet.
  const renderButton = useCallback(
    (el: HTMLElement) => {
      if (gsi !== "ready" || !window.google) return wantGoogle();
      window.google.accounts.id.renderButton(el, { theme: "outline", size: "large", shape: "pill", text: "continue_with" });
    },
    [gsi, wantGoogle],
  );

  // DropRefused: the server refused this token.
  const drop = useCallback((t: string) => {
    if (savedToken() === t) localStorage.removeItem(KEY);
    if (tokenRef.current === t) setRefused(true);
    setUser((u) => (u?.token === t ? null : u));
  }, []);

  const ready = gsi === "ready" || gsi === "failed";
  const failed = gsi === "failed";
  // During the switching render pages still see no one (see `told` above).
  const shown = switching ? null : user;
  const value = useMemo(
    () => ({ user: shown, ready, failed, endsAt, refused, signOut, renderButton, signInWithToken, switching, fetchAccessToken }),
    [shown, ready, failed, endsAt, refused, signOut, renderButton, signInWithToken, switching, fetchAccessToken],
  );

  return (
    <AuthContext.Provider value={value}>
      <ConvexProviderWithAuth client={client} useAuth={useAuthForConvex}>
        <DropRefused token={token} drop={drop} />
        {children}
      </ConvexProviderWithAuth>
    </AuthContext.Provider>
  );
}

// What Convex's provider calls to learn about the sign-in. A module-level hook, so its identity
// never changes. a.user is null during the switching render, so Convex hears signed in in the same
// render that hands pages the sign-in.
function useAuthForConvex() {
  const a = useContext(AuthContext)!;
  return { isLoading: a.switching, isAuthenticated: !!a.user, fetchAccessToken: a.fetchAccessToken };
}

// Drops the sign-in when the server refuses its token, so the sign-in shows again: a token that ran
// out, or a kind the backend doesn't accept (a typed sign-in once prod stopped taking them). It
// acts on a token only after seeing Convex check it (isLoading), which every sign-in goes through,
// whether saved from before or new (switching). A lost connection changes nothing here, so it never
// drops a sign-in.
function DropRefused({ token, drop }: { token: string | null; drop: (token: string) => void }) {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const checking = useRef<string | null>(null);
  useEffect(() => {
    if (!token) return;
    if (isLoading) checking.current = token;
    else if (!isAuthenticated && checking.current === token) drop(token);
  }, [token, isLoading, isAuthenticated, drop]);
  return null;
}

// Google's "Continue with Google" button. Google's script draws it into this box once it has
// loaded; the box keeps the button's height meanwhile, so nothing under it jumps.
export function GoogleButton() {
  const { renderButton, ready, failed } = useGoogleUser();
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (box.current) renderButton(box.current);
  }, [renderButton]);
  return (
    <div>
      <div ref={box} aria-busy={!ready} style={{ minHeight: 44 }} />
      {failed && <p className="muted">Google sign-in didn’t load. Check the connection, then reload the page.</p>}
    </div>
  );
}

// Staff screens: Google's button, with the typed test sign-in under it in `npm run dev` builds.
// A live build leaves TestSignIn, and with it src/blocks/devLogin.ts, out of the bundle. Above
// them, when the server refused the last sign-in, a line that says so (and in dev builds, where
// typed sign-ins work).
export function SignInButton() {
  const { refused } = useGoogleUser();
  return (
    <div>
      {refused && (
        <Status kind="error">
          The server didn’t accept that sign-in.
          {import.meta.env.DEV && " Test sign-ins work only on the dev backends in DEV_HOSTS in convex/auth.config.ts and convex/checkin/prof.ts."}
        </Status>
      )}
      <GoogleButton />
      {import.meta.env.DEV && <TestSignIn />}
    </div>
  );
}

// Student screens: the same as staff screens, Google's button with the typed test sign-in under
// it in `npm run dev` builds.
export function StudentSignIn() {
  return <SignInButton />;
}

// Who this browser is signed in as, so a student who typed the wrong email or picked up a
// friend's phone can sign out and sign in again: "Signed in as Jane Doe (jane@example.edu)" and a
// "Not you? Sign out" button. A name that is the email shows once. Nothing when signed out.
export function SignedInAs() {
  const { user, signOut } = useGoogleUser();
  if (!user) return null;
  const { name, email } = user;
  const who = name && email && name !== email ? `${name} (${email})` : name || email;
  return (
    <p className="row muted">
      <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>Signed in as {who}</span>
      <button type="button" className="quiet" onClick={signOut}>Not you? Sign out</button>
    </p>
  );
}

// The typed test sign-in (`npm run dev` only): a name and an email. The token is signed in the
// browser with crypto.subtle, which browsers give only to https pages and localhost, so the dev
// server's LAN address (http://192.168.x.x:5173 on a phone) says so instead of failing.
function TestSignIn() {
  const { signInWithToken } = useGoogleUser();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [err, setErr] = useState("");
  const heading = <strong style={{ width: "100%" }}>Test sign-in (dev only)</strong>;
  if (globalThis.isSecureContext === false)
    return (
      <div style={{ marginTop: 16 }}>
        {heading}
        <Status kind="error">Sign-in needs https. Open the live site or localhost.</Status>
      </div>
    );
  async function go(e: FormEvent) {
    e.preventDefault();
    const n = name.trim();
    const m = email.trim();
    // `required` lets a name of only spaces through, and the name shows on the pass, the door
    // iPad and the late banner, so it's never replaced with the email.
    if (!n) return setErr("Type your name.");
    setErr("");
    try {
      const { mintTestToken } = await import("./devLogin");
      signInWithToken(await mintTestToken(n.slice(0, NAME_MAX), m.slice(0, EMAIL_MAX)));
    } catch {
      setErr("Sign-in failed. Try again.");
    }
  }
  return (
    <form onSubmit={go} style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 16, alignItems: "center" }}>
      {heading}
      <input value={name} onChange={(e) => setName(e.target.value)} aria-label="Your name" placeholder="Your name" required maxLength={NAME_MAX} autoComplete="name" />
      <input value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Your email" placeholder="Your email" type="email" required maxLength={EMAIL_MAX} autoComplete="email" />
      <button type="submit">Sign in</button>
      {err && <Status kind="error">{err}</Status>}
    </form>
  );
}
