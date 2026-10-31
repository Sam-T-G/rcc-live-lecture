// @vitest-environment node
// #/checkin/teacher (Teacher.tsx) rendered to HTML with the server swapped for fixed answers by
// function name (no backend). Every test runs in Pacific time on Nov 5, 2026 at 2:40 PM.
// People are samples (@example.edu).
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { getFunctionName, type FunctionReference } from "convex/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dayTime, day, hhmm } from "./sheet";
import { ClassStart, Scanner } from "./Teacher";

const results: Record<string, unknown> = {};
vi.mock("convex/react", () => ({
  useQuery: (ref: FunctionReference<"query">, args: unknown) => (args === "skip" ? undefined : results[getFunctionName(ref)]),
  useMutation: () => async () => null,
  useConvex: () => ({ query: async () => [] }),
}));

// A Pacific wall-clock time as ms: November 2026 is PST (UTC-8), October PDT (UTC-7).
const pst = (mo: number, d: number, h: number, mi = 0) => Date.UTC(2026, mo - 1, d, h + 8, mi);
const pdt = (mo: number, d: number, h: number, mi = 0) => Date.UTC(2026, mo - 1, d, h + 7, mi);
const NOW = pst(11, 5, 14, 40);

const open = { lecture: "k1", open: true, startedAt: pst(11, 5, 14, 28), startsAt: pst(11, 5, 14, 30), graceMin: 5, endedAt: null, count: 2 };
// The last class, before the clocks changed: its 10:00 AM is still 10:00 AM on the form.
const lastWeek = { lecture: "k0", open: false, startedAt: pdt(10, 29, 9, 50), startsAt: pdt(10, 29, 10, 0), graceMin: 10, endedAt: pdt(10, 29, 11, 0), count: 3 };
const names = [
  { id: "c2", name: "Sample student 2", at: pst(11, 5, 14, 41) },
  { id: "c1", name: "Sample student 1", at: pst(11, 5, 14, 29) },
];
const sheet = [
  { name: "Sample student 1", email: "student1@example.edu", at: pst(11, 5, 14, 29), lateMin: null },
  { name: "Sample student 2", email: "student2@example.edu", at: pst(11, 5, 14, 41), lateMin: 11 },
];

beforeEach(() => {
  vi.stubEnv("TZ", "America/Los_Angeles");
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  for (const k of Object.keys(results)) delete results[k];
  Object.assign(results, {
    "checkin/attendance:lectures": [open, lastWeek],
    "checkin/attendance:classStart": { startsAt: open.startsAt, graceMin: 5 },
    "checkin/attendance:sheet": sheet,
    "checkin/read:names": names,
  });
});
afterEach(() => {
  vi.useRealTimers();
});

const page = () => renderToStaticMarkup(createElement(Scanner));
const words = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ");
const inputValue = (html: string, label: string) => {
  const id = new RegExp(`<label class="field__label" for="([^"]+)">${label}</label>`).exec(html)?.[1];
  return id ? new RegExp(`<input[^>]*id="${id}"[^>]*value="([^"]*)"`).exec(html)?.[1] : undefined;
};

describe("F13 the professor's scanner", () => {
  it("checkin-frontend-4 Start scanning works in every browser: never disabled, and no 'Open this page in Chrome' line", () => {
    const html = page();
    expect(html).toMatch(/<button[^>]*class="btn"[^>]*><span class="btn__label">Start scanning<\/span><\/button>/);
    expect(html).not.toMatch(/<button[^>]*disabled[^>]*><span class="btn__label">Start scanning/);
    expect(words(html)).not.toMatch(/Chrome|can.t read QR/);
    // The typed code still works: a labeled field and its button.
    expect(inputValue(html, "Code on their phone")).toBe("");
    expect(words(html)).toContain("Check in");
  });

  it("checkin-frontend-7 the status line says when this class started, with its date, or 'No class running.'", () => {
    expect(words(page())).toContain(`Class started ${dayTime(open.startedAt)}`);
    expect(words(page())).toMatch(/Class started Thu Nov 5, 2:28\sPM/);
    results["checkin/attendance:lectures"] = [lastWeek];
    expect(words(page())).toContain("No class running.");
    expect(words(page())).not.toContain("Class started");
  });

  it("a link 'End the class: Professor view, Points' opens #/host", () => {
    expect(page()).toContain('<a href="#/host">End the class: Professor view, Points</a>');
  });

  it("'professor', never 'teacher', on screen, loaded or loading", () => {
    expect(words(page())).not.toMatch(/teacher/i);
    results["checkin/attendance:lectures"] = undefined;
    results["checkin/read:names"] = undefined;
    results["checkin/attendance:sheet"] = undefined;
    results["checkin/attendance:classStart"] = undefined;
    expect(words(page())).not.toMatch(/teacher/i);
  });
});

