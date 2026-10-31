// @vitest-environment node
// AuthProvider (auth.tsx) through a class: Convex gets the sign-in the tab shows, tabs follow
// each other, a sign-in the server refuses is dropped so the sign-in shows again, Google's script
// loads only when a page needs it, and the typed test sign-in checks what's typed.
//
// These tests have no browser DOM, so React's hooks are swapped for a small stand-in that keeps
// each component's state between renders and runs effects after a render when their deps change
// (as in auth.renew.test.ts). Convex's provider isn't rendered. In its place, convexView() copies
// what ConvexProviderWithAuth (convex/dist/esm/react/ConvexAuthState.js) does with what
// AuthProvider tells it through the real useAuthForConvex hook: it reports "loading" (null) from
// its first render or from a render where it hears loading, "not signed in" once it hears signed
// out, and the server's answer once the test gives one (answer()). Right after a new sign-in it
// still holds "not signed in" from before until the server answers, unless it heard loading.
import type { ReactElement, ReactNode } from "react";
import type { ConvexReactClient } from "convex/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Effect = { deps?: unknown[]; cleanup?: void | (() => void) };
const hooks = vi.hoisted(() => ({
  slots: [] as unknown[], // the slots of the component rendering now
  at: 0,
  layout: [] as (() => void)[],
  effects: [] as (() => void)[],
  dirty: false,
  context: undefined as unknown, // what useContext gives
}));
vi.mock("react", async (orig) => {
  const R = await orig<typeof import("react")>();
  function slot<T>(make: () => T): T {
    const i = hooks.at++;
    if (!(i in hooks.slots)) hooks.slots[i] = make();
    return hooks.slots[i] as T;
  }
  const changed = (a: unknown[] | undefined, b: unknown[]) => !a || a.length !== b.length || a.some((x, k) => !Object.is(x, b[k]));
  const queue = (list: "layout" | "effects") => (fn: () => void | (() => void), deps: unknown[]) => {
    const s = slot<Effect>(() => ({}));
    if (!changed(s.deps, deps)) return;
    s.deps = deps;
    hooks[list].push(() => {
      if (typeof s.cleanup === "function") s.cleanup();
      s.cleanup = fn();
    });
  };
  return {
    ...R,
    useState: (init: unknown) => {
      const slots = hooks.slots;
      const i = hooks.at;
      const value = slot(() => (typeof init === "function" ? (init as () => unknown)() : init));
      const set = (next: unknown) => {
        const v = typeof next === "function" ? (next as (v: unknown) => unknown)(slots[i]) : next;
        if (!Object.is(v, slots[i])) hooks.dirty = true;
        slots[i] = v;
      };
      return [value, set];
    },
    useCallback: (fn: unknown, deps: unknown[]) => {
      const s = slot(() => ({ fn, deps: undefined as unknown[] | undefined }));
      if (changed(s.deps, deps)) Object.assign(s, { fn, deps });
      return s.fn;
    },
    useMemo: (make: () => unknown, deps: unknown[]) => {
      const s = slot(() => ({ value: undefined as unknown, deps: undefined as unknown[] | undefined }));
      if (changed(s.deps, deps)) Object.assign(s, { value: make(), deps });
      return s.value;
    },
    useRef: (init: unknown) => slot(() => ({ current: init })),
    useContext: () => hooks.context,
    useLayoutEffect: queue("layout"),
    useEffect: queue("effects"),
  };
});

// What Convex's provider holds: null loading, true or false once the server answered.
const convex = vi.hoisted(() => ({ held: null as boolean | null, view: { isLoading: true, isAuthenticated: false } }));
vi.mock("convex/react", () => ({
  ConvexProviderWithAuth: ({ children }: { children: ReactNode }) => children,
  ConvexReactClient: class {},
  useConvexAuth: () => convex.view,
}));

const KEY = "rcc-live:google-id-token";
const GOOGLE = "https://accounts.google.com";
const TYPED = "https://test-login.rcc-live-lecture.local";
const T0 = Date.UTC(2026, 10, 5, 21, 25);
const MIN = 60_000;

const b64url = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
function jwt(iss: string, email: string, ms: number, name = "Sample student") {
  return `${b64url({ alg: "RS256" })}.${b64url({ iss, sub: email, email, name, exp: Math.floor((T0 + ms) / 1000) })}.sig`;
}
const typed = (email: string, name?: string) => jwt(TYPED, email, 12 * 60 * MIN, name);
const google = (email: string, ms = 60 * MIN) => jwt(GOOGLE, email, ms);
const claimsOf = (token: string) => JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));

