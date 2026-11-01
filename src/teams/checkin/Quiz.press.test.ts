// @vitest-environment node
// #/checkin/quiz and the student's quiz card when someone presses twice, or the server says no.
// These tests have no browser DOM, so React's hooks are swapped for a small stand-in that keeps
// each component's state between renders, keyed by where the component sits in the tree (and its
// key), the way React keys it. render() calls every component as a plain function down to the
// HTML elements. press() does what a browser does with a click: nothing on a disabled button;
// otherwise the button's onClick, then, for a submit button whose click wasn't canceled, the
// browser's own check of required fields (unless the form has noValidate) and the form's onSubmit.
// Every mutation call waits until the test resolves or rejects it, like a slow network.
import { Fragment, createElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { getFunctionName, type FunctionReference } from "convex/server";
import { ConvexError } from "convex/values";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
    useId: () => "id",
  };
});

type Sent = { name: string; args: Record<string, unknown>; resolve: (v: unknown) => void; reject: (e: unknown) => void };
const server = vi.hoisted(() => ({
  results: {} as Record<string, unknown>,
  user: null as null | { name: string; email: string },
  sent: [] as Sent[],
}));
vi.mock("convex/react", () => ({
  useQuery: (ref: FunctionReference<"query">, args: unknown) => (typeof args === "object" ? server.results[getFunctionName(ref)] : undefined),
  useMutation: (ref: FunctionReference<"mutation">) => (args: Record<string, unknown>) =>
    new Promise((resolve, reject) => server.sent.push({ name: getFunctionName(ref), args, resolve, reject })),
}));
vi.mock("./prof", () => ({ StaffGate: ({ children }: { children: ReactNode }) => children }));
vi.mock("../../blocks/auth", () => ({ useGoogleUser: () => ({ user: server.user }) }));

const { Professor, QuizCard } = await import("./Quiz");

// ---------- a page as plain data ----------

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

const professor = () => expand(createElement(Professor), "root");
const card = () => expand(createElement(QuizCard), "root");

// What a browser's textContent gives, with runs of spaces made one.
function words(t: Tree | Tree[]): string {
  const raw = (x: Tree | Tree[]): string => (Array.isArray(x) ? x.map(raw).join("") : typeof x === "string" ? x : raw(x.children));
  return raw(t).replace(/\s+/g, " ").trim();
}

// Every element in the tree, each with the form it sits in.
function hosts(t: Tree[], form?: Host): { el: Host; form?: Host }[] {
  return t.flatMap((x) => {
    if (typeof x === "string") return [];
    return [{ el: x, form }, ...hosts(x.children, x.type === "form" ? x : form)];
  });
}

function button(t: Tree[], label: string) {
  const hit = hosts(t).find((h) => h.el.type === "button" && words(h.el) === label);
  if (!hit) throw new Error(`no button "${label}" in: ${words(t)}`);
  return hit;
}

// The text box labeled `label`: by aria-label, or inside a <label> that says it.
function textBox(t: Tree[], label: string) {
  const all = hosts(t).map((h) => h.el);
  const byAria = all.find((h) => h.type === "input" && h.props["aria-label"] === label);
  const wrap = all.find((h) => h.type === "label" && h.children.some((c) => typeof c === "string" && c.trim() === label));
  const input = byAria ?? (wrap && hosts(wrap.children).map((h) => h.el).find((h) => h.type === "input"));
  if (!input) throw new Error(`no field "${label}"`);
  return input;
}

function typeIn(view: () => Tree[], label: string, value: string) {
  (textBox(view(), label).props.onChange as (e: unknown) => void)({ target: { value } });
}

// The "Right" radio beside choice `n` (0 is A).
function markRight(view: () => Tree[], n: number) {
  const radios = hosts(view()).filter((h) => h.el.type === "input" && h.el.props.type === "radio");
  (radios[n].el.props.onChange as () => void)();
}

type Press = "disabled" | "canceled" | "browser-required" | "clicked" | "submitted";
function press(t: Tree[], label: string): Press {
  const { el, form } = button(t, label);
  if (el.props.disabled) return "disabled";
  let canceled = false;
  (el.props.onClick as ((e: unknown) => void) | undefined)?.({ preventDefault: () => (canceled = true) });
  if (canceled) return "canceled";
  if ((el.props.type ?? "submit") !== "submit" || !form) return "clicked";
  if (!form.props.noValidate) {
    const required = hosts(form.children).find((h) => h.el.type === "input" && h.el.props.required && !String(h.el.props.value ?? ""));
    if (required) return "browser-required";
  }
  (form.props.onSubmit as (e: unknown) => void)({ preventDefault: () => {} });
  return "submitted";
}

