// @vitest-environment node
// #/checkin/teacher (Teacher.tsx) when the professor presses Save, Download or Remove. These tests
// have no browser DOM, so React's hooks are swapped for a small stand-in that keeps each
// component's state between renders, keyed by where the component sits in the tree (and its key),
// the way React keys it (the same stand-in as Quiz.press.test.ts). render() calls every component
// as a plain function down to the HTML elements; press() runs a button's onClick, then, for a
// submit button, the form's onSubmit. Every mutation call waits until the test resolves it.
// Every test runs in Pacific time on Nov 5, 2026 at 2:20 PM. People are samples (@example.edu).
import { Fragment, createElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { getFunctionName, type FunctionReference } from "convex/server";
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
const server = vi.hoisted(() => ({ results: {} as Record<string, unknown>, sent: [] as Sent[], saved: [] as { rows: unknown; name: string }[] }));
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
vi.mock("./sheet", async (orig) => ({
  ...(await orig<typeof import("./sheet")>()),
  saveCsv: (rows: unknown, name: string) => server.saved.push({ rows, name }),
}));

const { ClassStart, Scanner } = await import("./Teacher");
const { STILL_OPEN } = await import("./util");
const { nearestStart } = await import("./sheet");

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

const page = () => expand(createElement(Scanner), "root");
const form = () => expand(createElement(ClassStart), "root");

function words(t: Tree | Tree[]): string {
  const raw = (x: Tree | Tree[]): string => (Array.isArray(x) ? x.map(raw).join("") : typeof x === "string" ? x : raw(x.children));
  return raw(t).replace(/\s+/g, " ").trim();
}

function hosts(t: Tree[], form?: Host): { el: Host; form?: Host }[] {
  return t.flatMap((x) => {
    if (typeof x === "string") return [];
    return [{ el: x, form }, ...hosts(x.children, x.type === "form" ? x : form)];
  });
}

function buttons(t: Tree[], label: string | RegExp) {
  return hosts(t).filter((h) => h.el.type === "button" && (typeof label === "string" ? words(h.el) === label : label.test(words(h.el))));
}
function button(t: Tree[], label: string | RegExp) {
  const hit = buttons(t, label)[0];
  if (!hit) throw new Error(`no button "${label}" in: ${words(t)}`);
  return hit;
}

// The input a <label for> names (kit.tsx Field).
function field(t: Tree[], label: string) {
  const all = hosts(t).map((h) => h.el);
  const lab = all.find((h) => h.type === "label" && words(h) === label);
  const input = lab && all.find((h) => h.type === "input" && h.props.id === lab.props.htmlFor);
  if (!input) throw new Error(`no field "${label}" in: ${words(t)}`);
  return input;
}
const typeIn = (view: () => Tree[], label: string, value: string) => (field(view(), label).props.onChange as (e: unknown) => void)({ target: { value } });

function press(t: Tree[], label: string | RegExp) {
  const { el, form } = button(t, label);
  if (el.props.disabled) return "disabled";
  (el.props.onClick as ((e: unknown) => void) | undefined)?.({ preventDefault: () => {} });
  if ((el.props.type ?? "submit") !== "submit" || !form) return "clicked";
  (form.props.onSubmit as (e: unknown) => void)({ preventDefault: () => {} });
  return "submitted";
}

const sent = (name: string) => server.sent.filter((s) => s.name === name);
const alertText = (t: Tree[]) => {
  const el = hosts(t).find((h) => h.el.props.role === "alert")?.el;
  return el && words(el);
};

// ---------- the data ----------

// A Pacific wall-clock time as ms: November 2026 is PST (UTC-8), October PDT (UTC-7).
const pst = (mo: number, d: number, h: number, mi = 0) => Date.UTC(2026, mo - 1, d, h + 8, mi);
const pdt = (mo: number, d: number, h: number, mi = 0) => Date.UTC(2026, mo - 1, d, h + 7, mi);
const NOW = pst(11, 5, 14, 20);

// The check-ins from before classes existed (prod's 10-29 rows), and no class yet.
const earlier = { lecture: "earlier", open: false, startedAt: pdt(10, 29, 15, 41), startsAt: null, graceMin: 0, endedAt: pdt(10, 29, 15, 50), count: 2 };
const earlierNames = [
  { id: "e2", name: "Sample student 2", at: pdt(10, 29, 15, 50) },
  { id: "e1", name: "Sample student 1", at: pdt(10, 29, 15, 41) },
];
const earlierSheet = [
  { name: "Sample student 1", email: "student1@example.edu", at: pdt(10, 29, 15, 41), lateMin: null },
  { name: "Sample student 2", email: "student2@example.edu", at: pdt(10, 29, 15, 50), lateMin: 7 },
];
// A class running now: opened at 2:12 PM, saved start 2:30 PM.
const open = { lecture: "k1", open: true, startedAt: pst(11, 5, 14, 12), startsAt: pst(11, 5, 14, 30), graceMin: 5, endedAt: null, count: 2 };
const names = [
  { id: "c2", name: "Sample student 2", at: pst(11, 5, 14, 19) },
  { id: "c1", name: "Sample student 1", at: pst(11, 5, 14, 13) },
];
const sheet = [
  { name: "Sample student 1", email: "student1@example.edu", at: pst(11, 5, 14, 13), lateMin: null },
  { name: "Sample student 2", email: "student2@example.edu", at: pst(11, 5, 14, 19), lateMin: null },
];

beforeEach(() => {
  vi.stubEnv("TZ", "America/Los_Angeles");
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  hooks.slots = new Map();
  server.sent = [];
  server.saved = [];
  server.results = {
    "checkin/attendance:lectures": [open, earlier],
    "checkin/attendance:classStart": { startsAt: open.startsAt, graceMin: 5 },
    "checkin/attendance:sheet": sheet,
    "checkin/read:names": names,
  };
});
afterEach(() => {
  vi.useRealTimers();
});

// Prod right after the deploy: no class yet, the classStarts row from 10-29, and the 10-29 rows.
function beforeFirstClass() {
  server.results = {
    "checkin/attendance:lectures": [earlier],
    "checkin/attendance:classStart": { startsAt: pdt(10, 29, 15, 43), graceMin: 2 },
    "checkin/attendance:sheet": earlierSheet,
    "checkin/read:names": earlierNames,
  };
}

describe("F15 Save on the class start form", () => {
  it("CKA-spec-2 CKA-risk-2 before the first class, Save with the old 10-29 start untouched saves today's 3:43 PM, never Oct 29", () => {
    beforeFirstClass();
    expect(field(form(), "Class starts").props.value).toBe("15:43");
    typeIn(form, "Late after (minutes)", "5");
    expect(press(form(), "Save")).toBe("submitted");
    expect(sent("checkin/attendance:setClassStart").map((s) => s.args)).toEqual([{ channel: "gdg", startsAt: pst(11, 5, 15, 43), graceMin: 5 }]);
  });

  it("CKA-risk-2 Save alone, with nothing changed, sends a start within 12 hours of now", () => {
    beforeFirstClass();
    press(form(), "Save");
    const [s] = sent("checkin/attendance:setClassStart");
    expect(s.args.startsAt).toBe(nearestStart("15:43", NOW));
    expect(Math.abs((s.args.startsAt as number) - NOW)).toBeLessThanOrEqual(12 * 3_600_000);
  });

  it("an unchanged time keeps this class's saved start, even when it is yesterday evening's", () => {
    const evening = pst(11, 4, 18, 0);
    vi.setSystemTime(pst(11, 5, 5, 30));
    server.results["checkin/attendance:classStart"] = { startsAt: evening, graceMin: 5 };
    typeIn(form, "Late after (minutes)", "7");
    press(form(), "Save");
    expect(sent("checkin/attendance:setClassStart").map((s) => s.args)).toEqual([{ channel: "gdg", startsAt: evening, graceMin: 7 }]);
  });

  it("CKA-fixcheck a morning start typed in the afternoon offers today's time instead of sending tomorrow's, which the server refuses", () => {
    // A deck press opened the 9:00 class with no start saved. At 3:30 PM the professor types 09:00.
    vi.setSystemTime(pst(11, 5, 15, 30));
    server.results["checkin/attendance:lectures"] = [{ ...open, startedAt: pst(11, 5, 8, 55), startsAt: null }];
    server.results["checkin/attendance:classStart"] = null;
    typeIn(form, "Class starts", "09:00");
    press(form(), "Save");
    expect(sent("checkin/attendance:setClassStart")).toEqual([]);
    expect(alertText(form())).toBe("Fri Nov 6, 9:00 AM is more than 12 hours away.");
    expect(press(form(), "Save Thu Nov 5, 9:00 AM")).toBe("clicked");
    expect(sent("checkin/attendance:setClassStart").map((s) => s.args)).toEqual([{ channel: "gdg", startsAt: pst(11, 5, 9, 0), graceMin: 5 }]);
  });

  it("CKA-fixcheck a night class's start corrected after midnight offers last night's time", () => {
    vi.setSystemTime(pst(11, 6, 0, 30));
    server.results["checkin/attendance:lectures"] = [{ ...open, startedAt: pst(11, 5, 17, 55), startsAt: null }];
    server.results["checkin/attendance:classStart"] = null;
    typeIn(form, "Class starts", "18:00");
    press(form(), "Save");
    expect(sent("checkin/attendance:setClassStart")).toEqual([]);
    expect(alertText(form())).toBe("Fri Nov 6, 6:00 PM is more than 12 hours away.");
    press(form(), "Save Thu Nov 5, 6:00 PM");
    expect(sent("checkin/attendance:setClassStart").map((s) => s.args)).toEqual([{ channel: "gdg", startsAt: pst(11, 5, 18, 0), graceMin: 5 }]);
  });

  it("CKA-fixcheck typing a new time takes the offer away; a time within 12 hours saves at once", () => {
    vi.setSystemTime(pst(11, 5, 15, 30));
    typeIn(form, "Class starts", "09:00");
    press(form(), "Save");
    expect(buttons(form(), /^Save Thu/)).toHaveLength(1);
    typeIn(form, "Class starts", "15:00");
    expect(buttons(form(), /^Save Thu/)).toEqual([]);
    press(form(), "Save");
    expect(sent("checkin/attendance:setClassStart").map((s) => s.args.startsAt)).toEqual([pst(11, 5, 15, 0)]);
  });

  it("sweep1-ledger-2 a start refused because the class is still open names its first check-in and offers Save anyway, which sends sameClass", async () => {
    // No start saved; Sample student 1 came at 1:30 PM, 60 minutes before the 2:30 PM start.
    server.results["checkin/attendance:lectures"] = [{ ...open, startedAt: pst(11, 5, 13, 30), startsAt: null }];
    server.results["checkin/attendance:classStart"] = null;
    server.results["checkin/attendance:sheet"] = [{ name: "Sample student 1", email: "student1@example.edu", at: pst(11, 5, 13, 30), lateMin: null }];
    typeIn(form, "Class starts", "14:30");
    press(form(), "Save");
    sent("checkin/attendance:setClassStart")[0].reject({ data: STILL_OPEN });
    await new Promise((r) => setTimeout(r, 0));
    expect(alertText(form())).toMatch(
      /^This class is still open\. Its first check-in, Sample student 1 at 1:30\sPM, is more than 45 minutes before 2:30\sPM\. If Sample student 1 is in this class, press Save anyway\. If 2:30\sPM is the next class's start, press End class, then save it\.$/,
    );
    expect(press(form(), "Save anyway")).toBe("clicked");
    expect(sent("checkin/attendance:setClassStart").map((s) => s.args)).toEqual([
      { channel: "gdg", startsAt: pst(11, 5, 14, 30), graceMin: 5 },
      { channel: "gdg", startsAt: pst(11, 5, 14, 30), graceMin: 5, sameClass: true },
    ]);
    // Typing another time takes the offer away.
    typeIn(form, "Class starts", "14:00");
    expect(buttons(form(), "Save anyway")).toEqual([]);
  });

  it("CKA-risk-5 a bad 'Late after' says 'Late after', never 'Grace', and sends nothing", () => {
    for (const bad of ["", "61", "-1", "2.5"]) {
      hooks.slots = new Map();
      typeIn(form, "Late after (minutes)", bad);
      press(form(), "Save");
      expect(alertText(form())).toBe("Late after has to be a whole number from 0 to 60.");
      expect(words(form())).not.toMatch(/grace/i);
    }
    expect(sent("checkin/attendance:setClassStart")).toEqual([]);
  });
});

describe("F14 This class before the first class", () => {
  it("CKA-spec-3 Download names the 10-29 check-ins with their own date, the way Past classes does", () => {
    beforeFirstClass();
    expect(press(page(), "Download attendance (CSV)")).toBe("clicked");
    expect(server.saved.map((s) => s.name)).toEqual(["attendance-gdg-2026-10-29.csv"]);
  });

  it("CKA-spec-3 the 10-29 names show with no Remove: they are that day's record", () => {
    beforeFirstClass();
    const text = words(page());
    for (const n of earlierNames) expect(text).toContain(n.name);
    expect(buttons(page(), /^Remove/)).toEqual([]);
  });

  it("sweep1-tests-5 F14.3 with nobody checked in, Download is disabled and saves nothing", () => {
    server.results["checkin/attendance:sheet"] = [];
    server.results["checkin/read:names"] = [];
    expect(press(page(), "Download attendance (CSV)")).toBe("disabled");
    expect(server.saved).toEqual([]);
  });

  it("with a class running, Download names the file with this class's date and start time", () => {
    press(page(), "Download attendance (CSV)");
    expect(server.saved.map((s) => s.name)).toEqual(["attendance-gdg-2026-11-05-1430.csv"]);
  });
});

describe("F14 Remove asks first", () => {
  it("CKA-risk-4 the first press on Remove only asks, naming the student; the second removes that check-in", () => {
    expect(press(page(), "Remove Sample student 1")).toBe("clicked");
    expect(sent("checkin/attendance:removeCheckin")).toEqual([]);
    expect(words(page())).toContain("Remove Sample student 1 from this class? Their phone shows their pass again, and their quiz and vote answers in this class are removed.");
    expect(words(page())).not.toContain("Remove Sample student 2 from this class?");
    press(page(), "Remove");
    expect(sent("checkin/attendance:removeCheckin").map((s) => s.args)).toEqual([{ checkin: "c1" }]);
  });
});

describe("the status line", () => {
  it("CKA-check-1 gives the class the same start time as Past classes: the saved start, not when the class opened", () => {
    vi.setSystemTime(pst(11, 5, 14, 40));
    const text = words(page());
    expect(text).toMatch(/Class started Thu Nov 5, 2:30\sPM/);
    expect(text).not.toMatch(/2:12/);
  });

  it("CKA-check-1 a saved start still ahead says when class starts", () => {
    // 2:20 PM, start saved for 2:30 PM.
    const text = words(page());
    expect(text).toMatch(/Class starts Thu Nov 5, 2:30\sPM/);
    expect(text).not.toMatch(/Class started/);
  });

  it("a class with no saved start says when it opened", () => {
    server.results["checkin/attendance:lectures"] = [{ ...open, startsAt: null }];
    expect(words(page())).toMatch(/Class started Thu Nov 5, 2:12\sPM/);
  });
});
