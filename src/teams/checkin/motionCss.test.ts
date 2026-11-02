// @vitest-environment node
// MOTION.md on the phone (answer-sent, checked-in): the moments in checkin.css move only cheap
// properties (transform, opacity, color, background-color), never loop, and keep every animation,
// delay included, under 700ms. The browser check is the lab scenario phone-pass-checks-in.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./checkin.css", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const ALLOWED = new Set(["transform", "opacity", "color", "background-color"]);
const TOKENS: Record<string, number> = { "--fx-fast": 90, "--fx": 140, "--fx-slow": 220, "--sp-fast": 200 };

// Each @keyframes block's name and the properties its frames set.
function keyframes() {
  const out: { name: string; props: string[] }[] = [];
  for (const m of css.matchAll(/@keyframes\s+([\w-]+)\s*\{((?:[^{}]*\{[^{}]*\})*)\s*\}/g)) {
    const props = [...m[2].matchAll(/([\w-]+)\s*:/g)].map((p) => p[1]);
    out.push({ name: m[1], props });
  }
  return out;
}

// ms of a time value: 300ms, var(--fx-slow), calc(2 * var(--fx-fast)).
function ms(v: string): number {
  const n = /^(\d+)ms$/.exec(v);
  if (n) return Number(n[1]);
  const t = /^var\((--[\w-]+)\)$/.exec(v);
  if (t) return TOKENS[t[1]];
  const k = /^calc\((\d+) \* var\((--[\w-]+)\)\)$/.exec(v);
  if (k) return Number(k[1]) * TOKENS[k[2]];
  const s = /^calc\(var\((--[\w-]+)\) \+ var\((--[\w-]+)\)\)$/.exec(v);
  if (s) return TOKENS[s[1]] + TOKENS[s[2]];
  throw new Error(`unknown time ${v}`);
}

describe("the phone's moments in checkin.css (MOTION.md)", () => {
  const frames = keyframes().filter((k) => /^(ci-|ph-late)/.test(k.name));

  it("defines the checked-in and sending keyframes", () => {
    expect(frames.map((k) => k.name).sort()).toEqual(["ci-fill", "ci-flip", "ci-in", "ci-ink", "ci-out", "ci-rise", "ci-surf", "ph-late"]);
  });

  it("animates only transform, opacity, color and background-color", () => {
    for (const k of frames) for (const p of k.props) expect(ALLOWED.has(p), `${k.name} sets ${p}`).toBe(true);
  });

  it("never loops, and each animation with its delay ends by 700ms", () => {
    expect(css).not.toMatch(/infinite/);
    const uses = [...css.matchAll(/animation:\s*([^;}]+)/g)].flatMap((m) => m[1].split(/,(?![^(]*\))/).map((s) => s.trim()));
    const ours = uses.filter((u) => /^(ci-|ph-late)/.test(u));
    expect(ours.length).toBeGreaterThan(0);
    for (const u of ours) {
      // Times only: the easings (var(--ease…)) are left out.
      const times = u.match(/calc\([^)]*\)\)|var\(--(?:fx|sp)[\w-]*\)|\b\d+ms\b/g) ?? [];
      const total = times.map(ms).reduce((a, b) => a + b, 0);
      expect(total, u).toBeLessThanOrEqual(700);
    }
  });
});
