// @vitest-environment node
// #/host's Ask the room card (AskRoom.tsx), rendered to HTML with made-up checkin.quiz.current and
// stats results (no backend): each choice's count and % once the question has ended, the right
// answer or the vote's top pick marked, and the line under the form when a question is open.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { getFunctionName, type FunctionReference } from "convex/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AskRoom, { QuestionForm } from "./AskRoom";

const results: Record<string, unknown> = {};
vi.mock("convex/react", () => ({
  useQuery: (ref: FunctionReference<"query">) => results[getFunctionName(ref)],
  useMutation: () => async () => null,
  useAction: () => async () => null,
}));

const poll = (o: Record<string, unknown> = {}) => ({
  id: "p1",
  kind: "vote",
  question: "Pizza or tacos?",
  choices: ["Pizza", "Tacos"],
  open: false,
  answered: 3,
  results: null,
  ...o,
});
const stats = (o: Record<string, unknown> = {}) => ({
  counts: [2, 1],
  answered: 3,
  checkedIn: 3,
  correct: null,
  rightPct: null,
  medianSec: 4,
  index: null,
  aiDraft: false,
  ...o,
});

beforeEach(() => {
  for (const k of Object.keys(results)) delete results[k];
});

const card = () => renderToStaticMarkup(createElement(AskRoom, { slideIndex: null }));
// Each bar as "letter text | number", with the marked bars' class.
const bars = (html: string) =>
  [...html.matchAll(/<li class="([^"]*)">(.*?)<\/li>/g)].map((m) => ({
    marked: m[1].includes("ask-bar--right"),
    text: m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
  }));

describe("#/host Ask the room", () => {
  it("F26.3 an ended vote shows count and % per choice and marks the top pick", () => {
    results["checkin/quiz:current"] = poll();
    results["checkin/quiz:stats"] = stats();
    expect(bars(card())).toEqual([
      { marked: true, text: "A Pizza · top pick 2 · 67%" },
      { marked: false, text: "B Tacos 1 · 33%" },
    ]);
  });

  it("F26.3 an ended vote with a tie marks both top picks; with no answers marks none", () => {
    results["checkin/quiz:current"] = poll();
    results["checkin/quiz:stats"] = stats({ counts: [1, 1], answered: 2 });
    expect(bars(card()).map((b) => b.marked)).toEqual([true, true]);
    results["checkin/quiz:stats"] = stats({ counts: [0, 0], answered: 0, medianSec: null });
    expect(bars(card())).toEqual([
      { marked: false, text: "A Pizza 0 · 0%" },
      { marked: false, text: "B Tacos 0 · 0%" },
    ]);
  });

  it("F26.3 an ended quiz shows count and % per choice and marks only the right answer", () => {
    results["checkin/quiz:current"] = poll({ kind: "quiz", question: "What is 2 + 2?", choices: ["3", "4"] });
    results["checkin/quiz:stats"] = stats({ counts: [3, 1], answered: 4, checkedIn: 4, correct: 1, rightPct: 25 });
    expect(bars(card())).toEqual([
      { marked: false, text: "A 3 3 · 75%" },
      { marked: true, text: "B 4 · right answer 1 · 25%" },
    ]);
  });

  it("F26.3 an ended quiz with no right answer marks its top pick", () => {
    results["checkin/quiz:current"] = poll({ kind: "quiz" });
    results["checkin/quiz:stats"] = stats();
    expect(bars(card()).map((b) => b.marked)).toEqual([true, false]);
  });

  it("F26.3 while the question is open: counts only, nothing marked", () => {
    results["checkin/quiz:current"] = poll({ open: true });
    results["checkin/quiz:stats"] = stats({ medianSec: null });
    expect(bars(card())).toEqual([
      { marked: false, text: "A Pizza 2" },
      { marked: false, text: "B Tacos 1" },
    ]);
  });

  it("sweep2-host-11 with no class running (none yet, or after End class), the card says so and what starts one", () => {
    results["checkin/quiz:current"] = null;
    const NONE = "No class is running. A class starts when you ask a quiz or vote, scan a pass or change slides.";
    const ended = { lecture: "k1", open: false, startedAt: 0, startsAt: null, graceMin: 5, endedAt: 1, count: 3 };
    for (const lectures of [[], [ended]]) {
      results["checkin/attendance:lectures"] = lectures;
      expect(card()).toContain(NONE);
      expect(card()).not.toContain("in this class");
    }
    results["checkin/attendance:lectures"] = [{ ...ended, lecture: "k2", open: true, endedAt: null }, ended];
    expect(card()).toContain("No quiz or vote in this class yet.");
    expect(card()).not.toContain(NONE);
  });

  it("UA-risk-3 the line under the form names the question or vote it opens", () => {
    const form = (kind: "quiz" | "vote") =>
      renderToStaticMarkup(
        createElement(QuestionForm, {
          form: { kind, question: "", choices: ["", "", "", ""], correct: null, index: null, aiDraft: false },
          slide: null,
          pollOpen: true,
          opening: false,
          onChange: () => {},
          onSubmit: () => {},
          onCancel: () => {},
        }),
      );
    expect(form("quiz")).toContain("Asking this quiz ends the quiz or vote that&#x27;s open now.");
    expect(form("vote")).toContain("Starting this vote ends the quiz or vote that&#x27;s open now.");
  });

  // sweep1-host-4: the Questions tab holds the students' questions, so the Now tab calls the
  // professor's poll a quiz or a vote, with #/checkin/quiz's button and count words (F42).
  it("sweep1-host-4 the Now tab says quiz or vote and uses #/checkin/quiz's words", () => {
    expect(card()).toContain("Loading the quiz or vote...");
    results["checkin/quiz:current"] = null;
    expect(card()).toContain("No quiz or vote in this class yet.");

    results["checkin/quiz:current"] = poll({ kind: "quiz", open: true });
    results["checkin/quiz:stats"] = stats({ answered: 1, checkedIn: 12, medianSec: null });
    const html = card();
    expect(html).toContain("1 of 12");
    expect(html).toContain("End the quiz");
    expect(html).not.toMatch(/question/i);

    const form = renderToStaticMarkup(
      createElement(QuestionForm, {
        form: { kind: "quiz", question: "", choices: ["", "", "", ""], correct: null, index: null, aiDraft: false },
        slide: null,
        pollOpen: false,
        opening: false,
        onChange: () => {},
        onSubmit: () => {},
        onCancel: () => {},
      }),
    );
    expect(form).toContain(">Ask the room<");
    expect(form).not.toContain("Open question");
  });
});
