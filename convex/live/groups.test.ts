// live/groups: teams of 3 or 4 dealt in check-in order, the 5-minute lock, and the leaderboard.
// The leaderboard's ranking and extra credit change in UB (decision D6), so only members, right
// answers and the count of ended quizzes are pinned here.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../_generated/api";
import { at, checkIn, PROF_KEY, profEnv, setup, TYPED_ISSUER, typed, type Caller, type T } from "../test.helpers";
import { teamsFor } from "./groups";

const CH = "gdg";
const T0 = at(2026, 11, 5, 21, 30); // class starts
const MIN = 60_000;
const student = (t: T, n: number) => typed(t, `Sample student ${n}`, `student${n}@example.edu`);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0 - 10 * MIN);
  profEnv();
});
afterEach(() => {
  vi.useRealTimers();
});

// n students checked in a second apart.
async function arrive(t: T, n: number) {
  const out: Caller[] = [];
  for (let i = 1; i <= n; i++) {
    const s = student(t, i);
    await checkIn(t, s);
    out.push(s);
    vi.advanceTimersByTime(1_000);
  }
  return out;
}
const teamOf = async (s: Caller) => (await s.query(api.live.groups.mine, { channel: CH }))!.team;
// How many students are on each team, team 0 first.
async function sizes(ss: Caller[]) {
  const n = new Map<number, number>();
  for (const s of ss) {
    const team = await teamOf(s);
    n.set(team, (n.get(team) ?? 0) + 1);
  }
  return [...n].sort((a, b) => a[0] - b[0]).map(([, k]) => k);
}

