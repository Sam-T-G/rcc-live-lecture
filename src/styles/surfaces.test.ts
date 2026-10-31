// @vitest-environment node
// Layout and size rules each surface needs (DESIGN-BRIEF.md "Who looks at what"), checked in the
// stylesheets themselves: the door iPad at 820 x 1180 portrait, the projector at 1920 x 1080 and
// the student phone. The browser checker measures the same things on the running pages.
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

// The value the last rule for this exact selector gives the property, outside any @media.
function value(rules: Rule[], selector: string, prop: string): string | undefined {
  let out: string | undefined;
  for (const r of rules) {
    if (r.at.some((a) => a.startsWith("@media")) || !r.selectors.includes(selector)) continue;
    for (const [k, v] of r.decls) if (k === prop) out = v;
  }
  return out;
}

describe("door iPad (#/checkin/kiosk at 820 x 1180 portrait)", () => {
  it("'Start check-in' stays on one line: the button is absolutely placed, so it shrinks to half its box", () => {
    expect(value(checkin, ".kiosk__start", "white-space")).toBe("nowrap");
  });

  it("the kiosk is one column on a portrait screen, so the camera takes the full width", () => {
    const portrait = checkin.filter(
      (r) => r.selectors.includes(".kiosk") && r.at.some((a) => /@media[^{]*orientation:\s*portrait/.test(a)),
    );
    expect(portrait.flatMap((r) => r.decls)).toContainEqual(["grid-template-columns", "1fr"]);
  });
});

describe("projector (#/checkin/stage and #/live/leaderboard at 1920 x 1080)", () => {
  // Stage sizes come from --stage-u or the --proj-* tokens (tokens.css), so the 1920 x 1080 floors
  // (40 body, 32 smallest) hold at any projector size. A px or rem size is a phone size; a
  // percentage is a share of the stage-sized card.
  const SIZED = ["font-size", "width", "height", "padding", "gap"];
  const stageSized = (v: string) => /var\(--(proj-[\w-]+|stage-u)\)/.test(v) || /^(0|auto|\d+%)$/.test(v);

  it("the check-in card on the deck sizes its box and words in stage units", () => {
    const bad = checkin
      .filter((r) => r.selectors.some((s) => /\.stage__(card|hide|count|hint|poll|q|answered|bar|show)\b/.test(s)))
      .flatMap((r) => r.decls.filter(([k, v]) => SIZED.includes(k) && !stageSized(v)).map(([k, v]) => `${r.selectors.join(", ")} { ${k}: ${v} }`));
    expect(bad).toEqual([]);
    expect(value(checkin, ".stage__card", "width")).toMatch(/stage-u/);
    expect(value(checkin, ".stage__card", "font-size")).toMatch(/--proj-/);
  });

  it("the check-in card takes its colors from tokens, not raw hex or rgb()", () => {
    const raw = checkin
      .filter((r) => r.selectors.some((s) => s.includes(".stage__")))
      .flatMap((r) => r.decls.filter(([k, v]) => k !== "box-shadow" && /#[0-9a-f]{3,6}\b|rgba?\(/i.test(v)).map(([k, v]) => `${r.selectors.join(", ")} { ${k}: ${v} }`));
    expect(raw).toEqual([]);
  });

  it("the big leaderboard sizes its words from the --proj-* tokens", () => {
    for (const sel of [".board--big .board__rank", ".board--big .board__name", ".board--big .board__score, .board--big .board__ec", ".board--big .board__members", ".board--big small"]) {
      const first = sel.split(", ")[0];
      expect(value(live, first, "font-size"), sel).toMatch(/^var\(--proj-/);
    }
  });
});

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
});
