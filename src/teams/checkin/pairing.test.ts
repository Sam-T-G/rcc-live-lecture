// @vitest-environment node
// PairScreen (prof.tsx), the door iPad's pairing screen: when it asks the server for a code. These
// tests have no browser DOM, so React's hooks are swapped for a small stand-in that keeps state
// between calls and runs an effect after a render when its deps change, the way React would. Each
// render calls PairScreen as a plain function; a test reads the element it returns and presses a
// button by calling its onClick. The status query's answer is passed in as the `status` prop.
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const hooks = vi.hoisted(() => ({ slots: [] as unknown[], at: 0, effects: [] as (() => void)[] }));
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
        hooks.slots[i] = typeof next === "function" ? (next as (v: unknown) => unknown)(hooks.slots[i]) : next;
      };
      return [value, set];
    },
    useRef: (init: unknown) => slot(() => ({ current: init })),
    useCallback: (fn: unknown, deps: unknown[]) => {
      const s = slot(() => ({ fn, deps: undefined as unknown[] | undefined }));
      if (changed(s.deps, deps)) Object.assign(s, { fn, deps });
      return s.fn;
    },
    useEffect: (fn: () => void | (() => void), deps: unknown[]) => {
      const s = slot(() => ({ deps: undefined as unknown[] | undefined }));
      if (changed(s.deps, deps)) {
        s.deps = deps;
        hooks.effects.push(() => void fn());
      }
    },
  };
});

// requestPairing. The code comes back to the screen through the status query (the `status` prop).
const request = vi.fn<(args: { token: string }) => Promise<unknown>>(async () => ({ status: "waiting", code: "111222", expiresAt: Date.now() + 600_000 }));
// checkin.attendance.clock: the server's time, `ahead` ms behind the iPad's own clock (the iPad
// runs fast when it's positive). `answer` false leaves the call waiting, like a slow network, until
// the test calls `release`.
const skew = vi.hoisted(() => ({ ahead: 0, answer: true, release: (() => {}) as () => void }));
const serverClock = vi.fn(() =>
  skew.answer
    ? Promise.resolve(Date.now() - skew.ahead)
    : new Promise<number>((done) => {
        skew.release = () => done(Date.now() - skew.ahead);
      }),
);
vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  return {
    useMutation: (ref: Parameters<typeof getFunctionName>[0]) => (getFunctionName(ref) === "checkin/attendance:clock" ? serverClock : request),
    useQuery: () => undefined,
    useConvexAuth: () => ({ isLoading: false }),
  };
});
vi.mock("../../blocks/auth", () => ({ SignInButton: () => null, useGoogleUser: () => ({ user: null, signOut: () => {} }) }));

const { PairScreen } = await import("./prof");
const { clock } = await import("./util");
type Props = Parameters<typeof PairScreen>[0];
type El = ReactElement<{ children?: ReactNode; onClick?: () => void; value?: unknown }>;

const TOKEN = "0123456789abcdef".repeat(4);
const T0 = Date.UTC(2026, 10, 5, 21, 30);

// Renders once, then runs the effects that render queued.
function render(status: Props["status"]) {
  hooks.at = 0;
  hooks.effects = [];
  const el = PairScreen({ me: null, token: TOKEN, status }) as El;
  const run = hooks.effects;
  hooks.effects = [];
  run.forEach((f) => f());
  return el;
}

// Every string and number in the tree, and every element, without rendering child components.
function walk(node: ReactNode, out: { words: string[]; els: El[] }) {
  if (typeof node === "string" || typeof node === "number") out.words.push(String(node));
  else if (Array.isArray(node)) node.forEach((n) => walk(n, out));
  else if (isValidElement(node)) {
    const el = node as El;
    out.els.push(el);
    walk(el.props.children, out);
  }
  return out;
}
const words = (el: El) => walk(el, { words: [], els: [] }).words.join(" ");
const bigValue = (el: El) => walk(el, { words: [], els: [] }).els.find((e) => e.props.value !== undefined)?.props.value;
const button = (el: El, label: string) => walk(el, { words: [], els: [] }).els.find((e) => e.props.children === label && e.props.onClick);

const waiting = (code: string, expiresAt: number) => ({ status: "waiting" as const, code, expiresAt });
const none = { status: "none" as const };

// Lets the server clock's answer (a resolved promise) reach the screen's state.
const settle = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

beforeEach(() => {
  hooks.slots = [];
  request.mockClear();
  serverClock.mockClear();
  skew.ahead = 0;
  skew.answer = true;
  vi.useFakeTimers();
  vi.setSystemTime(T0);
});
afterEach(() => {
  vi.useRealTimers();
});

