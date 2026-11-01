// @vitest-environment node
// The late banner itself (LateBanner.tsx), fed one lateFeed answer after another the way a page
// gets them, with no backend (CKP-risk-4). late.test.ts checks newArrivals on its own; this checks
// that the banner uses it: the arrivals already in the first answer never show, and a later one
// shows once, for 8 seconds. There is no browser DOM, so React's hooks are swapped for a small
// stand-in that keeps the banner's state between renders and runs an effect after a render when
// its inputs changed, the way React does.
import { renderToStaticMarkup } from "react-dom/server";
import { getFunctionName, type FunctionReference } from "convex/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Late } from "./late";

type Effect = { deps?: unknown[]; cleanup?: void | (() => void) };
const hooks = vi.hoisted(() => ({ slots: [] as unknown[], at: 0, queue: [] as (() => void)[], changed: false }));
vi.mock("react", async (orig) => {
  const R = await orig<typeof import("react")>();
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
    useEffect: (run: () => void | (() => void), deps?: unknown[]) => {
      const i = hooks.at++;
      const before = hooks.slots[i] as Effect | undefined;
      if (before && deps && before.deps && deps.every((d, k) => Object.is(d, before.deps![k]))) return;
      const effect: Effect = { deps };
      hooks.slots[i] = effect;
      hooks.queue.push(() => {
        if (typeof before?.cleanup === "function") before.cleanup();
        effect.cleanup = run();
      });
    },
  };
});

// `ahead`: how far the screen's clock runs ahead of the server's. The clock mutation answers
// `wait` ms after it's called with the server's time then, the screen's Date.now() minus `ahead`.
const server = vi.hoisted(() => ({ feed: undefined as unknown, asked: [] as { name: string; args: unknown }[], ahead: 0, wait: 0, told: [] as string[] }));
const clock = vi.hoisted(() => async () => {
  if (server.wait > 0) await new Promise((answer) => setTimeout(answer, server.wait));
  return Date.now() - server.ahead;
});
vi.mock("convex/react", () => ({
  useQuery: (ref: FunctionReference<"query">, args: unknown) => {
    server.asked.push({ name: getFunctionName(ref), args });
    return server.feed;
  },
  useMutation: (ref: FunctionReference<"mutation">) => {
    server.told.push(getFunctionName(ref));
    return clock;
  },
}));

const { default: LateBanner } = await import("./LateBanner");
const { lateLine } = await import("./late");

// Renders the banner with the feed the server answers now, runs its effects, and renders again
// until its state settles. Returns the HTML ("" when the banner shows nothing).
function show(feed?: Late[]): string {
  if (arguments.length > 0) server.feed = feed;
  let html = "";
  for (let pass = 0; pass < 10; pass++) {
    hooks.at = 0;
    hooks.queue = [];
    hooks.changed = false;
    const el = LateBanner();
    html = el ? renderToStaticMarkup(el) : "";
    for (const run of hooks.queue) run();
    if (!hooks.changed) return html;
  }
  throw new Error("show: the banner never settled");
}
// Runs the banner's timers up to `ms` from now, then renders.
function after(ms: number): string {
  vi.advanceTimersByTime(ms);
  return show();
}

// The phone's clock when each test starts (21:30); `row` times are seconds after it.
const T = Date.UTC(2026, 10, 5, 21, 30);
const row = (id: string, s: number): Late => ({ id, first: "Sample" + id, lateMin: 10, at: T + s * 1_000 });
const lines = (html: string) => [...html.matchAll(/<p class="late__item">([^<]*)<\/p>/g)].map((m) => m[1]);

beforeEach(() => {
  hooks.slots = [];
  server.feed = undefined;
  server.asked = [];
  server.ahead = 0;
  server.wait = 0;
  server.told = [];
  vi.useFakeTimers();
  vi.setSystemTime(T);
  vi.stubGlobal("window", globalThis);
});
afterEach(() => {
  vi.useRealTimers();
});

describe("F16 LateBanner shows each late arrival once, and only ones after the page opened", () => {
  it("a page that opens with 5 late arrivals in the feed shows none of them, while loading or after", () => {
    expect(show(undefined)).toBe("");
    const open = [row("e", 50), row("d", 40), row("c", 30), row("b", 20), row("a", 10)];
    expect(show(open)).toBe("");
    expect(show([...open])).toBe(""); // the same list again, as a new answer
    expect(server.asked.every((q) => q.name === "checkin/attendance:lateFeed")).toBe(true);
    expect(server.asked[0].args).toEqual({ channel: "gdg" });
  });

  it("a late arrival after the page opened shows once, for 8 seconds, and an older one that comes back into the list never shows", () => {
    show([row("b", 20), row("a", 10)]);
    const g = row("g", 60);
    const html = show([g, row("b", 20), row("a", 10)]);
    expect(lines(html)).toEqual([lateLine(g)]);
    expect(html).toContain('role="status"');
    expect(lines(after(7_999))).toEqual([lateLine(g)]);
    expect(after(1)).toBe("");
    // The same feed again, and G ticking then unticking the opt-out: G doesn't show again.
    expect(show([g, row("b", 20), row("a", 10)])).toBe("");
    expect(show([row("b", 20), row("a", 10), row("old", 5)])).toBe("");
    expect(show([g, row("b", 20), row("a", 10)])).toBe("");
  });

  it("two arrivals a few seconds apart each show for their own 8 seconds, newest first", () => {
    show([]);
    const a = row("a", 10);
    const b = row("b", 20);
    show([a]);
    expect(lines(after(3_000))).toEqual([lateLine(a)]);
    expect(lines(show([b, a]))).toEqual([lateLine(b), lateLine(a)]);
    expect(lines(after(5_000))).toEqual([lateLine(b)]);
    expect(after(3_000)).toBe("");
  });
});

