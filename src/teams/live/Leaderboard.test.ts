// @vitest-environment node
// The team leaderboard (Leaderboard.tsx) on the phone card and the projector, rendered to HTML
// with made-up query results (no backend).
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { getFunctionName, type FunctionReference } from "convex/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Leaderboard } from "./Leaderboard";

const results: Record<string, unknown> = {};
vi.mock("convex/react", () => ({
  useQuery: (ref: FunctionReference<"query">) => results[getFunctionName(ref)],
  useMutation: () => async () => null,
}));
vi.mock("../../blocks/auth", () => ({ useGoogleUser: () => ({ user: null }) }));
vi.mock("../../blocks/deck", () => ({ CHANNEL: "gdg" }));

type Team = { team: number; color: string; label: string; members: number; correct: number; changes: number; points: number; perStudent: number; rank: number; ec: number };
const team = (team: number, label: string, o: Partial<Team> = {}): Team => ({
  team,
  color: label.toLowerCase(),
  label,
  members: 3,
  correct: 3,
  changes: 0,
  points: 3,
  perStudent: 1,
  rank: 1,
  ec: 0,
  ...o,
});

beforeEach(() => {
  for (const k of Object.keys(results)) delete results[k];
  Object.assign(results, {
    "live/groups:status": { size: 4, locked: true, locksAt: null },
    "live/groups:mine": null,
    "live/groups:leaderboard": {
      questions: 3,
      teams: [
        team(0, "Red", { members: 4, correct: 6, points: 6, perStudent: 1.5, rank: 1, ec: 5 }),
        team(1, "Blue", { rank: 2, ec: 4 / 3 }),
        team(2, "Yellow", { rank: 2, ec: 4 / 3 }),
        team(3, "Green", { rank: 2, ec: 4 / 3 }),
      ],
    },
  });
});

// The markup with React's text separators taken out, so "+1.3" reads as one string.
const card = () => renderToStaticMarkup(createElement(Leaderboard)).replace(/<!-- -->/g, "");
const big = () => renderToStaticMarkup(createElement(Leaderboard, { big: true })).replace(/<!-- -->/g, "");

describe("the team leaderboard", () => {
  it("rt-2 neither the phone card nor the projector has the team-size buttons, even with a professor signed in", () => {
    results["checkin/pass:amHost"] = true;
    for (const html of [card(), big()]) {
      expect(html).not.toContain("Teams of 3");
      expect(html).not.toContain("Teams of 4");
    }
  });

  it("live-backend-14 a 3-way tie shows its extra credit to one decimal ('+1.3 extra credit'), never the raw fraction", () => {
    const html = big();
    expect(html.match(/\+1\.3 <small>extra credit<\/small>/g)).toHaveLength(3);
    expect(html).toContain("+5 <small>extra credit</small>");
    expect(html).not.toContain("1.333");
    expect(html).not.toContain("EC");
  });

  it("D6 each team shows its right answers and its points per student; the phone adds how many students", () => {
    expect(card()).toContain("6 right · 1.5 per student · 4 students");
    expect(big()).toContain("6 right · 1.5 per student</span>");
    // Once the professor changes a team's points, the line shows its points.
    results["live/groups:leaderboard"] = { questions: 3, teams: [team(0, "Red", { members: 4, correct: 6, changes: 1, points: 7, perStudent: 1.75, ec: 5 })] };
    expect(card()).toContain("7 points · 1.8 per student · 4 students");
  });

  it("live-frontend-24 says 'Teams lock 5 minutes after the first check-in.' with no start time, and how places earn extra credit", () => {
    results["live/groups:status"] = { size: 4, locked: false, locksAt: null };
    const html = card();
    expect(html).toContain("Teams lock 5 minutes after the first check-in.");
    expect(html).toContain("After 3 quizzes. Teams rank by points per student: 1st place gets 5 extra credit, 2nd gets 3, 3rd gets 1.");
  });

  it("F29.3 with no teams in this class it says so instead of an empty board", () => {
    results["live/groups:leaderboard"] = { questions: 0, teams: [] };
    for (const html of [card(), big()]) {
      expect(html).toContain("No teams yet. Each student joins a team when they check in.");
      expect(html).not.toContain("<ol");
    }
  });

  it("a team nobody in this class is on is left off the board", () => {
    results["live/groups:leaderboard"] = { questions: 1, teams: [team(0, "Red", { ec: 5 }), team(1, "Blue", { members: 0, correct: 0, points: 0, perStudent: 0, rank: 2 })] };
    expect(card()).toContain("Red");
    expect(card()).not.toContain("Blue");
  });
});

