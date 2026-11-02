// @vitest-environment node
// #/checkin/teacher (Teacher.tsx, teacher.css): where its parts sit. The markup is rendered with
// the server swapped for fixed answers by function name and StaffGate for a marker that shows its
// props; the layout rules are read from teacher.css (src/styles/cssRules.ts) and checked at the
// widths a laptop page meets (a 1440 or 1280 screen, half a screen, 150% zoom). People are
// samples (@example.edu).
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { getFunctionName, type FunctionReference } from "convex/server";
import { describe, expect, it, vi } from "vitest";
import { parse, type Rule } from "../../styles/cssRules";
import { Scanner, Teacher } from "./Teacher";

const T0 = Date.UTC(2026, 10, 5, 22, 30);
const results: Record<string, unknown> = {
  "checkin/attendance:lectures": [{ lecture: "k1", open: true, startedAt: T0, startsAt: T0, graceMin: 5, endedAt: null, count: 2 }],
  "checkin/attendance:classStart": { startsAt: T0, graceMin: 5 },
  "checkin/attendance:sheet": [
    { name: "Sample student 1", email: "student1@example.edu", at: T0 - 60_000, lateMin: null },
    { name: "Sample student 2", email: "student2@example.edu", at: T0 + 11 * 60_000, lateMin: 11 },
  ],
  "checkin/read:names": [
    { id: "c2", name: "Sample student 2", at: T0 + 11 * 60_000 },
    { id: "c1", name: "Sample student 1", at: T0 - 60_000 },
  ],
};
vi.mock("convex/react", () => ({
  useQuery: (ref: FunctionReference<"query">, args: unknown) => (args === "skip" ? undefined : results[getFunctionName(ref)]),
  useMutation: () => async () => null,
  useConvex: () => ({ query: async () => [] }),
}));
vi.mock("./prof", async () => {
  const { createElement, Fragment } = await import("react");
  return {
    StaffGate: ({ title, bar, children }: { title: string; bar?: boolean; children: unknown }) =>
      createElement(Fragment, null, `[gate ${title}${bar ? " bar" : ""}]`, children as never),
  };
});

const page = () => renderToStaticMarkup(createElement(Scanner)).replace(/<!-- -->/g, "");
const RULES = parse(readFileSync(new URL("./teacher.css", import.meta.url), "utf8"));

// Whether a rule's @media conditions (min-width and max-width only) hold at this width.
const holds = (r: Rule, w: number) =>
  r.at.every((a) => {
    if (!a.startsWith("@media")) return true;
    const min = /min-width:\s*(\d+)px/.exec(a);
    const max = /max-width:\s*(\d+)px/.exec(a);
    return (!min || w >= Number(min[1])) && (!max || w <= Number(max[1]));
  });
// The last value teacher.css gives `prop` on exactly this selector at this width.
const value = (selector: string, prop: string, w: number) =>
  RULES.filter((r) => holds(r, w) && r.selectors.some((s) => s.trim() === selector))
    .flatMap((r) => r.decls.filter(([p]) => p === prop).map(([, v]) => v))
    .at(-1);

describe("DS-STAFF-risk-1 #/checkin/teacher opens under the staff bar", () => {
  it("DS-STAFF-risk-1 Teacher passes `bar` to StaffGate, so the page has its title and who is signed in", () => {
    expect(renderToStaticMarkup(createElement(Teacher)).startsWith("[gate Attendance bar]")).toBe(true);
  });
});

