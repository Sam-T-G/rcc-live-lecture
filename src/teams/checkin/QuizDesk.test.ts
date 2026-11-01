// @vitest-environment node
// #/checkin/quiz (QuizDesk.tsx): the professor's ended quiz and vote results (Results, the kit's
// ruled bar chart on the card) and the page's staff bar. The server is swapped for fixed answers
// by function name, and StaffGate for a marker that shows the props it got.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { getFunctionName } from "convex/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Professor } from "./QuizDesk";

const answers: Record<string, unknown> = {};
vi.mock("convex/react", () => ({
  useQuery: (ref: Parameters<typeof getFunctionName>[0], args: unknown) => (typeof args === "object" ? answers[getFunctionName(ref)] : undefined),
  useMutation: () => async () => null,
}));
vi.mock("./prof", async () => {
  const { createElement, Fragment } = await import("react");
  return {
    StaffGate: ({ title, bar, children }: { title: string; bar?: boolean; children: unknown }) =>
      createElement(Fragment, null, `[gate ${title}${bar ? " bar" : ""}]`, children as never),
  };
});

const poll = (kind: "quiz" | "vote") => ({ id: "p1", kind, question: "What does a capacitor store?", choices: ["Charge", "Current"], open: false });

beforeEach(() => {
  for (const k of Object.keys(answers)) delete answers[k];
  answers["checkin/quiz:history"] = [];
});

const page = () => renderToStaticMarkup(createElement(Professor)).replace(/<!-- -->/g, "");
// The results' rows: [class, letter, count, percent, whether it says "right answer"].
const rows = (html: string) => {
  const list = html.slice(html.indexOf('<ul class="ruled rbars qd-bars">'), html.indexOf("</ul>", html.indexOf("qd-bars")));
  return [...list.matchAll(/<li class="([^"]*)"><span class="letter">(\w)<\/span>(.*?)<\/li>/g)].map(([, cls, letter, rest]) => ({
    cls,
    letter,
    n: /<span class="rbar__n"><span>(\d+)<\/span>/.exec(rest)?.[1],
    pct: /<span class="rbar__pct">([^<]*)<\/span>/.exec(rest)?.[1],
    right: rest.includes("right answer"),
  }));
};

describe("DS-STAFF-risk-1 #/checkin/quiz opens under the staff bar", () => {
  it("DS-STAFF-risk-1 Professor passes `bar` to StaffGate, so the page has its title and who is signed in", () => {
    answers["checkin/quiz:current"] = null;
    expect(page().startsWith("[gate Live quiz bar]")).toBe(true);
  });
});

describe("DS-STAFF-risk-2 the ended quiz's and vote's results on the lectern laptop", () => {
  it("DS-STAFF-risk-2 an ended quiz marks only its right answer (choice A), with each choice's count and share of everyone who answered", () => {
    answers["checkin/quiz:current"] = poll("quiz");
    answers["checkin/quiz:stats"] = { answered: 4, checkedIn: 12, counts: [3, 1], correct: 0, rightPct: 75, medianSec: 20 };
    const r = rows(page());
    expect(r).toHaveLength(2);
    expect(r[0]).toEqual({ cls: "ruled__row is-right", letter: "A", n: "3", pct: "75%", right: true });
    expect(r[1]).toEqual({ cls: "ruled__row", letter: "B", n: "1", pct: "25%", right: false });
  });

  it("DS-STAFF-risk-2 the right answer is the one the stats name, even when fewer picked it (choice B)", () => {
    answers["checkin/quiz:current"] = poll("quiz");
    answers["checkin/quiz:stats"] = { answered: 4, checkedIn: 12, counts: [3, 1], correct: 1, rightPct: 25, medianSec: 20 };
    const r = rows(page());
    expect(r.map((x) => [x.letter, x.cls, x.right])).toEqual([
      ["A", "ruled__row", false],
      ["B", "ruled__row is-right", true],
    ]);
  });

  it("DS-STAFF-risk-2 an ended vote marks its top pick as the lead, and no choice says 'right answer'", () => {
    answers["checkin/quiz:current"] = poll("vote");
    answers["checkin/quiz:stats"] = { answered: 5, checkedIn: 12, counts: [1, 4], correct: null, rightPct: null, medianSec: null };
    const r = rows(page());
    expect(r.map((x) => [x.letter, x.cls, x.n, x.pct, x.right])).toEqual([
      ["A", "ruled__row", "1", "20%", false],
      ["B", "ruled__row is-lead", "4", "80%", false],
    ]);
  });

  it("DS-STAFF-risk-2 an ended vote nobody answered shows 0 and 0% on every choice and no lead", () => {
    answers["checkin/quiz:current"] = poll("vote");
    answers["checkin/quiz:stats"] = { answered: 0, checkedIn: 12, counts: [0, 0], correct: null, rightPct: null, medianSec: null };
    expect(rows(page()).map((x) => [x.cls, x.n, x.pct])).toEqual([
      ["ruled__row", "0", "0%"],
      ["ruled__row", "0", "0%"],
    ]);
  });
});
