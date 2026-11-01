// live/groups re-deal fixes (UB round 3): a team change follows the students who were on the team
// when a re-deal moves them, several changes for one team spread over its students instead of all
// landing on the first one, a team change kept for a team with nobody left stays on the board, and
// a start time saved after a lock found nobody shows its own lock time.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { ensureLecture } from "../lib";
import { admin, at, checkIn, profEnv, setup, TYPED_ISSUER, typed, type Caller, type T } from "../test.helpers";

const CH = "gdg";
const T0 = at(2026, 11, 5, 21, 30);
const MIN = 60_000;
const student = (t: T, n: number) => typed(t, `Sample student ${n}`, `student${n}@example.edu`);
const userOf = (n: number) => `${TYPED_ISSUER}|student${n}@example.edu`;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0 - 10 * MIN);
  profEnv();
});
afterEach(() => {
  vi.useRealTimers();
});

// Students `from` to `to` checked in by a real scan, a second apart, running any lock that comes due.
async function arrive(t: T, from: number, to: number) {
  const out: Caller[] = [];
  for (let n = from; n <= to; n++) {
    const s = student(t, n);
    await checkIn(t, s);
    out.push(s);
    vi.advanceTimersByTime(1_000);
    await t.finishInProgressScheduledFunctions();
  }
  return out;
}

const teamOf = async (s: Caller) => (await s.query(api.live.groups.mine, { channel: CH }))?.team ?? null;
// Student numbers on each team, team 0 first.
async function members(ss: Caller[]) {
  const out = new Map<number, number[]>();
  for (const [i, s] of ss.entries()) {
    const team = await teamOf(s);
    if (team !== null) out.set(team, [...(out.get(team) ?? []), i + 1]);
  }
  return [...out].sort((a, b) => a[0] - b[0]).map(([, ns]) => ns);
}
const board = (t: T) => t.query(api.live.groups.leaderboard, { channel: CH });
// Each student's own changes from the roster ("Sample student 4" -> 4), students with none left out.
async function studentChanges(t: T) {
  const roster = await admin(t).query(api.live.groups.roster, { channel: CH });
  return Object.fromEntries(roster.filter((r) => r.changes !== 0).map((r) => [Number(r.name.replace("Sample student ", "")), r.changes]));
}
// Every change the board counts and every change pointLog lists, added up.
async function changeTotals(t: T) {
  const b = await board(t);
  const log = await admin(t).query(api.live.groups.pointLog, { channel: CH });
  return { board: b.teams.reduce((sum, g) => sum + g.changes, 0), log: log.reduce((sum, c) => sum + c.delta, 0) };
}
const teamChange = (t: T, team: number, delta: number) => admin(t).mutation(api.live.groups.adjust, { channel: CH, team, delta });

// 12 students in teams of 3, locked into Red 1 5 9, Blue 2 6 10, Yellow 3 7 11, Green 4 8 12.
async function twelveInFours(t: T) {
  await t.run((ctx) => ensureLecture(ctx, CH));
  await admin(t).mutation(api.live.groups.setSize, { channel: CH, size: 3 });
  const ss = await arrive(t, 1, 12);
  await t.mutation(internal.live.groups.lock, { channel: CH, force: true });
  expect(await members(ss)).toEqual([
    [1, 5, 9],
    [2, 6, 10],
    [3, 7, 11],
    [4, 8, 12],
  ]);
  return ss;
}

