// @vitest-environment node
// The board reorder's travel on #/live/leaderboard (StageBoard.tsx useReorder; MOTION.md projector
// board-reorder). There is no browser DOM, so React's hooks are swapped for a stand-in that keeps
// state and refs between renders and runs a layout effect when its deps change, the rows are
// stand-in elements whose spots the test sets, and each cell's animate() records its keyframes.
// IT1-PROJECTOR-risk-2: every keyframe moves only transform and opacity. IT1-PROJECTOR-risk-3: a
// team travels from where its row stood right before the new order, even after the page's scale
// changed with no new order (a window going full screen).
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const hooks = vi.hoisted(() => ({
  slots: [] as unknown[],
  at: 0,
  effects: [] as (() => void)[],
}));
vi.mock("react", async (orig) => {
  const R = await orig<typeof import("react")>();
  function slot<T>(make: () => T): [unknown[], number] {
    const i = hooks.at++;
    if (!(i in hooks.slots)) hooks.slots[i] = make();
    return [hooks.slots, i];
  }
  return {
    ...R,
    useState: (init: unknown) => {
      const [list, i] = slot(() => (typeof init === "function" ? (init as () => unknown)() : init));
      return [list[i], (next: unknown) => (list[i] = typeof next === "function" ? (next as (v: unknown) => unknown)(list[i]) : next)];
    },
    useRef: (init: unknown) => {
      const [list, i] = slot(() => ({ current: init }));
      return list[i];
    },
    // Runs after the test has attached the rows (commit()), when its deps changed.
    useLayoutEffect: (fn: () => void, deps: unknown[]) => {
      const [list, i] = slot(() => ({ deps: null as unknown[] | null }));
      const s = list[i] as { deps: unknown[] | null };
      if (!s.deps || s.deps.some((d, k) => d !== deps[k])) {
        s.deps = deps;
        hooks.effects.push(fn);
      }
    },
    useEffect: () => {},
  };
});
const results: Record<string, unknown> = {};
vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  return {
    useQuery: (ref: Parameters<typeof getFunctionName>[0]) => results[getFunctionName(ref)],
    useMutation: () => async () => null,
  };
});
vi.mock("../../blocks/auth", () => ({ useGoogleUser: () => ({ user: null }) }));
vi.mock("../../blocks/deck", () => ({ CHANNEL: "gdg" }));

const { StageBoard } = await import("./StageBoard");

type Frames = Record<string, unknown>[];
type Cell = { style: Record<string, string>; offsetLeft: number; frames: Frames[]; getAnimations: () => []; animate: (f: Frames) => { finished: Promise<void> } };
const cell = (): Cell => {
  const c: Cell = {
    style: {},
    offsetLeft: 0,
    frames: [],
    getAnimations: () => [],
    animate(f) {
      c.frames.push(f);
      return { finished: Promise.resolve() };
    },
  };
  return c;
};
// A ledger row: its spot (set by place()), its two moving cells, and the plates added to it.
type Row = { team: number; offsetLeft: number; offsetTop: number; clientWidth: number; parentElement: { offsetLeft: number; offsetTop: number }; cells: Cell[]; plates: Cell[] };
const list = { offsetLeft: 0, offsetTop: 0 };
const els = new Map<number, Row>();
function row(team: number): Row {
  let r = els.get(team);
  if (r) return r;
  const plates: Cell[] = [];
  r = {
    team,
    offsetLeft: 0,
    offsetTop: 0,
    clientWidth: 800,
    parentElement: list,
    cells: [cell(), cell()],
    plates,
    ...{
      querySelectorAll: (sel: string) => (sel.includes("pledger__plate") ? [] : els.get(team)!.cells),
      querySelector: () => ({ offsetLeft: 600 }),
      append: (p: Cell) => plates.push(p),
      classList: { add: () => {}, remove: () => {} },
    },
  } as Row;
  els.set(team, r);
  return r;
}
// The rows in this order, `pitch` stage px apart (the page's scale).
const place = (order: number[], pitch: number) => order.forEach((team, i) => (row(team).offsetTop = i * pitch));

type El = ReactElement<{ children?: ReactNode; row?: (el: unknown) => void; g?: { team: number } }>;
function elements(node: ReactNode): El[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement(node)) return [];
  const el = node as El;
  return [el, ...elements(el.props.children)];
}

