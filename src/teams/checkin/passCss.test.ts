// @vitest-environment node
// DS-PHONE-design-5: the pass's QR (and the "Making your pass…" / "Getting a new code…" square in
// its place) sits on the pass card's center axis, 280 wide (256 at 320). The browser check, in
// the screen lab at 390 x 844 and 320 x 693 on phone-pass-qr and phone-pass-making: the center of
// .pass__qr is within 1px of the center of .pass, and .pass__qr stays inside .pass.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "../../styles/cssRules";

const rules = parse(readFileSync(new URL("./checkin.css", import.meta.url), "utf8")).filter((r) => r.at.length === 0);
const last = (selector: string, prop: string) =>
  rules.filter((r) => r.selectors.includes(selector)).flatMap((r) => r.decls.filter(([k]) => k === prop).map(([, v]) => v)).at(-1);

describe("the pass's QR (DS-PHONE-design-5)", () => {
  it("centers the QR square in the pass card's one column", () => {
    expect(last(".ph .pass", "grid-template-columns")).toBe("minmax(0, 1fr)");
    expect(last(".pass__qr", "justify-self")).toBe("center");
  });

  it("keeps it 280 wide and lets it shrink to the card at 320", () => {
    expect(last(".pass__qr", "width")).toBe("280px");
    expect(last(".pass__qr", "max-width")).toBe("100%");
  });
});
