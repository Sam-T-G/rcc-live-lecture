// @vitest-environment node
// sweep2-host-9: host.css styles only parts a page renders, and its header points at the file the
// colors come from. A rule for a class nothing renders does nothing when someone restyles it.
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const SRC = new URL("../../", import.meta.url);
const CSS = readFileSync(new URL("teams/host/host.css", SRC), "utf8");
// Every .ts and .tsx file under src/ that isn't a test, joined.
const CODE = readdirSync(SRC, { recursive: true, encoding: "utf8" })
  .filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f))
  .map((f) => readFileSync(new URL(f, SRC), "utf8"))
  .join("\n");

describe("host.css", () => {
  it("every class it styles is in a src file's code", () => {
    const classes = [...new Set([...CSS.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/\.(-?[a-z_][\w-]*)/gi)].map((m) => m[1]))];
    const unused = classes.filter((c) => !new RegExp(`(^|[^\\w-])${c}([^\\w-]|$)`).test(CODE));
    expect(unused).toEqual([]);
  });

  // StaffGate (prof.tsx) opens with its own "Signed in as" strip, a page--wide block right before
  // the host page. The host bar carries those words, so the strip is hidden only there.
  it("DS-HOST-design-2 hides StaffGate's whoami strip right before .host-root, and only there", () => {
    const body = CSS.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(body).toMatch(/(^|\n)\.page--wide:has\(\+ \.host-root\) \{ display: none; \}/);
  });

  // e2e-host-tabs-narrow: at 900px the bar squeezed the tablist (overflow-x: auto lets it shrink)
  // and the Questions tab's centre landed on the header. The tablist keeps its width, and under
  // 1180 the bar's whoami gives way to StaffGate's strip so "Not you? Sign out" stays reachable.
  it("e2e-host-tabs-narrow keeps the bar's tabs at full width and moves whoami to the strip under 1180", () => {
    const body = CSS.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(body).toMatch(/(^|\n)\.host-bar > \.tabs__list \{ flex: none; \}/);
    const narrow = body.slice(body.indexOf("@media (max-width: 1180px)"));
    expect(narrow).toMatch(/^@media \(max-width: 1180px\) \{\s*\.host-bar > \.whoami \{ display: none; \}\s*\.page--wide:has\(\+ \.host-root\) \{ display: revert-layer; \}\s*\}/);
  });

  it("its header names src/styles/tokens.css as where the colors come from", () => {
    expect(CSS.slice(0, CSS.indexOf("*/"))).toContain("src/styles/tokens.css");
  });
});
