// @vitest-environment node
// sweep2-tests-9 and sweep2-ledger-9: #/host Points' Students card (Boards.tsx StudentsCard). A
// team's button shows only that team's students and a second press shows everyone again (F28.2);
// the reason typed goes with the next +1 or −1 (F28.3). The same stand-in for React's hooks as
// Boards.endCard.test.ts. People are samples.
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

type Sent = { name: string; args: Record<string, unknown> };
const server = vi.hoisted(() => ({ results: {} as Record<string, unknown>, sent: [] as Sent[] }));
vi.mock("convex/react", () => ({
  useQuery: (ref: FunctionReference<"query">) => server.results[getFunctionName(ref)],
  useMutation: (ref: FunctionReference<"mutation">) => async (args: Record<string, unknown>) => {
    server.sent.push({ name: getFunctionName(ref), args });
    return null;
  },
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
function words(t: Tree | Tree[]): string {
  const raw = (x: Tree | Tree[]): string => (Array.isArray(x) ? x.map(raw).join(" ") : typeof x === "string" ? x : raw(x.children));
  return raw(t).replace(/\s+/g, " ").trim();
}
const hosts = (t: Tree[]): Host[] => t.flatMap((x) => (typeof x === "string" ? [] : [x, ...hosts(x.children)]));
// The Students card, on a fresh render.
function card() {
  const all = expand(createElement(PointsTab), "root");
  const el = hosts(all).find((h) => h.type === "section" && words(h).startsWith("Students"));
  if (!el) throw new Error(`no Students card in: ${words(all)}`);
  return el;
}
// The names in the card's table, in order.
const names = () => hosts([card()]).filter((h) => h.type === "tr").slice(1).map((tr) => words(tr.children[1]));
// Presses the card's button whose words or aria-label are `label`.
function press(label: string) {
  const el = hosts([card()]).find((h) => h.type === "button" && (h.props["aria-label"] === label || words(h) === label));
  if (!el) throw new Error(`no button "${label}" in: ${words(card())}`);
  (el.props.onClick as (e: unknown) => void)({ preventDefault: () => {} });
}
const settle = () => new Promise((r) => setTimeout(r, 0));

const RED = { team: 0, color: "red", label: "Red" };
const BLUE = { team: 1, color: "blue", label: "Blue" };
const team = (info: typeof RED, members: number) => ({ ...info, members, correct: 2, changes: 0, points: 2, perStudent: 2 / members, rank: 1, ec: 5 });
const student = (n: number, info: typeof RED, points: number) => ({ checkin: `checkin${n}`, name: `Sample student ${n}`, team: info, right: points, answered: 2, changes: 0, points, ec: 0 });

beforeEach(() => {
  hooks.slots = new Map();
  server.sent = [];
  server.results = {
    "live/groups:leaderboard": { questions: 2, teams: [team(RED, 2), team(BLUE, 1)] },
    "live/groups:status": { size: 4, locked: true, locksAt: null },
    "live/groups:roster": [student(1, RED, 2), student(2, BLUE, 2), student(3, RED, 0)],
    "live/groups:pointLog": [],
    "checkin/attendance:lectures": [],
  };
});

describe("#/host Points: the Students card", () => {
  it("F28.2 a team's button shows only that team's students; pressing it again shows everyone", () => {
    expect(names()).toEqual(["Sample student 1", "Sample student 2", "Sample student 3"]);
    press("Red");
    expect(names()).toEqual(["Sample student 1", "Sample student 3"]);
    press("Blue");
    expect(names()).toEqual(["Sample student 2"]);
    press("Blue");
    expect(names()).toEqual(["Sample student 1", "Sample student 2", "Sample student 3"]);
    press("Red");
    press("Everyone");
    expect(names()).toEqual(["Sample student 1", "Sample student 2", "Sample student 3"]);
  });

  it("F28.3 the reason typed goes with the next −1 and is cleared after it; with no reason none is sent", async () => {
    const box = hosts([card()]).find((h) => h.type === "input" && h.props.type === "text");
    (box!.props.onChange as (e: unknown) => void)({ target: { value: "Phone out in class" } });
    press("Take 1 point off Sample student 2");
    await settle();
    press("Give Sample student 1 1 point");
    await settle();
    expect(server.sent.map((s) => [s.name, s.args])).toEqual([
      ["live/groups:adjust", { channel: "gdg", checkin: "checkin2", delta: -1, reason: "Phone out in class" }],
      ["live/groups:adjust", { channel: "gdg", checkin: "checkin1", delta: 1 }],
    ]);
  });
});
