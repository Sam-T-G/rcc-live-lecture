// @vitest-environment node
// #/live's layout rules in live.css. These checks read the stylesheet; the browser check
// measures it in the screen lab (design/lab, WebKit and Chromium, 390 x 844 and 320 x 568):
// - DS-PHONE-check-1: on phone-live-results-right, press ← Back. The slide card's title ends
//   above the action bar's top, and the results card sits under the slide card. On
//   phone-live-quiz-open the quiz field is above the slide card until ← Back, then under it.
// - DS-PHONE-check-2 / risk-4: on phone-live-slide, -paged-back, -lost-error (after a tap on
//   I'm lost) and -late-banner, Tab from the top of the page. No focused control outside the
//   action bar overlaps the bar, and elementFromPoint at its center isn't in the bar.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "../../styles/cssRules";

const rules = parse(readFileSync(new URL("./live.css", import.meta.url), "utf8")).filter((r) => r.at.length === 0);
// [selector, value] for every declaration of `prop`, in file order.
const decls = (prop: string) => rules.flatMap((r) => r.decls.filter(([k]) => k === prop).flatMap(([, v]) => r.selectors.map((s) => [s, v] as const)));

describe("#/live: the quiz above the slide card (DS-PHONE-check-1)", () => {
  it("never moves the results card (.qresult) above the slide card", () => {
    expect(decls("order").filter(([s]) => s.includes(".qresult"))).toEqual([]);
    expect(decls("display").filter(([s, v]) => v === "contents" && s.includes(".live__side") && s.includes(".qresult"))).toEqual([]);
  });

  it("moves the open quiz (.qfield) first only while Back to live isn't showing", () => {
    const first = decls("order").filter(([s, v]) => v === "-1" && s.includes(".qfield"));
    const joined = decls("display").filter(([s, v]) => v === "contents" && s.includes(".live__side"));
    expect(first.length).toBeGreaterThan(0);
    expect(joined.length).toBeGreaterThan(0);
    for (const [s] of [...first, ...joined]) expect(s).toMatch(/^\.ph--live:not\(:has\(\.ph-tolive\)\) /);
  });
});

describe("#/live: focus stops above the sticky action bar (DS-PHONE-check-2, risk-4)", () => {
  const padding = decls("scroll-padding-bottom");

  it("the action bar is sticky on the banner stack, so the page's scroll padding has to count it", () => {
    expect(decls("position")).toContainEqual([".ph-actions", "sticky"]);
    expect(decls("bottom")).toContainEqual([".ph-actions", "var(--banner-stack-space, 0px)"]);
  });

  it("pads the page's bottom by the banner stack plus the bar's 56 row and its padding while #/live shows the bar", () => {
    const live = padding.filter(([s]) => /^html:has\(\.ph--live > \.ph-actions/.test(s));
    expect(live).toHaveLength(1);
    const [, v] = live[0];
    expect(v).toContain("var(--banner-stack-space, 0px)");
    expect(v).toContain("56px");
    expect(v).toContain("env(safe-area-inset-bottom, 0px)");
    for (const part of ["--pha-late", "--pha-note", "--pha-err", "--pha-tolive"]) expect(v).toContain(`var(${part}, 0px)`);
  });

  it("adds each other part the bar can hold: late strips, I'm lost's line, its error, Back to live", () => {
    const set = (prop: string) => decls(prop).map(([s]) => s);
    expect(set("--pha-late").some((s) => s.includes(".late__item"))).toBe(true);
    expect(set("--pha-late").some((s) => s.includes(".late__item ~ .late__item"))).toBe(true);
    expect(set("--pha-note")).toContain("html:has(.ph--live > .ph-actions > .lost > p:not(.status))");
    expect(set("--pha-err")).toContain("html:has(.ph--live > .ph-actions > .lost > .status)");
    expect(set("--pha-tolive")).toContain("html:has(.ph--live > .ph-actions > .ph-tolive)");
  });
});