describe("ROLES the door iPad's pairing screen", () => {
  it("ROLES opening it with no code waiting asks for one, once, with this iPad's token, and shows 'Getting a code…' until it comes", () => {
    let el = render(none);
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith({ token: TOKEN });
    el = render(none);
    expect(words(el)).toContain("Getting a code…");
    expect(request).toHaveBeenCalledTimes(1);
    el = render(waiting("111222", T0 + 600_000));
    expect(bigValue(el)).toBe("111 222");
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("ROLES a reload while a code is waiting shows that code and asks for nothing", () => {
    const el = render(waiting("482913", T0 + 300_000));
    expect(bigValue(el)).toBe("482 913");
    expect(words(el)).toContain("A professor or admin types this code on #/admin, under Pair a door iPad.");
    render(waiting("482913", T0 + 300_000));
    expect(request).not.toHaveBeenCalled();
  });

  // The server ends a code only at its expiry (or by approval, which shows paired), so a code that
  // goes away while the iPad still counts time left means the iPad's clock is behind the server's.
  it("ROLES a code that goes away before the iPad's own expiry time (iPad clock 6 s behind) shows 'The code expired.' and asks for nothing", () => {
    render(waiting("482913", T0 + 600_000));
    vi.setSystemTime(T0 + 600_000 - 6_000);
    render(none);
    const el = render(none);
    expect(words(el)).toContain("The code expired.");
    expect(button(el, "Get a new code")).toBeDefined();
    expect(request).not.toHaveBeenCalled();
  });

  it("ROLES a code that runs its 10 minutes shows 'The code expired.' and waits for 'Get a new code'", () => {
    render(waiting("482913", T0 + 600_000));
    vi.setSystemTime(T0 + 600_000);
    render(none);
    let el = render(none);
    expect(words(el)).toContain("The code expired.");
    expect(request).not.toHaveBeenCalled();
    // A tab left open asks for nothing more on its own.
    vi.setSystemTime(T0 + 3_600_000);
    el = render(none);
    expect(request).not.toHaveBeenCalled();
    button(el, "Get a new code")!.props.onClick!();
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith({ token: TOKEN });
  });

  it("ROLES the screen stops showing a code once its time is up, before the server drops it", async () => {
    render(waiting("482913", T0 + 600_000));
    await settle();
    render(waiting("482913", T0 + 600_000));
    vi.setSystemTime(T0 + 600_001);
    vi.runOnlyPendingTimers();
    const el = render(waiting("482913", T0 + 600_000));
    expect(bigValue(el)).toBeUndefined();
    expect(words(el)).toContain("The code expired.");
  });
});

// sweep2-checkin-3 / sweep2-access-2: expiresAt is the server's time, so the screen judges it by
// the server's clock (checkin.attendance.clock), never the iPad's own.
describe("sweep2-checkin-3 an iPad whose clock is off still shows a code the server takes", () => {
  it("an iPad 11 minutes fast shows the server's fresh code, until the iPad's time for the server's expiry", async () => {
    skew.ahead = 11 * 60_000;
    vi.setSystemTime(T0 + skew.ahead); // the iPad's clock; the server's is T0
    render(none);
    await settle();
    let el = render(waiting("482913", T0 + 600_000));
    expect(serverClock).toHaveBeenCalledTimes(1);
    expect(bigValue(el)).toBe("482 913");
    expect(words(el)).toContain(`The code works until  ${clock(T0 + 600_000 + skew.ahead)} .`);
    expect(words(el)).not.toContain("expired");
    // 9 minutes on: still showing.
    vi.advanceTimersByTime(540_000);
    el = render(waiting("482913", T0 + 600_000));
    expect(bigValue(el)).toBe("482 913");
    // Past the server's expiry: gone, before the server drops it.
    vi.advanceTimersByTime(60_001);
    el = render(waiting("482913", T0 + 600_000));
    expect(bigValue(el)).toBeUndefined();
    expect(words(el)).toContain("The code expired.");
  });

  it("an iPad 3 minutes fast shows the code for its full 10 minutes", async () => {
    skew.ahead = 3 * 60_000;
    vi.setSystemTime(T0 + skew.ahead);
    render(waiting("482913", T0 + 600_000));
    await settle();
    render(waiting("482913", T0 + 600_000));
    vi.advanceTimersByTime(599_000);
    const el = render(waiting("482913", T0 + 600_000));
    expect(bigValue(el)).toBe("482 913");
  });

  it("an iPad 2 minutes slow hides the code when the server's 10 minutes are up", async () => {
    skew.ahead = -2 * 60_000;
    vi.setSystemTime(T0 + skew.ahead);
    render(waiting("482913", T0 + 600_000));
    await settle();
    render(waiting("482913", T0 + 600_000));
    vi.advanceTimersByTime(600_001);
    const el = render(waiting("482913", T0 + 600_000));
    expect(bigValue(el)).toBeUndefined();
  });

  it("until the server's clock answers, the iPad's own clock decides; the answer brings the code back", async () => {
    skew.ahead = 11 * 60_000;
    skew.answer = false;
    vi.setSystemTime(T0 + skew.ahead);
    render(waiting("482913", T0 + 600_000));
    let el = render(waiting("482913", T0 + 600_000));
    expect(bigValue(el)).toBeUndefined();
    skew.release();
    await settle();
    render(waiting("482913", T0 + 600_000));
    el = render(waiting("482913", T0 + 600_000));
    expect(bigValue(el)).toBe("482 913");
  });
});
