// live/groups review fixes (UB): ties follow the number the screens show, a lock that finds
// nobody checked in queues again on the next check-in, the extra credit a class saves when it
// closes without End day, a lock time that has passed, and reads that stay bounded as classes pile up.
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { ensureLecture, lectureWindow } from "../lib";
import schema from "../schema";
import { admin, at, checkIn, profEnv, setup, TYPED_ISSUER, typed, type Caller, type T } from "../test.helpers";
import { modules } from "../test.setup";
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

// ---------- Second review: UB-spec-3, UB-risk-2, UB-convex-2, UB-convex-3 ----------

const HOUR = 60 * MIN;
const userOf = (n: number) => `${TYPED_ISSUER}|student${n}@example.edu`;
// A backend that enforces Convex's per-call read limit, set to `documentsRead` documents, so a
// query that reads every class ever saved fails here the way it would once a channel has history.
const limited = (documentsRead: number) => convexTest({ schema, modules, transactionLimits: { documentsRead } });

// `n` rows End day saved in an earlier class, for students who aren't in this one.
async function history(t: T, n: number) {
  await t.run(async (ctx) => {
    const lecture = await ctx.db.insert("lectures", { channel: CH, startedAt: T0 - 24 * HOUR, endedAt: T0 - 23 * HOUR });
    for (let i = 0; i < n; i++)
      await ctx.db.insert("groupResults", { channel: CH, lecture, endedAt: T0 - 23 * HOUR, user: `old|${i}`, team: i % 3, rank: 1, points: 1, ec: 1 });
  });
  vi.advanceTimersByTime(MIN);
}

const savedFor = async (t: T, lecture: Id<"lectures">) =>
  (await t.run((ctx) => ctx.db.query("groupResults").withIndex("by_channel", (q) => q.eq("channel", CH)).collect())).filter((r) => r.lecture === lecture);
const openNow = async (t: T) => (await t.run((ctx) => lectureWindow(ctx, CH))).lecture!;

describe("UB-spec-3 with a start time saved and nobody checked in by start + 5, status shows no lock time that has passed", () => {
  it("before start + 5 it says start + 5; once that lock finds nobody, locksAt is null (5 minutes after the first check-in); the first check-in sets it again", async () => {
    const t = setup();
    await admin(t).mutation(api.checkin.attendance.setClassStart, { channel: CH, startsAt: T0, graceMin: 5 });
    expect(await t.query(api.live.groups.status, { channel: CH })).toEqual({ size: 4, locked: false, locksAt: T0 + 5 * MIN });
    vi.advanceTimersByTime(T0 + 8 * MIN - Date.now());
    await t.finishInProgressScheduledFunctions();
    expect(await t.query(api.live.groups.status, { channel: CH })).toEqual({ size: 4, locked: false, locksAt: null });
    const ss = await arrive(t, 1, 7);
    expect((await t.query(api.live.groups.status, { channel: CH })).locksAt).toBe(T0 + 13 * MIN);
    vi.advanceTimersByTime(T0 + 14 * MIN - Date.now());
    await t.finishInProgressScheduledFunctions();
    expect((await t.query(api.live.groups.status, { channel: CH })).locked).toBe(true);
    expect(await sizes(ss)).toEqual([4, 3]);
  });
});

describe("UB-risk-2 a class that closes without End day still saves its extra credit", () => {
  it("the 12-hour close (lectures.close) saves the board's places for every team member", async () => {
    const t = setup();
    const { ss, red } = await sevenLocked(t);
    await quiz(t, ss, red);
    const lecture = await openNow(t);
    vi.advanceTimersByTime(12 * HOUR + MIN);
    await t.finishInProgressScheduledFunctions();
    expect(await t.run((ctx) => lectureWindow(ctx, CH))).toMatchObject({ lecture: null });
    expect((await savedFor(t, lecture)).map((r) => [r.team, r.rank, r.ec]).sort()).toEqual([...Array(4).fill([0, 1, 5]), ...Array(3).fill([1, 2, 0])]);
  });

  it("ensureLecture closing a class left open past its close time saves it before it opens the next", async () => {
    const t = setup();
    const { ss, red } = await sevenLocked(t);
    await quiz(t, ss, red);
    const lecture = await openNow(t);
    // The close job hasn't run: setSystemTime moves the clock without firing timers.
    vi.setSystemTime(Date.now() + 13 * HOUR);
    const next = await t.run((ctx) => ensureLecture(ctx, CH));
    expect(next._id).not.toBe(lecture);
    expect(await savedFor(t, lecture)).toHaveLength(7);
    // The close job, when it runs, saves nothing more.
    vi.advanceTimersByTime(MIN);
    await t.finishInProgressScheduledFunctions();
    expect(await savedFor(t, lecture)).toHaveLength(7);
  });

  it("End day, then the 12-hour close job: saved once", async () => {
    const t = setup();
    const { ss, red } = await sevenLocked(t);
    await quiz(t, ss, red);
    const lecture = await openNow(t);
    await admin(t).mutation(api.live.groups.endDay, { channel: CH });
    vi.advanceTimersByTime(12 * HOUR + MIN);
    await t.finishInProgressScheduledFunctions();
    expect(await savedFor(t, lecture)).toHaveLength(7);
  });
});

