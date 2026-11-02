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

// IT1-STAFF design loop (round 1 judges): row actions and the role pickers.
describe("IT1-STAFF-4 #/admin row actions and role pickers", () => {
  it("IT1-STAFF-4 Remove and Unpair are --muted at rest and red only on hover or keyboard focus", () => {
    expect(value(".admin__act > .btn--danger", "color", 1440)).toBe("var(--muted)");
    expect(value(".admin__act > .btn--danger:is(:hover, :focus-visible)", "color", 1440)).toBe("var(--error)");
  });

  it("IT1-STAFF-4 the role pickers draw the kit's chevron, not the browser's", () => {
    expect(value(".admin-people td select", "appearance", 1440)).toBe("none");
    expect(value(".admin-people td select", "background", 1440)).toContain("var(--select-chev)");
  });
});

// IT1-STAFF design loop (check pass): admin.css is unlayered, so its role picker drawing beats the
// kit's @layer kit :disabled look; the disabled rule has to give the muted words and no edge back.
describe("IT1-STAFF-risk-2 a role picker that is saving looks disabled", () => {
  it("IT1-STAFF-risk-2 :disabled sets the kit's well fill, --muted words and a transparent border", () => {
    expect(value(".admin-people td select:disabled", "background-color", 1440)).toBe("var(--well)");
    expect(value(".admin-people td select:disabled", "color", 1440)).toBe("var(--muted)");
    expect(value(".admin-people td select:disabled", "border-color", 1440)).toBe("transparent");
  });
});
