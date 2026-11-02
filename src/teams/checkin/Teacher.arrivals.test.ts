// @vitest-environment node
// #/checkin/teacher's This class list when check-ins arrive (useArrivals in Teacher.tsx). teacher.css
// turns off the browser's scroll anchoring on .att-list, so the hook keeps a scrolled list in place
// itself: new rows go in at the top (checkin.read.names is newest first), and scrollTop takes their
// height so the rows the professor is reading don't move. That has to happen in every case, also
// where the hook draws no motion: reduced motion, over 40 rows, more than 3 arrivals at once
// (IT1-STAFF-risk-1). These tests have no browser DOM: React's hooks are a small stand-in (refs
// kept between renders, the layout effect run at once) and the list is a stand-in element whose
// rows sit 44 apart under a 4px inset. Row ids are samples.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const hooks = vi.hoisted(() => ({ refs: [] as { current: unknown }[], at: 0 }));
vi.mock("react", async (orig) => {
  const R = await orig<typeof import("react")>();
  return {
    ...R,
    useRef: (init: unknown) => {
      const i = hooks.at++;
      if (!(i in hooks.refs)) hooks.refs[i] = { current: init };
      return hooks.refs[i];
    },
    useEffect: () => {},
    useLayoutEffect: (fn: () => void) => fn(),
  };
});

// Called as a plain function under the hook stand-in above, so it gets a name the hook lint skips.
const { useArrivals: arrivals } = await import("./Teacher");

const ROW = 44;
const INSET = 4;
const UL_TOP = 300;

type FakeRow = { dataset: { row: string }; classes: Set<string>; animated: number; i: number };

// A list element with these row ids in order, scrolled to `scrollTop`.
function list(scrollTop: number) {
  let rows: FakeRow[] = [];
  const ul = {
    scrollTop,
    clientHeight: 8 * ROW + 2 * INSET,
    getBoundingClientRect: () => ({ top: UL_TOP }),
    animate: () => {},
    querySelectorAll: () =>
      rows.map((r) => ({
        dataset: r.dataset,
        classList: {
          add: (c: string) => r.classes.add(c),
          remove: (c: string) => r.classes.delete(c),
          replace: (a: string, b: string) => (r.classes.delete(a), r.classes.add(b)),
        },
        getBoundingClientRect: () => ({ top: UL_TOP - ul.scrollTop + INSET + r.i * ROW }),
        animate: () => void r.animated++,
      })),
  };
  const set = (ids: string[]) => {
    const old = new Map(rows.map((r) => [r.dataset.row, r]));
    rows = ids.map((id, i) => {
      const r = old.get(id) ?? { dataset: { row: id }, classes: new Set<string>(), animated: 0, i };
      r.i = i;
      return r;
    });
  };
  const row = (id: string) => rows.find((r) => r.dataset.row === id)!;
  return { ul, set, row };
}

// One render of the hook with the list showing `ids` (newest first).
function render(l: ReturnType<typeof list>, ids: string[]) {
  hooks.at = 0;
  l.set(ids);
  arrivals({ current: l.ul as unknown as HTMLUListElement }, ids.join(" "));
}

const ids = (n: number, from = 0) => Array.from({ length: n }, (_, i) => `c${from + n - i}`);

let reduced = false;
beforeEach(() => {
  hooks.refs = [];
  reduced = false;
  vi.stubGlobal("document", { documentElement: {} });
  vi.stubGlobal("getComputedStyle", () => ({ getPropertyValue: () => "" }));
  vi.stubGlobal("matchMedia", () => ({ matches: reduced }));
  vi.stubGlobal("window", { setTimeout: () => 0 });
});
afterEach(() => vi.unstubAllGlobals());

describe("IT1-STAFF-risk-1 a scrolled This class list stays put when check-ins arrive", () => {
  it("IT1-STAFF-risk-1 over 40 rows: one arrival adds its row's height to scrollTop", () => {
    const l = list(400);
    render(l, ids(41));
    render(l, ["new1", ...ids(41)]);
    expect(l.ul.scrollTop).toBe(400 + ROW);
    expect(l.row("new1").classes.has("is-new")).toBe(true);
    expect(l.row("c41").animated).toBe(0);
  });

  it("IT1-STAFF-risk-1 reduced motion: one arrival adds its row's height to scrollTop, with no motion", () => {
    reduced = true;
    const l = list(60);
    render(l, ids(12));
    render(l, ["new1", ...ids(12)]);
    expect(l.ul.scrollTop).toBe(60 + ROW);
    expect(l.row("new1").classes.has("is-new")).toBe(true);
    expect(l.row("new1").animated + l.row("c12").animated).toBe(0);
  });

  it("IT1-STAFF-risk-1 4 arrivals in one update: scrollTop takes all 4 rows, no tint (a reconnect or rush)", () => {
    const l = list(100);
    render(l, ids(20));
    render(l, ["n1", "n2", "n3", "n4", ...ids(20)]);
    expect(l.ul.scrollTop).toBe(100 + 4 * ROW);
    expect(l.row("n1").classes.size).toBe(0);
  });

  it("IT1-STAFF-risk-1 a class change (every row new) leaves scrollTop alone", () => {
    const l = list(100);
    render(l, ids(20));
    render(l, ids(20, 100));
    expect(l.ul.scrollTop).toBe(100);
  });

  it("IT1-STAFF-risk-1 as before: a scrolled list under 40 rows keeps its place and tints the new row", () => {
    const l = list(80);
    render(l, ids(10));
    render(l, ["new1", ...ids(10)]);
    expect(l.ul.scrollTop).toBe(80 + ROW);
    expect(l.row("new1").classes.has("is-new")).toBe(true);
    expect(l.row("new1").animated).toBe(0);
  });

  it("IT1-STAFF-risk-1 as before: a list at its top stays at the top and the rows move down (FLIP)", () => {
    const l = list(0);
    render(l, ids(5));
    render(l, ["new1", ...ids(5)]);
    expect(l.ul.scrollTop).toBe(0);
    expect(l.row("new1").animated).toBe(1);
    expect(l.row("c5").animated).toBe(1);
  });
});