type El = ReactElement<Record<string, unknown>>;
type Bridge = { isLoading: boolean; isAuthenticated: boolean; fetchAccessToken: () => Promise<string | null> };
// What AuthProvider gives the page through useGoogleUser().
type Shared = {
  user: { token: string; name: string; email: string } | null;
  renderButton: (el: HTMLElement) => void;
  signInWithToken: (token: string) => void;
  signOut: () => void;
  ready: boolean;
};

let Auth: typeof import("./auth");
let store: Map<string, string>;
let listeners: Map<string, (e: object) => void>;
let scripts: number;
let googleCallback: ((r: { credential: string }) => void) | undefined;
let drawn: unknown[];
let shared: Shared;
let bridge: Bridge; // what AuthProvider told Convex in the last render
let heard: boolean[]; // isLoading as AuthProvider told it to Convex, one entry per render
let providerSlots: unknown[];
let watcherSlots: unknown[];

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  store = new Map();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
  listeners = new Map();
  scripts = 0;
  googleCallback = undefined;
  drawn = [];
  vi.stubGlobal("window", {
    location: { hash: "#/live" },
    addEventListener: (type: string, fn: (e: object) => void) => void listeners.set(type, fn),
    removeEventListener: (type: string) => void listeners.delete(type),
    google: {
      accounts: {
        id: {
          initialize: (o: { callback: (r: { credential: string }) => void }) => (googleCallback = o.callback),
          renderButton: (el: unknown) => void drawn.push(el),
          prompt: () => {},
          disableAutoSelect: () => {},
        },
      },
    },
  });
  // Google's script "loads" as soon as auth.tsx adds it.
  vi.stubGlobal("document", {
    createElement: () => ({}) as { onload?: () => void },
    head: {
      appendChild: (el: { onload?: () => void }) => {
        scripts++;
        queueMicrotask(() => el.onload?.());
      },
    },
  });
  convex.held = null; // Convex's provider starts out loading
  heard = [];
  providerSlots = [];
  watcherSlots = [];
  vi.resetModules(); // auth.tsx loads Google's script once per page
  Auth = await import("./auth");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function find(el: unknown, match: (e: El) => boolean): El | undefined {
  if (!el || typeof el !== "object") return undefined;
  if (Array.isArray(el)) {
    for (const c of el) {
      const hit = find(c, match);
      if (hit) return hit;
    }
    return undefined;
  }
  const e = el as El;
  if (match(e)) return e;
  return find(e.props?.children, match);
}
const named = (name: string) => (e: El) => typeof e.type === "function" && e.type.name === name;

// Convex's provider during one render, given what AuthProvider told it (ConvexAuthState.js).
function convexView(b: Bridge) {
  if (b.isLoading && convex.held !== null) convex.held = null;
  if (!b.isLoading && !b.isAuthenticated && convex.held !== false) convex.held = false;
  convex.view = { isLoading: convex.held === null, isAuthenticated: b.isAuthenticated && (convex.held ?? false) };
}

// One render of AuthProvider and DropRefused inside it, then their effects: layout effects, then
// the child's effects before the parent's, as React runs them.
function render() {
  hooks.layout = [];
  hooks.dirty = false;
  hooks.slots = providerSlots;
  hooks.at = 0;
  hooks.effects = [];
  const tree = Auth.AuthProvider({ client: {} as ConvexReactClient, children: null }) as El;
  const providerEffects = hooks.effects;
  shared = tree.props.value as Shared;
  hooks.context = shared;
  const provider = find(tree, (e) => typeof e.props?.useAuth === "function")!;
  bridge = (provider.props.useAuth as () => Bridge)();
  heard.push(bridge.isLoading);
  convexView(bridge);
  const watcher = find(tree, named("DropRefused"));
  hooks.slots = watcherSlots;
  hooks.at = 0;
  hooks.effects = [];
  if (watcher) (watcher.type as (p: object) => unknown)(watcher.props);
  const watcherEffects = hooks.effects;
  for (const e of [...hooks.layout, ...watcherEffects, ...providerEffects]) e();
}

async function settle() {
  for (let i = 0; i < 20; i++) {
    render();
    await vi.advanceTimersByTimeAsync(0); // Google's script loading, and timers that are due
    if (!hooks.dirty) return;
  }
  throw new Error("AuthProvider kept re-rendering");
}

// The server answers Convex about the sign-in it has.
async function answer(accepted: boolean) {
  convex.held = accepted;
  await settle();
}

// The token Convex gets when it asks (on connecting, and when the server says its token ran out).
const convexAsks = () => bridge.fetchAccessToken();

function saveSignIn(token: string, name = "Sample student") {
  const c = claimsOf(token);
  store.set(KEY, JSON.stringify({ token, exp: c.exp * 1000, name, email: c.email, picture: "" }));
}
const signedIn = () => shared.user?.token ?? null;
// Another tab of this site changed the saved sign-in.
function otherTab(token: string | null) {
  if (token) saveSignIn(token);
  else store.delete(KEY);
  listeners.get("storage")?.({ key: KEY });
}

