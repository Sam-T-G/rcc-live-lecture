// @vitest-environment node
// #/admin's columns (admin.css), read with src/styles/cssRules.ts and checked at the widths a
// laptop page meets. The People table's fixed columns (Role, Added, Remove: 408px) leave Email and
// Added by no room in a two-column page under 1024 wide (a 400 aside and 48 margins), so the page
// stays one column there and the table scrolls inside its own box (.table-scroll).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse, type Rule } from "../styles/cssRules";

const RULES = parse(readFileSync(new URL("./admin.css", import.meta.url), "utf8"));
const holds = (r: Rule, w: number) =>
  r.at.every((a) => {
    if (!a.startsWith("@media")) return true;
    const min = /min-width:\s*(\d+)px/.exec(a);
    const max = /max-width:\s*(\d+)px/.exec(a);
    return (!min || w >= Number(min[1])) && (!max || w <= Number(max[1]));
  });
const value = (selector: string, prop: string, w: number) =>
  RULES.filter((r) => holds(r, w) && r.selectors.some((s) => s.trim() === selector))
    .flatMap((r) => r.decls.filter(([p]) => p === prop).map(([, v]) => v))
    .at(-1);

describe("DS-STAFF-risk-5 #/admin is one column under 1024 wide", () => {
  it("DS-STAFF-risk-5 from 901 to 1023 wide: one column, the professor's columns not placed, and People scrolls in its own box", () => {
    for (const w of [901, 920, 960, 1023]) {
      expect(value(".desk.admin", "grid-template-columns", w), `${w}`).toBe("minmax(0, 1fr)");
      expect(value(".admin--prof > .admin__side", "grid-column", w), `${w}`).toBeUndefined();
      expect(value(".admin-people", "overflow", w), `${w}`).toBeUndefined();
    }
  });

  it("DS-STAFF-risk-5 from 1024 wide: two columns (the kit's .desk), Pair a door iPad beside a professor's list, People's question boxes rise over its rows", () => {
    for (const w of [1024, 1280, 1440]) {
      expect(value(".desk.admin", "grid-template-columns", w), `${w}`).toBeUndefined();
      expect(value(".admin--prof > .admin__side", "grid-column", w), `${w}`).toBe("2");
      expect(value(".admin--prof > .admin__main", "grid-column", w), `${w}`).toBe("1");
      expect(value(".admin-people", "overflow", w), `${w}`).toBe("visible");
    }
  });
});
