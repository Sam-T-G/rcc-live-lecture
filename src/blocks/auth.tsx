// Block: Google sign-in. Google Identity Services gives the browser an ID token; Convex
// checks it (convex/auth.config.ts). Wrap the app in <AuthProvider>, put <SignInButton/>
// where people sign in, and read the user server-side with ctx.auth.getUserIdentity().
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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

type AuthState = { user: Stored | null; ready: boolean; signOut: () => void; renderButton: (el: HTMLElement) => void };
const AuthContext = createContext<AuthState | null>(null);

export function useGoogleUser() {
  const a = useContext(AuthContext);
  if (!a) throw new Error("useGoogleUser needs <AuthProvider>");
  return a;
}

export function AuthProvider({ client, children }: { client: ConvexReactClient; children: ReactNode }) {
  const [user, setUser] = useState<Stored | null>(load);
  const [ready, setReady] = useState(false);

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
      .catch(() => setReady(true));
  }, []);

  // ID tokens last an hour. When one runs out, drop it so the page asks again.
  useEffect(() => {
    if (!user) return;
    const t = setTimeout(() => { localStorage.removeItem(KEY); setUser(null); }, Math.max(0, user.exp - 60_000 - Date.now()));
    return () => clearTimeout(t);
  }, [user]);

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

  const value = useMemo(() => ({ user, ready, signOut, renderButton }), [user, ready, signOut, renderButton]);

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

export function SignInButton() {
  const { renderButton, ready } = useGoogleUser();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current) renderButton(ref.current); }, [renderButton]);
  return <div ref={ref} aria-busy={!ready} style={{ minHeight: 44 }} />;
}
