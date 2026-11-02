// @vitest-environment node
// The checked-in moment (CheckInMoment in Student.tsx) plays only when the server's answer to
// read.me turns from false to true while the pass is open, never when a student who is already
// checked in opens or reloads the page and read.me goes from loading (undefined) to true
// (IT1-PHONE-risk-1, MOTION.md principle 1). No browser here: React's hooks are swapped for a small
// stand-in that keeps refs between renders and runs layout effects after a render when their inputs
// changed, the pass and stub are plain objects, and the moment counts as played when the stub gets
// a ci- class.
import { renderToStaticMarkup } from "react-dom/server";
import { getFunctionName, type FunctionReference } from "convex/server";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Effect = { deps?: unknown[]; cleanup?: void | (() => void) };
const hooks = vi.hoisted(() => ({ slots: [] as unknown[], at: 0, queue: [] as (() => void)[] }));
vi.mock("react", async (orig) => {
  const R = await orig<typeof import("react")>();
  const same = (a?: unknown[], b?: unknown[]) => !!a && !!b && a.length === b.length && a.every((d, k) => Object.is(d, b[k]));
  const slot = (make: () => unknown) => {
    const i = hooks.at++;
    if (!(i in hooks.slots)) hooks.slots[i] = make();
    return hooks.slots[i];
  };
  return {
    ...R,
    useState: (init: unknown) => [slot(() => (typeof init === "function" ? (init as () => unknown)() : init)), () => {}],
    useRef: (init: unknown) => slot(() => ({ current: init })),
    useCallback: (fn: unknown) => fn,
    // The page's timers and code requests stay off: only the moment's layout effects run.
    useEffect: () => {},
    useLayoutEffect: (run: () => void | (() => void), deps?: unknown[]) => {
      const i = hooks.at++;
      const before = hooks.slots[i] as Effect | undefined;
      if (before && same(deps, before.deps)) return;
      const effect: Effect = { deps };
      hooks.slots[i] = effect;
      hooks.queue.push(() => {
        if (typeof before?.cleanup === "function") before.cleanup();
        effect.cleanup = run();
      });
    },
  };
});

const server = vi.hoisted(() => ({ answers: {} as Record<string, unknown> }));
vi.mock("convex/react", () => ({
  useQuery: (ref: FunctionReference<"query">) => server.answers[getFunctionName(ref)],
  useMutation: () => () => Promise.resolve(null),
}));
vi.mock("../../blocks/auth", () => ({
  StudentSignIn: () => null,
  SignedInAs: () => null,
  useGoogleUser: () => ({ user: { name: "Sample student 1", email: "student1@example.edu" }, signOut: () => {} }),
}));
vi.mock("../../blocks/qr", () => ({ QR: ({ value }: { value: string }) => `[QR ${value}]` }));
vi.mock("./LateBanner", () => ({ default: () => null }));
vi.mock("./Quiz", () => ({ QuizCard: () => null }));

const { StudentPass } = await import("./Student");

type Box = { current: unknown };
const rect = (top: number, height: number) => ({ top, left: 16, width: 358, height, right: 374, bottom: top + height, x: 16, y: top });
const classes = () => {
  const on = new Set<string>();
  return { on, add: (...c: string[]) => c.forEach((x) => on.add(x)), remove: (...c: string[]) => c.forEach((x) => on.delete(x)) };
};
let body: { getBoundingClientRect: () => unknown; querySelector: () => null; children: unknown[]; classList: ReturnType<typeof classes>; append: () => void };
let passCard: { isConnected: boolean; parentElement: unknown; getBoundingClientRect: () => unknown };
let stubCard: { isConnected: boolean; parentElement: unknown; getBoundingClientRect: () => unknown; classList: ReturnType<typeof classes> };

// Renders the pass page with read.me answering `me`, places the pass (connected while it shows)
// and the stub where React would have put them, and runs the layout effects.
function show(me: boolean | undefined) {
  server.answers["checkin/read:me"] = me;
  hooks.at = 0;
  hooks.queue = [];
  const page = StudentPass() as ReactElement<{ moment: ReactElement<{ pass: Box; stub: Box }> }>;
  const { pass, stub } = page.props.moment.props;
  if (me === true) {
    passCard.isConnected = false;
    stub.current = stubCard;
  } else {
    pass.current = passCard;
  }
  renderToStaticMarkup(page);
  for (const run of hooks.queue) run();
}
const played = () => stubCard.classList.on.size > 0;

beforeEach(() => {
  hooks.slots = [];
  vi.useFakeTimers();
  vi.stubGlobal("window", {
    matchMedia: () => ({ matches: true }),
    setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
    clearTimeout: (id: number) => clearTimeout(id),
  });
  body = { getBoundingClientRect: () => rect(0, 800), querySelector: () => null, children: [], classList: classes(), append: () => {} };
  passCard = { isConnected: true, parentElement: body, getBoundingClientRect: () => rect(16, 560) };
  stubCard = { isConnected: true, parentElement: body, getBoundingClientRect: () => rect(16, 120), classList: classes() };
  body.children = [stubCard];
  server.answers = {
    "checkin/pass:mine": { code: "ABCDEF", name: "Sample student 1", email: "student1@example.edu", at: 0 },
    "checkin/attendance:myHideLate": undefined,
  };
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

// On mount the second layout effect runs too and clears what the first recorded, so the page needs
// a second render on the same answer before the moment can play. A real page always has one: the
// pass arrives, the code's arrival time is stored, and the clock ticks every second while the
// student isn't checked in.
const showTwice = (me: boolean | undefined) => {
  show(me);
  show(me);
};

describe("the checked-in moment (IT1-PHONE-risk-1)", () => {
  it("plays when the door checks the student in while the pass is open (read.me false, then true)", () => {
    showTwice(false);
    show(true);
    expect(played()).toBe(true);
  });

  it("does not play when an already checked-in student opens the page (read.me loading, then true)", () => {
    showTwice(undefined);
    show(true);
    expect(played()).toBe(false);
  });

  it("does not play when read.me resolves to false, goes back to loading, then answers true", () => {
    showTwice(false);
    showTwice(undefined);
    show(true);
    expect(played()).toBe(false);
  });
});