describe("UB-fixcheck-1 / UB-r3-check-3 a re-deal moves a team change with the students who earned it", () => {
  it("Red +5 and Green +3, then teams of 4: Red's 5 stays with students 1, 5 and 9, not with the students now on Red", async () => {
    const t = setup();
    const ss = await twelveInFours(t);
    await teamChange(t, 0, 5);
    await teamChange(t, 3, 3);
    await admin(t).mutation(api.live.groups.setSize, { channel: CH, size: 4 }); // teamsFor(12, 4) = 3
    expect(await members(ss)).toEqual([
      [1, 4, 7, 10],
      [2, 5, 8, 11],
      [3, 6, 9, 12],
    ]);
    expect(await studentChanges(t)).toEqual({ 1: 2, 5: 2, 9: 1, 4: 1, 8: 1, 12: 1 });
    // Red is 1 4 7 10 now: 2 (student 1) + 1 (student 4).
    expect((await board(t)).teams.map((g) => [g.label, g.changes]).sort()).toEqual([
      ["Blue", 2 + 1],
      ["Red", 2 + 1],
      ["Yellow", 1 + 1],
    ]);
    expect(await changeTotals(t)).toEqual({ board: 8, log: 8 });
  });

  it("Red (1, 4, 7) +5 and Green (10, 13) +2 before the lock; 13 students lock into 4 teams; each change stays with its students", async () => {
    const t = setup();
    await t.run((ctx) => ensureLecture(ctx, CH));
    await admin(t).mutation(api.live.groups.setSize, { channel: CH, size: 3 });
    const ss = await arrive(t, 1, 13);
    expect((await members(ss))[0]).toEqual([1, 4, 7]);
    expect((await members(ss))[3]).toEqual([10, 13]);
    await teamChange(t, 0, 5);
    await teamChange(t, 3, 2);
    await t.mutation(internal.live.groups.lock, { channel: CH, force: true }); // teamsFor(13, 4) = 4
    expect(await members(ss)).toEqual([
      [1, 5, 9, 13],
      [2, 6, 10],
      [3, 7, 11],
      [4, 8, 12],
    ]);
    expect(await studentChanges(t)).toEqual({ 1: 2, 4: 2, 7: 1, 10: 1, 13: 1 });
    expect(await changeTotals(t)).toEqual({ board: 7, log: 7 });
  });

  it("a team whose students the re-deal leaves together keeps its team change as it is", async () => {
    const t = setup();
    await t.run((ctx) => ensureLecture(ctx, CH));
    await admin(t).mutation(api.live.groups.setSize, { channel: CH, size: 3 });
    const ss = await arrive(t, 1, 9); // Red 1 4 7, Blue 2 5 8, Yellow 3 6 9: the lock deals the same teams
    await teamChange(t, 0, 2);
    await t.mutation(internal.live.groups.lock, { channel: CH, force: true });
    expect(await members(ss)).toEqual([
      [1, 4, 7],
      [2, 5, 8],
      [3, 6, 9],
    ]);
    expect(await studentChanges(t)).toEqual({});
    const log = await admin(t).query(api.live.groups.pointLog, { channel: CH });
    expect(log.map((c) => [c.team?.label, c.name, c.delta])).toEqual([["Red", null, 2]]);
  });
});

describe("UB-r3-check-2 several changes for a team that a re-deal breaks up spread over its students", () => {
  it("Green gets +1 three times, then teams of 4: students 4, 8 and 12 get 1 each", async () => {
    const t = setup();
    await twelveInFours(t);
    for (let i = 0; i < 3; i++) {
      await teamChange(t, 3, 1);
      vi.advanceTimersByTime(1_000);
    }
    await admin(t).mutation(api.live.groups.setSize, { channel: CH, size: 4 });
    expect(await studentChanges(t)).toEqual({ 4: 1, 8: 1, 12: 1 });
    const log = await admin(t).query(api.live.groups.pointLog, { channel: CH });
    expect(log.map((c) => [c.name, c.delta, c.reason]).sort()).toEqual([
      ["Sample student 12", 1, "Bonus"],
      ["Sample student 4", 1, "Bonus"],
      ["Sample student 8", 1, "Bonus"],
    ]);
  });

  it("Green +2 then -1: the -1 comes off a student who got 1, so the team's net 1 lands on one student", async () => {
    const t = setup();
    await twelveInFours(t);
    await teamChange(t, 3, 2);
    vi.advanceTimersByTime(1_000);
    await teamChange(t, 3, -1);
    await admin(t).mutation(api.live.groups.setSize, { channel: CH, size: 4 });
    expect(await studentChanges(t)).toEqual({ 8: 1 });
    expect(await changeTotals(t)).toEqual({ board: 1, log: 1 });
  });
});

