// @vitest-environment node
// AuthProvider (auth.tsx) keeps a Google sign-in going past the hour its ID token lasts: before
// the token runs out it asks Google for a new one (google.accounts.id.prompt() with auto_select),
// and the new token takes the old one's place without signing anyone out (ROLES-UI-risk-1). Only
// Chrome answers that with no click, so AuthProvider also gives the page the sign-in's end time
// for its last 5 minutes (ROLES-UI-fixcheck-2), and never asks on the door iPad
// (ROLES-UI-fixcheck-1). A typed sign-in never asks Google, so it can't turn into a different person.
// These tests have no browser DOM, so React's hooks are swapped for a small stand-in that keeps
// state between renders, runs an effect after a render when its deps change and runs its cleanup
// first, the way React would. AuthProvider is called as a plain function; Convex's provider is
// never rendered.
import type { ReactElement, ReactNode } from "react";
import type { ConvexReactClient } from "convex/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Effect = { deps?: unknown[]; cleanup?: void | (() => void) };
const hooks = vi.hoisted(() => ({ slots: [] as unknown[], at: 0, effects: [] as (() => void)[], dirty: false }));
vi.mock("react", async (orig) => {
  const R = await orig<typeof import("react")>();
  function slot<T>(make: () => T): T {
    const i = hooks.at++;
    if (!(i in hooks.slots)) hooks.slots[i] = make();
    return hooks.slots[i] as T;
  }
  const changed = (a: unknown[] | undefined, b: unknown[]) => !a || a.length !== b.length || a.some((x, k) => !Object.is(x, b[k]));
  return {
    ...R,
    useState: (init: unknown) => {
      const i = hooks.at;
      const value = slot(() => (typeof init === "function" ? (init as () => unknown)() : init));
      const set = (next: unknown) => {
        const v = typeof next === "function" ? (next as (v: unknown) => unknown)(hooks.slots[i]) : next;
        if (!Object.is(v, hooks.slots[i])) hooks.dirty = true;
        hooks.slots[i] = v;
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
    useEffect: (fn: () => void | (() => void), deps: unknown[]) => {
      const s = slot<Effect>(() => ({}));
      if (changed(s.deps, deps)) {
        s.deps = deps;
        hooks.effects.push(() => {
          if (typeof s.cleanup === "function") s.cleanup();
          s.cleanup = fn();
        });
      }
    },
  };
});
vi.mock("convex/react", () => ({ ConvexProviderWithAuth: ({ children }: { children: ReactNode }) => children, ConvexReactClient: class {} }));

const T0 = Date.UTC(2026, 10, 5, 21, 25);
const MIN = 60_000;
const GOOGLE = "https://accounts.google.com";
const TYPED = "https://test-login.rcc-live-lecture.local";

const b64url = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = (iss: string, exp: number, email = "prof@example.edu") =>
  `${b64url({ alg: "RS256" })}.${b64url({ iss, exp: Math.floor(exp / 1000), email, name: "Sample professor" })}.sig`;

let store: Map<string, string>;
let prompt: ReturnType<typeof vi.fn>;
let googleCallback: ((r: { credential: string }) => void) | undefined;
type Auth = typeof import("./auth");
let AuthProvider: Auth["AuthProvider"];
let user: () => { token: string } | null;
let last: ReactElement<{ value: { endsAt: number | null } }> | undefined; // what AuthProvider last returned
// When the sign-in ends, as AuthProvider's context gives it to the page (null: not ending soon).
const endsAt = () => last!.props.value.endsAt;

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  hooks.slots = [];
  store = new Map();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
  prompt = vi.fn();
  googleCallback = undefined;
  vi.stubGlobal("window", {
    location: { hash: "#/host" },
    google: {
      accounts: {
        id: {
          initialize: (o: { callback: (r: { credential: string }) => void }) => (googleCallback = o.callback),
          prompt,
          renderButton: () => {},
          disableAutoSelect: () => {},
        },
      },
    },
  });
  // Google's script "loads" as soon as auth.tsx adds it.
  vi.stubGlobal("document", {
    createElement: () => ({}) as { onload?: () => void },
    head: { appendChild: (el: { onload?: () => void }) => queueMicrotask(() => el.onload?.()) },
  });
  vi.resetModules(); // auth.tsx loads and initializes Google's script once per page
  ({ AuthProvider } = await import("./auth"));
  // The first useState slot is the user.
  user = () => hooks.slots[0] as { token: string } | null;
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

// Renders, runs the effects that render queued, and renders again while state changed.
async function settle() {
  for (let i = 0; i < 10; i++) {
    hooks.at = 0;
    hooks.effects = [];
    hooks.dirty = false;
    last = AuthProvider({ client: {} as ConvexReactClient, children: null }) as typeof last;
    hooks.effects.forEach((e) => e());
    await vi.advanceTimersByTimeAsync(0); // Google's script loading, a timer that is due now
    if (!hooks.dirty) return;
  }
  throw new Error("AuthProvider kept re-rendering");
}

async function at(ms: number) {
  await vi.advanceTimersByTimeAsync(T0 + ms - Date.now());
  await settle();
}

function signedIn(iss: string, exp: number) {
  const token = jwt(iss, exp);
  store.set("rcc-live:google-id-token", JSON.stringify({ token, exp, name: "Sample professor", email: "prof@example.edu", picture: "" }));
  return token;
}

describe("ROLES-UI-risk-1 a Google sign-in lasts the whole class", () => {
  it("asks Google for a new token before the hour is up, and the new one keeps the professor signed in", async () => {
    const first = signedIn(GOOGLE, T0 + 60 * MIN);
    await settle();
    expect(user()?.token).toBe(first);
    expect(googleCallback).toBeTypeOf("function");

    await at(54 * MIN);
    expect(prompt).not.toHaveBeenCalled();
    await at(55 * MIN);
    expect(prompt).toHaveBeenCalledTimes(1);

    // Google signs the same account back in (in Chrome with no click; elsewhere after a click).
    const second = jwt(GOOGLE, T0 + 115 * MIN);
    googleCallback!({ credential: second });
    await settle();

    await at(59 * MIN);
    expect(user()?.token).toBe(second);
    expect(JSON.parse(store.get("rcc-live:google-id-token")!).token).toBe(second);
    // The old token's drop timer is gone with it: still signed in an hour later.
    await at(80 * MIN);
    expect(user()?.token).toBe(second);
    // And the new token is renewed the same way.
    await at(110 * MIN);
    expect(prompt).toHaveBeenCalledTimes(2);
  });

  it("asks a second time when the first ask brings nothing, then signs out a minute before the token runs out", async () => {
    signedIn(GOOGLE, T0 + 60 * MIN);
    await settle();
    await at(55 * MIN);
    expect(prompt).toHaveBeenCalledTimes(1);
    await at(58 * MIN);
    expect(prompt).toHaveBeenCalledTimes(2);
    expect(user()).not.toBeNull();
    await at(59 * MIN);
    expect(user()).toBeNull();
    expect(store.has("rcc-live:google-id-token")).toBe(false);
  });

  it("asks right away for a saved Google token with under 5 minutes left", async () => {
    signedIn(GOOGLE, T0 + 3 * MIN);
    await settle();
    expect(prompt).toHaveBeenCalledTimes(1);
  });

  it("never asks Google for a typed sign-in, so it can't turn into a Google identity; it ends when its token does", async () => {
    signedIn(TYPED, T0 + 12 * 60 * MIN);
    await settle();
    await at(12 * 60 * MIN - 2 * MIN);
    expect(prompt).not.toHaveBeenCalled();
    expect(user()).not.toBeNull();
    await at(12 * 60 * MIN - MIN);
    expect(user()).toBeNull();
  });
});

// Google's prompt() signs someone back in with no click only in Chrome (FedCM). Safari and Firefox
// get a One Tap card that needs a click, so the page says when the sign-in ends and offers Google's
// button for those 5 minutes (SignInEnding in src/teams/checkin/prof.tsx reads endsAt).
describe("ROLES-UI-fixcheck-2 the page says when a Google sign-in ends", () => {
  it("gives the end time from 5 minutes before the token runs out, and clears it once a new token comes", async () => {
    signedIn(GOOGLE, T0 + 60 * MIN);
    await settle();
    expect(endsAt()).toBeNull();
    await at(54 * MIN);
    expect(endsAt()).toBeNull();
    await at(55 * MIN);
    expect(endsAt()).toBe(T0 + 59 * MIN);
    googleCallback!({ credential: jwt(GOOGLE, T0 + 115 * MIN) });
    await settle();
    expect(endsAt()).toBeNull();
  });

  it("keeps giving it while nobody clicks Google's card, until the sign-in ends", async () => {
    signedIn(GOOGLE, T0 + 60 * MIN);
    await settle();
    await at(58 * MIN);
    expect(endsAt()).toBe(T0 + 59 * MIN);
    await at(59 * MIN);
    expect(user()).toBeNull();
    expect(endsAt()).toBeNull();
  });

  it("gives it on the first render for a saved Google token with under 5 minutes left", () => {
    signedIn(GOOGLE, T0 + 3 * MIN);
    hooks.at = 0;
    last = AuthProvider({ client: {} as ConvexReactClient, children: null }) as typeof last;
    expect(endsAt()).toBe(T0 + 2 * MIN);
  });

  it("never gives it for a typed sign-in", async () => {
    signedIn(TYPED, T0 + 12 * 60 * MIN);
    await settle();
    await at(12 * 60 * MIN - 2 * MIN);
    expect(endsAt()).toBeNull();
  });
});

// A One Tap card on the door iPad would let anyone in line tap "Continue as <staff email>".
describe("ROLES-UI-fixcheck-1 no Google prompt on the door iPad", () => {
  const goTo = (hash: string) => ((window as unknown as { location: { hash: string } }).location.hash = hash);

  for (const hash of ["#/checkin/kiosk", "#checkin/kiosk", "#/checkin/kiosk?x=1"])
    it(`never calls prompt() on ${hash}; the sign-in ends a minute before its token`, async () => {
      goTo(hash);
      signedIn(GOOGLE, T0 + 60 * MIN);
      await settle();
      await at(58 * MIN);
      expect(prompt).not.toHaveBeenCalled();
      await at(59 * MIN);
      expect(user()).toBeNull();
    });

  it("still calls prompt() on a route that only starts like the kiosk's", async () => {
    goTo("#/checkin/kioskette");
    signedIn(GOOGLE, T0 + 60 * MIN);
    await settle();
    await at(55 * MIN);
    expect(prompt).toHaveBeenCalledTimes(1);
  });
});
