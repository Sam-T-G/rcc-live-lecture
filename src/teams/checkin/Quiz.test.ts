// @vitest-environment node
// #/checkin/quiz after the professor ends a quiz. The server is swapped for fixed answers, so the
// test checks only what the page draws.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { getFunctionName } from "convex/server";
import { describe, expect, it, vi } from "vitest";
import { Professor } from "./Quiz";

const answers: Record<string, unknown> = {
  "checkin/quiz:current": { id: "p1", kind: "quiz", question: "What does a capacitor store?", choices: ["Charge", "Current"], open: false },
  "checkin/quiz:stats": { answered: 1, checkedIn: 12, counts: [1, 0], correct: 0, rightPct: 100, medianSec: 225 },
  "checkin/quiz:history": [],
};

vi.mock("convex/react", () => ({
  useQuery: (ref: Parameters<typeof getFunctionName>[0]) => answers[getFunctionName(ref)],
  useMutation: () => async () => null,
}));
vi.mock("./prof", () => ({
  StaffGate: ({ children }: { children: unknown }) => children,
}));

describe("#/checkin/quiz, ended quiz", () => {
  it("shows answered, right and median time as three Stats in one row, with no Big number above 'Ask another'", () => {
    const html = renderToStaticMarkup(createElement(Professor));
    const stats = html.slice(html.indexOf('class="quiz__stats"'), html.indexOf("Ask another"));
    expect(stats).not.toContain("big__value");
    expect(stats.match(/class="stat__value"/g)).toHaveLength(3);
    expect(stats).toContain('<span class="stat__value">1 / 12</span><span class="stat__label">answered</span>');
    expect(stats).toContain('<span class="stat__value">100%</span><span class="stat__label">got it right</span>');
    expect(stats).toContain('<span class="stat__value">225 s</span><span class="stat__label">median time to answer</span>');
  });
});
