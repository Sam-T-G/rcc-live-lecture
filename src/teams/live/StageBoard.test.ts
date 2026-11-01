// @vitest-environment node
// The projector's team board (StageBoard.tsx) when teams share 1st place, rendered to HTML with
// made-up query results (no backend). Teams with the same points per student share a rank
// (convex/live/groups.ts), and before any quiz with a right answer ends every team is 1st with +0.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { getFunctionName, type FunctionReference } from "convex/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StageBoard } from "./StageBoard";

const results: Record<string, unknown> = {};
vi.mock("convex/react", () => ({
  useQuery: (ref: FunctionReference<"query">) => results[getFunctionName(ref)],
  useMutation: () => async () => null,
}));
vi.mock("../../blocks/auth", () => ({ useGoogleUser: () => ({ user: null }) }));
vi.mock("../../blocks/deck", () => ({ CHANNEL: "gdg" }));

const NAMES = ["Red", "Blue", "Yellow", "Green", "Orange", "Purple", "Pink"];
const team = (i: number, o: { rank: number; ec?: number; correct?: number }) => ({
  team: i,
  color: NAMES[i].toLowerCase(),
  label: NAMES[i],
  members: 3,
  correct: o.correct ?? 0,
  changes: 0,
  points: o.correct ?? 0,
  perStudent: (o.correct ?? 0) / 3,
  rank: o.rank,
  ec: o.ec ?? 0,
});

function show(questions: number, ranks: number[], ec: number[] = []) {
  results["live/groups:leaderboard"] = { questions, teams: ranks.map((rank, i) => team(i, { rank, ec: ec[i], correct: 9 - rank })) };
}

const html = () => renderToStaticMarkup(createElement(StageBoard)).replace(/<!-- -->/g, "");
// The team names in the 1st place block, and in the ledger's rows in order.
const first = (h: string) => [...h.matchAll(/<div class="first">[\s\S]*?board__name">([^<]*)</g)].map((m) => m[1]);
const ledger = (h: string) => [...h.matchAll(/<li class="pledger__row">[\s\S]*?board__name">([^<]*)</g)].map((m) => m[1]);

beforeEach(() => {
  for (const k of Object.keys(results)) delete results[k];
  results["live/groups:status"] = { size: 4, locked: true, locksAt: null };
  results["live/groups:mine"] = null;
});

describe("the projector board when teams share 1st place", () => {
  it("one team alone in 1st gets the 1st place block and the rest are the ledger", () => {
    show(3, [1, 2, 3, 4], [5, 3, 1, 0]);
    const h = html();
    expect(first(h)).toEqual(["Red"]);
    expect(ledger(h)).toEqual(["Blue", "Yellow", "Green"]);
  });

  it("before any quiz ends every team is 1st with +0: no team gets the block, and the ledger lists all four", () => {
    show(0, [1, 1, 1, 1]);
    const h = html();
    expect(h).not.toContain('class="first"');
    expect(ledger(h)).toEqual(["Red", "Blue", "Yellow", "Green"]);
  });

  it("a 2-way tie for 1st lists both teams in the ledger at place 1, neither in the block", () => {
    show(3, [1, 1, 3, 4], [4, 4, 1, 0]);
    const h = html();
    expect(first(h)).toEqual([]);
    expect(ledger(h)).toEqual(["Red", "Blue", "Yellow", "Green"]);
    expect([...h.matchAll(/pledger__place n">(\d+)</g)].map((m) => m[1])).toEqual(["1", "1", "3", "4"]);
  });

  it("past six teams, a tie for 1st marks the ledger .board--tied (no lone green 1st row), and one team alone in 1st doesn't", () => {
    show(0, [1, 1, 1, 1, 1, 1, 1]);
    expect(html()).toMatch(/<ol class="board board--big board--many board--tied">/);
    show(3, [1, 2, 3, 4, 5, 6, 7]);
    expect(html()).toMatch(/<ol class="board board--big board--many">/);
  });
});
