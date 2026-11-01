// @vitest-environment node
// DS-HOST-design-1, DS-HOST-risk-5, DS-HOST-check-1, DS-HOST-risk-6: where #/host's Ask the room
// puts a new question's form when a question already exists, how the bars draw while an open
// question's stats load, and how "Who got it wrong" fits a long name. The same stand-in for React's
// hooks as AskRoom.submit.test.ts, so pressing Write my own opens the form on the next render.
import { readFileSync } from "node:fs";
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
const server = vi.hoisted(() => ({ results: {} as Record<string, unknown>, sent: [] as Sent[], draft: null as unknown }));
vi.mock("convex/react", () => ({
  useQuery: (ref: FunctionReference<"query">) => server.results[getFunctionName(ref)],
  useMutation: (ref: FunctionReference<"mutation">) => async (args: Record<string, unknown>) => {
    server.sent.push({ name: getFunctionName(ref), args });
    return "p1";
  },
  useAction: (ref: FunctionReference<"action">) => async (args: Record<string, unknown>) => {
    server.sent.push({ name: getFunctionName(ref), args });
    return server.draft;
  },
}));

const { default: AskRoom } = await import("./AskRoom");

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
const page = () => expand(createElement(AskRoom, { slideIndex: 6 }), "root");
function words(t: Tree | Tree[]): string {
  const raw = (x: Tree | Tree[]): string => (Array.isArray(x) ? x.map(raw).join(" ") : typeof x === "string" ? x : raw(x.children));
  return raw(t).replace(/\s+/g, " ").trim();
}
const hosts = (t: Tree[]): Host[] => t.flatMap((x) => (typeof x === "string" ? [] : [x, ...hosts(x.children)]));
function press(label: string) {
  const t = page();
  const el = hosts(t).find((h) => h.type === "button" && words(h) === label);
  if (!el) throw new Error(`no button "${label}" in: ${words(t)}`);
  (el.props.onClick as (e: unknown) => void)({ preventDefault: () => {} });
}
// The input `pick` finds, on a fresh render.
function input(pick: (h: Host) => boolean, what: string) {
  const el = hosts(page()).find((h) => h.type === "input" && pick(h));
  if (!el) throw new Error(`no ${what}`);
  return el;
}
const type = (pick: (h: Host) => boolean, what: string, value: string) =>
  (input(pick, what).props.onChange as (e: unknown) => void)({ target: { value } });
const typeQuestion = (value: string) => type((h) => h.props.type === undefined && h.props["aria-label"] === undefined, "question box", value);
const typeChoice = (letter: string, value: string) => type((h) => h.props["aria-label"] === `Choice ${letter}`, `choice ${letter}`, value);
function submit() {
  const form = hosts(page()).find((h) => h.type === "form");
  if (!form) throw new Error(`no form in: ${words(page())}`);
  (form.props.onSubmit as (e: unknown) => void)({ preventDefault: () => {} });
}
const settle = () => new Promise((r) => setTimeout(r, 0));

const POLL = { id: "p1", kind: "quiz", question: "Which one is a fruit?", choices: ["Pear", "Brick", "Stone"], answered: 5, results: null };
const STATS = { counts: [3, 2, 0], answered: 5, checkedIn: 9, correct: 0, rightPct: 60, medianSec: 7, index: null, aiDraft: false };
const card = (t: Tree[]) => hosts(t).find((h) => h.type === "section");
const has = (t: Tree[], cls: string) => hosts(t).some((h) => String(h.props.className ?? "").split(" ").includes(cls));

beforeEach(() => {
  hooks.slots = new Map();
  server.sent = [];
  server.results = { "checkin/quiz:current": null };
  server.draft = null;
});

