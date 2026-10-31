// @vitest-environment node
// #/live and #/live/leaderboard, rendered to HTML with made-up query results (no backend).
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { getFunctionName, type FunctionReference } from "convex/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import LivePage from "./Page";
import { Leaderboard } from "./Leaderboard";

const results: Record<string, unknown> = {};
vi.mock("convex/react", () => ({
  useQuery: (ref: FunctionReference<"query">) => results[getFunctionName(ref)],
  useMutation: () => async () => null,
}));
vi.mock("../../blocks/auth", () => ({ useGoogleUser: () => ({ user: null }) }));
vi.mock("../../blocks/deck", () => ({ CHANNEL: "gdg", useDeckSlide: () => null }));
vi.mock("../checkin/Quiz", () => ({ QuizCard: () => "[quiz card]" }));
vi.mock("./PastQuestions", () => ({ default: () => "[past questions]" }));
vi.mock("./Questions", () => ({ default: () => "[questions]" }));

const team = (n: number) => ({ team: n, color: "green", label: `Team ${n}`, members: 3, correct: 6 - n, rank: n, ec: 0 });

beforeEach(() => {
  for (const k of Object.keys(results)) delete results[k];
  Object.assign(results, {
    "checkin/pass:amHost": true, // a professor is signed in on the projector laptop
    "live/groups:status": { size: 3, locked: true, locksAt: null },
    "live/groups:leaderboard": { questions: 2, teams: [1, 2, 3, 4, 5].map(team) },
    "live/groups:mine": null,
    "deck:slides": [],
  });
});

function open(hash: string) {
  vi.stubGlobal("location", { hash });
  return renderToStaticMarkup(createElement(LivePage));
}

describe("#/live/leaderboard, the room's board", () => {
  it("renders on the light projector stage, not in the phone screen", () => {
    const html = open("#/live/leaderboard");
    expect(html).toMatch(/^<main class="projector" data-theme="light">/);
    expect(html).not.toContain('class="page');
  });

  it("never shows the professor's 'Teams of 3 / Teams of 4' buttons to the room", () => {
    const html = open("#/live/leaderboard");
    expect(html).not.toContain("Teams of 3");
    expect(html).not.toContain("Teams of 4");
  });

  it("lists every team, since nobody can open a fold on the projector", () => {
    const html = renderToStaticMarkup(createElement(Leaderboard, { big: true }));
    expect(html).not.toContain("<details");
    for (const n of [1, 2, 3, 4, 5]) expect(html).toContain(`Team ${n}`);
  });

  const big = () => renderToStaticMarkup(createElement(Leaderboard, { big: true }));
  const rows = (html: string) => [...html.matchAll(/<span class="board__name">(.*?)<\/span>/g)].map((m) => m[1].split("<!-- -->").join(""));
  const teams = (n: number) => Array.from({ length: n }, (_, i) => team(i + 1));

  it("up to six teams keep the two-line rows (DESIGN-fixcheck-2)", () => {
    expect(big()).toMatch(/<ol class="board board--big">/);
  });

  it("seven to ten teams all show, in one-line rows so they fit 1080 tall (DESIGN-fixcheck-2)", () => {
    for (const n of [7, 8, 10]) {
      results["live/groups:leaderboard"] = { questions: 2, teams: teams(n) };
      const html = big();
      expect(html, `${n} teams`).toMatch(/<ol class="board board--big board--many">/);
      expect(rows(html)).toHaveLength(n);
      expect(html).not.toContain("board__more");
    }
  });

  it("past ten teams it lists ten and says how many more (DESIGN-fixcheck-2)", () => {
    results["live/groups:leaderboard"] = { questions: 2, teams: teams(12) };
    const html = big();
    expect(rows(html)).toEqual(teams(10).map((g) => g.label));
    expect(html).toContain("Plus 2 more teams. Your phone shows your team’s place.");
  });

  it("past ten teams, the viewer's own lower team takes the tenth row", () => {
    results["live/groups:leaderboard"] = { questions: 2, teams: teams(13) };
    results["live/groups:mine"] = { team: 12, color: "green", label: "Team 12" };
    const html = big();
    expect(rows(html)).toEqual([...teams(9).map((g) => g.label), "Team 12 (you)"]);
    expect(html).toContain("Plus 3 more teams.");
  });

  it("the phone card still gives the professor the team-size buttons", () => {
    expect(renderToStaticMarkup(createElement(Leaderboard))).toContain("Teams of 3");
  });
});

describe("#/live, the student phone", () => {
  it("stacks the side cards in a column with a gap (live.css .live__side)", () => {
    const html = open("#/live");
    expect(html).toMatch(/<div class="live__side">\[quiz card\]/);
  });
});
