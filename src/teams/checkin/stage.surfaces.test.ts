// @vitest-environment node
// The projector (#/checkin/stage and #/live/leaderboard at 1920 x 1080), checked in its
// stylesheets: stage.css (the check-in card, the quiz panel and the bottom-left lane on the deck)
// and stageboard.css (the team board; the rule that hides the students line with 7 or more teams
// is in live.css). Moved from src/styles/surfaces.test.ts with those rules (DESIGN-BRIEF.md "Who
// looks at what"); the browser checker and the screen lab measure the same things on the running
// pages.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse, type Rule } from "../../styles/cssRules";

const read = (path: string) => parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const stage = read("./stage.css");
const board = read("../live/stageboard.css");
const live = read("../live/live.css");
const kit = read("../../styles/kit.css");

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

// Every declaration of `prop` in the sheet, as "selectors { prop: value }".
const every = (rules: Rule[], prop: string) =>
  rules.flatMap((r) => r.decls.filter(([k]) => k === prop).map(([, v]) => ({ where: `${r.selectors.join(", ")} { ${prop}: ${v} }`, v, r })));

describe("projector (#/checkin/stage and #/live/leaderboard at 1920 x 1080)", () => {
  // Stage sizes come from --stage-u, the --p-* stage sizes or the older --proj-* ones
  // (tokens.css), so the 1920 x 1080 floors (40 body, 32 smallest) hold at any projector size. A
  // px or rem size is a phone size; a percentage is a share of a stage-sized box.
  const SIZED = ["font-size", "width", "height", "padding", "gap"];
  const stageSized = (v: string) => /var\(--(proj-[\w-]+|p-[\w-]+|stage-u)\)/.test(v) || /^(0|auto|\d+%)$/.test(v);

  it("the check-in card, the quiz panel and the lane size their boxes and words in stage units", () => {
    const bad = stage
      .filter((r) => r.selectors.some((s) => /\.stage__(card|hide|count|hint|poll|q|answered|choice|bar|show|lane|late|warn)\b/.test(s)))
      .flatMap((r) => r.decls.filter(([k, v]) => SIZED.includes(k) && !stageSized(v)).map(([k, v]) => `${r.selectors.join(", ")} { ${k}: ${v} }`));
    expect(bad).toEqual([]);
    expect(value(stage, ".stage__poll", "width")).toMatch(/stage-u/);
    expect(value(stage, ".stage__count b", "font-size")).toBe("var(--p-count)");
  });

  it("no word on the stage or the board is set under the 32 stage px floor", () => {
    // The floor is --p-ledger (32): every font size is a stage token from 32 up, or inherits one.
    const ok = /^var\(--(p-(count|rank|head|q|body|small|ledger)|proj-(digits|head|body|small|ledger))\)$|^inherit$/;
    const bad = [...every(stage, "font-size"), ...every(board, "font-size")].filter((d) => !ok.test(d.v)).map((d) => d.where);
    expect(bad).toEqual([]);
  });

  it("the check-in card takes its colors from tokens, not raw hex or rgb()", () => {
    const raw = stage
      .filter((r) => r.selectors.some((s) => s.includes(".stage__")))
      .flatMap((r) => r.decls.filter(([k, v]) => k !== "box-shadow" && /#[0-9a-f]{3,6}\b|rgba?\(/i.test(v)).map(([k, v]) => `${r.selectors.join(", ")} { ${k}: ${v} }`));
    expect(raw).toEqual([]);
  });

  it("nothing on the stage or the board casts a shadow: every box-shadow is a ring with no offset or blur", () => {
    // DESIGN-SYSTEM.md "Projector: no shadows. Separate by tone and 6 stage px rules."
    const ring = /^(inset )?0 0 0 /;
    const bad = [...every(stage, "box-shadow"), ...every(board, "box-shadow")].filter((d) => !ring.test(d.v)).map((d) => d.where);
    expect(bad).toEqual([]);
  });

  it("the 'Check-in' button that brings the card back keeps its green fill (DESIGN-fixcheck-1)", () => {
    // Stage.tsx puts data-theme="light" on it. The base `[data-theme] { background-color: var(--bg) }`
    // outranks the base `button { background-color: var(--accent) }` in the same layer, so without
    // its own fill the button was a #f7faf8 pill on the white slide (1.05:1).
    expect(value(stage, ".stage__show", "background-color")).toBe("var(--accent)");
    expect(value(stage, ".stage__show", "color")).toBe("var(--accent-text)");
  });

  it("the card is the kit's .stage-card spanning the frame's height, so it keeps one box in every state", () => {
    // The kit puts it on the frame's right and bottom edges at 600 wide; stage.css adds the top.
    expect(value(kit, ".stage-card", "right")).toBe("var(--p-margin)");
    expect(value(kit, ".stage-card", "bottom")).toBe("var(--p-margin)");
    expect(value(kit, ".stage-card", "width")).toBe("var(--p-card)");
    expect(value(stage, ".stage__card > .stage-card", "top")).toBe("var(--p-margin)");
    // The aside only themes the card, so the kit's card is positioned on the stage itself.
    expect(value(stage, ".stage__card", "display")).toBe("contents");
  });

  it("the QR keeps its size and spot in every state: no rule shrinks it for a quiz (projector baseline problem 3)", () => {
    expect(value(stage, ".stage__card > .stage-card > .qr", "width")).toBe("100%");
    const widths = every(stage, "width").filter((d) => d.r.selectors.some((s) => /\.qr\b/.test(s)));
    expect(widths.map((d) => d.v)).toEqual(["100%"]);
    // The QR is the card's width minus the card's side padding, so a rule that changes either one
    // moves it. Nothing but that width sizes the QR (no max-width, transform, zoom or scale), and the
    // card's padding and columns are set once, by `.stage__card > .stage-card` (the QR spans both
    // columns), with no quiz-state rule (`:has(.stage__poll)` and the like) changing them.
    const BOX = /^((max-|min-)?(width|height|inline-size|block-size)|padding(-\w+)*|margin(-\w+)*|transform|translate|zoom|scale|aspect-ratio|grid-template-columns|box-sizing)$/;
    // The selector's subject: its last compound, with any :has(...) taken out.
    const subject = (s: string) => s.replace(/:has\((?:[^()]|\([^()]*\))*\)/g, "").trim().split(/\s*[\s>+~]\s*/).pop() ?? "";
    const isQr = (s: string) => /\.qr\b/.test(subject(s));
    const isCard = (s: string) => /\.stage-card(?![\w-])/.test(subject(s));
    const boxed = (pick: (s: string) => boolean) =>
      stage
        .filter((r) => r.selectors.some(pick))
        .flatMap((r) => r.decls.filter(([k]) => BOX.test(k)).map(([k, v]) => `${r.selectors.filter(pick).join(", ")} { ${k}: ${v} }`));
    expect(boxed(isQr)).toEqual([".stage__card > .stage-card > .qr { width: 100% }"]);
    expect(boxed(isCard)).toEqual([
      ".stage__card > .stage-card { padding: calc(32 * var(--stage-u)) calc(44 * var(--stage-u)) }",
      ".stage__card > .stage-card { grid-template-columns: minmax(0, 1fr) auto }",
    ]);
  });

  it("with an ended quiz's bars on screen, the card and the quiz panel fit the stage (DCHK-1)", () => {
    // The bars sit in the quiz panel, out of the card's flow, so they can't push the card or the QR.
    // The panel's top and bottom sit on the frame, so a 125-character question and four long
    // choices stop at a line count with "..." and the rows share the height that's left. The
    // browser checker measures the card and the panel themselves.
    expect(value(stage, ".stage__poll", "position")).toBe("fixed");
    expect(value(stage, ".stage__poll", "top")).toBe("var(--p-margin)");
    expect(value(stage, ".stage__poll", "bottom")).toBe("var(--p-margin)");
    expect(value(stage, ".stage__poll", "overflow")).toBe("hidden");
    // The bars at 40, the sentence floor (docs/design.md, projector-stage-quiz-ended).
    expect(value(stage, ".stage__bars", "font-size")).toBe("var(--p-small)");
    for (const [sel, lines] of [[".stage__q", "4"], [".stage__poll:has(.stage__bars) .stage__q", "3"], [".stage__label", "2"]]) {
      expect(value(stage, sel, "-webkit-line-clamp"), sel).toBe(lines);
    }
    for (const sel of [".stage__q", ".stage__label"]) {
      expect(value(stage, sel, "display"), sel).toBe("-webkit-box");
      expect(value(stage, sel, "overflow"), sel).toBe("hidden");
    }
  });

  it("the quiz panel takes the left column beside the card: 96 + 1080 + 48 + 600 + 96 = 1920", () => {
    expect(value(stage, ".stage__poll", "left")).toBe("var(--p-margin)");
    expect(value(stage, ".stage__poll", "top")).toBe("var(--p-margin)");
    const panel = Number(/calc\((\d+) \* var\(--stage-u\)\)/.exec(value(stage, ".stage__poll", "width") ?? "")?.[1]);
    const card = Number(/calc\((\d+) \*/.exec(readFileSync(new URL("../../styles/tokens.css", import.meta.url), "utf8").match(/--p-card:[^;]+/)?.[0] ?? "")?.[1]);
    expect(96 + panel + 48 + card + 96).toBe(1920);
  });

  it("the late banner and the presenter notes sit in the bottom-left lane, above the quiz panel", () => {
    expect(value(stage, ".stage__lane", "left")).toBe("var(--p-margin)");
    expect(value(stage, ".stage__lane", "bottom")).toBe("var(--p-margin)");
    expect(Number(value(stage, ".stage__lane", "z-index"))).toBeGreaterThan(0);
    expect(value(stage, ".stage__poll", "z-index")).toBeUndefined();
    // A late arrival is one strip at the stage's body size.
    expect(value(stage, ".stage__late .late__item", "font-size")).toBe("var(--p-body)");
  });

  it("past six teams the big board's rows are tighter, so ten teams fit 1080 tall (DESIGN-fixcheck-2)", () => {
    // StageBoard.tsx adds .board--many past six and lists at most ten (Page.test.ts): two columns
    // of rows at 40, the place on the name's first line.
    expect(value(live, ".board--many .board__members", "display")).toBe("none");
    expect(value(board, "ol.board.board--many", "grid-template-columns")).toBe("repeat(2, minmax(0, 1fr))");
    expect(value(board, ".board--many .pledger__place", "grid-row")).toBe("auto");
    expect(value(board, ".board--many .pledger__place", "font-size")).toMatch(/^var\(--proj-/);
  });

  it("the big leaderboard sizes its words from the --proj-* tokens", () => {
    for (const sel of [".board--big .pledger__place", ".board--big .board__name", ".board--big .board__ec", ".board--big .board__score", ".board--big small"]) {
      expect(value(board, sel, "font-size"), sel).toMatch(/^var\(--proj-/);
    }
  });
});
