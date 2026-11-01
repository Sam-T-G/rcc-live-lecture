// @vitest-environment node
// The door iPad (#/checkin/kiosk at 820 x 1180 portrait), checked in its stylesheet (kiosk.css).
// Moved from src/styles/surfaces.test.ts with the kiosk's rules (DESIGN-BRIEF.md "Who looks at
// what"); the browser checker measures the same things on the running page, and the screen lab
// (design/lab, `--only kiosk`) shoots every door state.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse, type Rule } from "../../styles/cssRules";

const kiosk = parse(readFileSync(new URL("./kiosk.css", import.meta.url), "utf8"));
const tokens = parse(readFileSync(new URL("../../styles/tokens.css", import.meta.url), "utf8"));

// The kiosk tokens (--k-*) as tokens.css sets them outside any @media: --k-u is 1px on the iPad.
const kTokens = new Map<string, string>();
for (const r of tokens) {
  if (r.at.some((a) => a.startsWith("@media"))) continue;
  for (const [k, v] of r.decls) if (k.startsWith("--k-")) kTokens.set(k, v);
}

// A font-size in px at a window `vw` px wide, or null when it can't be worked out: only px, vw,
// var(--k-*) tokens, calc, min, max and clamp resolve. em, rem, %, keywords and any other var()
// give null, so the 16 px test fails on them instead of letting them through.
function px(size: string, vw: number): number | null {
  let v = size;
  for (let i = 0; i < 10 && /var\(/.test(v); i++)
    v = v.replace(/var\((--[\w-]+)\)/g, (_, name: string) => (kTokens.has(name) ? `(${kTokens.get(name)})` : "UNKNOWN"));
  v = v
    .replace(/(\d*\.?\d+)px\b/g, "$1")
    .replace(/(\d*\.?\d+)vw\b/g, (_, n: string) => `(${n} * ${vw} / 100)`)
    .replace(/\bcalc\(/g, "(")
    .replace(/\bmin\(/g, "M(")
    .replace(/\bmax\(/g, "X(")
    .replace(/\bclamp\(/g, "C(");
  if (!/^[\d.\s+\-*/(),MXC]+$/.test(v)) return null;
  const C = (lo: number, mid: number, hi: number) => Math.max(lo, Math.min(mid, hi));
  const out: unknown = new Function("M", "X", "C", `return (${v});`)(Math.min, Math.max, C);
  return typeof out === "number" && Number.isFinite(out) ? out : null;
}

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
    // The reader itself: a size it can't work out comes back null, which counts as too small.
    expect([".5em", "0.75rem", "smaller", "var(--nope)", "50%"].map((v) => px(v, 320))).toEqual([null, null, null, null, null]);
    expect(px("calc(20 * var(--k-u))", 320)).toBe(20);
    expect(px("clamp(28px, 7.5vw, calc(56 * var(--k-u)))", 320)).toBe(28);
    const sizes = decls.filter((d) => d.prop === "font-size");
    expect(sizes.length).toBeGreaterThan(10);
    // At a 320 phone (the smallest), the iPad in portrait and in landscape.
    const tooSmall = sizes
      .map((d) => ({ ...d, px: [320, 820, 1180].map((w) => px(d.value, w)) }))
      .filter((d) => d.px.some((n) => n === null || n < 16));
    expect(tooSmall).toEqual([]);
  });

  it("DS-KIOSK-risk-2 a scanned student's name wraps and shows in full, never cut to one line with an ellipsis", () => {
    const name = decls.filter((d) => d.selectors.split(", ").includes(".kiosk__name"));
    expect(
      name.filter((d) => (d.prop === "white-space" && d.value === "nowrap") || d.prop === "text-overflow" || (d.prop === "overflow" && d.value === "hidden")),
    ).toEqual([]);
    // index.css sets break-word on the page; the name's grid cell can shrink below its longest word.
    expect(value(kiosk, ".kiosk__name", "overflow-wrap")).toBe("anywhere");
  });

  it("DS-KIOSK-risk-4 the scanner's bar keeps its rung in light: it paints above the panel (also white), so the panel doesn't cover the bar's shadow", () => {
    // The bar and the panel are flex items of .door; with no position the later panel paints over
    // the bar's outer shadow.
    expect(value(kiosk, ".kiosk__bar", "position")).toBe("relative");
    expect(Number(value(kiosk, ".kiosk__bar", "z-index"))).toBeGreaterThan(0);
  });
});
