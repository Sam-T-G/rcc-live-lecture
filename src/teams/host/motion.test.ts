// @vitest-environment node
// IT1-HOST motion: the lost-tap mark's clock (Page.tsx) and the question-ended trigger
// (AskRoom.tsx), as MOTION.md's host rows give them, and the CSS rules that play them: effects
// only, nothing that loops, nothing over 700ms.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ENDING_MS, justEnded } from "./AskRoom";
import { HOLD_GLANCE, HOLD_GLANCE_MAX, NO_GLANCE, glanceClear, glanceTap } from "./Page";

describe("lost-tap mark", () => {
  it("holds 8s from a tap, plus the 90ms fade-in", () => {
    const tap = glanceTap(NO_GLANCE, 1000);
    expect(tap).toEqual({ g: { first: 1000, restUntil: 0 }, clearAt: 1000 + 90 + HOLD_GLANCE, capped: false });
  });

  it("a tap during the hold pushes the clear out, never past 15s from the first tap", () => {
    const one = glanceTap(NO_GLANCE, 0)!;
    const two = glanceTap(one.g, 5000)!;
    expect(two.clearAt).toBe(5000 + 90 + HOLD_GLANCE);
    expect(two.capped).toBe(false);
    const three = glanceTap(two.g, 12000)!;
    expect(three.clearAt).toBe(HOLD_GLANCE_MAX);
    expect(three.capped).toBe(true);
  });

  it("after a capped clear, taps in the next 8s change only the number", () => {
    const rest = glanceClear(true, HOLD_GLANCE_MAX);
    expect(glanceTap(rest, HOLD_GLANCE_MAX + 4000)).toBeNull();
    expect(glanceTap(rest, HOLD_GLANCE_MAX + HOLD_GLANCE)).not.toBeNull();
  });

  it("an uncapped clear leaves no rest", () => {
    expect(glanceClear(false, 9000)).toEqual(NO_GLANCE);
  });
});

describe("question-ended trigger", () => {
  const open = { id: "p1", open: true };
  const ended = { id: "p1", open: false };
  it("plays only when the same question goes from open to ended", () => {
    expect(justEnded(open, ended)).toBe(true);
    expect(justEnded(null, ended)).toBe(false);
    expect(justEnded(ended, ended)).toBe(false);
    expect(justEnded(open, { id: "p2", open: false })).toBe(false);
    expect(justEnded(ended, { id: "p1", open: true })).toBe(false);
    expect(justEnded(open, null)).toBe(false);
  });

  it("keeps the card's class no longer than the 700ms budget", () => {
    expect(ENDING_MS).toBeLessThanOrEqual(700);
  });
});

describe("motion CSS", () => {
  const css = (f: string) => readFileSync(new URL(f, import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const sheets = ["host.css", "ask.css", "lost.css", "qa.css", "points.css"].map(css).join("\n");

  it("nothing loops", () => {
    expect(sheets).not.toMatch(/infinite/);
  });

  it("transitions and keyframes move only opacity, transform, color or background-color", () => {
    const props = [...sheets.matchAll(/transition:\s*([^;}]+)/g)].flatMap((m) => m[1].split(",").map((p) => p.trim().split(/\s+/)[0]));
    expect(props.filter((p) => !["opacity", "transform", "color", "background-color", "border-color", "none"].includes(p))).toEqual([]);
    const frames = [...sheets.matchAll(/@keyframes [\w-]+ \{([\s\S]*?)\}\s*\}/g)].map((m) => m[1]);
    for (const f of frames) for (const p of f.matchAll(/([\w-]+):/g)) expect(["opacity", "transform"]).toContain(p[1]);
  });

  it("the lost-tap tint fades in on --fx-fast and out on --fx-slow", () => {
    const lost = css("lost.css");
    expect(lost).toMatch(/\.track__n::before \{[^}]*opacity: 0; transition: opacity var\(--fx-slow\)/);
    expect(lost).toMatch(/\.track__n\.is-marked::before \{ opacity: 1; transition-duration: var\(--fx-fast\); \}/);
  });
});
