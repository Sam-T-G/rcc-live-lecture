// @vitest-environment node
// #/checkin/stage, rendered to HTML with made-up query results (no backend).
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { getFunctionName, type FunctionReference } from "convex/server";
import { describe, expect, it, vi } from "vitest";
import Stage from "./Stage";

vi.mock("convex/react", () => ({
  useQuery: (ref: FunctionReference<"query">) =>
    ({
      "checkin/read:count": 12,
      "checkin/quiz:current": { question: "Which route shows the board?", choices: ["A", "B"], open: true, answered: 1 },
    })[getFunctionName(ref)],
}));

describe("#/checkin/stage", () => {
  it("the check-in card is light whatever the laptop's theme, like the deck under it", () => {
    vi.stubGlobal("location", { hash: "#/checkin/stage", href: "http://x/#/checkin/stage", origin: "http://x", pathname: "/" });
    const html = renderToStaticMarkup(createElement(Stage));
    expect(html).toMatch(/<aside class="stage__card" data-theme="light">/);
  });
});
