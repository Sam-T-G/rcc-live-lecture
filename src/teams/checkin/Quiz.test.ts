// @vitest-environment node
// #/checkin/quiz and the student's quiz card, rendered to HTML. The server is swapped for fixed
// answers, so the tests check only what the page draws.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { getFunctionName } from "convex/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Professor, QuizCard } from "./Quiz";

const answers: Record<string, unknown> = {};
const who = vi.hoisted(() => ({ user: null as null | { name: string; email: string } }));

vi.mock("convex/react", () => ({
  useQuery: (ref: Parameters<typeof getFunctionName>[0], args: unknown) => (typeof args === "object" ? answers[getFunctionName(ref)] : undefined),
  useMutation: () => async () => null,
}));
vi.mock("./prof", () => ({
  StaffGate: ({ children }: { children: unknown }) => children,
}));
vi.mock("../../blocks/auth", () => ({ useGoogleUser: () => ({ user: who.user }) }));

const ended = { id: "p1", kind: "quiz", question: "What does a capacitor store?", choices: ["Charge", "Current"], open: false };
const open = (kind: "quiz" | "vote") => ({
  id: "p2",
  kind,
  question: "Which law gives V = IR?",
  choices: ["Ohm", "Coulomb", "Faraday"],
  open: true,
  answered: 0,
  results: null,
});

beforeEach(() => {
  for (const k of Object.keys(answers)) delete answers[k];
  who.user = null;
});

const page = () => renderToStaticMarkup(createElement(Professor)).replace(/<!-- -->/g, "");
const card = () => renderToStaticMarkup(createElement(QuizCard)).replace(/<!-- -->/g, "");
const CHECK_IN_LINK = /<a href="#\/checkin\/student"[^>]*>Check in<\/a>/;

describe("#/checkin/quiz, ended quiz", () => {
  it("shows answered, right and median time as three Stats in one row, with no Big number above 'Ask another'", () => {
    Object.assign(answers, {
      "checkin/quiz:current": ended,
      "checkin/quiz:stats": { answered: 1, checkedIn: 12, counts: [1, 0], correct: 0, rightPct: 100, medianSec: 225 },
      "checkin/quiz:history": [],
    });
    const html = page();
    const stats = html.slice(html.indexOf('class="quiz__stats"'), html.indexOf("Ask another"));
    expect(stats).not.toContain("big__value");
    expect(stats.match(/class="stat__value"/g)).toHaveLength(3);
    expect(stats).toContain('<span class="stat__value">1 / 12</span><span class="stat__label">answered</span>');
    expect(stats).toContain('<span class="stat__value">100%</span><span class="stat__label">got it right</span>');
    expect(stats).toContain('<span class="stat__value">225 s</span><span class="stat__label">median time to answer</span>');
  });
});

describe("#/checkin/quiz, 'This class'", () => {
  it("F41.1 QUI-fixcheck-1 says 'Loading…' while the list loads, and 'No quiz or vote yet.' only once it's empty", () => {
    answers["checkin/quiz:current"] = null;
    const loading = page();
    const side = (html: string) => html.slice(html.indexOf("<h2>This class</h2>"));
    expect(side(loading)).toContain('<p class="status status--loading" role="status">Loading…</p>');
    expect(side(loading)).not.toContain("No quiz or vote yet.");
    answers["checkin/quiz:history"] = [];
    expect(side(page())).toContain('<p class="status status--empty" role="status">No quiz or vote yet.</p>');
    expect(side(page())).not.toMatch(/question/i);
  });
});

describe("the quiz card on #/live never says 'question' (that word is for students' posts)", () => {
  // The poll's own text is left out: a professor may type the word in it.
  const words = (html: string) => html.replace("Which law gives V = IR?", "").replace("What does a capacitor store?", "");

  it("QUI-fixcheck-1 an open quiz is titled 'Quiz now' ('Vote now' on a vote), and an answered quiz says it waits for the professor to end the quiz", () => {
    who.user = { name: "Ada Lovelace", email: "ada@example.edu" };
    Object.assign(answers, { "checkin/quiz:current": open("quiz"), "checkin/quiz:mine": null, "checkin/read:me": true });
    let html = card();
    expect(html).toContain(">Quiz now<");
    expect(words(html)).not.toMatch(/question/i);

    answers["checkin/quiz:mine"] = 0;
    html = card();
    expect(html).toContain("Answer sent. Results show when the professor ends the quiz.");
    expect(words(html)).not.toMatch(/question/i);

    answers["checkin/quiz:current"] = open("vote");
    html = card();
    expect(html).toContain(">Vote now<");
    expect(words(html)).not.toMatch(/question/i);

    answers["checkin/quiz:current"] = { ...ended, results: { counts: [1, 0], correct: 0 } };
    expect(words(card())).not.toMatch(/question/i);
  });
});

describe("the quiz card before check-in (#/live)", () => {
  it("F21.2 checkin-frontend-19 signed out: the question and its choices, 'Sign in and check in to answer.' and a link to #/checkin/student, and no answer buttons", () => {
    Object.assign(answers, { "checkin/quiz:current": open("quiz"), "checkin/quiz:mine": null, "checkin/read:me": false });
    const html = card();
    expect(html).toContain("Which law gives V = IR?");
    expect(html).toContain("<b>C</b> Faraday");
    expect(html).toContain("<p>Sign in and check in to answer.</p>");
    expect(html).toMatch(CHECK_IN_LINK);
    expect(html).not.toContain("<button");
  });

  it("F21.2 checkin-frontend-19 signed in but not checked in: 'Check in to answer.' ('Check in to vote.' on a vote) and the link, no buttons; checked in: one button per choice and no line", () => {
    who.user = { name: "Ada Lovelace", email: "ada@example.edu" };
    Object.assign(answers, { "checkin/quiz:current": open("quiz"), "checkin/quiz:mine": null, "checkin/read:me": false });
    let html = card();
    expect(html).toContain("<p>Check in to answer.</p>");
    expect(html).toMatch(CHECK_IN_LINK);
    expect(html).not.toContain("<button");

    answers["checkin/quiz:current"] = open("vote");
    html = card();
    expect(html).toContain("<p>Check in to vote.</p>");
    expect(html).not.toContain("<button");

    answers["checkin/read:me"] = true;
    html = card();
    expect(html.match(/<button/g)).toHaveLength(3);
    expect(html).toContain("<b>C</b> Faraday</button>");
    expect(html).not.toContain("Check in to");
    expect(html).not.toMatch(CHECK_IN_LINK);
  });

  it("F21.2 checkin-frontend-19 while the check-in status loads, the question and choices show with no buttons and no check-in line", () => {
    who.user = { name: "Ada Lovelace", email: "ada@example.edu" };
    Object.assign(answers, { "checkin/quiz:current": open("quiz"), "checkin/quiz:mine": null });
    const html = card();
    expect(html).toContain("<b>A</b> Ohm");
    expect(html).not.toContain("<button");
    expect(html).not.toContain("Check in to");
  });
});
