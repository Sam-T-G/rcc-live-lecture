// @vitest-environment node
// #/host Points (Boards.tsx), rendered to HTML with made-up query results (no backend).
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { getFunctionName, type FunctionReference } from "convex/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PointsTab } from "./Boards";

const results: Record<string, unknown> = {};
// What the page's controls do when pressed, and every mutation they send: [function, args].
const { handlers, calls } = vi.hoisted(() => ({
  handlers: {} as Record<string, (value?: unknown) => unknown>,
  calls: [] as [string, unknown][],
}));
vi.mock("convex/react", () => ({
  useQuery: (ref: FunctionReference<"query">) => results[getFunctionName(ref)],
  useMutation: (ref: FunctionReference<"mutation">) => async (args: unknown) => {
    calls.push([getFunctionName(ref), args]);
    return "Class ended.";
  },
  useConvex: () => ({ query: async () => [] }),
}));
vi.mock("../../blocks/deck", () => ({ CHANNEL: "gdg" }));
// The real kit parts, each keeping its handler: a Button under its aria-label (or its words), a
// Segmented under its label, a ConfirmButton under "confirm" and its confirm words.
vi.mock("../../blocks/kit", async (importOriginal) => {
  const kit = await importOriginal<typeof import("../../blocks/kit")>();
  const { createElement } = await import("react");
  return {
    ...kit,
    Button: (p: Parameters<typeof kit.Button>[0]) => {
      handlers[String(p["aria-label"] ?? p.children)] = p.onClick as () => unknown;
      return createElement(kit.Button, p);
    },
    Segmented: (p: Parameters<typeof kit.Segmented<string>>[0]) => {
      handlers[String(p.label)] = p.onChange as (value?: unknown) => unknown;
      return createElement(kit.Segmented<string>, p);
    },
    ConfirmButton: (p: Parameters<typeof kit.ConfirmButton>[0]) => {
      handlers[`confirm ${String(p.confirm)}`] = p.onConfirm;
      return createElement(kit.ConfirmButton, p);
    },
  };
});

const RED = { team: 0, color: "red", label: "Red" };
const BLUE = { team: 1, color: "blue", label: "Blue" };
const YELLOW = { team: 2, color: "yellow", label: "Yellow" };
const team = (info: typeof RED, o: Record<string, number>) => ({ ...info, members: 3, correct: 3, changes: 0, points: 3, perStudent: 1, rank: 1, ec: 4, ...o });
const student = (n: number, info: typeof RED | null, points: number, o: Record<string, number> = {}) => ({
  checkin: `checkin${n}`,
  name: `Sample student ${n}`,
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
  for (const k of Object.keys(handlers)) delete handlers[k];
  calls.length = 0;
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
  it("rt-2 F28 the professor sets team size here ('Teams of 3' / 'Teams of 4') and gives +1 or -1 to each team and each student; End class and the CSV are here; 'Mix the teams' and -5 are gone", () => {
    const html = tab();
    expect(html).toContain("Teams of 3");
    expect(html).toContain("Teams of 4");
    expect(html).toContain('aria-label="Give Red 1 point"');
    expect(html).toContain('aria-label="Take 1 point off Blue"');
    expect(html).toContain('aria-label="Give Sample student 4 1 point"');
    expect(html).toContain('aria-label="Take 1 point off Sample student 1"');
    expect(html).toContain(">End class<");
    expect(html).toContain("Download extra credit (CSV)");
    expect(html).not.toContain("Mix the teams");
    expect(html).not.toMatch(/[-−]5</);
  });

  it("UB-risk-4 F28 each control sends its change: +1 and −1 per team and per student, the team size, Undo and End class", async () => {
    tab();
    // Presses a control the way a click would, then lets its change go out.
    const press = async (name: string, value?: unknown) => {
      expect(Object.keys(handlers)).toContain(name);
      calls.length = 0;
      await handlers[name](value);
      await new Promise((r) => setTimeout(r, 0));
      return calls.slice();
    };
    const adjust = (args: object) => [["live/groups:adjust", { channel: "gdg", ...args }]];
    expect(await press("Give Red 1 point")).toEqual(adjust({ team: 0, delta: 1 }));
    expect(await press("Take 1 point off Red")).toEqual(adjust({ team: 0, delta: -1 }));
    expect(await press("Give Blue 1 point")).toEqual(adjust({ team: 1, delta: 1 }));
    expect(await press("Take 1 point off Blue")).toEqual(adjust({ team: 1, delta: -1 }));
    expect(await press("Give Sample student 4 1 point")).toEqual(adjust({ checkin: "checkin4", delta: 1 }));
    expect(await press("Take 1 point off Sample student 1")).toEqual(adjust({ checkin: "checkin1", delta: -1 }));
    expect(await press("Team size", "3")).toEqual([["live/groups:setSize", { channel: "gdg", size: 3 }]]);
    expect(await press("Team size", "4")).toEqual([["live/groups:setSize", { channel: "gdg", size: 4 }]]);
    expect(await press("Undo −1 for Blue")).toEqual([["live/groups:removePoints", { id: "points2" }]]);
    expect(await press("Undo +2 for Sample student 1")).toEqual([["live/groups:removePoints", { id: "points1" }]]);
    expect(await press("confirm End class")).toEqual([["live/groups:endDay", { channel: "gdg" }]]);
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

  it("sweep2-host-11 with no class running, Students and Point changes say so and what starts one, not 'in this class'", () => {
    const NONE = "No class is running. A class starts when you ask a quiz or vote, scan a pass or change slides.";
    const ended = { lecture: "k1", open: false, startedAt: 0, startsAt: null, graceMin: 5, endedAt: 1, count: 3 };
    Object.assign(results, {
      "live/groups:leaderboard": { questions: 0, teams: [] },
      "live/groups:roster": [],
      "live/groups:pointLog": [],
      "checkin/attendance:lectures": [ended],
    });
    const html = tab();
    expect(texts(html, "status--empty").filter((t) => t === NONE)).toHaveLength(2);
    expect(html).not.toContain("in this class yet.");
    results["checkin/attendance:lectures"] = [{ ...ended, lecture: "k2", open: true, endedAt: null }, ended];
    const open = tab();
    expect(open).toContain("No students checked in to this class yet.");
    expect(open).toContain("No point changes in this class yet.");
    expect(open).not.toContain(NONE);
  });
});
