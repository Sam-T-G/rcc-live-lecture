// @vitest-environment node
// The door iPad (#/checkin/kiosk at 820 x 1180 portrait), checked in its stylesheet (kiosk.css).
// Moved from src/styles/surfaces.test.ts with the kiosk's rules (DESIGN-BRIEF.md "Who looks at
// what"); the browser checker measures the same things on the running page.
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

describe("door iPad (#/checkin/kiosk at 820 x 1180 portrait)", () => {
  it("'Start check-in' stays on one line: the button is absolutely placed, so it shrinks to half its box", () => {
    expect(value(kiosk, ".kiosk__start", "white-space")).toBe("nowrap");
  });

  it("the kiosk is one column on a portrait screen, so the camera takes the full width", () => {
    const portrait = kiosk.filter(
      (r) => r.selectors.includes(".kiosk") && r.at.some((a) => /@media[^{]*orientation:\s*portrait/.test(a)),
    );
    expect(portrait.flatMap((r) => r.decls)).toContainEqual(["grid-template-columns", "1fr"]);
  });
});