describe("#/host Ask the room: the form when a question already exists (DS-HOST-design-1)", () => {
  for (const open of [true, false]) {
    it(`${open ? "an open" : "an ended"} quiz: Write my own puts the form in the card's draft placement, results folded`, () => {
      server.results = { "checkin/quiz:current": { ...POLL, open }, "checkin/quiz:stats": STATS };
      expect(String(card(page())?.props.className)).not.toContain("ask--draft");
      expect(has(page(), "ask-bars")).toBe(true);
      press("Write my own");
      const t = page();
      expect(String(card(t)?.props.className).split(" ")).toContain("ask--draft");
      // The old results fold away, so the form takes their place under the heading row.
      expect(has(t, "ask-bars")).toBe(false);
      expect(has(t, "ask__tally")).toBe(false);
      expect(hosts(t).some((h) => h.type === "form")).toBe(true);
      expect(words(t)).toContain(open ? "Open" : "Ended");
      // End stays on screen while a question is open; Cancel brings the results back.
      expect(words(t).includes("End the quiz")).toBe(open);
      press("Cancel");
      expect(has(page(), "ask-bars")).toBe(true);
      expect(String(card(page())?.props.className)).not.toContain("ask--draft");
    });
  }

  it("End still ends the open quiz while the next one is being written", async () => {
    server.results = { "checkin/quiz:current": { ...POLL, open: true }, "checkin/quiz:stats": STATS };
    press("Write my own");
    press("End the quiz");
    await settle();
    expect(server.sent.map((s) => s.name)).toContain("checkin/quiz:end");
  });

  it("the form still asks the next question after one ended", async () => {
    server.results = { "checkin/quiz:current": { ...POLL, open: false }, "checkin/quiz:stats": STATS };
    press("Write my own");
    typeQuestion("Pizza or tacos?");
    typeChoice("A", "Pizza");
    typeChoice("B", "Tacos");
    submit();
    await settle();
    expect(server.sent.filter((s) => s.name === "checkin/quiz:ask").map((s) => s.args)).toEqual([
      { channel: "gdg", kind: "quiz", question: "Pizza or tacos?", choices: ["Pizza", "Tacos"] },
    ]);
  });
});

describe("#/host Ask the room: bars while an open question's stats load (DS-HOST-risk-5)", () => {
  it("no choice is drawn as the leader before the counts arrive", () => {
    server.results = { "checkin/quiz:current": { ...POLL, open: true } };
    const rows = hosts(page()).filter((h) => h.type === "li");
    expect(rows).toHaveLength(3);
    expect(rows.filter((r) => String(r.props.className).includes("is-lead"))).toEqual([]);
  });

  it("once the counts arrive, the choice most picked leads", () => {
    server.results = { "checkin/quiz:current": { ...POLL, open: true }, "checkin/quiz:stats": STATS };
    const rows = hosts(page()).filter((h) => h.type === "li");
    expect(rows.map((r) => String(r.props.className).includes("is-lead"))).toEqual([true, false, false]);
  });
});

describe("ask.css: Who got it wrong (DS-HOST-check-1, DS-HOST-risk-6)", () => {
  const CSS = readFileSync(new URL("./ask.css", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const rules = [...CSS.matchAll(/([^{}]+)\{([^}]*)\}/g)].map((m) => ({ sel: m[1].trim(), body: m[2] }));
  const nameCell = (sel: string) => sel.split(",").some((s) => /\.ask-wrong__table td(:first-child)?$/.test(s.trim()));

  it("a student's name wraps in full instead of ending in an ellipsis", () => {
    const name = rules.filter((r) => nameCell(r.sel));
    expect(name.some((r) => /white-space:\s*normal/.test(r.body))).toBe(true);
    expect(name.some((r) => /overflow-wrap:\s*anywhere/.test(r.body))).toBe(true);
    expect(name.filter((r) => /text-overflow:\s*ellipsis/.test(r.body))).toEqual([]);
    // Picked holds the choice's words ("Hash table"), so it wraps too.
    const picked = rules.filter((r) => r.sel.split(",").some((s) => s.trim() === ".ask-wrong__table td:last-child"));
    expect(picked.some((r) => /white-space:\s*normal/.test(r.body))).toBe(true);
    expect(CSS).not.toMatch(/text-overflow:\s*ellipsis/);
  });

  it("Name is the widest column, and the waiting well's head uses the table's widths", () => {
    const width = (sel: RegExp) => Number(rules.find((r) => sel.test(r.sel))?.body.match(/width:\s*(\d+)%/)?.[1]);
    const name = width(/\.ask-wrong__table th:first-child$/);
    const team = width(/\.ask-wrong__table th:nth-child\(2\)$/);
    expect(name).toBeGreaterThan(team);
    expect(name + team).toBeLessThanOrEqual(80);
    const wait = rules.find((r) => r.sel === ".ask-wrong__wait")?.body ?? "";
    expect(wait).toContain(`--rcols: ${name}% ${team}% minmax(0, 1fr)`);
  });
});
