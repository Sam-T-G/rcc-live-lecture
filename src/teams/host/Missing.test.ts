// @vitest-environment node
// The Now tab's "Who got it wrong" card (Missing.tsx), rendered to HTML. checkin.quiz.missing and
// checkin.quiz.current are swapped for fixed answers, so these check only what the card draws.
// People are samples (@example.edu).
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { getFunctionName } from "convex/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const answers = vi.hoisted(() => ({}) as Record<string, unknown>);
vi.mock("convex/react", () => ({
  useQuery: (ref: Parameters<typeof getFunctionName>[0], args: unknown) => (typeof args === "object" ? answers[getFunctionName(ref)] : undefined),
  useAction: () => async () => "",
}));

const { Missing } = await import("./Missing");

const card = () =>
  renderToStaticMarkup(createElement(Missing))
    .replace(/<!-- -->/g, "")
    .replace(/&quot;/g, '"');
const words = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

const quiz = (wrong: { name: string; team: null | { team: number; color: string; label: string }; picked: string }[]) => ({
  kind: "quiz",
  poll: "p1",
  question: "What does a capacitor store?",
  choices: ["Charge", "Current"],
  correct: 0,
  open: false,
  answered: 3,
  counts: [3 - wrong.length, wrong.length],
  byTeam: [],
  wrong,
});

beforeEach(() => {
  for (const k of Object.keys(answers)) delete answers[k];
  answers["checkin/quiz:current"] = null;
});

describe("sweep1-tests-5 F27 the 'Who got it wrong' card", () => {
  it("says 'Loading the answers...' while the query loads", () => {
    expect(words(card())).toContain("Loading the answers...");
  });

  it("with no quiz that has a right answer, says so", () => {
    answers["checkin/quiz:missing"] = null;
    expect(words(card())).toContain("No quiz with a right answer yet.");
    expect(card()).not.toContain("<table");
  });

  it("a vote says it has no right answer", () => {
    answers["checkin/quiz:missing"] = { kind: "vote", poll: "p2", question: "What should we cover next?" };
    expect(words(card())).toContain("“What should we cover next?” is a vote, so it has no right answer.");
    expect(card()).not.toContain("<table");
  });

  it("F27.1 a quiz nobody got wrong says 'Nobody got it wrong yet.' and shows no table", () => {
    answers["checkin/quiz:missing"] = quiz([]);
    const html = card();
    expect(words(html)).toContain("3 answered. Right answer: Charge.");
    expect(html).toContain('<p class="status status--empty" role="status">Nobody got it wrong yet.</p>');
    expect(html).not.toContain("<table");
  });

  it("a quiz with wrong answers lists each name, team and pick, and no empty line", () => {
    answers["checkin/quiz:missing"] = quiz([
      { name: "Sample student 1", team: { team: 1, color: "#1a73e8", label: "Blue" }, picked: "Current" },
      { name: "Sample student 2", team: null, picked: "Current" },
    ]);
    const html = card();
    expect(words(html)).toContain("3 answered, 2 wrong. Right answer: Charge.");
    expect(html).not.toContain("Nobody got it wrong yet.");
    const rows = [...html.matchAll(/<tr>(.*?)<\/tr>/g)].map((m) => words(m[1]));
    expect(rows).toEqual(["Name Team Picked", "Sample student 1 Blue Current", "Sample student 2 No team Current"]);
  });
});
