// @vitest-environment node
// #/host Points (Boards.tsx), rendered to HTML with made-up query results (no backend).
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { getFunctionName, type FunctionReference } from "convex/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PointsTab } from "./Boards";

const results: Record<string, unknown> = {};
vi.mock("convex/react", () => ({
  useQuery: (ref: FunctionReference<"query">) => results[getFunctionName(ref)],
  useMutation: () => async () => null,
  useConvex: () => ({ query: async () => [] }),
}));
vi.mock("../../blocks/deck", () => ({ CHANNEL: "gdg" }));

const RED = { team: 0, color: "red", label: "Red" };
const BLUE = { team: 1, color: "blue", label: "Blue" };
const YELLOW = { team: 2, color: "yellow", label: "Yellow" };
const team = (info: typeof RED, o: Record<string, number>) => ({ ...info, members: 3, correct: 3, changes: 0, points: 3, perStudent: 1, rank: 1, ec: 4, ...o });
const student = (n: number, info: typeof RED | null, points: number, o: Record<string, number> = {}) => ({
  checkin: `checkin${n}`,
  name: `Sample student ${n}`,
  email: `student${n}@example.edu`,
  team: info,
  right: points,
  answered: 2,
  changes: 0,
  points,
  ec: 0,
  ...o,
});

beforeEach(() => {
  for (const k of Object.keys(results)) delete results[k];
  Object.assign(results, {
    "live/groups:status": { size: 4, locked: true, locksAt: null },
    "live/groups:leaderboard": {
      questions: 2,
      teams: [
        team(RED, {}),
        team(BLUE, { changes: 1, points: 4, correct: 3, perStudent: 4 / 3 }),
        team(YELLOW, { members: 1, correct: 0, points: 0, perStudent: 0, rank: 3, ec: 0 }),
        team({ team: 3, color: "green", label: "Green" }, { members: 0, correct: 0, points: 0, perStudent: 0, rank: 4, ec: 0 }),
      ],
    },
    "live/groups:roster": [student(1, RED, 2, { ec: 4 / 3 }), student(2, BLUE, 2), student(3, YELLOW, 1), student(4, null, 0)],
    "live/groups:pointLog": [
      { id: "points2", at: Date.UTC(2026, 10, 5, 21, 40), delta: -1, reason: "Deduction", team: BLUE, name: null },
      { id: "points1", at: Date.UTC(2026, 10, 5, 21, 35), delta: 2, reason: "Good question", team: RED, name: "Sample student 1" },
    ],
  });
});

// The markup with React's text separators taken out, so "+1.3" reads as one string.
const tab = () => renderToStaticMarkup(createElement(PointsTab)).replace(/<!-- -->/g, "");
// The text of every element with this class.
const texts = (html: string, cls: string) =>
  [...html.matchAll(new RegExp(`<[a-z]+ class="[^"]*\\b${cls}\\b[^"]*"[^>]*>(.*?)</`, "g"))].map((m) => m[1].replace(/<[^>]+>/g, ""));

describe("#/host Points", () => {
  it("rt-2 F28 the professor sets team size here ('Teams of 3' / 'Teams of 4') and gives +1 or -1 to each team and each student; End day and the CSV are here; 'Mix the teams' and -5 are gone", () => {
    const html = tab();
    expect(html).toContain("Teams of 3");
    expect(html).toContain("Teams of 4");
    expect(html).toContain('aria-label="Give Red 1 point"');
    expect(html).toContain('aria-label="Take 1 point off Blue"');
    expect(html).toContain('aria-label="Give Sample student 4 1 point"');
    expect(html).toContain('aria-label="Take 1 point off Sample student 1"');
    expect(html).toContain(">End day<");
    expect(html).toContain("Download extra credit (CSV)");
    expect(html).not.toContain("Mix the teams");
    expect(html).not.toMatch(/[-−]5</);
  });

  it("host-frontend-23 equal totals share a place and say 'tied', for teams and for students", () => {
    const html = tab();
    expect(texts(html, "badge")).toEqual(["1st, tied", "1st, tied", "3rd"]);
    const places = [...html.matchAll(/<tr><td>(.*?)<\/td><td>(.*?)<\/td>/g)].map((m) => [m[2], m[1]]);
    expect(places).toEqual([
      ["Sample student 1", "1st, tied"],
      ["Sample student 2", "1st, tied"],
      ["Sample student 3", "3rd"],
      ["Sample student 4", "4th"],
    ]);
  });

  it("host-backend-13 '1 student' in the singular, team labels from describe(), extra credit to one decimal, and a team nobody is on left off", () => {
    const lines = texts(tab(), "points-team__line");
    expect(lines).toEqual([
      "3 students · 3 right · 1.0 per student · +4 extra credit",
      "3 students · 4 points (3 right, +1) · 1.3 per student · +4 extra credit",
      "1 student · 0 right · 0.0 per student · +0 extra credit",
    ]);
    const html = tab();
    expect(html).not.toContain("Green");
    expect(html).toContain("<td>1.3</td>"); // student 1's saved extra credit
    expect(html).toContain('<span class="muted">No team</span>');
  });

  it("F28.4 Point changes lists each change with who, why and Undo, newest first", () => {
    const html = tab();
    expect(texts(html, "points-log__delta")).toEqual(["−1", "+2"]);
    expect(html).toContain("Good question");
    expect(html).toContain('aria-label="Undo −1 for Blue"');
    expect(html).toContain('aria-label="Undo +2 for Sample student 1"');
  });

  it("shows loading lines, then empty lines, never a blank card", () => {
    for (const k of Object.keys(results)) delete results[k];
    const loading = tab();
    for (const line of ["Loading the teams…", "Loading the students…", "Loading the point changes…"]) expect(loading).toContain(line);
    Object.assign(results, {
      "live/groups:status": { size: 4, locked: false, locksAt: null },
      "live/groups:leaderboard": { questions: 0, teams: [] },
      "live/groups:roster": [],
      "live/groups:pointLog": [],
    });
    const empty = tab();
    for (const line of [
      "No teams yet. Each student joins a team when they check in.",
      "No students checked in to this class yet.",
      "No point changes in this class yet.",
      "Teams lock 5 minutes after the first check-in.",
    ])
      expect(empty).toContain(line);
  });
});
