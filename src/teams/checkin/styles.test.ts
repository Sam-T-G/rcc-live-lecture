// @vitest-environment node
// The check-in stylesheets ship in the main CSS bundle (src/pages/index.ts imports the check-in
// pages on every route), and their rules sit outside any @layer, so they beat index.css's
// `@layer base` helpers on every page. A check-in rule may style the design system's helpers
// (docs/design.md "Helpers") or the kit's button classes only under a check-in class, such as
// `.stage .row`, never bare (sweep2-checkin-4: a bare `.row { margin: 12px 0 }` here gave every
// .row in the app 12px margins).
import { readdirSync, readFileSync } from "node:fs";
import { Fragment, createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { parse } from "../../styles/cssRules";
import { ErrorBoundary } from "../../blocks/ui";

const DIR = new URL("./", import.meta.url);
const SHEETS = readdirSync(DIR)
  .filter((f) => f.endsWith(".css"))
  .map((f) => [f, parse(readFileSync(new URL(f, DIR), "utf8"))] as const);

// The design system's helpers and button classes (docs/design.md), and the old team-made
// `.quiet` button class the kit's `.btn--quiet` replaced.
const SHARED = /^(?:[a-z]+)?\.(?:row|stack|muted|error|ledger|sr-only|quiet|btn(?:--[a-z-]+)?)(?![\w-])/;

describe("check-in stylesheets", () => {
  it("finds the check-in stylesheets", () => {
    expect(SHEETS.map(([f]) => f)).toContain("checkin.css");
  });

  it("restyles no design-system helper or kit button class outside a check-in class", () => {
    const bare = SHEETS.flatMap(([f, rules]) =>
      rules.filter((r) => !r.at.some((a) => a.startsWith("@layer"))).flatMap((r) => r.selectors.filter((s) => SHARED.test(s)).map((s) => `${f}: ${s}`)),
    );
    expect(bare).toEqual([]);
  });
});

// sweep2-blocks-2: on #/checkin/stage a part that didn't load shows ErrorBoundary's error line
// and Try again button (ui.tsx). stage.css sizes both for the projector (--proj-ledger), so the
// rule's selector has to match the button the boundary draws today.
describe("#/checkin/stage, a part that didn't load", () => {
  // The boundary's markup in its failed state, from its own render().
  function failedBoundary() {
    const b = new ErrorBoundary({ label: "The late banner" });
    b.state = { failed: true };
    return renderToStaticMarkup(createElement(Fragment, null, b.render()));
  }

  // Whether `selector`, read as ".stage .row > <compound>", matches an element with this tag and
  // these classes sitting in a `.row` in `.stage`. The compound may hold a tag, classes, and
  // `:not(.x)` or `:where(:not(.x))`; anything else counts as no match.
  function matchesRowChild(selector: string, tag: string, classes: string[]) {
    const m = selector.match(/^\.stage \.row > (.+)$/);
    if (!m) return false;
    let rest = m[1];
    const not = [...rest.matchAll(/:(?:where\(:not\(\.([\w-]+)\)\)|not\(\.([\w-]+)\))/g)].map((x) => x[1] ?? x[2]);
    rest = rest.replace(/:(?:where\(:not\(\.[\w-]+\)\)|not\(\.[\w-]+\))/g, "");
    const parts = rest.match(/^([a-z]*)((?:\.[\w-]+)*)$/);
    if (!parts) return false;
    if (parts[1] && parts[1] !== tag) return false;
    const need = parts[2].split(".").filter(Boolean);
    return need.every((c) => classes.includes(c)) && !not.some((c) => classes.includes(c));
  }

  it("Try again is sized at --proj-ledger, like the error line beside it", () => {
    const html = failedBoundary();
    const button = html.match(/<button[^>]*class="([^"]*)"[^>]*>Try again<\/button>/);
    expect(button, html).not.toBeNull();
    const classes = button![1].split(/\s+/);
    const stage = SHEETS.find(([f]) => f === "stage.css")![1];
    const sized = stage.filter((r) => r.decls.some(([k, v]) => k === "font-size" && v === "var(--proj-ledger)"));
    expect(sized.some((r) => r.selectors.some((s) => matchesRowChild(s, "button", classes)))).toBe(true);
    expect(sized.some((r) => r.selectors.some((s) => matchesRowChild(s, "p", ["status", "status--error"])))).toBe(true);
  });
});