describe("DS-STAFF-design-1 This class keeps Past classes near the first view", () => {
  // At 1440x900 with 38 check-ins the list was 1680px tall and Past classes started at y 1972.
  // It ends on row 8's bottom edge: at 8.5 rows the 9th row was cut through its words (IT1 staff-craft-1-1).
  it("DS-STAFF-design-1 the check-in list scrolls inside its well, 8 whole rows tall, at every width", () => {
    for (const w of [720, 860, 960, 1280, 1440]) {
      expect(value(".att-list", "max-height", w), `${w}`).toMatch(/^calc\(8 \* var\(--row-h\)/);
      expect(value(".att-list", "overflow-y", w), `${w}`).toBe("auto");
    }
  });
});

describe("DS-STAFF-risk-3 This class's heading keeps how many were late beside the CSV button", () => {
  it("DS-STAFF-risk-3 'Download attendance (CSV)' then '1 late' at the end of the This class heading", () => {
    expect(page()).toMatch(/<p class="row att-sec__act"><button[^>]*><span class="btn__label">Download attendance \(CSV\)<\/span><\/button><span class="muted">1 late<\/span><\/p>/);
  });
});

describe("DS-STAFF-risk-4 the scanner comes first when the page is one column", () => {
  it("DS-STAFF-risk-4 the scanner card and Class start come before This class and Past classes in the page", () => {
    const html = page();
    expect(html.indexOf('class="att-side"')).toBeGreaterThan(-1);
    expect(html.indexOf('class="att-side"')).toBeLessThan(html.indexOf('class="att-main"'));
    expect(html.indexOf("Start scanning")).toBeLessThan(html.indexOf("<h2>This class</h2>"));
  });

  it("DS-STAFF-risk-4 above 900 wide (two columns) the lists take the first column and the scanner the second, both on the first row", () => {
    for (const w of [901, 1280, 1440]) {
      expect([value(".att-desk > .att-main", "grid-column", w), value(".att-desk > .att-main", "grid-row", w)], `${w}`).toEqual(["1", "1"]);
      expect([value(".att-desk > .att-side", "grid-column", w), value(".att-desk > .att-side", "grid-row", w)], `${w}`).toEqual(["2", "1"]);
    }
    // One column (the kit's .desk at 900 and under): no placement, so the page order holds.
    for (const w of [720, 860, 900]) {
      expect(value(".att-desk > .att-side", "grid-column", w), `${w}`).toBeUndefined();
      expect(value(".att-desk > .att-main", "grid-column", w), `${w}`).toBeUndefined();
    }
  });
});

// IT1-STAFF design loop (round 1 judges): row actions, the result panel and its motion.
describe("IT1-STAFF-2 a row's Remove is quiet at rest; End class keeps its red", () => {
  it("IT1-STAFF-2 Remove is --muted at rest and red only on hover or keyboard focus; End class stays --error", () => {
    expect(value(".att-row__action > .btn--danger", "color", 1440)).toBe("var(--muted)");
    const hover = RULES.find((r) => r.selectors.some((s) => s.trim() === ":is(.att-row__action, .att-status) > .btn--danger:is(:hover, :focus-visible)"));
    expect(hover?.decls).toContainEqual(["color", "var(--error)"]);
    expect(value(":is(.att-row__action, .att-status) > .btn--danger", "color", 1440)).toBe("var(--error)");
  });
});

describe("IT1-STAFF-3 the result panel keeps one 120 slot and moves only transform and opacity", () => {
  const css = readFileSync(new URL("./teacher.css", import.meta.url), "utf8");
  const keyframes = (css.match(/@keyframes att-[a-z]+ \{.*\}/g) ?? []).map((k) => k.replace(/\s+/g, " "));
  it("IT1-STAFF-3 the stop panel shares .att-result's 120 min-height; the rise is a transform, the fill a background-color", () => {
    expect(value(".att-result", "min-height", 1440)).toBe("120px");
    expect(value(".att-result--stop", "min-height", 1440)).toBeUndefined();
    expect(value(".att-result--stop", "background", 1440)).toBe("var(--st-stop)");
    expect(keyframes).toEqual([
      "@keyframes att-fill { from { background-color: transparent; } }",
      "@keyframes att-rise { from { transform: translateY(40%); } to { transform: none; } }",
      "@keyframes att-fade { from { opacity: 0; } to { opacity: 1; } }",
    ]);
  });

  it("IT1-STAFF-3 under reduced motion the words fade in place (no rise)", () => {
    const reduced = RULES.filter((r) => r.at.some((a) => a.includes("prefers-reduced-motion: reduce")) && r.selectors.some((s) => s.trim() === ".att-result__mask > *"));
    expect(reduced.flatMap((r) => r.decls)).toEqual([["animation", "att-fade var(--fx-slow) var(--ease) both"]]);
  });
});

// IT1-STAFF design loop (check pass): a row's Remove confirm inside This class's scrolling well.
// The box was absolute over its row; with one or two rows the well scrolled to Cancel and cut off
// the question (elementFromPoint at the question hit MAIN). In the row's flow it grows the row, so
// the well holds the whole box. The lab scenario staff-attendance-remove-confirm-one shows it.
describe("IT1-STAFF-check-1 a row's Remove confirm stays whole inside the This class well", () => {
  it("IT1-STAFF-check-1 the question box sits in the row's flow, not absolute over the well's scroll area", () => {
    for (const w of [720, 1280, 1440]) expect(value(".att-row__action > .confirm", "position", w), `${w}`).not.toBe("absolute");
  });

  it("IT1-STAFF-check-1 the action cell holding the box takes a line of its own under the name and time", () => {
    expect(value(".att-list > .att-row > .att-row__action:has(> .confirm)", "grid-column", 1440)).toBe("1 / -1");
  });
});
