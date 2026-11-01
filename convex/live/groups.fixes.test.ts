// live/groups review fixes (UB): ties follow the number the screens show, a lock that finds
// nobody checked in queues again on the next check-in, and the extra credit helper the class
// closes can call.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../_generated/api";
import { ensureLecture } from "../lib";
import { admin, at, checkIn, profEnv, setup, typed, type Caller, type T } from "../test.helpers";
import { saveExtraCredit, tenths } from "./groups";

const CH = "gdg";
const T0 = at(2026, 11, 5, 21, 30);
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
async function sizes(ss: Caller[]) {
  const n = new Map<number, number>();
  for (const s of ss) {
    const team = await teamOf(s);
    if (team !== null) n.set(team, (n.get(team) ?? 0) + 1);
  }
  return [...n].sort((a, b) => a[0] - b[0]).map(([, k]) => k);
}

let asked = 0;
async function quiz(t: T, all: Caller[], right: Caller[]) {
  const poll = await admin(t).mutation(api.checkin.quiz.ask, { channel: CH, kind: "quiz", question: `Question ${++asked}`, choices: ["Right", "Wrong"], correct: 0 });
  for (const s of all) await s.mutation(api.checkin.quiz.answer, { poll, choice: right.includes(s) ? 0 : 1 });
  await admin(t).mutation(api.checkin.quiz.end, { poll });
  vi.advanceTimersByTime(10_000);
}

// 7 students locked into Red (4) and Blue (3).
async function sevenLocked(t: T) {
  await t.run((ctx) => ensureLecture(ctx, CH));
  const ss = await arrive(t, 1, 7);
  await t.mutation(internal.live.groups.lock, { channel: CH, force: true });
  expect(await sizes(ss)).toEqual([4, 3]);
  const teams = await Promise.all(ss.map(teamOf));
  return { ss, red: ss.filter((_, i) => teams[i] === 0), blue: ss.filter((_, i) => teams[i] === 1) };
}

const places = async (t: T) =>
  Object.fromEntries((await t.query(api.live.groups.leaderboard, { channel: CH })).teams.map((g) => [g.label, { shown: g.perStudent.toFixed(1), rank: g.rank, ec: g.ec }]));

describe("UB-spec-2 teams rank and tie on points per student to one decimal, as every screen shows it", () => {
  it("tenths(points, members) is the figure perStudent.toFixed(1) shows, for teams of 1 to 5", () => {
    for (let n = 1; n <= 5; n++)
      for (let p = -25; p <= 50; p++) expect([p, n, (tenths(p, n) / 10).toFixed(1)]).toEqual([p, n, (p / n).toFixed(1)]);
    expect(tenths(0, 0)).toBe(0);
  });

  it("Red 5 / 4 and Blue 4 / 3 both show 1.3, so they tie for 1st with 4 extra credit each", async () => {
    const t = setup();
    const { ss, red, blue } = await sevenLocked(t);
    await quiz(t, ss, ss);
    await quiz(t, ss, [red[0], blue[0]]);
    expect(await places(t)).toEqual({
      Red: { shown: "1.3", rank: 1, ec: 4 },
      Blue: { shown: "1.3", rank: 1, ec: 4 },
    });
  });

  it("one right answer on each team: 1 / 4 and 1 / 3 both show 0.3 and tie", async () => {
    const t = setup();
    const { ss, red, blue } = await sevenLocked(t);
    await quiz(t, ss, [red[0], blue[0]]);
    expect(await places(t)).toEqual({
      Red: { shown: "0.3", rank: 1, ec: 4 },
      Blue: { shown: "0.3", rank: 1, ec: 4 },
    });
  });

  it("End day says they tied", async () => {
    const t = setup();
    const { ss, red, blue } = await sevenLocked(t);
    await quiz(t, ss, [red[0], blue[0]]);
    expect(await admin(t).mutation(api.live.groups.endDay, { channel: CH })).toMatch(/^Red and Blue tied for 1st with 0\.3 points per student\./);
  });
});

describe("UB-risk-1 a lock that finds nobody checked in lets the next check-in queue it again", () => {
  it("the class's only check-in is removed before the lock; 7 later arrivals still lock into 4 and 3", async () => {
    const t = setup();
    // No class start saved. The first scan opens the class and queues the lock for 5 minutes later.
    await arrive(t, 1, 1);
    const [first] = await admin(t).query(api.live.groups.roster, { channel: CH });
    await admin(t).mutation(api.checkin.attendance.removeCheckin, { checkin: first.checkin });
    vi.advanceTimersByTime(6 * MIN);
    await t.finishInProgressScheduledFunctions();
    expect(await t.query(api.live.groups.status, { channel: CH })).toMatchObject({ locked: false, locksAt: null });

    const ss = await arrive(t, 2, 8);
    expect(await sizes(ss)).toEqual([3, 2, 2]);
    vi.advanceTimersByTime(30 * MIN);
    await t.finishInProgressScheduledFunctions();
    expect(await t.query(api.live.groups.status, { channel: CH })).toMatchObject({ locked: true, locksAt: null });
    expect(await sizes(ss)).toEqual([4, 3]);
  });
});

describe("UB-risk-2 saveExtraCredit, for a class that closes without End day", () => {
  it("saves the board's places for every team member of the open class, the same rows End day saves", async () => {
    const t = setup();
    const { ss, red } = await sevenLocked(t);
    await quiz(t, ss, red);
    const endedAt = Date.now();
    expect(await t.run((ctx) => saveExtraCredit(ctx, CH, endedAt))).toBe(4);
    const rows = await t.run((ctx) => ctx.db.query("groupResults").withIndex("by_channel", (q) => q.eq("channel", CH)).collect());
    expect(rows.map((r) => [r.team, r.rank, r.points, r.ec, r.endedAt]).sort()).toEqual([
      ...Array(4).fill([0, 1, 4, 5, endedAt]),
      ...Array(3).fill([1, 2, 0, 0, endedAt]),
    ]);
  });

  it("an open quiz counts for nothing and doesn't stop it; no class open or nothing to score saves nothing", async () => {
    const t = setup();
    expect(await t.run((ctx) => saveExtraCredit(ctx, CH, Date.now()))).toBe(0);
    const { ss, red } = await sevenLocked(t);
    expect(await t.run((ctx) => saveExtraCredit(ctx, CH, Date.now()))).toBe(0);
    await quiz(t, ss, red);
    await admin(t).mutation(api.checkin.quiz.ask, { channel: CH, kind: "quiz", question: "Still open", choices: ["A", "B"], correct: 0 });
    expect(await t.run((ctx) => saveExtraCredit(ctx, CH, Date.now()))).toBe(4);
  });
});