describe("UB the phone card's top rows", () => {
  it("UB-check-2 the phone card lists every team tied for a place that earns extra credit above the fold, so a 3-way tie for 2nd shows all three", () => {
    results["live/groups:leaderboard"] = {
      questions: 2,
      teams: [
        team(0, "Red", { correct: 5, points: 5, perStudent: 5 / 3, rank: 1, ec: 5 }),
        team(3, "Green", { members: 1, correct: 1, points: 1, perStudent: 1, rank: 2, ec: 4 / 3 }),
        team(4, "Orange", { members: 1, correct: 1, points: 1, perStudent: 1, rank: 2, ec: 4 / 3 }),
        team(5, "Purple", { members: 1, correct: 1, points: 1, perStudent: 1, rank: 2, ec: 4 / 3 }),
        team(1, "Blue", { correct: 0, points: 0, perStudent: 0, rank: 5, ec: 0 }),
        team(2, "Yellow", { correct: 0, points: 0, perStudent: 0, rank: 5, ec: 0 }),
      ],
    };
    const [above, fold] = card().split("<details>");
    for (const n of ["Red", "Green", "Orange", "Purple"]) expect(above).toContain(`board__name">${n}<`);
    expect(fold).toContain("All 6 teams");
    expect(fold).not.toContain(`board__name">Purple<`);
    expect(fold).toContain(`board__name">Blue<`);
  });

  it("UB-check-2 teams tied with no points still stop at 3 rows above the fold", () => {
    const names = ["Red", "Blue", "Yellow", "Green", "Orange"];
    results["live/groups:leaderboard"] = { questions: 0, teams: names.map((n, i) => team(i, n, { correct: 0, points: 0, perStudent: 0, rank: 1, ec: 0 })) };
    const [above, fold] = card().split("<details>");
    expect(above.match(/board__name/g)).toHaveLength(3);
    expect(fold).toContain("All 5 teams");
  });
});

describe("UB-spec-1 the projector shows right answers and points per student with 7 or more teams", () => {
  it("with 7 teams (.board--many) the '6 right · 1.5 per student' line sits in a span no .board--many rule hides", () => {
    const css = ["live.css", "leaderboard.css"].map((f) => readFileSync(new URL("./" + f, import.meta.url), "utf8")).join("\n");
    // Every class a `.board--many .x { display: none }` rule hides on the projector.
    const hidden = [...css.matchAll(/\.board--many\s+\.([\w-]+)\s*\{[^}]*display:\s*none/g)].map((m) => m[1]);
    expect(hidden.length).toBeGreaterThan(0);
    const names = ["Red", "Blue", "Yellow", "Green", "Orange", "Purple", "Pink"];
    results["live/groups:leaderboard"] = {
      questions: 3,
      teams: names.map((n, i) => team(i, n, i === 0 ? { members: 4, correct: 6, points: 6, perStudent: 1.5, ec: 5 } : { rank: 2 })),
    };
    const html = big();
    expect(html).toContain("board--many");
    const span = html.match(/<span class="([^"]*)">6 right · 1\.5 per student<\/span>/);
    expect(span).not.toBeNull();
    for (const cls of span![1].split(/\s+/)) expect(hidden).not.toContain(cls);
    expect(html).not.toContain("4 students");
  });
});
