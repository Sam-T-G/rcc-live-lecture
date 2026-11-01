// @vitest-environment node
// The door iPad (#/checkin/kiosk at 820 x 1180 portrait), checked in its stylesheet (kiosk.css).
// Moved from src/styles/surfaces.test.ts with the kiosk's rules (DESIGN-BRIEF.md "Who looks at
// what"); the browser checker measures the same things on the running page, and the screen lab
// (design/lab, `--only kiosk`) shoots every door state.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse, type Rule } from "../../styles/cssRules";

const kiosk = parse(readFileSync(new URL("./kiosk.css", import.meta.url), "utf8"));

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

// Every declaration in the file, inside @media and @supports too, with the rule's selectors.
const decls = kiosk.flatMap((r) => r.decls.map(([k, v]) => ({ selectors: r.selectors.join(", "), prop: k, value: v })));

describe("door iPad (#/checkin/kiosk at 820 x 1180 portrait)", () => {
  it("'Start check-in' stays on one line: the button is absolutely placed, so it shrinks to half its box", () => {
    expect(value(kiosk, ".kiosk__start", "white-space")).toBe("nowrap");
  });

  it("the door panel is one column on a portrait screen, so the camera takes the full width", () => {
    const portrait = kiosk.filter(
      (r) => r.selectors.includes(".kiosk__result") && r.at.some((a) => /@media[^{]*orientation:\s*portrait/.test(a)),
    );
    expect(portrait.flatMap((r) => r.decls)).toContainEqual(["grid-template-columns", "1fr"]);
  });

  it("DS-KIOSK the scanner is exactly the iPad's height, so the camera window's row takes what the bar, the band and the strip leave and the page never scrolls", () => {
    // A min-height alone leaves the panel's height indefinite, and the window's minmax(0, 1fr) row
    // then shrinks to its content, which is nothing: the camera would vanish.
    expect(kiosk.some((r) => r.selectors.includes(".kiosk.door") && !r.at.length && r.decls.some(([k, v]) => k === "height" && v === "100dvh"))).toBe(true);
    const rows = value(kiosk, ".kiosk__result", "grid-template-rows") ?? "";
    expect(rows).toMatch(/^minmax\(var\(--k-door\), auto\) minmax\(0, 1fr\)$/);
  });

  it("DS-KIOSK kiosk.css draws no corner and no shadow: the kit's door parts own them, and the bar keeps its rung (the round 7 'box-shadow: none' on .k-bar)", () => {
    expect(decls.filter((d) => /radius/.test(d.prop) || d.prop === "box-shadow")).toEqual([]);
  });

  it("DS-KIOSK older door iPads: no blur, filter, animation or transition loop in kiosk.css", () => {
    expect(decls.filter((d) => /^(-webkit-)?(backdrop-)?filter$|^animation|^transition/.test(d.prop))).toEqual([]);
  });

  it("DS-KIOSK every text size kiosk.css sets is 16 px or more on the iPad, phones' smallest included", () => {
    const sizes = decls.filter((d) => d.prop === "font-size");
    expect(sizes.length).toBeGreaterThan(10);
    const tooSmall = sizes.filter(({ value: v }) => {
      const unit = [...v.matchAll(/calc\((\d+(?:\.\d+)?) \* var\(--k-u\)\)/g)].map((m) => Number(m[1]));
      const floor = /^clamp\((\d+)px,/.exec(v);
      const px = /^(\d+(?:\.\d+)?)px$/.exec(v);
      return unit.some((n) => n < 16) || (floor !== null && Number(floor[1]) < 16) || (px !== null && Number(px[1]) < 16);
    });
    expect(tooSmall).toEqual([]);
  });
});