const alertText = (t: Tree[]) => {
  const el = hosts(t).find((h) => h.el.props.role === "alert")?.el;
  return el && words(el);
};
const sent = (name: string) => server.sent.filter((s) => s.name === name);
const settle = () => new Promise((r) => setTimeout(r, 0));

const open = (id: string, kind: "quiz" | "vote" = "quiz") => ({
  id,
  kind,
  question: "What does a capacitor store?",
  choices: ["Charge", "Current", "Voltage"],
  open: true,
  answered: 0,
  results: null,
});

let rejections: unknown[];
const onRejection = (r: unknown) => rejections.push(r);
beforeEach(() => {
  hooks.slots = new Map();
  server.results = {};
  server.sent = [];
  server.user = { name: "Ada Lovelace", email: "ada@example.edu" };
  rejections = [];
  process.prependListener("unhandledRejection", onRejection);
});
afterEach(() => {
  process.removeListener("unhandledRejection", onRejection);
});

// ---------- the professor ----------

describe("#/checkin/quiz, asking", () => {
  beforeEach(() => {
    server.results = { "checkin/quiz:current": null, "checkin/quiz:history": [] };
  });

  it("F17.1 checkin-frontend-17 a double click on 'Ask the room' asks once; the button stays busy until the server answers", async () => {
    typeIn(professor, "Question", "What does a capacitor store?");
    typeIn(professor, "Choice A", "Charge");
    typeIn(professor, "Choice B", "Current");
    expect(press(professor(), "Ask the room")).toBe("submitted");
    const busy = professor();
    expect(button(busy, "Ask the room").el.props["aria-busy"]).toBe(true);
    press(busy, "Ask the room");
    expect(sent("checkin/quiz:ask")).toHaveLength(1);
    expect(sent("checkin/quiz:ask")[0].args).toEqual({ channel: "gdg", kind: "quiz", question: "What does a capacitor store?", choices: ["Charge", "Current"] });

    sent("checkin/quiz:ask")[0].resolve("p9");
    await settle();
    expect(button(professor(), "Ask the room").el.props["aria-busy"]).toBeUndefined();
    expect(rejections).toEqual([]);
  });

  it("F17.1 checkin-frontend-17 a double click on 'Start the vote' starts one vote", () => {
    (button(professor(), "Vote").el.props.onClick as () => void)();
    typeIn(professor, "Question", "What should we cover next?");
    typeIn(professor, "Choice A", "Capacitors");
    typeIn(professor, "Choice B", "Magnets");
    expect(press(professor(), "Start the vote")).toBe("submitted");
    press(professor(), "Start the vote");
    expect(sent("checkin/quiz:ask")).toHaveLength(1);
    expect(sent("checkin/quiz:ask")[0].args).toMatchObject({ kind: "vote", choices: ["Capacitors", "Magnets"] });
  });

  it("F17.1 checkin-frontend-16 'Right' on a blank choice says 'Type the right answer’s choice.' and asks nothing; on a filled choice under a blank one it goes out as that choice", () => {
    typeIn(professor, "Question", "What does a capacitor store?");
    typeIn(professor, "Choice A", "Charge");
    typeIn(professor, "Choice B", "Current");
    markRight(professor, 2); // C, left blank
    expect(press(professor(), "Ask the room")).toBe("submitted");
    expect(sent("checkin/quiz:ask")).toHaveLength(0);
    expect(alertText(professor())).toBe("Type the right answer’s choice.");

    typeIn(professor, "Choice B", "");
    typeIn(professor, "Choice C", "Current");
    expect(press(professor(), "Ask the room")).toBe("submitted");
    expect(sent("checkin/quiz:ask")).toHaveLength(1);
    expect(sent("checkin/quiz:ask")[0].args).toMatchObject({ choices: ["Charge", "Current"], correct: 1 });
  });

  it("F17.1 a blank question says 'Type a question.' on the page, never the browser's own message, and asks nothing", () => {
    typeIn(professor, "Choice A", "Charge");
    typeIn(professor, "Choice B", "Current");
    expect(press(professor(), "Ask the room")).toBe("submitted");
    expect(alertText(professor())).toBe("Type a question.");
    typeIn(professor, "Question", "   ");
    expect(press(professor(), "Ask the room")).toBe("submitted");
    expect(alertText(professor())).toBe("Type a question.");
    expect(sent("checkin/quiz:ask")).toHaveLength(0);
  });
});

