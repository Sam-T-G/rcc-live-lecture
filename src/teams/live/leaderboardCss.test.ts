// @vitest-environment node
// The projector board with 7 or more teams (.board--many on #/live/leaderboard). Its numbers line
// ("6 right · 1.5 per student", .board__score) and the extra credit both keep to one line
// (white-space: nowrap in live.css), and together they are wider than a column of the two-column
// board, so when they shared the first row the name column got 0 px and the row ran off the
// screen (UB-r3-check-1, UB-fixcheck-1, UB-fixcheck-2). These checks read the stylesheets; the
// browser check measures it: every .board__name keeps its text on one line and every row's parts
// stay inside the row, with no page scroll, at 1920 x 1080, 1366 x 768 and 1280 x 720 for 7, 10
// and 12 teams.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse, splitTop } from "../../styles/cssRules";

const rules = ["live.css", "leaderboard.css", "stageboard.css"].flatMap((f) => parse(readFileSync(new URL("./" + f, import.meta.url), "utf8")));
// Every declaration of `prop` in a rule with a selector that has all of `parts`, in file order.
const decls = (prop: string, ...parts: string[]) =>
  rules
    .filter((r) => r.at.length === 0 && r.selectors.some((s) => parts.every((p) => new RegExp(`\\${p}(?![\\w-])`).test(s))))
    .flatMap((r) => r.decls.filter(([k]) => k === prop).map(([, v]) => v));

describe("#/live/leaderboard with 7 or more teams", () => {
  it("UB-r3-check-1 the numbers line goes on its own row under the name, across the name and extra credit columns", () => {
    expect(decls("grid-row", ".board--many", ".board__score").at(-1)).toBe("2");
    expect(decls("grid-column", ".board--big", ".board__score").at(-1)).toBe("2 / -1");
    expect(decls("grid-column", ".board--many", ".board__score")).toEqual([]);
  });

  it("UB-fixcheck-1 a row keeps three columns (place, name, extra credit), so nothing but the extra credit sits beside the name", () => {
    for (const cols of decls("grid-template-columns", ".board--many", ".board__row")) expect(splitTop(cols, " ")).toHaveLength(3);
    expect(decls("grid-template-columns", ".board--big", ".board__row").at(-1)).toBe("2.2em minmax(0, 1fr) auto");
  });
});
