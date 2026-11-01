// @vitest-environment node
// Past quizzes and votes on #/live (PastQuestions.tsx), rendered to HTML with made-up rows from live.past
// (no backend).
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PastQuestions from "./PastQuestions";

const past = vi.hoisted(() => ({ rows: undefined as unknown, user: null as unknown }));
vi.mock("convex/react", () => ({ useQuery: () => past.rows }));
vi.mock("../../blocks/auth", () => ({ useGoogleUser: () => ({ user: past.user }) }));

beforeEach(() => {
  past.user = { name: "Sample student 1", email: "student1@example.edu" };
});

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

// The line under each question, top to bottom: "Quiz 2 · You got it wrong".
const verdicts = (page: string) => [...page.matchAll(/<span class="past__verdict muted">([^<]*)<\/span>/g)].map((m) => m[1]);

describe("Past quizzes and votes on #/live", () => {
  it("F23.3 live-backend-12 live-frontend-10 rt-12 a quiz with no right answer says 'You picked B', never right or wrong; the other verdicts stay", () => {
    const page = html([
      row(5, { correct: null, mine: 1 }),
      row(4, { correct: null, mine: null }),
      row(3, { kind: "vote", correct: null, mine: 2 }),
      row(2, { correct: 0, mine: 1 }),
      row(1, { correct: 0, mine: 0 }),
    ]);
    expect(verdicts(page)).toEqual([
      "Quiz 4 · You picked B",
      "Quiz 3 · No answer",
      "Vote 1 · You picked C",
      "Quiz 2 · You got it wrong",
      "Quiz 1 · You got it right",
    ]);
    // The quiz with no right answer marks no choice right; the student's pick still shows.
    const first = page.slice(page.indexOf("Question text 5"), page.indexOf("Question text 4"));
    expect(first).not.toContain("right answer");
    expect(first).toContain("Current (your pick)");
  });

  it("F23.1 F23.4 QUI-risk-1 the card says 'quizzes and votes' while it loads, when it's empty and with rows, never 'question'", () => {
    for (const rows of [undefined, [], [row(2, { kind: "vote", correct: null, mine: null }), row(1, { mine: 0 })]]) {
      const page = html(rows);
      expect(page.startsWith('<section class="panel"><h2>Past quizzes and votes</h2>')).toBe(true);
      // "Question" names a student's post on the Questions card beside this one.
      expect(page.replace(/Question text \d/g, "")).not.toMatch(/question/i);
    }
    expect(html(undefined)).toContain("Loading past quizzes and votes…");
    expect(html([])).toContain("No quiz or vote has ended yet.");
    expect(verdicts(html([row(2, { kind: "vote", correct: null, mine: null }), row(1, { mine: 0 })]))).toEqual([
      "Vote 1 · No answer",
      "Quiz 1 · You got it right",
    ]);
  });

  it("sweep2-live-4 signed out (the sign-in ran out, or Sign out), the card says to sign in to see your answers and never says 'No answer'", () => {
    past.user = null;
    // live.past sends mine: null to a signed-out reader, even for a quiz this student answered.
    const page = html([row(2, { kind: "vote", correct: null, mine: null }), row(1, { mine: null })]);
    expect(verdicts(page)).toEqual(["Vote 1", "Quiz 1"]);
    expect(page).toContain('<p class="muted">Sign in to see your answers.</p>');
    expect(page).not.toContain("No answer");
    expect(page).not.toContain("your pick");
    // The right answer still shows: it's the same for everyone.
    expect(page).toContain("✓ right answer");
    // No rows: nothing to sign in for.
    expect(html([])).not.toContain("Sign in to see your answers.");
  });
});
