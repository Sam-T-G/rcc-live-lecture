// @vitest-environment node
// LX (F8.1): End class on #/checkin/teacher (Teacher.tsx EndClass), next to the class status line.
// It runs End day (live.groups.endDay) for the class running now, after a question, and shows the
// line End day returns until the next class opens. The same stand-in for React's hooks as
// Teacher.press.test.ts: each component keeps its state between renders, keyed by where it sits
// in the tree; render() calls every component down to the HTML elements, and press() runs a
// button's onClick. Every mutation call waits until the test resolves or rejects it. Pacific time,
// Nov 5, 2026 at 3:30 PM. People are samples (@example.edu).
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
    useId: () => {
      const [list, i] = slot(() => `id${hooks.slots.size}-${hooks.at}`);
      return list[i];
    },
  };
});

type Sent = { name: string; args: Record<string, unknown>; resolve: (v: unknown) => void; reject: (e: unknown) => void };
const server = vi.hoisted(() => ({ results: {} as Record<string, unknown>, sent: [] as Sent[] }));
vi.mock("convex/react", () => ({
  useQuery: (ref: FunctionReference<"query">, args: unknown) => (typeof args === "object" ? server.results[getFunctionName(ref)] : undefined),
  useMutation: (ref: FunctionReference<"mutation">) => (args: Record<string, unknown>) =>
    new Promise((resolve, reject) => server.sent.push({ name: getFunctionName(ref), args, resolve, reject })),
  useConvex: () => ({ query: async () => [] }),
}));
vi.mock("../../blocks/ui", async (orig) => ({
  ...(await orig<typeof import("../../blocks/ui")>()),
  ErrorBoundary: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("../../blocks/camera", () => ({ useCamera: () => ({ on: false, error: "", video: { current: null }, start: async () => {}, stop: () => {} }) }));
vi.mock("./qrRead", () => ({ makeQrReader: () => async () => null }));

const { Scanner } = await import("./Teacher");

// ---------- the page as plain data ----------

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

const page = () => expand(createElement(Scanner), "root");

// The text in reading order, a space between elements.
function words(t: Tree | Tree[]): string {
  const raw = (x: Tree | Tree[]): string => (Array.isArray(x) ? x.map(raw).join(" ") : typeof x === "string" ? x : raw(x.children));
  return raw(t).replace(/\s+/g, " ").trim();
}
const hosts = (t: Tree[]): Host[] => t.flatMap((x) => (typeof x === "string" ? [] : [x, ...hosts(x.children)]));
const buttons = (t: Tree[], label: string) => hosts(t).filter((h) => h.type === "button" && words(h) === label);
function press(t: Tree[], label: string) {
  const el = buttons(t, label)[0];
  if (!el) throw new Error(`no button "${label}" in: ${words(t)}`);
  if (el.props.disabled) return "disabled";
  (el.props.onClick as (e: unknown) => void)({ preventDefault: () => {} });
  return "clicked";
}
// The words in the status row (ClassStatus and End class), and in the box End day's line shows in.
const statusRow = (t: Tree[]) => words(hosts(t).find((h) => h.props.className === "row att-status") ?? []);
const banner = (t: Tree[]) => {
  const el = hosts(t).find((h) => typeof h.props.className === "string" && h.props.className.startsWith("banner "));
  return el && words(el);
};
const alertText = (t: Tree[]) => {
  const el = hosts(t).find((h) => h.props.role === "alert");
  return el && words(el);
};
// The card the last scan or typed code shows ("Checked in", the name and email).
const scanCard = (t: Tree[]) => {
  const el = hosts(t).find((h) => h.type === "section" && h.props.className === "panel" && /^(Already checked in|Checked in) /.test(words(h)));
  return el && words(el);
};
// Types a code in "Code on their phone" and presses Check in (the form's onSubmit).
function checkIn(code: string) {
  const form = () => hosts(page()).find((h) => h.type === "form" && h.props.className === "att-code");
  const input = hosts(form()?.children ?? []).find((h) => h.type === "input");
  if (!input) throw new Error(`no code field in: ${words(page())}`);
  (input.props.onChange as (e: unknown) => void)({ target: { value: code } });
  (form()!.props.onSubmit as (e: unknown) => void)({ preventDefault: () => {} });
}
const sent = (name: string) => server.sent.filter((s) => s.name === name);
const settle = () => new Promise((r) => setTimeout(r, 0));

// ---------- the data ----------

const pst = (mo: number, d: number, h: number, mi = 0) => Date.UTC(2026, mo - 1, d, h + 8, mi);
const NOW = pst(11, 5, 15, 30);
const QUESTION =
  "End this class? Each student gets their team's extra credit now. Next class, everyone checks in again and points start from 0. This can't be undone.";
const LINE = "Red came 1st with 4 points, 1.0 per student. Saved extra credit for 4 students. The next class starts from 0 points.";

// This class, running since 2:20 PM with its start at 2:30 PM, then the same class once it ended,
// and next week's class.
const open = { lecture: "k1", open: true, startedAt: pst(11, 5, 14, 20), startsAt: pst(11, 5, 14, 30), graceMin: 5, endedAt: null, count: 4 };
const ended = { ...open, open: false, endedAt: NOW };
const nextWeek = { ...open, lecture: "k2", startedAt: pst(11, 12, 14, 20), startsAt: null, count: 0 };

let rejections: unknown[];
const onRejection = (r: unknown) => rejections.push(r);
beforeEach(() => {
  vi.stubEnv("TZ", "America/Los_Angeles");
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  hooks.slots = new Map();
  server.sent = [];
  server.results = {
    "checkin/attendance:lectures": [open],
    "checkin/attendance:classStart": { startsAt: open.startsAt, graceMin: 5 },
    "checkin/attendance:sheet": [],
    "checkin/read:names": [],
  };
  rejections = [];
  process.prependListener("unhandledRejection", onRejection);
});
afterEach(() => {
  process.removeListener("unhandledRejection", onRejection);
  vi.useRealTimers();
});

describe("F8.1 End class on #/checkin/teacher", () => {
  it("the first press only asks; the second runs End day for this class and shows its line in place of the button until the next class opens", async () => {
    expect(statusRow(page())).toBe("Class started Thu Nov 5, 2:30 PM End class");
    expect(press(page(), "End class")).toBe("clicked");
    expect(sent("live/groups:endDay")).toEqual([]);
    expect(statusRow(page())).toBe(`Class started Thu Nov 5, 2:30 PM ${QUESTION} End class Cancel`);

    expect(press(page(), "End class")).toBe("clicked");
    expect(sent("live/groups:endDay").map((s) => s.args)).toEqual([{ channel: "gdg" }]);
    // A second press while End day runs sends nothing more.
    press(page(), "End class");
    expect(sent("live/groups:endDay")).toHaveLength(1);

    sent("live/groups:endDay")[0].resolve(LINE);
    await settle();
    // The list can still show the class open for a moment: the line shows, not the button.
    expect(banner(page())).toBe(LINE);
    expect(buttons(page(), "End class")).toEqual([]);
    // The class ended.
    server.results["checkin/attendance:lectures"] = [ended];
    expect(statusRow(page())).toBe(`No class running. ${LINE}`);
    // Next week's class opens: End class is back, for that class, and the line is gone.
    vi.setSystemTime(pst(11, 12, 14, 25));
    server.results["checkin/attendance:lectures"] = [nextWeek, ended];
    expect(statusRow(page())).toBe("Class started Thu Nov 12, 2:20 PM End class");
    expect(banner(page())).toBeUndefined();
    // LX-risk-1: next week's class ends some other way (End class on #/host, or the 12-hour close):
    // the line about the class before it doesn't come back.
    server.results["checkin/attendance:lectures"] = [{ ...nextWeek, open: false, endedAt: pst(11, 12, 16, 0) }, ended];
    expect(statusRow(page())).toBe("No class running.");
    expect(banner(page())).toBeUndefined();
    expect(rejections).toEqual([]);
  });

  it("when End day refuses, the question box says why and stays open, and the class keeps running; Cancel closes the box", async () => {
    press(page(), "End class");
    press(page(), "End class");
    sent("live/groups:endDay")[0].reject(new ConvexError("End the open question first."));
    await settle();
    expect(alertText(page())).toBe("End the open question first.");
    expect(statusRow(page())).toBe(`Class started Thu Nov 5, 2:30 PM ${QUESTION} End the open question first. End class Cancel`);
    expect(banner(page())).toBeUndefined();

    expect(press(page(), "Cancel")).toBe("clicked");
    expect(statusRow(page())).toBe("Class started Thu Nov 5, 2:30 PM End class");
    expect(rejections).toEqual([]);
  });

  it("LX-check-1 the last scan's card goes when its class ends, and the next class doesn't show it", async () => {
    checkIn("abc123");
    expect(sent("checkin/pass:scan").map((s) => s.args)).toEqual([{ channel: "gdg", code: "abc123" }]);
    sent("checkin/pass:scan")[0].resolve({ name: "Sample student 1", email: "s1@example.edu", already: false });
    await settle();
    expect(scanCard(page())).toBe("Checked in Sample student 1 s1@example.edu");
    press(page(), "End class");
    press(page(), "End class");
    sent("live/groups:endDay")[0].resolve(LINE);
    await settle();
    // The list can still show the class open for a moment: the card is still this class's.
    expect(scanCard(page())).toBe("Checked in Sample student 1 s1@example.edu");
    server.results["checkin/attendance:lectures"] = [ended];
    expect(statusRow(page())).toBe(`No class running. ${LINE}`);
    expect(scanCard(page())).toBeUndefined();
    vi.setSystemTime(pst(11, 12, 14, 25));
    server.results["checkin/attendance:lectures"] = [nextWeek, ended];
    expect(scanCard(page())).toBeUndefined();
    expect(rejections).toEqual([]);
  });

  it("LX-check-1 a scan with no class running opens one, and its card stays for that class until it ends", async () => {
    server.results["checkin/attendance:lectures"] = [ended];
    checkIn("abc123");
    sent("checkin/pass:scan")[0].resolve({ name: "Sample student 1", email: "s1@example.edu", already: false });
    await settle();
    expect(scanCard(page())).toBe("Checked in Sample student 1 s1@example.edu");
    // The scan opened next week's class.
    vi.setSystemTime(pst(11, 12, 14, 25));
    server.results["checkin/attendance:lectures"] = [nextWeek, ended];
    expect(scanCard(page())).toBe("Checked in Sample student 1 s1@example.edu");
    // A second code in the same class replaces the card.
    checkIn("def456");
    sent("checkin/pass:scan")[1].resolve({ name: "Sample student 2", email: "s2@example.edu", already: true });
    await settle();
    expect(scanCard(page())).toBe("Already checked in Sample student 2 s2@example.edu");
    server.results["checkin/attendance:lectures"] = [{ ...nextWeek, open: false, endedAt: pst(11, 12, 16, 0) }, ended];
    expect(scanCard(page())).toBeUndefined();
    expect(rejections).toEqual([]);
  });

  it("LX-check-1 a refused code with no class running opens nothing, so its error goes when a class opens", async () => {
    server.results["checkin/attendance:lectures"] = [ended];
    checkIn("abc123");
    sent("checkin/pass:scan")[0].reject(new ConvexError("That code is old."));
    await settle();
    expect(alertText(page())).toBe("That code is old.");
    vi.setSystemTime(pst(11, 12, 14, 25));
    server.results["checkin/attendance:lectures"] = [nextWeek, ended];
    expect(alertText(page())).toBeUndefined();
    expect(rejections).toEqual([]);
  });

  it("with no class running, or before the list loads, there is no End class", () => {
    server.results["checkin/attendance:lectures"] = [ended];
    expect(statusRow(page())).toBe("No class running.");
    server.results["checkin/attendance:lectures"] = undefined;
    expect(statusRow(page())).toBe("Loading…");
  });
});