describe("UB-fixcheck-4 a team change kept for a team with nobody left stays on the board", () => {
  it("Yellow +2, then students 3 and 6 leave (check-in and team rows gone) and the lock deals one team: Yellow shows 0 students and its 2", async () => {
    const t = setup();
    await t.run((ctx) => ensureLecture(ctx, CH));
    await arrive(t, 1, 7); // Red 1 4 7, Blue 2 5, Yellow 3 6
    await teamChange(t, 2, 2);
    await t.run(async (ctx) => {
      for (const n of [3, 6]) {
        for (const table of ["checkins", "groups"] as const) {
          const row = await ctx.db.query(table).withIndex("by_channel_and_user", (q) => q.eq("channel", CH).eq("user", userOf(n))).first();
          await ctx.db.delete(table, row!._id);
        }
      }
    });
    await t.mutation(internal.live.groups.lock, { channel: CH, force: true }); // teamsFor(5, 4) = 1
    const yellow = (await board(t)).teams.find((g) => g.label === "Yellow");
    expect(yellow).toMatchObject({ members: 0, changes: 2, ec: 0 });
    expect(await changeTotals(t)).toEqual({ board: 2, log: 2 });
  });
});

describe("UB-fixcheck-2 a start saved after a lock found nobody shows its own lock time", () => {
  async function startAt(t: T, lecture: Id<"lectures">, startsAt: number) {
    await admin(t).mutation(api.checkin.attendance.setClassStart, { channel: CH, startsAt, graceMin: 5 });
    await t.run((ctx) => ctx.db.patch("lectures", lecture, { startsAt, graceMin: 5 }));
  }

  it("start 21:30, nobody by 21:35; start saved again as 21:45: locksAt 21:50 before anyone arrives, and the teams lock then", async () => {
    const t = setup();
    const lecture = (await t.run((ctx) => ensureLecture(ctx, CH)))._id;
    await startAt(t, lecture, T0);
    vi.advanceTimersByTime(T0 + 6 * MIN - Date.now());
    await t.finishInProgressScheduledFunctions();
    expect(await t.query(api.live.groups.status, { channel: CH })).toEqual({ size: 4, locked: false, locksAt: null });

    await startAt(t, lecture, T0 + 15 * MIN);
    expect(await t.query(api.live.groups.status, { channel: CH })).toEqual({ size: 4, locked: false, locksAt: T0 + 20 * MIN });

    vi.advanceTimersByTime(T0 + 7 * MIN - Date.now());
    const ss = await arrive(t, 1, 7);
    expect((await t.query(api.live.groups.status, { channel: CH })).locksAt).toBe(T0 + 20 * MIN);
    vi.advanceTimersByTime(T0 + 21 * MIN - Date.now());
    await t.finishInProgressScheduledFunctions();
    expect((await t.query(api.live.groups.status, { channel: CH })).locked).toBe(true);
    expect(await members(ss)).toEqual([
      [1, 3, 5, 7],
      [2, 4, 6],
    ]);
  });

  it("a start saved again for a time whose lock has already passed still shows no lock time", async () => {
    const t = setup();
    const lecture = (await t.run((ctx) => ensureLecture(ctx, CH)))._id;
    await startAt(t, lecture, T0);
    vi.advanceTimersByTime(T0 + 6 * MIN - Date.now());
    await t.finishInProgressScheduledFunctions();
    await startAt(t, lecture, T0 - 2 * MIN);
    await t.finishInProgressScheduledFunctions();
    expect(await t.query(api.live.groups.status, { channel: CH })).toEqual({ size: 4, locked: false, locksAt: null });
  });
});
