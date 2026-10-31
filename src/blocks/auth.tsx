// Block: sign-in. Google Identity Services gives the browser an ID token; Convex checks it
// (convex/auth.config.ts). Wrap the app in <AuthProvider>, put <SignInButton/> where people sign
// in, and read the user server-side with ctx.auth.getUserIdentity().
// <SignInButton/> shows Google's button with the typed sign-in (any name and email) under it, for
// staff screens; <StudentSignIn/> is the typed sign-in on its own, for student screens;
// <GoogleButton/> is Google's button on its own. Show any of them only to someone signed out:
// Convex keeps using the token it has until it refreshes it, so a new sign-in on top of a live
// one reaches the server only after a reload. Staff roles count only for a Google sign-in on
// prod (convex/checkin/prof.ts).
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ConvexProviderWithAuth, ConvexReactClient } from "convex/react";

export const GOOGLE_CLIENT_ID = "954308885597-kmeh8q5gajj5mh2vhnkgtgfd89e8son4.apps.googleusercontent.com";
const KEY = "rcc-live:google-id-token";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Google's script has no types package here
  interface Window { google?: any }
}

type Stored = { token: string; exp: number; name: string; email: string; picture: string };

function decode(token: string): Stored | null {
  try {
    const p = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return { token, exp: p.exp * 1000, name: p.name ?? "", email: p.email ?? "", picture: p.picture ?? "" };
  } catch {
    return null;
  }
}

// Whether Google issued this token (the typed sign-in has its own issuer, src/blocks/devLogin.ts).
function isGoogle(token: string) {
  try {
    const iss = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).iss;
    return iss === "https://accounts.google.com" || iss === "accounts.google.com";
  } catch {
    return false;
  }
}

function load(): Stored | null {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || "null") as Stored | null;
    return s && s.exp - 60_000 > Date.now() ? s : null;
  } catch {
    return null;
  }
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

// failed: Google's script didn't load (offline, or blocked), so its button can't show.
type AuthState = {
  user: Stored | null;
  ready: boolean;
  failed: boolean;
  signOut: () => void;
  renderButton: (el: HTMLElement) => void;
  signInWithToken: (token: string) => void;
};
const AuthContext = createContext<AuthState | null>(null);

export function useGoogleUser() {
  const a = useContext(AuthContext);
  if (!a) throw new Error("useGoogleUser needs <AuthProvider>");
  return a;
}

export function AuthProvider({ client, children }: { client: ConvexReactClient; children: ReactNode }) {
  const [user, setUser] = useState<Stored | null>(load);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    loadGsi()
      .then(() => {
        if (gsiReady) return setReady(true);
        gsiReady = true;
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: (r: { credential: string }) => {
            const s = decode(r.credential);
            if (!s) return;
            localStorage.setItem(KEY, JSON.stringify(s));
            setUser(s);
          },
          auto_select: true,
          itp_support: true,
        });
        setReady(true);
      })
      .catch(() => {
        setFailed(true);
        setReady(true);
      });
  }, []);

  // Google ID tokens last an hour, and a class runs longer. 5 minutes before one runs out, ask
  // Google for a new one: prompt() with auto_select signs the same account back in with no click,
  // and the callback above saves it in the old one's place. Convex reads the saved token on its
  // next refresh (useConvexAuth), so nobody is signed out and no page unmounts. If nothing comes,
  // ask once more 2 minutes before, then drop the token a minute before it runs out so the page
  // asks again. A typed sign-in never asks Google: that would swap the student for a Google
  // identity, which the server counts as a different person.
  useEffect(() => {
    if (!user) return;
    const left = user.exp - Date.now();
    const asks = ready && !failed && isGoogle(user.token) ? [left - 5 * 60_000, left - 2 * 60_000] : [];
    const timers = asks.map((ms) => setTimeout(() => window.google?.accounts.id.prompt(), Math.max(0, ms)));
    timers.push(setTimeout(() => { localStorage.removeItem(KEY); setUser(null); }, Math.max(0, left - 60_000)));
    return () => timers.forEach(clearTimeout);
  }, [user, ready, failed]);

  const signOut = useCallback(() => {
    localStorage.removeItem(KEY);
    window.google?.accounts.id.disableAutoSelect();
    setUser(null);
  }, []);

  const renderButton = useCallback(
    (el: HTMLElement) => {
      if (!ready || !window.google) return;
      window.google.accounts.id.renderButton(el, { theme: "outline", size: "large", shape: "pill", text: "continue_with" });
    },
    [ready],
  );

  // Signs in with a token made somewhere other than Google (the dev test sign-in).
  const signInWithToken = useCallback((token: string) => {
    const s = decode(token);
    if (!s) return;
    localStorage.setItem(KEY, JSON.stringify(s));
    setUser(s);
  }, []);

  const value = useMemo(
    () => ({ user, ready, failed, signOut, renderButton, signInWithToken }),
    [user, ready, failed, signOut, renderButton, signInWithToken],
  );

  return (
    <AuthContext.Provider value={value}>
      <ConvexProviderWithAuth client={client} useAuth={useConvexAuth}>
        {children}
      </ConvexProviderWithAuth>
    </AuthContext.Provider>
  );
}

// What Convex calls to get the token. A module-level hook, so its identity never changes.
function useConvexAuth() {
  const u = useContext(AuthContext)?.user ?? null;
  const fetchAccessToken = useCallback(async () => load()?.token ?? null, []);
  return { isLoading: false, isAuthenticated: !!u, fetchAccessToken };
}

// Google's "Continue with Google" button. Google's script draws it into this box once
// AuthProvider has loaded it; the box keeps the button's height meanwhile, so nothing under it
// jumps.
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

// Staff sign in here: Google's button, with the typed sign-in (a name and an email) under it.
export function SignInButton() {
  return (
    <div>
      <GoogleButton />
      <TestSignIn heading="Or type your name and email" />
    </div>
  );
}

// Students sign in here: the typed sign-in only. Google and the typed sign-in give the same email
// two identities (tokenIdentifier is issuer|subject), so a student who checked in one way and
// signs back in the other way would be a new student to the server: no check-in, a second pass,
// a second attendance row (ROLES-UI-risk-2). Students have typed since 2026-10-29, so they keep
// typing until prod stops taking typed sign-ins and this becomes Google's button.
export function StudentSignIn() {
  return <TestSignIn />;
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

// Typed sign-in: any name and email (convex/auth.config.ts). Anyone can type any email, so a
// typed sign-in holds a staff role only on a dev backend (convex/checkin/prof.ts).
function TestSignIn({ heading }: { heading?: string }) {
  const { signInWithToken } = useGoogleUser();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [err, setErr] = useState("");
  async function go(e: FormEvent) {
    e.preventDefault();
    try {
      const { mintTestToken } = await import("./devLogin");
      signInWithToken(await mintTestToken(name.trim() || email.trim(), email.trim()));
    } catch {
      setErr("Sign-in failed. Try again.");
    }
  }
  return (
    <form onSubmit={go} style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 16, alignItems: "center" }}>
      {heading && <strong style={{ width: "100%" }}>{heading}</strong>}
      <input value={name} onChange={(e) => setName(e.target.value)} aria-label="Your name" placeholder="Your name" required autoComplete="name" />
      <input value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Your email" placeholder="Your email" type="email" required autoComplete="email" />
      <button type="submit">Sign in</button>
      {err && <span role="alert">{err}</span>}
    </form>
  );
}
