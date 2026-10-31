// @vitest-environment node
// questions.css loads on every route (one bundled stylesheet), so its class names must not match
// another page's. The professor's quiz form on #/checkin/quiz is <form className="ask"> with
// .ask__q and .ask__choice (src/teams/checkin/Quiz.tsx); a rule here for .ask would turn that form
// into a grid. The #/live post form uses live-ask classes instead.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "../../styles/cssRules";

const css = parse(readFileSync(new URL("./questions.css", import.meta.url), "utf8"));
const tsx = readFileSync(new URL("./Questions.tsx", import.meta.url), "utf8");

describe("#/live questions.css", () => {
  it("UC-risk-1 no rule targets the quiz form's .ask classes", () => {
    const hits = css.flatMap((r) => r.selectors).filter((s) => /\.ask(?![\w-])|\.ask__/.test(s));
    expect(hits).toEqual([]);
  });

  it("UC-risk-1 the post form and its parts use live-ask classes that questions.css styles", () => {
    expect(tsx).not.toMatch(/className="ask(?:__[\w-]+)?"/);
    const selectors = css.flatMap((r) => r.selectors);
    for (const cls of ["live-ask", "live-ask__foot", "live-ask__count"]) {
      expect(tsx).toContain(`className="${cls}"`);
      expect(selectors).toContain(`.${cls}`);
    }
  });
});
