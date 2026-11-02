// @vitest-environment node
// TK-COPY-risk-1: under 360 wide the quiz tile's state word (Sending with its clock, or the check
// and Sent; Quiz.tsx) drops to 15px with a 16px glyph, as comp phone-quiz-sending draws it. At
// 17px with the 18px clock it took 89px of a 320 phone's tile, and "render" in "Once, after the
// first render" split over two lines (the lab, WebKit, reduced motion).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "../../styles/cssRules";

const rules = parse(readFileSync(new URL("./quiz.css", import.meta.url), "utf8"));
const at = (sel: string, prop: string) =>
  rules
    .filter((r) => r.selectors.includes(sel) && r.at.some((a) => /max-width:\s*359px/.test(a)))
    .flatMap((r) => r.decls.filter(([k]) => k === prop).map(([, v]) => v))
    .at(-1);

describe("TK-COPY-risk-1 the quiz tile's state word at 320 wide", () => {
  it("TK-COPY-risk-1 under 360 the word is 15px and its glyph 16px (comp phone-quiz-sending)", () => {
    expect(at(".qfield .choice__state", "font-size")).toBe("var(--t-small)");
    expect(at(".qfield .choice__state .icon", "width")).toBe("16px");
    expect(at(".qfield .choice__state .icon", "height")).toBe("16px");
  });

  it("TK-COPY-risk-1 Quiz.tsx loads quiz.css, so #/live and #/checkin/student both get it", () => {
    expect(readFileSync(new URL("./Quiz.tsx", import.meta.url), "utf8")).toMatch(/^import "\.\/quiz\.css";$/m);
  });
});
