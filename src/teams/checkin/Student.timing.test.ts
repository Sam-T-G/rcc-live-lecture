// @vitest-environment node
// The pass page's own wiring (StudentPass in Student.tsx), with no backend and no browser
// (CKP-risk-2): it asks for a code on mount, every 5 s, when the page turns visible and as the code
// turns 20 s old; it stops asking once the student is checked in; it hides a code that has been on
// screen over 25 s; and "Sign in first." from the server signs the student out. passTiming.test.ts
// checks the helpers on their own. React's hooks are swapped for a small stand-in that keeps state
// between renders and runs an effect after a render when its inputs changed, the way React does
// (the same stand-in as LateBanner.test.ts, plus useCallback). window and document are plain
// EventTargets.
import { renderToStaticMarkup } from "react-dom/server";
import { getFunctionName, type FunctionReference } from "convex/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Effect = { deps?: unknown[]; cleanup?: void | (() => void) };
const hooks = vi.hoisted(() => ({ slots: [] as unknown[], at: 0, queue: [] as (() => void)[], changed: false }));
vi.mock("react", async (orig) => {
  const R = await orig<typeof import("react")>();
  const same = (a?: unknown[], b?: unknown[]) => !!a && !!b && a.length === b.length && a.every((d, k) => Object.is(d, b[k]));
  const slot = <S,>(make: () => S): [unknown[], number] => {
    const i = hooks.at++;
    if (!(i in hooks.slots)) hooks.slots[i] = make();
    return [hooks.slots, i];
  };
  return {
    ...R,
    useState: (init: unknown) => {
      const [list, i] = slot(() => (typeof init === "function" ? (init as () => unknown)() : init));
      const set = (next: unknown) => {
        const value = typeof next === "function" ? (next as (v: unknown) => unknown)(list[i]) : next;
        if (!Object.is(value, list[i])) hooks.changed = true;
        list[i] = value;
      };
      return [list[i], set];
    },
    useRef: (init: unknown) => {
      const [list, i] = slot(() => ({ current: init }));
      return list[i];
    },
    useCallback: (fn: unknown, deps: unknown[]) => {
      const i = hooks.at++;
      const before = hooks.slots[i] as { fn: unknown; deps: unknown[] } | undefined;
      if (before && same(deps, before.deps)) return before.fn;
      hooks.slots[i] = { fn, deps };
      return fn;
    },
    useEffect: (run: () => void | (() => void), deps?: unknown[]) => {
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

// What each query answers, by name; refresh is the pass.refresh mutation the page calls.
const server = vi.hoisted(() => ({
  answers: {} as Record<string, unknown>,
  refresh: (() => Promise.resolve(null)) as (args: unknown) => Promise<unknown>,
  signOut: () => {},
}));
vi.mock("convex/react", () => ({
  useQuery: (ref: FunctionReference<"query">) => server.answers[getFunctionName(ref)],
  useMutation: (ref: FunctionReference<"mutation">) =>
    getFunctionName(ref) === "checkin/pass:refresh" ? server.refresh : () => Promise.resolve(null),
}));
vi.mock("../../blocks/auth", () => ({
  StudentSignIn: () => null,
  SignedInAs: () => null,
  useGoogleUser: () => ({ user: { name: "Sample student 1", email: "student1@example.edu" }, signOut: server.signOut }),
}));
vi.mock("../../blocks/qr", () => ({ QR: ({ value }: { value: string }) => `[QR ${value}]` }));
vi.mock("./LateBanner", () => ({ default: () => null }));
vi.mock("./Quiz", () => ({ QuizCard: () => null }));

const { StudentPass } = await import("./Student");

const T = Date.UTC(2026, 10, 5, 21, 30);
const pass = (code: string, at: number) => ({ code, name: "Sample student 1", email: "student1@example.edu", at });
let doc: EventTarget & { visibilityState: string };

// Sets what the server answers now (when given), renders the page, runs its effects, and renders
// again until its state settles. Returns the HTML.
function show(answers?: { pass?: unknown; here?: boolean }): string {
  if (answers) {
    if ("pass" in answers) server.answers["checkin/pass:mine"] = answers.pass;
    if ("here" in answers) server.answers["checkin/read:me"] = answers.here;
  }
  let html = "";
  for (let round = 0; round < 10; round++) {
    hooks.at = 0;
    hooks.queue = [];
    hooks.changed = false;
    html = renderToStaticMarkup(StudentPass());
    for (const run of hooks.queue) run();
    if (!hooks.changed) return html;
  }
  throw new Error("show: the page never settled");
}
// Runs the page's timers `ms` on, lets the refresh replies land, then renders.
async function after(ms: number): Promise<string> {
  await vi.advanceTimersByTimeAsync(ms);
  return show();
}

let refresh: ReturnType<typeof vi.fn<(args: unknown) => Promise<unknown>>>;
let signOut: ReturnType<typeof vi.fn<() => void>>;
beforeEach(() => {
  hooks.slots = [];
  vi.useFakeTimers();
  vi.setSystemTime(T);
  refresh = vi.fn<(args: unknown) => Promise<unknown>>(() => Promise.resolve(null));
  signOut = vi.fn();
  server.refresh = refresh;
  server.signOut = signOut;
  server.answers = { "checkin/read:me": false, "checkin/attendance:myHideLate": undefined };
  doc = Object.assign(new EventTarget(), { visibilityState: "visible" });
  vi.stubGlobal("window", new EventTarget());
  vi.stubGlobal("document", doc);
});
afterEach(() => {
  vi.useRealTimers();
});

describe("CKP-risk-2 the pass page keeps its code new", () => {
  it("asks for a code on mount, every 5 s and when the page turns visible, always with the channel", async () => {
    show({ pass: undefined });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenLastCalledWith({ channel: "gdg" });
    await after(5_000);
    expect(refresh).toHaveBeenCalledTimes(2);
    doc.dispatchEvent(new Event("visibilitychange"));
    expect(refresh).toHaveBeenCalledTimes(3);
  });

  it("asks again as the code turns 20 s old: 20.25 s after it arrived, between the 5 s asks", async () => {
    show({ pass: pass("AAAAAA", T) });
    await after(2_000); // the 5 s asks now land at 5, 10, 15 and 20 s; the code timer at 20.25 s
    const asks = refresh.mock.calls.length;
    await after(18_249);
    expect(refresh.mock.calls.length).toBe(asks + 4);
    await after(1);
    expect(refresh.mock.calls.length).toBe(asks + 5);
  });

  it("shows the QR until the code has been on screen 25 s, then 'Getting a new code…' in its place; a new code shows at once", async () => {
    let html = show({ pass: pass("AAAAAA", T) });
    expect(html).toContain("[QR RCC-AAAAAA]");
    html = await after(25_000);
    expect(html).toContain("[QR RCC-AAAAAA]");
    html = await after(1_000); // the page's clock ticks every second
    expect(html).not.toContain("[QR");
    expect(html).toContain("Getting a new code…");
    expect(html).toContain('<p class="pass__code pass__code--old" aria-hidden="true">AAAAAA</p>');
    html = show({ pass: pass("BBBBBB", T + 26_000) });
    expect(html).toContain("[QR RCC-BBBBBB]");
    expect(html).not.toContain("Getting a new code");
  });

  it("stops asking once the student is checked in, and shows 'You’re checked in.'", async () => {
    show({ pass: pass("AAAAAA", T) });
    expect(refresh).toHaveBeenCalledTimes(1);
    const html = show({ here: true });
    expect(html).toContain("You’re checked in.");
    expect(html).not.toContain("[QR");
    await after(60_000);
    doc.dispatchEvent(new Event("visibilitychange"));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("'Sign in first.' from the server signs the student out; any other error shows on the pass", async () => {
    refresh.mockImplementation(() => Promise.reject({ data: "Couldn't make a new code. Try again." }));
    let html = show({ pass: pass("AAAAAA", T) });
    html = await after(0);
    expect(html).toContain("Couldn&#x27;t make a new code. Try again.");
    expect(signOut).not.toHaveBeenCalled();
    refresh.mockImplementation(() => Promise.reject({ data: "Sign in first." }));
    await after(5_000);
    expect(signOut).toHaveBeenCalledTimes(1);
  });
});
