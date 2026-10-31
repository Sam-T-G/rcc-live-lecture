// @vitest-environment node
// #/checkin/stage, rendered to HTML with made-up query results (no backend).
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { getFunctionName, type FunctionReference } from "convex/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Stage from "./Stage";

const results: Record<string, unknown> = {};
vi.mock("convex/react", () => ({
  useQuery: (ref: FunctionReference<"query">) => results[getFunctionName(ref)],
}));

const OPEN = { question: "Which route shows the board?", choices: ["A", "B"], open: true, answered: 1 };

beforeEach(() => {
  for (const k of Object.keys(results)) delete results[k];
  Object.assign(results, { "checkin/read:count": 12, "checkin/quiz:current": OPEN });
  vi.stubGlobal("location", { hash: "#/checkin/stage", href: "http://x/#/checkin/stage", origin: "http://x", pathname: "/" });
});

describe("#/checkin/stage", () => {
  it("the check-in card is light whatever the laptop's theme, like the deck under it", () => {
    const html = renderToStaticMarkup(createElement(Stage));
    expect(html).toMatch(/<aside class="stage__card" data-theme="light">/);
  });

  it("each ended choice's words are in .stage__label, which stops at 2 lines (DCHK-1)", () => {
    results["checkin/quiz:current"] = {
      question: "Which of these four things does the card show to the room?",
      choices: ["The QR code", "Bars", "The right answer", "Names"],
      open: false,
      answered: 1,
      results: { counts: [0, 1, 0, 0], correct: 1 },
    };
    const html = renderToStaticMarkup(createElement(Stage));
    expect(html.match(/<span class="stage__label">[A-D] [^<]+<\/span><b>\d+<\/b>/g)).toHaveLength(4);
  });
});
