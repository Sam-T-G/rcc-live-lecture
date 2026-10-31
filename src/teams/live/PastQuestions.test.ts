// @vitest-environment node
// Past quizzes on #/live (PastQuestions.tsx), rendered to HTML with made-up rows from live.past
// (no backend).
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import PastQuestions from "./PastQuestions";

const past = vi.hoisted(() => ({ rows: undefined as unknown }));
vi.mock("convex/react", () => ({ useQuery: () => past.rows }));

type Row = {
  id: string;
  kind: "quiz" | "vote";
  question: string;
  choices: string[];
  correct: number | null;
  counts: number[];
  mine: number | null;
  at: number;
};
const row = (n: number, r: Partial<Row>): Row => ({
  id: "p" + n,
  kind: "quiz",
  question: "Question text " + n,
  choices: ["Charge", "Current", "Voltage"],
  correct: 0,
  counts: [3, 1, 0],
  mine: null,
  at: n,
  ...r,
});

function html(rows: Row[] | undefined) {
  past.rows = rows;
  return renderToStaticMarkup(createElement(PastQuestions)).replace(/<!-- -->/g, "");
}

// The line under each question, top to bottom: "Question 2 · You got it wrong".
const verdicts = (page: string) => [...page.matchAll(/<span class="past__verdict muted">([^<]*)<\/span>/g)].map((m) => m[1]);

describe("Past quizzes on #/live", () => {
  it("F23.3 live-backend-12 live-frontend-10 rt-12 a quiz with no right answer says 'You picked B', never right or wrong; the other verdicts stay", () => {
    const page = html([
      row(5, { correct: null, mine: 1 }),
      row(4, { correct: null, mine: null }),
      row(3, { kind: "vote", correct: null, mine: 2 }),
      row(2, { correct: 0, mine: 1 }),
      row(1, { correct: 0, mine: 0 }),
    ]);
    expect(verdicts(page)).toEqual([
      "Question 5 · You picked B",
      "Question 4 · No answer",
      "Question 3 · Vote",
      "Question 2 · You got it wrong",
      "Question 1 · You got it right",
    ]);
    // The quiz with no right answer marks no choice right; the student's pick still shows.
    const first = page.slice(page.indexOf("Question text 5"), page.indexOf("Question text 4"));
    expect(first).not.toContain("right answer");
    expect(first).toContain("Current (your pick)");
  });

  it("F23.1 F23.4 the card is titled 'Past quizzes' while it loads, when it's empty and with rows", () => {
    for (const rows of [undefined, [], [row(1, { mine: 0 })]]) {
      const page = html(rows);
      expect(page.startsWith('<section class="panel"><h2>Past quizzes</h2>')).toBe(true);
      expect(page).not.toContain("Past questions");
    }
    expect(html(undefined)).toContain("Loading past questions…");
    expect(html([])).toContain("No questions have ended yet.");
  });
});
