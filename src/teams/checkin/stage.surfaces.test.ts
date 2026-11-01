// @vitest-environment node
// The projector (#/checkin/stage and #/live/leaderboard at 1920 x 1080), checked in its
// stylesheets: stage.css (the check-in card on the deck) and stageboard.css (the team board; the
// rule that hides the students line with 7 or more teams is in live.css). Moved from
// src/styles/surfaces.test.ts with those rules (DESIGN-BRIEF.md "Who looks at what"); the browser
// checker measures the same things on the running pages.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse, type Rule } from "../../styles/cssRules";

const read = (path: string) => parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const stage = read("./stage.css");
const board = read("../live/stageboard.css");
const live = read("../live/live.css");

// The value the last rule for this exact selector gives the property, outside any @media.
function value(rules: Rule[], selector: string, prop: string): string | undefined {
  let out: string | undefined;
  for (const r of rules) {
    if (r.at.some((a) => a.startsWith("@media"))) continue;
    if (!r.selectors.includes(selector)) continue;
    for (const [k, v] of r.decls) if (k === prop) out = v;
  }
  return out;
}

describe("projector (#/checkin/stage and #/live/leaderboard at 1920 x 1080)", () => {
  // Stage sizes come from --stage-u or the --proj-* tokens (tokens.css), so the 1920 x 1080 floors
  // (40 body, 32 smallest) hold at any projector size. A px or rem size is a phone size; a
  // percentage is a share of the stage-sized card.
  const SIZED = ["font-size", "width", "height", "padding", "gap"];
  const stageSized = (v: string) => /var\(--(proj-[\w-]+|stage-u)\)/.test(v) || /^(0|auto|\d+%)$/.test(v);

  it("the check-in card on the deck sizes its box and words in stage units", () => {
    const bad = stage
      .filter((r) => r.selectors.some((s) => /\.stage__(card|hide|count|hint|poll|q|answered|bar|show)\b/.test(s)))
      .flatMap((r) => r.decls.filter(([k, v]) => SIZED.includes(k) && !stageSized(v)).map(([k, v]) => `${r.selectors.join(", ")} { ${k}: ${v} }`));
    expect(bad).toEqual([]);
    expect(value(stage, ".stage__card", "width")).toMatch(/stage-u/);
    expect(value(stage, ".stage__card", "font-size")).toMatch(/--proj-/);
  });

  it("the check-in card takes its colors from tokens, not raw hex or rgb()", () => {
    const raw = stage
      .filter((r) => r.selectors.some((s) => s.includes(".stage__")))
      .flatMap((r) => r.decls.filter(([k, v]) => k !== "box-shadow" && /#[0-9a-f]{3,6}\b|rgba?\(/i.test(v)).map(([k, v]) => `${r.selectors.join(", ")} { ${k}: ${v} }`));
    expect(raw).toEqual([]);
  });

  it("the 'Check-in' button that brings the card back keeps its green fill (DESIGN-fixcheck-1)", () => {
    // Stage.tsx puts data-theme="light" on it. The base `[data-theme] { background-color: var(--bg) }`
    // outranks the base `button { background-color: var(--accent) }` in the same layer, so without
    // its own fill the button was a #f7faf8 pill on the white slide (1.05:1).
    expect(value(stage, ".stage__show", "background-color")).toBe("var(--accent)");
    expect(value(stage, ".stage__show", "color")).toBe("var(--accent-text)");
  });

  it("with an ended quiz's bars on it, the check-in card fits the stage (DCHK-1)", () => {
    // The card can't scroll (overflow: hidden), so at 1920 x 1080 a 125-character question and
    // four choices cut off choice D. The QR shrinks while the bars show, and the question and each
    // choice stop at a line count with "...". The browser checker measures the card itself.
    expect(value(stage, ".stage__card:has(.stage__bars) .qr", "width")).toMatch(/^40%/);
    for (const [sel, lines] of [[".stage__q", "4"], [".stage__poll:has(.stage__bars) .stage__q", "3"], [".stage__label", "2"]]) {
      expect(value(stage, sel, "-webkit-line-clamp"), sel).toBe(lines);
    }
    for (const sel of [".stage__q", ".stage__label"]) {
      expect(value(stage, sel, "display"), sel).toBe("-webkit-box");
      expect(value(stage, sel, "overflow"), sel).toBe("hidden");
    }
  });

  it("past six teams the big board's rows are one line, so ten teams fit 1080 tall (DESIGN-fixcheck-2)", () => {
    // Two-line rows are 165 stage px: three rows (six teams) fit. StageBoard.tsx adds
    // .board--many past six and lists at most ten (Page.test.ts).
    expect(value(live, ".board--many .board__members", "display")).toBe("none");
    expect(value(board, ".board--many .board__rank", "grid-row")).toBe("auto");
    expect(value(board, ".board--many .board__rank", "font-size")).toMatch(/^var\(--proj-/);
  });

  it("the big leaderboard sizes its words from the --proj-* tokens", () => {
    for (const sel of [".board--big .board__rank", ".board--big .board__name", ".board--big .board__score, .board--big .board__ec", ".board--big .board__members", ".board--big small"]) {
      const first = sel.split(", ")[0];
      expect(value(board, first, "font-size"), sel).toMatch(/^var\(--proj-/);
    }
  });
});
