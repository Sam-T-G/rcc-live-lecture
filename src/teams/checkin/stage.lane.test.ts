// @vitest-environment node
// The left column of #/checkin/stage stacks without overlap (DESIGN-SYSTEM.md: the poll panel
// sits above the late lane): from the bottom up, the lane (late strips, presenter notes), the
// count's error row, then the quiz panel. Before this, the lane and the count's error drew over
// the panel's last choices (DS-PROJECTOR-check-2, -design-2, -risk-1, -risk-3). The screen lab
// measures the boxes; this pins the rules that place them.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse, type Rule } from "../../styles/cssRules";

const stage = parse(readFileSync(new URL("./stage.css", import.meta.url), "utf8"));

// Every value `prop` gets from a rule whose selector list includes `selector`, in sheet order,
// with the at-rules around it.
const values = (selector: string, prop: string) =>
  stage.flatMap((r: Rule) =>
    r.selectors.includes(selector) ? r.decls.filter(([k]) => k === prop).map(([, v]) => ({ v, at: r.at })) : [],
  );
const last = (selector: string, prop: string) => values(selector, prop).at(-1);

const LANE_FULL = ".stage:has(> .stage__lane :is(.late__item, .pnote, .row))";
const COUNT_ROW = ".stage__card > .stage-card > .row:has(+ .stage__hint)";
const COUNT_ERR = ".stage__card > .stage-card:has(> .row + .stage__hint)";

describe("the stage's left column: lane, count error and quiz panel never overlap", () => {
  it("the lane and the count's error row are anchors; the lane's names come first so the row wins --stage-foot", () => {
    expect(last(".stage__lane", "anchor-name")?.v).toBe("--stage-lane, --stage-foot");
    expect(last(COUNT_ROW, "anchor-name")?.v).toBe("--stage-foot");
  });

  it("with something in the lane, the quiz panel ends 24 above the box under it", () => {
    const b = last(`${LANE_FULL} .stage__card .stage__poll`, "bottom");
    expect(b?.v).toBe("calc(anchor(--stage-foot top) + 24 * var(--stage-u))");
    expect(b?.at.some((a) => a.startsWith("@supports (anchor-name"))).toBe(true);
  });

  it("with the count's error showing, the quiz panel ends 24 above it, and the row sits above the lane", () => {
    expect(last(`${COUNT_ERR} .stage__poll`, "bottom")?.v).toBe("calc(anchor(--stage-foot top) + 24 * var(--stage-u))");
    expect(last(`${LANE_FULL} ${COUNT_ROW}`, "bottom")?.v).toBe("calc(anchor(--stage-lane top) + 24 * var(--stage-u))");
  });

  it("a browser without anchor positioning reserves one 120 strip plus the 24 gap", () => {
    const plain = values(`${LANE_FULL} .stage__card .stage__poll`, "bottom").filter((d) => d.at.length === 0 || d.at.every((a) => !a.startsWith("@supports")));
    expect(plain.map((d) => d.v)).toContain("calc(var(--p-margin) + 144 * var(--stage-u))");
  });

  it("TK-COPY-risk-2 without anchor positioning, a presenter note (196 tall with 'For the presenter:') gets 220 reserved, not 144", () => {
    const NOTE = ".stage:has(> .stage__lane .pnote)";
    const plain = (sel: string, prop: string) =>
      values(sel, prop).filter((d) => d.at.some((a) => a.startsWith("@supports not (anchor-name"))).at(-1)?.v;
    expect(plain(`${NOTE} .stage__card .stage__poll`, "bottom")).toBe("calc(var(--p-margin) + 220 * var(--stage-u))");
    expect(plain(`${NOTE} ${COUNT_ROW}`, "bottom")).toBe("calc(var(--p-margin) + 220 * var(--stage-u))");
    expect(plain(`${NOTE} .stage__card .stage__poll:has(.stage__bars)`, "max-height")).toBe("calc(668 * var(--stage-u))");
    expect(plain(`${NOTE} ${COUNT_ERR} .stage__poll`, "bottom")).toBe("calc(var(--p-margin) + 364 * var(--stage-u))");
  });

  it("a shortened panel never clips its question, count or choices: it keeps at least its content's height", () => {
    expect(last(`${LANE_FULL} .stage__card .stage__poll`, "min-height")?.v).toBe("min-content");
    // The tracks count every row's words, so min-content is the whole panel (an overflow:hidden
    // question in an auto track counted as 0 tall).
    expect(last(".stage__poll", "grid-template-rows")?.v).toBe("min-content min-content minmax(min-content, 1fr)");
    expect(last(".stage__poll:has(.stage__bars)", "grid-template-rows")?.v).toBe("min-content minmax(min-content, 1fr)");
  });

  it("the shortened panel tightens its rows and stops the question at 2 lines", () => {
    expect(last(`${LANE_FULL} .stage__card :is(.stage__choice, .stage__bar)`, "padding-block")?.v).toBe("calc(2 * var(--stage-u))");
    expect(last(`${LANE_FULL} .stage__card .stage__q`, "-webkit-line-clamp")?.v).toBe("2");
  });

  it("with an empty lane and no count error the panel still spans the frame", () => {
    expect(last(".stage__poll", "bottom")?.v).toBe("var(--p-margin)");
    expect(last(".stage__poll", "top")?.v).toBe("var(--p-margin)");
  });
});