describe("UB-convex-2 results reads one class's rows, however many other classes saved", () => {
  it("one class, with 400 rows saved in an earlier class: stays under 100 documents read", async () => {
    const t = limited(100);
    await history(t, 400);
    const { ss, red } = await sevenLocked(t);
    await quiz(t, ss, red);
    const lecture = await openNow(t);
    await admin(t).mutation(api.live.groups.endDay, { channel: CH });
    const { page, isDone } = await admin(t).query(api.live.groups.results, { channel: CH, lecture, paginationOpts: { numItems: 50, cursor: null } });
    expect(isDone).toBe(true);
    expect(page.map((r) => [r.name, r.email, r.ec]).sort()).toEqual(ss.map((s, i) => [`Sample student ${i + 1}`, `student${i + 1}@example.edu`, red.includes(s) ? 5 : 0]).sort());
  });

  it("every class: pages of at most 200 rows each stay under 300 documents read, together every row once", async () => {
    const t = limited(300);
    await history(t, 400);
    const { ss, red } = await sevenLocked(t);
    await quiz(t, ss, red);
    await admin(t).mutation(api.live.groups.endDay, { channel: CH });
    const rows = [];
    let cursor: string | null = null;
    for (;;) {
      const res: { page: unknown[]; isDone: boolean; continueCursor: string } = await admin(t).query(api.live.groups.results, { channel: CH, paginationOpts: { numItems: 1000, cursor } });
      expect(res.page.length).toBeLessThanOrEqual(200);
      rows.push(...res.page);
      if (res.isDone) break;
      cursor = res.continueCursor;
    }
    expect(rows).toHaveLength(407);
  });

  it("a row saved before names were kept gets the name from that student's check-in", async () => {
    const t = setup();
    const { ss, red } = await sevenLocked(t);
    await quiz(t, ss, red);
    const lecture = await openNow(t);
    await admin(t).mutation(api.live.groups.endDay, { channel: CH });
    await t.run(async (ctx) => {
      for (const r of await ctx.db.query("groupResults").withIndex("by_channel_and_lecture", (q) => q.eq("channel", CH).eq("lecture", lecture)).collect())
        await ctx.db.replace("groupResults", r._id, { channel: r.channel, lecture: r.lecture, endedAt: r.endedAt, user: r.user, team: r.team, rank: r.rank, points: r.points, ec: r.ec });
    });
    const { page } = await admin(t).query(api.live.groups.results, { channel: CH, lecture, paginationOpts: { numItems: 50, cursor: null } });
    expect(page.map((r) => r.name).sort()).toEqual(ss.map((_, i) => `Sample student ${i + 1}`).sort());
  });
});

describe("UB-convex-3 roster reads each student's saved extra credit, not every class's rows", () => {
  it("with 400 rows saved for other students it stays under 100 documents read and still adds up each student's extra credit", async () => {
    const t = limited(100);
    await history(t, 400);
    // Student 1's earlier classes.
    await t.run(async (ctx) => {
      const lecture = (await ctx.db.query("lectures").withIndex("by_channel", (q) => q.eq("channel", CH)).first())!._id;
      for (const ec of [3, 2]) await ctx.db.insert("groupResults", { channel: CH, lecture, endedAt: T0 - 23 * HOUR, user: userOf(1), team: 0, rank: 1, points: 2, ec });
    });
    const { ss } = await sevenLocked(t);
    const ec = async () => Object.fromEntries((await admin(t).query(api.live.groups.roster, { channel: CH })).map((r) => [r.name, r.ec]));
    expect(await ec()).toMatchObject({ "Sample student 1": 5, "Sample student 2": 0 });
    await quiz(t, ss, ss);
    await admin(t).mutation(api.live.groups.endDay, { channel: CH });
    // The next class: student 1 has the 5 from before plus 4 for Red and Blue tying for 1st (1.0 each).
    vi.advanceTimersByTime(MIN);
    await t.run((ctx) => ensureLecture(ctx, CH));
    await t.run((ctx) => ctx.db.insert("checkins", { channel: CH, user: userOf(1), name: "Sample student 1", email: "student1@example.edu", at: Date.now() }));
    expect(await ec()).toEqual({ "Sample student 1": 9 });
  });
});
