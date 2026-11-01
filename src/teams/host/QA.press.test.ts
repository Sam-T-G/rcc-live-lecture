// @vitest-environment node
// sweep2-tests-7 and sweep2-ledger-5: what #/host Questions sends when the professor presses Save
// answer, Share the answer and Stop sharing (F30.3, F30.4). The same stand-in for React's hooks as
// Boards.endCard.test.ts, so the typed answer carries from one render to the next.
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
const server = vi.hoisted(() => ({ items: [] as unknown[], sent: [] as Sent[] }));
vi.mock("convex/react", () => ({
  useQuery: () => server.items,
  useMutation: (ref: FunctionReference<"mutation">) => async (args: Record<string, unknown>) => {
    server.sent.push({ name: getFunctionName(ref), args });
    return null;
  },
  useAction: () => async () => 0,
}));

const { default: QA } = await import("./QA");

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
// The question whose text is `text`, on a fresh render.
function row(text: string) {
  const all = expand(createElement(QA), "root");
  const li = hosts(all).find((h) => h.type === "li" && words(h).startsWith(text));
  if (!li) throw new Error(`no question "${text}" in: ${words(all)}`);
  return li;
}
function press(text: string, label: string) {
  const el = hosts([row(text)]).find((h) => h.type === "button" && words(h) === label);
  if (!el) throw new Error(`no button "${label}" on "${text}": ${words(row(text))}`);
  (el.props.onClick as (e: unknown) => void)({ preventDefault: () => {} });
}
const sent = (name: string) => server.sent.filter((s) => s.name === name).map((s) => s.args);
const settle = () => new Promise((r) => setTimeout(r, 0));

const item = (o: Record<string, unknown>) => ({
  _id: "q1",
  index: 3,
  text: "What does O(n) mean?",
  name: null,
  private: false,
  votes: 1,
  at: Date.UTC(2026, 10, 5, 21, 40),
  topic: null,
  cluster: null,
  status: "new",
  answer: null,
  shared: false,
  ...o,
});

beforeEach(() => {
  hooks.slots = new Map();
  server.sent = [];
  server.items = [
    item({ _id: "q1", text: "What does O(n) mean?" }),
    item({ _id: "q2", text: "Where are the slides posted?", answer: "On the class site.", shared: false }),
    item({ _id: "q3", text: "Is there a quiz Friday?", answer: "Yes, on chapter 4.", shared: true }),
  ];
});

describe("#/host Questions: what the buttons send", () => {
  it("F30.3 Save answer sends the question and exactly the words typed", async () => {
    press("What does O(n) mean?", "Type answer");
    const box = hosts([row("What does O(n) mean?")]).find((h) => h.type === "textarea");
    (box!.props.onChange as (e: unknown) => void)({ target: { value: "How the steps grow with the input size." } });
    const form = hosts([row("What does O(n) mean?")]).find((h) => h.type === "form");
    (form!.props.onSubmit as (e: unknown) => void)({ preventDefault: () => {} });
    await settle();
    expect(sent("live/questions:answer")).toEqual([{ question: "q1", text: "How the steps grow with the input size." }]);
  });

  it("F30.4 Share the answer sends shared: true; Stop sharing sends shared: false", async () => {
    press("Where are the slides posted?", "Share the answer");
    await settle();
    press("Is there a quiz Friday?", "Stop sharing");
    await settle();
    expect(sent("live/questions:share")).toEqual([
      { question: "q2", shared: true },
      { question: "q3", shared: false },
    ]);
  });
});
