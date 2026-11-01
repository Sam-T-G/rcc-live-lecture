// @vitest-environment node
// LX-spec-1 and LX-risk-2: End class on #/host Points (Boards.tsx EndCard). It has the same name and
// question as End class on #/checkin/teacher (both run live.groups.endDay), and the line End day
// returns shows only until the next class opens: Page.tsx keeps the Points panel mounted, so
// without that the line from last class would sit under this class's board. The same stand-in
// for React's hooks as src/teams/checkin/Teacher.endClass.test.ts. People are samples.
import { Fragment, createElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { getFunctionName, type FunctionReference } from "convex/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const hooks = vi.hoisted(() => ({ slots: new Map<string, unknown[]>(), path: "", at: 0 }));
vi.mock("react", async (orig) => {
  const R = await orig<typeof import("react")>();
  function slot(make: () => unknown): [unknown[], number] {
    let list = hooks.slots.get(hooks.path);
    if (!list) hooks.slots.set(hooks.path, (list = []));
    const i = hooks.at++;
    if (!(i in list)) list[i] = make();
    return [list, i];
  }
  return {
    ...R,
    useState: (init: unknown) => {
      const [list, i] = slot(() => (typeof init === "function" ? (init as () => unknown)() : init));
      const set = (next: unknown) => {
        list[i] = typeof next === "function" ? (next as (v: unknown) => unknown)(list[i]) : next;
      };
      return [list[i], set];
    },
    useRef: (init: unknown) => {
      const [list, i] = slot(() => ({ current: init }));
      return list[i];
    },
    useEffect: () => {},
    useId: () => {
      const [list, i] = slot(() => `id${hooks.slots.size}-${hooks.at}`);
      return list[i];
    },
  };
});

type Sent = { name: string; args: Record<string, unknown>; resolve: (v: unknown) => void };
const server = vi.hoisted(() => ({ results: {} as Record<string, unknown>, sent: [] as Sent[] }));
vi.mock("convex/react", () => ({
  useQuery: (ref: FunctionReference<"query">) => server.results[getFunctionName(ref)],
  useMutation: (ref: FunctionReference<"mutation">) => (args: Record<string, unknown>) =>
    new Promise((resolve) => server.sent.push({ name: getFunctionName(ref), args, resolve })),
  useConvex: () => ({ query: async () => ({ page: [], isDone: true, continueCursor: "" }) }),
}));

const { PointsTab } = await import("./Boards");

type Host = { type: string; props: Record<string, unknown>; children: Tree[] };
type Tree = Host | string;
function expand(node: ReactNode, path: string): Tree[] {
  if (node === null || node === undefined || typeof node === "boolean") return [];
  if (typeof node === "string" || typeof node === "number") return [String(node)];
  if (Array.isArray(node)) return node.flatMap((n, i) => expand(n, `${path}.${i}`));
  if (!isValidElement(node)) return [];
  const el = node as ReactElement<{ children?: ReactNode } & Record<string, unknown>>;
  const at = el.key === null ? path : `${path}[${el.key}]`;
  if (el.type === Fragment) return expand(el.props.children, at);
  if (typeof el.type === "function") {
    const own = `${at}/${el.type.name}`;
    const saved = { path: hooks.path, at: hooks.at };
    hooks.path = own;
    hooks.at = 0;
    const out = (el.type as (props: unknown) => ReactNode)(el.props);
    Object.assign(hooks, saved);
    return expand(out, own);
  }
  const { children, ...props } = el.props;
  return [{ type: el.type as string, props, children: expand(children, at) }];
}
const page = () => expand(createElement(PointsTab), "root");
function words(t: Tree | Tree[]): string {
  const raw = (x: Tree | Tree[]): string => (Array.isArray(x) ? x.map(raw).join(" ") : typeof x === "string" ? x : raw(x.children));
  return raw(t).replace(/\s+/g, " ").trim();
}
const hosts = (t: Tree[]): Host[] => t.flatMap((x) => (typeof x === "string" ? [] : [x, ...hosts(x.children)]));
function press(t: Tree[], label: string) {
  const el = hosts(t).find((h) => h.type === "button" && words(h) === label);
  if (!el) throw new Error(`no button "${label}" in: ${words(t)}`);
  (el.props.onClick as (e: unknown) => void)({ preventDefault: () => {} });
}
// The words in the End of class card.
const endCard = (t: Tree[]) => {
  const el = hosts(t).find((h) => h.type === "section" && words(h).startsWith("End of class"));
  return el && words(el);
};
const settle = () => new Promise((r) => setTimeout(r, 0));

const LINE = "Red came 1st with 4 points, 1.0 per student. Saved extra credit for 4 students. The next class starts from 0 points.";
const QUESTION =
  "End this class? Each student gets their team's extra credit now. Next class, everyone checks in again and points start from 0. This can't be undone.";
const team = (label: string, members: number, points: number) => ({ team: 0, color: "red", label, members, correct: points, changes: 0, points, perStudent: points / members, rank: 1, ec: 5 });
const at = Date.UTC(2026, 10, 5, 22, 20);
const open = { lecture: "k1", open: true, startedAt: at, startsAt: at + 600_000, graceMin: 5, endedAt: null, count: 4 };
const ended = { ...open, open: false, endedAt: at + 3_600_000 };
const next = { ...open, lecture: "k2", startedAt: at + 7 * 86_400_000, startsAt: null, count: 1 };

beforeEach(() => {
  hooks.slots = new Map();
  server.sent = [];
  server.results = {
    "live/groups:leaderboard": { questions: 1, teams: [team("Red", 4, 4)] },
    "live/groups:status": { size: 4, locked: true, locksAt: null },
    "live/groups:roster": [],
    "live/groups:pointLog": [],
    "checkin/attendance:lectures": [open],
  };
});

describe("#/host Points: End class", () => {
  it("LX-risk-2 has the same name and question as End class on #/checkin/teacher", () => {
    expect(endCard(page())).toBe("End of class End class Download extra credit (CSV)");
    press(page(), "End class");
    expect(endCard(page())).toBe(`End of class ${QUESTION} End class Cancel Download extra credit (CSV)`);
    expect(endCard(page())).not.toMatch(/End day|End the day/);
  });

  it("LX-spec-1 the line End day returns shows until the next class opens, and doesn't come back when that class ends", async () => {
    press(page(), "End class");
    press(page(), "End class");
    expect(server.sent.map((s) => [s.name, s.args])).toEqual([["live/groups:endDay", { channel: "gdg" }]]);
    server.sent[0].resolve(LINE);
    await settle();
    // The list can still show the class open for a moment: the line is about it.
    expect(endCard(page())).toContain(LINE);
    server.results["checkin/attendance:lectures"] = [ended];
    expect(endCard(page())).toContain(LINE);
    // Next class opens (a deck press or a scan): one student on Red at 0 points, teams not locked.
    server.results["live/groups:leaderboard"] = { questions: 0, teams: [team("Red", 1, 0)] };
    server.results["live/groups:status"] = { size: 4, locked: false, locksAt: next.startedAt + 300_000 };
    server.results["checkin/attendance:lectures"] = [next, ended];
    expect(endCard(page())).toBe("End of class End class Download extra credit (CSV)");
    // That class ends some other way (End class on #/checkin/teacher, or the 12-hour close).
    server.results["checkin/attendance:lectures"] = [{ ...next, open: false, endedAt: next.startedAt + 3_600_000 }, ended];
    expect(endCard(page())).toBe("End of class End class Download extra credit (CSV)");
  });

  it("LX-spec-1 End class with no class running keeps its line until a class opens", async () => {
    server.results["checkin/attendance:lectures"] = [ended];
    press(page(), "End class");
    press(page(), "End class");
    server.sent[0].resolve("No class is running.");
    await settle();
    expect(endCard(page())).toContain("No class is running.");
    server.results["checkin/attendance:lectures"] = [next, ended];
    expect(endCard(page())).not.toContain("No class is running.");
  });
});