describe("F24 teams and the leaderboard", () => {
  it("F24.1 deals Red, Blue, Yellow in check-in order", async () => {
    const t = setup();
    const ss = await arrive(t, 4);
    expect(await ss[0].query(api.live.groups.mine, { channel: CH })).toEqual({ team: 0, color: "red", label: "Red" });
    expect(await ss[1].query(api.live.groups.mine, { channel: CH })).toEqual({ team: 1, color: "blue", label: "Blue" });
    expect(await ss[2].query(api.live.groups.mine, { channel: CH })).toEqual({ team: 2, color: "yellow", label: "Yellow" });
    expect(await teamOf(ss[3])).toBe(0); // around again
    expect(await t.query(api.live.groups.mine, { channel: CH })).toBeNull(); // signed out
    expect(await student(t, 9).query(api.live.groups.mine, { channel: CH })).toBeNull(); // not checked in
  });

  it("F24.3 setSize accepts 3 and 4 and refuses 5 ('Pick teams of 3 or 4.')", async () => {
    const t = setup();
    expect(await t.query(api.live.groups.status, { channel: CH })).toEqual({ size: 4, locked: false, locksAt: null });
    await t.mutation(api.live.groups.setSize, { key: PROF_KEY, channel: CH, size: 3 });
    expect((await t.query(api.live.groups.status, { channel: CH })).size).toBe(3);
    await t.mutation(api.live.groups.setSize, { key: PROF_KEY, channel: CH, size: 4 });
    expect((await t.query(api.live.groups.status, { channel: CH })).size).toBe(4);
    for (const size of [5, 2, 0])
      await expect(t.mutation(api.live.groups.setSize, { key: PROF_KEY, channel: CH, size })).rejects.toThrow(/3 or 4/);
    expect((await t.query(api.live.groups.status, { channel: CH })).size).toBe(4);
  });

  it("F24.4 teamsFor(10, 4) = 3, teamsFor(5, 4) = 1", () => {
    expect(teamsFor(10, 4)).toBe(3);
    expect(teamsFor(5, 4)).toBe(1);
    expect(teamsFor(7, 4)).toBe(2);
    expect(teamsFor(12, 3)).toBe(4);
    expect(teamsFor(12, 4)).toBe(3);
  });

  it("F24.4 the lock 5 minutes after class starts re-deals everyone into teams of 3 or 4", async () => {
    const t = setup();
    await t.mutation(api.checkin.attendance.setClassStart, { key: PROF_KEY, channel: CH, startsAt: T0, graceMin: 5 });
    const ss = await arrive(t, 7);
    // Before the lock, 7 students are dealt over Red, Blue and Yellow: 3, 2 and 2.
    expect(await sizes(ss)).toEqual([3, 2, 2]);
    expect(await t.query(api.live.groups.status, { channel: CH })).toEqual({ size: 4, locked: false, locksAt: T0 + 5 * MIN });

    vi.advanceTimersByTime(T0 + 6 * MIN - Date.now());
    await t.finishInProgressScheduledFunctions();

    expect(await t.query(api.live.groups.status, { channel: CH })).toMatchObject({ locked: true, locksAt: null });
    // teamsFor(7, 4) is 2 teams, re-dealt in check-in order: 4 and 3.
    expect(await sizes(ss)).toEqual([4, 3]);
  });

  it("F24.4 internal.live.groups.lock with force locks now and re-deals; a second lock changes nothing", async () => {
    const t = setup();
    const ss = await arrive(t, 7);
    expect(await sizes(ss)).toEqual([3, 2, 2]);
    await t.mutation(internal.live.groups.lock, { channel: CH, force: true });
    expect(await t.query(api.live.groups.status, { channel: CH })).toMatchObject({ locked: true, locksAt: null });
    const after = await Promise.all(ss.map(teamOf));
    expect(await sizes(ss)).toEqual([4, 3]);
    await t.mutation(internal.live.groups.lock, { channel: CH, force: true });
    expect(await Promise.all(ss.map(teamOf))).toEqual(after);
  });

  it("join deals a team to everyone checked in without one, in check-in order", async () => {
    const t = setup();
    const [a, b] = [student(t, 1), student(t, 2)];
    // Check-ins from before teams existed: rows with no team.
    await t.run(async (ctx) => {
      for (const [i, n] of [1, 2].entries())
        await ctx.db.insert("checkins", { channel: CH, user: `${TYPED_ISSUER}|student${n}@example.edu`, name: `Sample student ${n}`, at: Date.now() + i });
    });
    await expect(t.mutation(api.live.groups.join, { channel: CH })).rejects.toThrow("Sign in first.");
    expect(await student(t, 3).mutation(api.live.groups.join, { channel: CH })).toBeNull(); // not checked in
    expect(await b.mutation(api.live.groups.join, { channel: CH })).toEqual({ team: 1, color: "blue", label: "Blue" });
    expect(await a.query(api.live.groups.mine, { channel: CH })).toEqual({ team: 0, color: "red", label: "Red" });
    expect(await b.mutation(api.live.groups.join, { channel: CH })).toEqual({ team: 1, color: "blue", label: "Blue" });
  });

  it("F24.2 the leaderboard counts right answers on ended quizzes only", async () => {
    const t = setup();
    const [red, blue] = await arrive(t, 3);
    const quiz = await t.mutation(api.checkin.quiz.ask, { key: PROF_KEY, channel: CH, kind: "quiz", question: "What is 2 + 2?", choices: ["4", "5"], correct: 0 });
    await red.mutation(api.checkin.quiz.answer, { poll: quiz, choice: 0 });
    await blue.mutation(api.checkin.quiz.answer, { poll: quiz, choice: 1 });
    const board = async () => {
      const b = await t.query(api.live.groups.leaderboard, { channel: CH });
      return { questions: b.questions, teams: Object.fromEntries(b.teams.map((g) => [g.label, [g.members, g.correct]])) };
    };
    // While the quiz is open it counts for nothing, so the board can't give the answer away.
    expect(await board()).toEqual({ questions: 0, teams: { Red: [1, 0], Blue: [1, 0], Yellow: [1, 0] } });
    await t.mutation(api.checkin.quiz.end, { key: PROF_KEY, poll: quiz });
    expect(await board()).toEqual({ questions: 1, teams: { Red: [1, 1], Blue: [1, 0], Yellow: [1, 0] } });

    // A vote and a quiz with no right answer never count.
    vi.advanceTimersByTime(60_000);
    const vote = await t.mutation(api.checkin.quiz.ask, { key: PROF_KEY, channel: CH, kind: "vote", question: "Pizza or tacos?", choices: ["Pizza", "Tacos"] });
    await blue.mutation(api.checkin.quiz.answer, { poll: vote, choice: 0 });
    await t.mutation(api.checkin.quiz.end, { key: PROF_KEY, poll: vote });
    vi.advanceTimersByTime(60_000);
    const open = await t.mutation(api.checkin.quiz.ask, { key: PROF_KEY, channel: CH, kind: "quiz", question: "Which did you like best?", choices: ["Slides", "Demo"] });
    await blue.mutation(api.checkin.quiz.answer, { poll: open, choice: 0 });
    await t.mutation(api.checkin.quiz.end, { key: PROF_KEY, poll: open });
    expect(await board()).toEqual({ questions: 1, teams: { Red: [1, 1], Blue: [1, 0], Yellow: [1, 0] } });
  });
});