describe("#/checkin/quiz, ending", () => {
  beforeEach(() => {
    server.results = {
      "checkin/quiz:current": open("p1"),
      "checkin/quiz:stats": { counts: [0, 0, 0], answered: 0, checkedIn: 3, correct: null, rightPct: null, medianSec: null },
      "checkin/quiz:history": [],
    };
  });

  it("F17.4 F41.3 checkin-frontend-17 'End the quiz' is busy while it ends, a second press sends nothing, and a failed end shows the server's words", async () => {
    expect(press(professor(), "End the quiz")).toBe("clicked");
    const busy = professor();
    expect(button(busy, "End the quiz").el.props["aria-busy"]).toBe(true);
    press(busy, "End the quiz");
    expect(sent("checkin/quiz:end")).toHaveLength(1);
    expect(sent("checkin/quiz:end")[0].args).toEqual({ poll: "p1" });

    sent("checkin/quiz:end")[0].reject(new ConvexError("Only professors can do that."));
    await settle();
    const after = professor();
    expect(alertText(after)).toBe("Only professors can do that.");
    expect(button(after, "End the quiz").el.props["aria-busy"]).toBeUndefined();
    expect(rejections).toEqual([]);
  });
});

// ---------- the student ----------

describe("the quiz card, answering", () => {
  beforeEach(() => {
    server.results = { "checkin/quiz:current": open("p1"), "checkin/quiz:mine": null, "checkin/read:me": true };
  });
  const choices = (t: Tree[]) => hosts(t).filter((h) => h.el.type === "button").map((h) => h.el);

  it("F18.2 checkin-frontend-17 a double tap sends one answer: the choices are disabled while it sends, and the quiz then says 'Answer sent.' with no 'You already answered.' under it", async () => {
    const ready = card();
    expect(press(ready, "B Current")).toBe("clicked");
    // A second tap that lands before the page redraws still sends nothing.
    expect(press(ready, "B Current")).toBe("clicked");
    expect(sent("checkin/quiz:answer")).toHaveLength(1);
    const sending = card();
    expect(choices(sending).map((b) => b.props.disabled)).toEqual([true, true, true]);
    expect(press(sending, "B Current")).toBe("disabled");

    // The first answer lands; any other send comes back "You already answered."
    const [first, ...more] = sent("checkin/quiz:answer");
    expect(first.args).toEqual({ poll: "p1", choice: 1 });
    first.resolve(null);
    server.results["checkin/quiz:mine"] = 1;
    for (const s of more) s.reject(new ConvexError("You already answered."));
    await settle();
    const after = card();
    expect(sent("checkin/quiz:answer")).toHaveLength(1);
    expect(words(after)).toContain("Answer sent.");
    expect(alertText(after)).toBeUndefined();
    expect(rejections).toEqual([]);
  });

  it("F18.3 checkin-frontend-17 on a vote the choices come back once the pick lands, so the student can change it", async () => {
    server.results["checkin/quiz:current"] = open("p1", "vote");
    press(card(), "A Charge");
    expect(press(card(), "B Current")).toBe("disabled");
    sent("checkin/quiz:answer")[0].resolve(null);
    server.results["checkin/quiz:mine"] = 0;
    await settle();
    const after = card();
    expect(words(after)).toContain("You picked A. Tap another to change it.");
    expect(press(after, "B Current")).toBe("clicked");
    expect(sent("checkin/quiz:answer").map((s) => s.args.choice)).toEqual([0, 1]);
  });

  it("checkin-frontend-17 a failed answer's error goes away when the professor asks the next question", async () => {
    press(card(), "A Charge");
    sent("checkin/quiz:answer")[0].reject(new ConvexError("Time’s up. The professor ended this quiz."));
    await settle();
    expect(alertText(card())).toBe("Time’s up. The professor ended this quiz.");
    server.results["checkin/quiz:current"] = open("p2");
    expect(alertText(card())).toBeUndefined();
    expect(rejections).toEqual([]);
  });

  it("checkin-frontend-17 a failed answer's error goes away when the answer lands", async () => {
    server.results["checkin/quiz:current"] = open("p1", "vote");
    server.results["checkin/quiz:mine"] = 0;
    press(card(), "B Current");
    sent("checkin/quiz:answer")[0].reject(new Error("connection lost"));
    await settle();
    expect(alertText(card())).toBe("Something went wrong. Try again.");
    server.results["checkin/quiz:mine"] = 1; // the pick reached the server after all
    expect(alertText(card())).toBeUndefined();
  });
});