// Five teams, each alone in its place: the 1st place block, then the ledger of the other four.
const COLORS = ["red", "blue", "yellow", "green", "orange"];
function scores(order: number[]) {
  results["live/groups:leaderboard"] = {
    questions: 3,
    teams: order.map((team, i) => ({ team, color: COLORS[team], label: COLORS[team], members: 3, correct: 9 - i, changes: 0, points: 9 - i, perStudent: (9 - i) / 3, rank: i + 1, ec: 0 })),
  };
}
// One render of the board and its commit: the rows the ledger lists get their elements, the page
// lays them out (`pitch`), then the layout effects run.
function render(order: number[], pitch: number) {
  scores(order);
  hooks.at = 0;
  const ledger = elements(StageBoard()).filter((e) => typeof e.props.row === "function");
  place(ledger.map((e) => e.props.g!.team), pitch);
  ledger.forEach((e) => e.props.row!(row(e.props.g!.team)));
  const run = hooks.effects.splice(0);
  run.forEach((fn) => fn());
  return ledger.map((e) => e.props.g!.team);
}

let reduced = false;
const TOKENS: Record<string, string> = { "--fx-fast": "120ms", "--fx": "200ms", "--sp": "420ms", "--ease": "ease-out", "--lift": "#fff" };
beforeEach(() => {
  hooks.slots = [];
  hooks.effects = [];
  els.clear();
  reduced = false;
  for (const k of Object.keys(results)) delete results[k];
  results["live/groups:status"] = { size: 4, locked: true, locksAt: null };
  results["live/groups:mine"] = null;
  vi.useFakeTimers();
  vi.stubGlobal("window", { setTimeout, clearTimeout, matchMedia: () => ({ matches: reduced }) });
  vi.stubGlobal("document", { documentElement: {}, createElement: () => ({ ...cell(), setAttribute: () => {}, remove: () => {} }) });
  vi.stubGlobal("getComputedStyle", () => ({ backgroundColor: "rgba(0, 0, 0, 0)", getPropertyValue: (n: string) => TOKENS[n] ?? "" }));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const travel = (team: number) => row(team).cells[0].frames.at(-1);
const allFrames = () => [...els.values()].flatMap((r) => [...r.cells, ...r.plates].flatMap((c) => c.frames));

describe("the board reorder's travel (StageBoard.tsx useReorder)", () => {
  it("IT1-PROJECTOR-risk-3 a team travels from where its row stood just before the new order, after a resize with no new order", () => {
    // Blue (1) 1st; Yellow, Green, Orange, Red in the ledger 100 apart in a 1280 x 720 window.
    expect(render([1, 2, 3, 4, 0], 100)).toEqual([2, 3, 4, 0]);
    // Full screen: the scale goes from 2/3 to 1, so the rows stand 150 apart; nothing renders.
    place([2, 3, 4, 0], 150);
    // After the next quiz Green passes Yellow: Green goes from slot 1 (y 150) to slot 0 (y 0).
    expect(render([1, 3, 2, 4, 0], 150)).toEqual([3, 2, 4, 0]);
    expect(travel(3)?.[0]).toEqual({ transform: "translateY(150px)" });
    expect(travel(2)?.[0]).toEqual({ transform: "translateY(-150px)" });
    // Teams that kept their slot don't move.
    expect(row(4).cells[0].frames).toEqual([]);
  });

  it("IT1-PROJECTOR-risk-2 every keyframe of the move (the travel, the plate, the reduced-motion arrival) is transform and opacity only", () => {
    render([1, 2, 3, 4, 0], 100);
    render([1, 3, 2, 4, 0], 100);
    // Reduced motion: the words arrive at their new row.
    reduced = true;
    render([1, 2, 3, 4, 0], 100);
    const frames = allFrames();
    // Both cells of both moved rows, twice, and the rising team's plate once.
    expect(frames.length).toBe(9);
    expect(row(3).plates).toHaveLength(1);
    const keys = new Set(frames.flatMap((f) => f.flatMap((k) => Object.keys(k))));
    expect([...keys].filter((k) => !["transform", "opacity", "offset"].includes(k))).toEqual([]);
  });
});