describe("F16.2 LateBanner never shows an arrival from before its page opened", () => {
  const MIN = 60_000;
  const at = (id: string, ms: number, lateMin = 10): Late => ({ id, first: "Sample" + id, lateMin, at: ms });

  it("CKP-spec-1 an arrival scanned before the page opened that comes into the feed later (she unticks the opt-out) never shows; a new one does", () => {
    // Xena is scanned 10 min late at 21:40 with the opt-out ticked. Yuri opens #/live at 21:42: the feed is empty.
    vi.setSystemTime(T + 12 * MIN);
    expect(show([])).toBe("");
    // At 21:48 Xena unticks it.
    vi.setSystemTime(T + 18 * MIN);
    expect(show([at("xena", T + 10 * MIN)])).toBe("");
    // Zed walks in late at 21:50 and the feed brings him a second later: he shows.
    vi.setSystemTime(T + 20 * MIN + 1_000);
    const zed = at("zed", T + 20 * MIN);
    expect(lines(show([zed, at("xena", T + 10 * MIN)]))).toEqual([lateLine(zed)]);
  });

  it("CKP-fixcheck-1 an arrival scanned 30 s before the page opened that comes into the feed 20 s after it opened never shows", () => {
    // Xena is scanned late at 21:29:30 with the opt-out ticked. Yuri opens #/live at 21:30:00: the feed is empty.
    expect(show([])).toBe("");
    // At 21:30:20 Xena unticks it: her row is 50 s old, inside the minute.
    vi.setSystemTime(T + 20_000);
    expect(show([at("xena", T - 30_000)])).toBe("");
  });

  it("CKP-check-1 CKP-risk-3 a class start saved after students arrived shows none of them, on a page opened after they arrived or before", () => {
    // No start saved, so lateFeed is empty. Ana and Ben are scanned at 21:31 and 21:33.
    // A phone opens #/live at 21:34.
    vi.setSystemTime(T + 4 * MIN);
    expect(show([])).toBe("");
    // At 21:36 the professor saves start 21:30 with grace 0: lateFeed now counts both as late.
    vi.setSystemTime(T + 6 * MIN);
    expect(show([at("ben", T + 3 * MIN, 3), at("ana", T + 1 * MIN, 1)])).toBe("");

    // The projector opened at 21:25, before both arrived.
    hooks.slots = [];
    vi.setSystemTime(T - 5 * MIN);
    expect(show([])).toBe("");
    vi.setSystemTime(T + 6 * MIN);
    expect(show([at("ben", T + 3 * MIN, 3), at("ana", T + 1 * MIN, 1)])).toBe("");
  });
});

describe("CKP-fixcheck-2 a screen whose clock is off shows late arrivals by the server's clock", () => {
  const MIN = 60_000;
  const at = (id: string, ms: number): Late => ({ id, first: "Sample" + id, lateMin: 10, at: ms });

  it("a projector whose clock runs 90 s fast shows Zed a second after his scan", async () => {
    // The server's clock says 21:30:00 and the projector's says 21:31:30 when #/checkin/stage opens.
    server.ahead = 90_000;
    vi.setSystemTime(T + 90_000);
    expect(show([])).toBe("");
    await vi.advanceTimersByTimeAsync(0); // the server's clock answers
    // Zed is scanned 10 min late at 21:40:00 by the server's clock, and the feed brings him a second later.
    vi.setSystemTime(T + 10 * MIN + 1_000 + 90_000);
    const zed = at("zed", T + 10 * MIN);
    expect(lines(show([zed]))).toEqual([lateLine(zed)]);
    expect([...new Set(server.told)]).toEqual(["checkin/attendance:clock"]);
  });

  it("a phone whose clock runs 90 s slow still skips Xena when she unticks the opt-out 8 min after her scan", async () => {
    server.ahead = -90_000;
    vi.setSystemTime(T - 90_000);
    expect(show([])).toBe("");
    await vi.advanceTimersByTimeAsync(0);
    // Xena was scanned at 21:31:00 with the opt-out ticked and unticks it at 21:39:00.
    vi.setSystemTime(T + 9 * MIN - 90_000);
    expect(show([at("xena", T + MIN)])).toBe("");
  });

  it("a clock answer that took 10 min (the page opened offline) is dropped, so a correct clock still shows Zed", async () => {
    server.wait = 10 * MIN;
    expect(show([])).toBe("");
    await vi.advanceTimersByTimeAsync(10 * MIN); // back online: the call runs and answers now
    vi.setSystemTime(T + 11 * MIN + 1_000);
    const zed = at("zed", T + 11 * MIN);
    expect(lines(show([zed]))).toEqual([lateLine(zed)]);
  });

  it("an answer from the clock that isn't a number changes nothing", async () => {
    server.ahead = Number.NaN;
    expect(show([])).toBe("");
    await vi.advanceTimersByTimeAsync(0);
    vi.setSystemTime(T + 10_000);
    const g = at("g", T + 9_000);
    expect(lines(show([g]))).toEqual([lateLine(g)]);
  });
});
