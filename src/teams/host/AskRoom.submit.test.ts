// @vitest-environment node
// sweep2-tests-6 and sweep2-ledger-4: what #/host's Ask the room sends checkin.quiz.ask when the
// professor presses Ask the room or Start the vote (F26.1, F26.2). Blank boxes drop out and the
// right answer follows its own box; an AI draft keeps its slide and is marked aiDraft; a vote has
// no right answer; a right answer on a blank box is refused before anything is sent. The same
// stand-in for React's hooks as Boards.endCard.test.ts, so the form's state carries from one
// render to the next.
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
const markRight = (letter: string) => (input((h) => h.props["aria-label"] === `${letter} is the right answer`, `${letter}'s right answer`).props.onChange as () => void)();
const pickKind = (kind: "quiz" | "vote") => (input((h) => h.props.type === "radio" && h.props.value === kind, kind).props.onChange as () => void)();
function submit() {
  const form = hosts(page()).find((h) => h.type === "form");
  if (!form) throw new Error(`no form in: ${words(page())}`);
  (form.props.onSubmit as (e: unknown) => void)({ preventDefault: () => {} });
}
const asked = () => server.sent.filter((s) => s.name === "checkin/quiz:ask").map((s) => s.args);
const settle = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  hooks.slots = new Map();
  server.sent = [];
  server.results = { "checkin/quiz:current": null };
  server.draft = null;
});

describe("#/host Ask the room: what Ask the room sends (F26.1, F26.2)", () => {
  it("an AI draft keeps its slide and aiDraft, and its right answer follows its box when a box above it is cleared", async () => {
    server.draft = { question: "Which planet is closest to the sun?", choices: ["Venus", "Mars", "Mercury", "Earth"], correct: 2, index: 4 };
    press("Draft with AI");
    await settle();
    typeChoice("B", "");
    submit();
    await settle();
    expect(asked()).toEqual([
      { channel: "gdg", kind: "quiz", question: "Which planet is closest to the sun?", choices: ["Venus", "Mercury", "Earth"], correct: 1, index: 4, aiDraft: true },
    ]);
  });

  it("a quiz written by hand: blank boxes drop out, the right answer follows its box, no slide and no aiDraft", async () => {
    press("Write my own");
    typeQuestion("Which one is a vowel?");
    typeChoice("A", "B");
    typeChoice("C", "E");
    typeChoice("D", "K");
    markRight("C");
    submit();
    await settle();
    expect(asked()).toEqual([{ channel: "gdg", kind: "quiz", question: "Which one is a vowel?", choices: ["B", "E", "K"], correct: 1 }]);
  });

  it("a quiz with no right answer sends no correct", async () => {
    press("Write my own");
    typeQuestion("Which part did you like best?");
    typeChoice("A", "Slides");
    typeChoice("B", "Demo");
    submit();
    await settle();
    expect(asked()).toEqual([{ channel: "gdg", kind: "quiz", question: "Which part did you like best?", choices: ["Slides", "Demo"] }]);
  });

  it("a vote sends no correct, even after a box was marked right while it was a quiz", async () => {
    press("Write my own");
    typeQuestion("Pizza or tacos?");
    typeChoice("A", "Pizza");
    typeChoice("B", "Tacos");
    markRight("A");
    pickKind("vote");
    submit();
    await settle();
    expect(asked()).toEqual([{ channel: "gdg", kind: "vote", question: "Pizza or tacos?", choices: ["Pizza", "Tacos"] }]);
  });

  it("a right answer on a blank box is refused with \"Type the right answer's choice.\" and nothing is sent", async () => {
    press("Write my own");
    typeQuestion("Which one is a vowel?");
    typeChoice("A", "E");
    typeChoice("B", "K");
    markRight("D");
    submit();
    await settle();
    expect(asked()).toEqual([]);
    expect(words(page())).toContain("Type the right answer's choice.");
  });
});