describe("blocks-frontend-9 a sign-in the server refuses is dropped, so the sign-in shows again", () => {
  it("blocks-frontend-9 a saved sign-in the server refuses when the page opens is dropped from the tab and the browser", async () => {
    const ana = typed("ana@example.edu");
    saveSignIn(ana);
    await settle();
    expect(signedIn()).toBe(ana);
    await answer(false);
    expect(signedIn()).toBeNull();
    expect(store.has(KEY)).toBe(false);
  });

  it("blocks-frontend-9 one the server accepted stays through a lost connection, and is dropped once the server refuses it", async () => {
    const ana = typed("ana@example.edu");
    saveSignIn(ana);
    await settle();
    await answer(true);
    // Offline for 30 s: Convex reconnects with the same sign-in and reports nothing new.
    await vi.advanceTimersByTimeAsync(30_000);
    await settle();
    expect(signedIn()).toBe(ana);
    await answer(false);
    expect(signedIn()).toBeNull();
  });

  it("blocks-frontend-9 a new sign-in: Convex hears loading for one render, keeps it while the server checks, and a refusal drops it", async () => {
    await settle();
    expect(convex.view).toEqual({ isLoading: false, isAuthenticated: false });
    const ana = typed("ana@example.edu");
    heard = [];
    shared.signInWithToken(ana);
    await settle();
    // Without the loading render, Convex would still say "not signed in" from before, and the
    // sign-in would look refused before the server ever saw it.
    expect(heard[0]).toBe(true);
    expect(heard[heard.length - 1]).toBe(false);
    expect(convex.view).toEqual({ isLoading: true, isAuthenticated: false });
    expect(signedIn()).toBe(ana);
    await answer(false);
    expect(signedIn()).toBeNull();
  });
});

describe("blocks-frontend-18 every tab has the same sign-in, and Convex gets the one the tab shows", () => {
  it("blocks-frontend-18 Convex gets this tab's token, even when the browser holds another one this tab hasn't heard about", async () => {
    const ana = typed("ana@example.edu");
    saveSignIn(ana);
    await settle();
    await answer(true);
    saveSignIn(typed("ben@example.edu")); // no storage event reached this tab
    expect(await convexAsks()).toBe(ana);
  });

  it("blocks-frontend-18 signing out in another tab signs this tab out, and signing in there signs this tab in", async () => {
    const ana = typed("ana@example.edu");
    saveSignIn(ana);
    await settle();
    await answer(true);
    otherTab(null);
    await settle();
    expect(signedIn()).toBeNull();
    expect(await convexAsks()).toBeNull();
    const ben = typed("ben@example.edu");
    otherTab(ben);
    await settle();
    expect(signedIn()).toBe(ben);
    expect(await convexAsks()).toBe(ben);
  });

  it("blocks-frontend-18 another account in another tab: Convex hears loading first and checks the new account; a renewed token for the same person doesn't", async () => {
    saveSignIn(google("prof@example.edu"));
    await settle();
    await answer(true);
    // Google renews the token: the same person, so Convex keeps going and reads the new token
    // when the server says the old one ran out.
    const renewed = google("prof@example.edu", 115 * MIN);
    heard = [];
    googleCallback!({ credential: renewed });
    await settle();
    expect(heard.every((loading) => !loading)).toBe(true);
    expect(convex.view).toEqual({ isLoading: false, isAuthenticated: true });
    expect(await convexAsks()).toBe(renewed);

    // Another tab signs in as someone else: Convex drops the old account and checks the new one.
    const ben = typed("ben@example.edu");
    heard = [];
    otherTab(ben);
    await settle();
    expect(heard[0]).toBe(true);
    expect(convex.view.isLoading).toBe(true);
    expect(await convexAsks()).toBe(ben);
    await answer(true);
    expect(signedIn()).toBe(ben);
  });
});

describe("blocks-frontend-15 Google's script loads only when a page needs it", () => {
  it("blocks-frontend-15 not for someone signed out on a page without Google's button, or for a typed sign-in", async () => {
    await settle();
    await vi.advanceTimersByTimeAsync(5 * MIN);
    expect(scripts).toBe(0);
    shared.signInWithToken(typed("ana@example.edu"));
    await settle();
    await answer(true);
    expect(scripts).toBe(0);
  });

  it("blocks-frontend-15 for Google's button, which it then draws, and for a Google sign-in", async () => {
    await settle();
    const box = {} as HTMLElement;
    shared.renderButton(box);
    await settle();
    expect(scripts).toBe(1);
    expect(shared.ready).toBe(true);
    shared.renderButton(box);
    expect(drawn).toEqual([box]);

    vi.resetModules();
    Auth = await import("./auth");
    providerSlots = [];
    watcherSlots = [];
    saveSignIn(google("prof@example.edu"));
    await settle();
    expect(scripts).toBe(2);
    expect(googleCallback).toBeTypeOf("function");
  });
});

