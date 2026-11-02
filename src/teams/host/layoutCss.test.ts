// @vitest-environment node
// IT1-HOST round-1 design fixes, checked on the stylesheets.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "../../styles/cssRules";

const read = (f: string) => readFileSync(new URL(f, import.meta.url), "utf8");

describe("Questions row actions (qa.css)", () => {
  // IT1-HOST-design-1: hiding the actions at rest left a blank 32px band on every question and
  // hid Keep, Type answer, Dismiss and Delete until a hover. They stay visible, as before.
  it("IT1-HOST-design-1 never hides a row's actions at rest", () => {
    const hidden = parse(read("./qa.css")).filter(
      (r) =>
        r.selectors.some((s) => s.includes(".qa-q__actions")) &&
        r.decls.some(([p, v]) => (p === "opacity" && v === "0") || (p === "visibility" && v === "hidden")),
    );
    expect(hidden).toEqual([]);
  });
});

describe("host aside (host.css)", () => {
  // IT1-HOST-design-2: a max-height plus overflow-y made the aside its own scroll box, so at
  // 1280x800 the Ask the AI note landed below its fold and a page scroll never reached it.
  it("IT1-HOST-design-2 keeps the sticky aside out of its own scroll box", () => {
    const side = parse(read("./host.css")).filter((r) => r.selectors.some((s) => /\.host-side$/.test(s)));
    expect(side.some((r) => r.decls.some(([p, v]) => p === "position" && v === "sticky"))).toBe(true);
    const boxed = side.flatMap((r) => r.decls).filter(([p]) => ["max-height", "overflow", "overflow-y"].includes(p));
    expect(boxed).toEqual([]);
  });
});