describe("F14 who checked in to this class", () => {
  it("F13.4 'No one yet.' shows only once the list has loaded and is empty", () => {
    results["checkin/read:names"] = undefined;
    expect(words(page())).not.toContain("No one yet.");
    results["checkin/read:names"] = [];
    expect(words(page())).toContain("No one yet.");
  });

  it("removeCheckin on screen: each name has a Remove button that asks first; the counts show checked in and late", () => {
    const html = page();
    for (const n of names) expect(words(html)).toContain(`Remove ${n.name}`);
    // ConfirmButton: the first press only asks, so the page holds no question until then.
    expect(words(html)).not.toContain("from this class?");
    expect(html.match(/btn--danger/g)).toHaveLength(2);
    expect(words(html)).toMatch(/2 checked in 1 late/);
  });

  it("F8.4 Past classes lists each class with check-ins, this one marked, each with Download CSV", () => {
    const text = words(page());
    expect(text).toContain("Past classes");
    expect(text).toMatch(/Thu Nov 5, 2:30\sPM This class 2 checked in Download CSV/);
    expect(text).toMatch(/Thu Oct 29, 10:00\sAM 3 checked in Download CSV/);
    // A class running with nobody checked in yet isn't in the list, but the status line has it.
    results["checkin/attendance:lectures"] = [{ ...open, count: 0 }, lastWeek];
    const quiet = words(page());
    expect(quiet).toContain("Class started");
    expect(quiet).not.toContain("This class 0 checked in");
    expect(quiet.match(/Download CSV/g)).toHaveLength(1);
  });
});

describe("F15 the class start form", () => {
  const form = () => renderToStaticMarkup(createElement(ClassStart));

  it("checkin-backend-10 rt-16 the form shows the saved start and grace, not 14:30 and 5", () => {
    results["checkin/attendance:classStart"] = { startsAt: pst(11, 5, 9, 5), graceMin: 12 };
    const html = form();
    expect(inputValue(html, "Class starts")).toBe("09:05");
    expect(inputValue(html, "Late after \\(minutes\\)")).toBe("12");
    expect(words(html)).toMatch(/Late after 9:17\sAM/);
  });

  it("with no class running, the form shows the last class's time of day and grace, ready to save, and says nobody is late yet", () => {
    results["checkin/attendance:classStart"] = null;
    results["checkin/attendance:lectures"] = [lastWeek];
    const html = form();
    expect(inputValue(html, "Class starts")).toBe(hhmm(lastWeek.startsAt));
    expect(inputValue(html, "Class starts")).toBe("10:00");
    expect(inputValue(html, "Late after \\(minutes\\)")).toBe("10");
    expect(words(html)).toContain("No start time yet, so nobody is late.");
  });

  it("checkin-frontend-7 a saved start that isn't today shows its date", () => {
    const evening = pst(11, 4, 18, 0);
    results["checkin/attendance:classStart"] = { startsAt: evening, graceMin: 5 };
    const text = words(form());
    expect(text).toContain(day(evening));
    expect(text).toContain(`Late after ${dayTime(evening + 5 * 60_000)}`);
    results["checkin/attendance:classStart"] = { startsAt: pst(11, 5, 14, 30), graceMin: 5 };
    expect(words(form())).not.toContain(day(NOW));
  });

  it("the form waits for the saved start before it can save", () => {
    results["checkin/attendance:classStart"] = undefined;
    expect(form()).toMatch(/<fieldset class="att-start" disabled="">/);
    results["checkin/attendance:classStart"] = null;
    expect(form()).not.toContain("disabled");
  });
});