describe("blocks-frontend-17 names are read as UTF-8", () => {
  it("blocks-frontend-17 'José Núñez' reads back as typed, from a new sign-in and from one saved garbled before", async () => {
    await settle();
    shared.signInWithToken(typed("jose@example.edu", "José Núñez"));
    await settle();
    expect(shared.user?.name).toBe("José Núñez");
    expect(JSON.parse(store.get(KEY)!).name).toBe("José Núñez");

    // An older version saved the name as Latin-1 ("JosÃ© NÃºÃ±ez"); the token itself is right.
    store.clear();
    providerSlots = [];
    watcherSlots = [];
    saveSignIn(typed("jose@example.edu", "José Núñez"), "JosÃ© NÃºÃ±ez");
    await settle();
    expect(shared.user?.name).toBe("José Núñez");
  });
});

describe("D1 the live site signs in with Google only", () => {
  it("D1 a live build drops a typed sign-in saved in the browser and keeps a Google one", async () => {
    vi.stubEnv("DEV", false);
    saveSignIn(typed("ana@example.edu"));
    await settle();
    expect(signedIn()).toBeNull();

    providerSlots = [];
    watcherSlots = [];
    const prof = google("prof@example.edu");
    saveSignIn(prof);
    await settle();
    expect(signedIn()).toBe(prof);
  });
});

// The typed test sign-in (`npm run dev` builds): TestSignIn inside SignInButton, rendered with the
// same stand-in hooks. Its sign-in goes to a spy.
function typedForm() {
  const signIn = vi.fn();
  const slots: unknown[] = [];
  const view = () => {
    hooks.slots = slots;
    hooks.at = 0;
    hooks.context = { signInWithToken: signIn };
    hooks.effects = [];
    hooks.layout = [];
    const form = find(Auth.SignInButton(), named("TestSignIn"))!;
    return (form.type as (p: object) => El)(form.props);
  };
  return { signIn, view };
}
const input = (el: El, label: string) => find(el, (e) => e.type === "input" && e.props["aria-label"] === label)!;
const errorIn = (el: El) => find(el, named("Status"))?.props.children;
async function submit(f: ReturnType<typeof typedForm>, name: string, email: string) {
  let el = f.view();
  (input(el, "Your name").props.onChange as (e: object) => void)({ target: { value: name } });
  (input(el, "Your email").props.onChange as (e: object) => void)({ target: { value: email } });
  el = f.view();
  await (find(el, (e) => e.type === "form")!.props.onSubmit as (e: object) => Promise<void>)({ preventDefault() {} });
  return f.view();
}

describe("blocks-frontend-7 the typed test sign-in never uses the email as the name", () => {
  it("blocks-frontend-7 a name of only spaces says 'Type your name.' and signs nobody in; a real name signs in trimmed", async () => {
    const f = typedForm();
    expect(errorIn(await submit(f, "   ", "ana.lopez@example.edu"))).toBe("Type your name.");
    expect(f.signIn).not.toHaveBeenCalled();

    expect(errorIn(await submit(f, "  José Núñez  ", " jose@example.edu "))).toBeUndefined();
    expect(f.signIn).toHaveBeenCalledTimes(1);
    const c = claimsOf(f.signIn.mock.calls[0][0]);
    expect([c.name, c.email, c.sub]).toEqual(["José Núñez", "jose@example.edu", "jose@example.edu"]);
  });

  it("blocks-frontend-7 the name stops at 60 characters and the email at 254", async () => {
    const f = typedForm();
    const el = f.view();
    expect([input(el, "Your name").props.maxLength, input(el, "Your email").props.maxLength]).toEqual([60, 254]);
    await submit(f, "A".repeat(70), `${"b".repeat(250)}@example.edu`);
    const c = claimsOf(f.signIn.mock.calls[0][0]);
    expect([c.name.length, c.email.length]).toEqual([60, 254]);
  });
});

describe("blocks-frontend-16 the typed test sign-in on an http address", () => {
  it("blocks-frontend-16 says 'Sign-in needs https. Open the live site or localhost.' instead of a form that always fails", () => {
    vi.stubGlobal("isSecureContext", false);
    const el = typedForm().view();
    expect(errorIn(el)).toBe("Sign-in needs https. Open the live site or localhost.");
    expect(find(el, (e) => e.type === "input")).toBeUndefined();
  });
});
