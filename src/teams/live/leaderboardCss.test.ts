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

  it("e2e-board-tied-first-green past six teams, the green top row is only for a team alone in 1st (.board--tied rows stay plain)", () => {
    // StageBoard.tsx adds .board--tied when two or more teams share 1st; every rule that paints
    // the first row of a .board--many list has to leave a tied list alone.
    const firstRow = rules.flatMap((r) => r.selectors).filter((s) => /\.board--many\b/.test(s) && /:first-child/.test(s));
    expect(firstRow.length).toBeGreaterThan(0);
    for (const s of firstRow) expect(s, s).toMatch(/\.board--many:not\(\.board--tied\)/);
  });

  it("IT1-PROJECTOR-check-1 late strips sit side by side in one row on the frame's bottom and take the scoring line's spot, so two never reach a ledger row", () => {
    // Measured at 1920 x 1080: the ledger ends at y 776 with 13 teams, 662 with 8, and the 1st
    // place block at 812 with 5. One strip is 120 tall (y 864); two side by side are 147 (y 837).
    // Stacked, two reached y 728 and covered the 5th row of both columns.
    expect(decls("flex-direction", ".live-board__late", ".late").at(-1)).toBe("row");
    expect(decls("left", ".live-board__late", ".late").at(-1)).toBe("var(--p-margin)");
    expect(decls("right", ".live-board__late", ".late").at(-1)).toBe("var(--p-margin)");
    expect(decls("bottom", ".live-board__late", ".late").at(-1)).toBe("var(--p-margin)");
    expect(decls("flex", ".live-board__late", ".late__item").at(-1)).toBe("1 1 0");
    expect(decls("max-width", ".live-board__late", ".late__item").at(-1)).toBe("calc(1080 * var(--stage-u))");
    expect(decls("min-height", ".live-board__late", ".late__item").at(-1)).toBe("calc(120 * var(--stage-u))");
    // The scoring line gives way while a strip shows, so it never shows cut in half behind one.
    const foot = rules.filter((r) => r.selectors.some((s) => s.includes(".late__item") && /> \.lbfoot$/.test(s)));
    expect(foot.flatMap((r) => r.decls)).toContainEqual(["visibility", "hidden"]);
  });

  it("IT1-PROJECTOR-check-3 past six teams the moved-row ring lies on the row's rules, clear of its words; the green leader's ring stays on its fill", () => {
    // The compact rows have 6 of padding: a ring 4 inside them ran 7 into the words' ascent and
    // descent. On the rules (-6, over the next row's rule) it clears them by 3.
    const ring = (sel: string, prop: string) =>
      rules.filter((r) => r.at.length === 0 && r.selectors.includes(sel)).flatMap((r) => r.decls.filter(([k]) => k === prop).map(([, v]) => v)).at(-1);
    expect(ring(".board--many .pledger__row::after", "inset-block")).toBe("calc(-6 * var(--stage-u))");
    expect(ring(".board--many .pledger__row::after", "z-index")).toBe("1");
    const LEAD = ".board--many:not(.board--tied) > .pledger__row:first-child";
    expect(ring(LEAD + "::after", "inset-block")).toBe("0");
    // The leader's words sit 4 higher in the same 12 of padding.
    expect(ring(LEAD, "padding-block")).toBe("calc(2 * var(--stage-u)) calc(10 * var(--stage-u))");
    expect(ring(".board--many .pledger__row", "padding-block")).toBe("calc(6 * var(--stage-u))");
  });

  it("a long name ends in '...' in its own column instead of pushing the credit off the row", () => {
    expect(decls("text-overflow", ".board--big", ".board__name").at(-1)).toBe("ellipsis");
    expect(decls("white-space", ".board--big", ".board__name").at(-1)).toBe("nowrap");
    expect(decls("min-width", ".board--big", ".board__name").at(-1)).toBe("0");
  });
});
