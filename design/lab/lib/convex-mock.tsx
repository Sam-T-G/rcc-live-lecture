// "convex/react" for the screen lab (vite.config.ts aliases it). Every query answers from the
// scenario's fixtures, by getFunctionName(ref); nothing talks to a server.
//   useQuery       the fixture (a value, or a function of the args); "skip" gives undefined; a
//                  missing fixture gives undefined (the page's loading state) and one console.warn
//                  naming the function; a hangs() fixture gives undefined with no warning
//   useMutation, useAction   async; resolve to the fixture when there is one, else null; log the
//                  call; a hangs() fixture never resolves, a refuses() one rejects
//   useConvex()    query, mutation and action, answered the same way
//   useConvexAuth  what AuthProvider hands ConvexProviderWithAuth: signed in when the lab seeded a
//                  sign-in for the scenario's role. With setAuthMode("refused") it says "checking"
//                  first and then "not signed in", the way Convex answers a token the server refuses
// Only main.tsx calls setFixtures and setAuthMode; the app sees the exports Convex itself has.
/* eslint-disable react-refresh/only-export-components -- this file mirrors convex/react's exports,
   hooks and components side by side, and the lab's Vite runs with hmr off (no Fast Refresh). */
import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { getFunctionName } from "convex/server";
import { HANGS, type Fixtures } from "./types";

type Ref = unknown;
type Kind = "query" | "mutation" | "action";

const state = { fixtures: {} as Fixtures, version: 0 };
const listeners = new Set<() => void>();
const cache = new Map<string, unknown>();
const warned = new Set<string>();

// Adds to (or replaces) the fixtures and re-renders every query.
export function setFixtures(f: Fixtures) {
  state.fixtures = { ...state.fixtures, ...f };
  state.version++;
  cache.clear();
  listeners.forEach((l) => l());
}

function nameOf(ref: Ref): string {
  if (typeof ref === "string") return ref;
  try {
    return getFunctionName(ref as never);
  } catch {
    return String(ref);
  }
}

const MISSING = Symbol("missing");
const HUNG = Symbol("hung");

const hangs = (f: unknown) => typeof f === "function" && (f as unknown as Record<symbol, unknown>)[HANGS] === true;

function answer(kind: Kind, ref: Ref, args: unknown): unknown {
  const name = nameOf(ref);
  if (!Object.prototype.hasOwnProperty.call(state.fixtures, name)) {
    if (kind === "query" && !warned.has(name)) {
      warned.add(name);
      console.warn(`[lab] no fixture for ${name}: it stays loading (undefined).`);
    }
    return MISSING;
  }
  const f = state.fixtures[name];
  if (hangs(f)) return HUNG;
  return typeof f === "function" ? (f as (a: unknown) => unknown)(args ?? {}) : f;
}

// The same object for the same call until the fixtures change, so effects keyed on a query's
// result don't run again on every render.
function cachedQuery(ref: Ref, args: unknown): unknown {
  const key = `${nameOf(ref)}|${JSON.stringify(args ?? {})}|${state.version}`;
  if (cache.has(key)) return cache.get(key);
  const v = answer("query", ref, args); // a throw reaches the page's error boundary
  const out = v === MISSING || v === HUNG ? undefined : v;
  cache.set(key, out);
  return out;
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}
const version = () => state.version;

export function useQuery(ref: Ref, ...rest: unknown[]): unknown {
  useSyncExternalStore(subscribe, version, version);
  const args = rest[0];
  if (args === "skip") return undefined;
  return cachedQuery(ref, args);
}

async function call(kind: Kind, ref: Ref, args: unknown): Promise<unknown> {
  console.info(`[lab] ${kind} ${nameOf(ref)}`, args ?? {});
  const v = answer(kind, ref, args);
  if (v === HUNG) return new Promise(() => {});
  return v === MISSING ? null : v;
}

type Callable = ((args?: unknown) => Promise<unknown>) & { withOptimisticUpdate: () => Callable };
const callables = new Map<string, Callable>();
function callable(kind: Kind, ref: Ref): Callable {
  const key = `${kind}|${nameOf(ref)}`;
  let fn = callables.get(key);
  if (!fn) {
    const f = ((args?: unknown) => call(kind, ref, args)) as Callable;
    f.withOptimisticUpdate = () => f;
    callables.set(key, f);
    fn = f;
  }
  return fn;
}

export function useMutation(ref: Ref) {
  return callable("mutation", ref);
}

export function useAction(ref: Ref) {
  return callable("action", ref);
}

// An inert client: main.tsx hands one to AuthProvider; nothing connects.
export class ConvexReactClient {
  url: string;
  constructor(url?: string) {
    this.url = url ?? "lab";
  }
  setAuth() {}
  clearAuth() {}
  async close() {}
  // A one-off query (the extra credit CSV): answered like useQuery, and warned about the same way
  // when it has no fixture.
  query(ref: Ref, args?: unknown) {
    return call("query", ref, args);
  }
  mutation(ref: Ref, args?: unknown) {
    return call("mutation", ref, args);
  }
  action(ref: Ref, args?: unknown) {
    return call("action", ref, args);
  }
  connectionState() {
    return { hasInflightRequests: false, isWebSocketConnected: true };
  }
}

const client = new ConvexReactClient("lab");
export function useConvex() {
  return client;
}

type AuthState = { isLoading: boolean; isAuthenticated: boolean };
const AuthCtx = createContext<AuthState | null>(null);

// "ok": Convex takes every sign-in the page hands it. "refused": Convex checks the sign-in the page
// opens with, then says it isn't signed in, as it does for a token the server won't take.
let authMode: "ok" | "refused" = "ok";
export function setAuthMode(mode: "ok" | "refused") {
  authMode = mode;
}

export function ConvexProvider({ children }: { client?: unknown; children?: ReactNode }) {
  return <>{children}</>;
}

export function ConvexProviderWithAuth({ children, useAuth }: { client?: unknown; children?: ReactNode; useAuth: () => AuthState }) {
  const a = useAuth();
  const [refusing] = useState(authMode === "refused");
  const [checked, setChecked] = useState(!refusing);
  useEffect(() => {
    if (checked) return;
    const t = setTimeout(() => setChecked(true), 100);
    return () => clearTimeout(t);
  }, [checked]);
  const value = refusing ? { isLoading: !checked, isAuthenticated: false } : { isLoading: a.isLoading, isAuthenticated: a.isAuthenticated };
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useConvexAuth(): AuthState {
  return useContext(AuthCtx) ?? { isLoading: false, isAuthenticated: false };
}
