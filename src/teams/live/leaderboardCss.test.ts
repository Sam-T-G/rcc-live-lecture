// @vitest-environment node
// The projector board's ledger rows (#/live/leaderboard; StageBoard.tsx draws them as the kit's
// .pledger__row in the .board--big list, .board--many with 7 or more teams). Their numbers line
// ("6 right · 1.5 per student", .board__score) and the extra credit both keep to one line, and
// together they are wider than a column of the board, so when they shared the first row the name
// column got 0 px and the row ran off the screen (UB-r3-check-1, UB-fixcheck-1, UB-fixcheck-2).
// These checks read the stylesheets; the browser check measures it: every .board__name keeps its
// text on one line and every row's parts stay inside the row, with no page scroll, at 1920 x
// 1080, 1366 x 768 and 1280 x 720 for 7, 10 and 12 teams.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse, splitTop } from "../../styles/cssRules";

const rules = ["live.css", "leaderboard.css", "stageboard.css"].flatMap((f) => parse(readFileSync(new URL("./" + f, import.meta.url), "utf8")));
// Every declaration of `prop` in a rule with a selector that has all of `parts`, in file order.
const decls = (prop: string, ...parts: string[]) =>
  rules
    .filter((r) => r.at.length === 0 && r.selectors.some((s) => parts.every((p) => new RegExp(`\\${p}(?![\\w-])`).test(s))))
    .flatMap((r) => r.decls.filter(([k]) => k === prop).map(([, v]) => v));

describe("#/live/leaderboard's ledger rows, 7 or more teams included", () => {
  it("UB-r3-check-1 the numbers line goes on its own row under the name, across the name and extra credit columns", () => {
    expect(decls("grid-row", ".board--many", ".board__score").at(-1)).toBe("2");
    expect(decls("grid-row", ".board--big", ".board__score").at(-1)).toBe("2");
    expect(decls("grid-column", ".board--big", ".board__score").at(-1)).toBe("2 / -1");
    expect(decls("grid-column", ".board--many", ".board__score")).toEqual([]);
  });

  it("UB-fixcheck-1 a row keeps three columns (place, name, extra credit), so nothing but the extra credit sits beside the name", () => {
    const many = decls("grid-template-columns", ".board--many", ".pledger__row");
    expect(many.length).toBeGreaterThan(0);
    for (const cols of [...many, decls("grid-template-columns", ".board--big", ".pledger__row").at(-1) ?? ""]) {
      const tracks = splitTop(cols, " ");
      expect(tracks, cols).toHaveLength(3);
      // The name's column is the one that gives way; the place and the credit keep their width.
      expect(tracks[1], cols).toBe("minmax(0, 1fr)");
    }
  });

  it("a long name ends in '...' in its own column instead of pushing the credit off the row", () => {
    expect(decls("text-overflow", ".board--big", ".board__name").at(-1)).toBe("ellipsis");
    expect(decls("white-space", ".board--big", ".board__name").at(-1)).toBe("nowrap");
    expect(decls("min-width", ".board--big", ".board__name").at(-1)).toBe("0");
  });
});
