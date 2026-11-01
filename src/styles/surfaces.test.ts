// @vitest-environment node
// Layout and size rules each surface needs (DESIGN-BRIEF.md "Who looks at what"), checked in the
// stylesheets themselves: controls' edges everywhere and the student phone. The door iPad's checks
// are in src/teams/checkin/kiosk.surfaces.test.ts and the projector's in
// src/teams/checkin/stage.surfaces.test.ts, beside their stylesheets. The browser checker measures
// the same things on the running pages.
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse, type Rule } from "./cssRules";

const SRC = new URL("../", import.meta.url);
const read = (path: string) => parse(readFileSync(new URL(path, SRC), "utf8"));
const SHEETS = Object.fromEntries(
  readdirSync(SRC, { recursive: true, encoding: "utf8" })
    .filter((f) => f.endsWith(".css"))
    .map((f) => [f, parse(readFileSync(new URL(f, SRC), "utf8"))]),
);
const checkin = read("teams/checkin/checkin.css");
const live = read("teams/live/live.css");
const stageboard = read("teams/live/stageboard.css");
const index = read("index.css");
const kit = read("styles/kit.css");

// The value the last rule for this exact selector gives the property, outside any @media, or
// only inside an @media whose condition matches `media` when it's given.
function value(rules: Rule[], selector: string, prop: string, media?: RegExp): string | undefined {
  let out: string | undefined;
  for (const r of rules) {
    const at = r.at.filter((a) => a.startsWith("@media"));
    if (media ? !at.some((a) => media.test(a)) : at.length > 0) continue;
    if (!r.selectors.includes(selector)) continue;
    for (const [k, v] of r.decls) if (k === prop) out = v;
  }
  return out;
}

describe("controls' edges (3:1 for UI parts)", () => {
  // --line is for dividers only (tokens.css): 1.44:1 on --bg. A button, field or toggle draws its
  // edge with --line-strong.
  const CONTROL = /(^|[\s>+~])(button|textarea|input|select)\b|\.q__vote\b/;
  it("no button, field or textarea draws its edge with --line", () => {
    const bad: string[] = [];
    for (const [file, rules] of Object.entries(SHEETS)) {
      for (const r of rules) {
        const last = r.selectors.map((s) => s.split(/\s+/).pop() ?? s);
        if (!last.some((s) => CONTROL.test(s) || CONTROL.test(" " + s))) continue;
        for (const [k, v] of r.decls) if (/^border(-color|-top|-right|-bottom|-left)?$/.test(k) && /var\(--line\)/.test(v)) bad.push(`${file} ${r.selectors.join(", ")} { ${k}: ${v} }`);
      }
    }
    expect(bad).toEqual([]);
  });
});

describe("student phone (#/live)", () => {
  it("the cards in the side column have a gap between them", () => {
    expect(value(live, ".live__side", "display")).toBe("grid");
    expect(value(live, ".live__side", "gap")).toBeTruthy();
  });

  it("the leaderboard card's rows share one set of columns, so scores line up (DCHK-2)", () => {
    // Each row was its own grid, so at 320 wide "12 right" wrapped in some rows and not others.
    expect(value(live, ".board:not(.board--big)", "grid-template-columns")).toBeTruthy();
    expect(value(live, ".board:not(.board--big) > .board__row", "grid-template-columns")).toBe("subgrid");
    expect(value(live, ".board:not(.board--big) > .board__row", "grid-column")).toBe("1 / -1");
    for (const sel of [".board__score", ".board__ec"]) expect(value(live, sel, "white-space"), sel).toBe("nowrap");
  });

  it("under 360 wide the score sits on the name's line and the extra credit under it (DCHK-2)", () => {
    const narrow = /max-width:\s*359px/;
    expect(value(live, ".board:not(.board--big)", "grid-template-columns", narrow)).toBe("2.2em minmax(0, 1fr) auto");
    expect(value(live, ".board:not(.board--big) .board__score", "grid-column", narrow)).toBe("3");
    expect(value(live, ".board:not(.board--big) .board__score", "grid-row", narrow)).toBe("1");
    expect(value(live, ".board:not(.board--big) .board__ec", "grid-column", narrow)).toBe("3");
    expect(value(live, ".board:not(.board--big) .board__ec", "grid-row", narrow)).toBe("2");
    expect(value(live, ".board:not(.board--big) .board__members", "grid-row", narrow)).toBe("2");
  });
});

describe("design fixes that only a stylesheet shows (DESIGN-fixcheck-3)", () => {
  it("body breaks long words with break-word, never anywhere (DESIGN-design-1)", () => {
    // anywhere shrinks every flex and grid box to one letter: "Yellow" split mid-word at 320.
    expect(value(index, "body", "overflow-wrap")).toBe("break-word");
  });

  it("a checkbox's words wrap beside the box, never under it (DC-1, DESIGN-design-8)", () => {
    const label = 'label:has(> input[type="checkbox"], > input[type="radio"])';
    expect(value(index, label, "display")).toBe("flex");
    expect(value(index, label, "flex-wrap")).toBe("nowrap");
  });

  it("the quiz question and the big board's names and scores set their line height (DESIGN-design-7)", () => {
    expect(value(checkin, ".quiz__q", "line-height")).toBeTruthy();
    expect(value(stageboard, ".board--big .board__name", "line-height")).toBeTruthy();
    expect(value(stageboard, ".board--big .board__score", "line-height")).toBeTruthy();
    expect(value(stageboard, ".board--big .board__ec", "line-height")).toBeTruthy();
  });

  it("#/ui's forced hover on a segmented option draws the hover layer (DESIGN-spec-3)", () => {
    expect(value(kit, '.seg__label[data-force="hover"]', "background-color")).toMatch(/--rcc-state-hover/);
  });

  it("a flush quiet button pulls left by exactly its own side padding (DCHK-3)", () => {
    // Home's links: the words start at the same x as the description under each one.
    const pad = value(index, ".btn--quiet", "padding-inline");
    expect(pad).toBeTruthy();
    expect(value(index, ".btn--quiet.btn--flush", "margin-inline-start")).toBe(`calc(-1 * ${pad})`);
  });
});
