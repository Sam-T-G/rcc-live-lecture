// live/groups: teams of 3 or 4 dealt in check-in order, the lock, points per student (D6), the
// professor's point changes with Undo, End day and the saved extra credit, all per class.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { endLecture, ensureLecture, lectureWindow } from "../lib";
import { admin, at, authMatrix, checkIn, HOST_ONLY, profEnv, setup, TYPED_ISSUER, typed, type Caller, type T } from "../test.helpers";
import { teamsFor } from "./groups";

const CH = "gdg";
const T0 = at(2026, 11, 5, 21, 30); // class starts
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

// Opens a class the way the professor's first scan, quiz or deck press does (lib.ensureLecture),
// a minute after whatever came before. convex-test stamps _creationTime with the fake clock, so a
// class opened in the same millisecond another one ended would hold that class's last rows.
async function openClass(t: T) {
  vi.advanceTimersByTime(MIN);
  return (await t.run((ctx) => ensureLecture(ctx, CH)))._id;
}
const endClass = (t: T) => t.run((ctx) => endLecture(ctx, CH));
const classNow = async (t: T) => (await t.run((ctx) => lectureWindow(ctx, CH))).lecture;

// Saves when class starts the professor's way, and on the open class itself, which is where
// lib.lectureWindow reads it once a class is open.
async function startAt(t: T, lecture: Id<"lectures">, startsAt: number) {
  await admin(t).mutation(api.checkin.attendance.setClassStart, { channel: CH, startsAt, graceMin: 5 });
  await t.run((ctx) => ctx.db.patch("lectures", lecture, { startsAt, graceMin: 5 }));
}

// Students `from` to `to` checked in by a real scan, a second apart. A lock that comes due between
// two scans runs there, as it would in class.
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

// A student's check-in in the current class, written straight to the table: a second check-in on
// the channel, which pass.scan refuses until the class model reaches it.
async function checkInAgain(t: T, n: number) {
  await t.run((ctx) => ctx.db.insert("checkins", { channel: CH, user: userOf(n), name: `Sample student ${n}`, email: `student${n}@example.edu`, at: Date.now() }));
  vi.advanceTimersByTime(1_000);
}

const teamOf = async (s: Caller) => (await s.query(api.live.groups.mine, { channel: CH }))?.team ?? null;
// How many students are on each team, team 0 first.
async function sizes(ss: Caller[]) {
  const n = new Map<number, number>();
  for (const s of ss) {
    const team = await teamOf(s);
    if (team !== null) n.set(team, (n.get(team) ?? 0) + 1);
  }
  return [...n].sort((a, b) => a[0] - b[0]).map(([, k]) => k);
}

// The admin asks a quiz; the students in `right` answer it right, the rest of `all` wrong; then
// the admin ends it.
let asked = 0;
async function quiz(t: T, all: Caller[], right: Caller[]) {
  const poll = await admin(t).mutation(api.checkin.quiz.ask, { channel: CH, kind: "quiz", question: `Question ${++asked}`, choices: ["Right", "Wrong"], correct: 0 });
  for (const s of all) await s.mutation(api.checkin.quiz.answer, { poll, choice: right.includes(s) ? 0 : 1 });
  await admin(t).mutation(api.checkin.quiz.end, { poll });
  vi.advanceTimersByTime(10_000);
  return poll;
}

const board = (t: T) => t.query(api.live.groups.leaderboard, { channel: CH });
// Each team by label: its students, right answers, points, points per student, place and extra credit.
async function standings(t: T) {
  const b = await board(t);
  return Object.fromEntries(b.teams.map((g) => [g.label, { members: g.members, correct: g.correct, points: g.points, perStudent: g.perStudent, rank: g.rank, ec: g.ec }]));
}
const saved = (t: T) => t.run((ctx) => ctx.db.query("groupResults").withIndex("by_channel", (q) => q.eq("channel", CH)).collect());
// Every key in a result, nested ones included.
const keysDeep = (x: unknown): string[] =>
  Array.isArray(x) ? x.flatMap(keysDeep) : x && typeof x === "object" ? Object.entries(x).flatMap(([k, v]) => [k, ...keysDeep(v)]) : [];
// The roster's checkins id for each student, by name.
async function checkinIds(t: T) {
  return Object.fromEntries((await admin(t).query(api.live.groups.roster, { channel: CH })).map((r) => [r.name, r.checkin]));
}

describe("F24 teams and the leaderboard", () => {
  it("F24.1 deals Red, Blue, Yellow in check-in order", async () => {
    const t = setup();
    const ss = await arrive(t, 1, 4);
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
    await admin(t).mutation(api.live.groups.setSize, { channel: CH, size: 3 });
    expect((await t.query(api.live.groups.status, { channel: CH })).size).toBe(3);
    await admin(t).mutation(api.live.groups.setSize, { channel: CH, size: 4 });
    expect((await t.query(api.live.groups.status, { channel: CH })).size).toBe(4);
    for (const size of [5, 2, 0])
      await expect(admin(t).mutation(api.live.groups.setSize, { channel: CH, size })).rejects.toThrow(/3 or 4/);
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
    await startAt(t, await openClass(t), T0);
    const ss = await arrive(t, 1, 7);
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
    const ss = await arrive(t, 1, 7);
    expect(await sizes(ss)).toEqual([3, 2, 2]);
    await t.mutation(internal.live.groups.lock, { channel: CH, force: true });
    expect(await t.query(api.live.groups.status, { channel: CH })).toMatchObject({ locked: true, locksAt: null });
    const after = await Promise.all(ss.map(teamOf));
    expect(await sizes(ss)).toEqual([4, 3]);
    await t.mutation(internal.live.groups.lock, { channel: CH, force: true });
    expect(await Promise.all(ss.map(teamOf))).toEqual(after);
  });

  it("F24.4 class start 14:30, first scan 14:36, 9 students lock 3,3,3 (not 4,4,1)", async () => {
    const t = setup();
    vi.setSystemTime(at(2026, 11, 5, 14, 20));
    const lecture = await openClass(t);
    await admin(t).mutation(api.live.groups.setSize, { channel: CH, size: 3 });
    await startAt(t, lecture, at(2026, 11, 5, 14, 30));
    vi.setSystemTime(at(2026, 11, 5, 14, 36));
    const ss = await arrive(t, 1, 9);
    // The first scan came after 14:35, so the teams get 5 minutes from it.
    expect(await t.query(api.live.groups.status, { channel: CH })).toEqual({ size: 3, locked: false, locksAt: at(2026, 11, 5, 14, 41) });
    vi.advanceTimersByTime(at(2026, 11, 5, 14, 42) - Date.now());
    await t.finishInProgressScheduledFunctions();
    expect((await t.query(api.live.groups.status, { channel: CH })).locked).toBe(true);
    expect(await sizes(ss)).toEqual([3, 3, 3]);
  });

  it("F24.4 a lock that comes due before anyone checks in leaves the teams open; the first check-in starts the 5 minutes", async () => {
    const t = setup();
    const lecture = await openClass(t);
    await startAt(t, lecture, T0);
    // The lock checkin.attendance.setClassStart queues for 5 minutes after the start.
    await t.run((ctx) => ctx.scheduler.runAt(T0 + 5 * MIN, internal.live.groups.lock, { channel: CH, lecture }));
    vi.advanceTimersByTime(T0 + 6 * MIN - Date.now());
    await t.finishInProgressScheduledFunctions();
    // UB-spec-3: that lock found nobody, so no lock time that has passed (T0 + 5) is shown.
    expect(await t.query(api.live.groups.status, { channel: CH })).toEqual({ size: 4, locked: false, locksAt: null });
    const ss = await arrive(t, 1, 7);
    expect(await sizes(ss)).toEqual([3, 2, 2]);
    expect((await t.query(api.live.groups.status, { channel: CH })).locksAt).toBe(T0 + 11 * MIN);
    vi.advanceTimersByTime(T0 + 12 * MIN - Date.now());
    await t.finishInProgressScheduledFunctions();
    expect((await t.query(api.live.groups.status, { channel: CH })).locked).toBe(true);
    expect(await sizes(ss)).toEqual([4, 3]);
  });

  it("F24.5 after the lock with every team at 4, the next arrival joins the smallest team; a new team opens only when every team has 5", async () => {
    const t = setup();
    await openClass(t);
    const early = await arrive(t, 1, 7);
    await t.mutation(internal.live.groups.lock, { channel: CH, force: true });
    expect(await sizes(early)).toEqual([4, 3]);
    const [eighth] = await arrive(t, 8, 8); // Blue has room
    expect(await teamOf(eighth)).toBe(1);
    const [ninth, tenth] = await arrive(t, 9, 10); // every team has 4: the smallest, Red first on a tie
    expect([await teamOf(ninth), await teamOf(tenth)]).toEqual([0, 1]);
    const [eleventh] = await arrive(t, 11, 11); // every team has 5: Yellow opens
    expect(await teamOf(eleventh)).toBe(2);
    expect(await sizes([...early, eighth, ninth, tenth, eleventh])).toEqual([5, 5, 1]);
  });

  it("live-backend-8 setSize with the size already set moves nobody", async () => {
    const t = setup();
    await openClass(t);
    const early = await arrive(t, 1, 9);
    await t.mutation(internal.live.groups.lock, { channel: CH, force: true });
    const all = [...early, ...(await arrive(t, 10, 13))];
    const before = await Promise.all(all.map(teamOf));
    expect(await sizes(all)).toEqual([5, 4, 4]);
    await admin(t).mutation(api.live.groups.setSize, { channel: CH, size: 4 });
    expect(await Promise.all(all.map(teamOf))).toEqual(before);
    // A new size after the lock still re-deals everyone: teamsFor(13, 3) is 4 teams.
    await admin(t).mutation(api.live.groups.setSize, { channel: CH, size: 3 });
    expect(await sizes(all)).toEqual([4, 3, 3, 3]);
  });

  it("join deals a team to everyone checked in without one, in check-in order", async () => {
    const t = setup();
    const [a, b] = [student(t, 1), student(t, 2)];
    // Check-ins from before teams existed: rows with no team.
    await t.run(async (ctx) => {
      for (const [i, n] of [1, 2].entries())
        await ctx.db.insert("checkins", { channel: CH, user: userOf(n), name: `Sample student ${n}`, at: Date.now() + i });
    });
    await expect(t.mutation(api.live.groups.join, { channel: CH })).rejects.toThrow("Sign in first.");
    expect(await student(t, 3).mutation(api.live.groups.join, { channel: CH })).toBeNull(); // not checked in
    expect(await b.mutation(api.live.groups.join, { channel: CH })).toEqual({ team: 1, color: "blue", label: "Blue" });
    expect(await a.query(api.live.groups.mine, { channel: CH })).toEqual({ team: 0, color: "red", label: "Red" });
    expect(await b.mutation(api.live.groups.join, { channel: CH })).toEqual({ team: 1, color: "blue", label: "Blue" });
  });

  it("F24.2 only quizzes ended in this class count; open quizzes and votes never count", async () => {
    const t = setup();
    await openClass(t);
    const [red, blue, yellow] = await arrive(t, 1, 3);
    const poll = await admin(t).mutation(api.checkin.quiz.ask, { channel: CH, kind: "quiz", question: "What is 2 + 2?", choices: ["4", "5"], correct: 0 });
    await red.mutation(api.checkin.quiz.answer, { poll, choice: 0 });
    await blue.mutation(api.checkin.quiz.answer, { poll, choice: 1 });
    const right = async () => ({ questions: (await board(t)).questions, ...Object.fromEntries((await board(t)).teams.map((g) => [g.label, g.correct])) });
    // While the quiz is open it counts for nothing, so the board can't give the answer away.
    expect(await right()).toEqual({ questions: 0, Red: 0, Blue: 0, Yellow: 0 });
    await admin(t).mutation(api.checkin.quiz.end, { poll });
    expect(await right()).toEqual({ questions: 1, Red: 1, Blue: 0, Yellow: 0 });

    // A vote and a quiz with no right answer never count; an open quiz counts once it ends.
    vi.advanceTimersByTime(MIN);
    const vote = await admin(t).mutation(api.checkin.quiz.ask, { channel: CH, kind: "vote", question: "Pizza or tacos?", choices: ["Pizza", "Tacos"] });
    await blue.mutation(api.checkin.quiz.answer, { poll: vote, choice: 0 });
    await admin(t).mutation(api.checkin.quiz.end, { poll: vote });
    vi.advanceTimersByTime(MIN);
    const opinion = await admin(t).mutation(api.checkin.quiz.ask, { channel: CH, kind: "quiz", question: "Which did you like best?", choices: ["Slides", "Demo"] });
    await blue.mutation(api.checkin.quiz.answer, { poll: opinion, choice: 0 });
    await admin(t).mutation(api.checkin.quiz.end, { poll: opinion });
    vi.advanceTimersByTime(MIN);
    const open = await admin(t).mutation(api.checkin.quiz.ask, { channel: CH, kind: "quiz", question: "What is 3 + 3?", choices: ["6", "7"], correct: 0 });
    await yellow.mutation(api.checkin.quiz.answer, { poll: open, choice: 0 });
    expect(await right()).toEqual({ questions: 1, Red: 1, Blue: 0, Yellow: 0 });
    await admin(t).mutation(api.checkin.quiz.end, { poll: open });
    expect(await right()).toEqual({ questions: 2, Red: 1, Blue: 0, Yellow: 1 });

    // The next class starts from nothing: last class's quizzes count for nobody.
    await endClass(t);
    await openClass(t);
    for (const n of [1, 2, 3]) await checkInAgain(t, n);
    await red.mutation(api.live.groups.join, { channel: CH });
    expect(await right()).toEqual({ questions: 0, Red: 0, Blue: 0, Yellow: 0 });
  });

  it("F24.2 D6 teams rank by points per student: 10 students lock 4, 3, 3 and all answer right, so all three tie for 1st with 3 extra credit each", async () => {
    const t = setup();
    await openClass(t);
    const ss = await arrive(t, 1, 10);
    await t.mutation(internal.live.groups.lock, { channel: CH, force: true });
    expect(await sizes(ss)).toEqual([4, 3, 3]);
    await quiz(t, ss, ss);
    expect(await standings(t)).toEqual({
      Red: { members: 4, correct: 4, points: 4, perStudent: 1, rank: 1, ec: 3 },
      Blue: { members: 3, correct: 3, points: 3, perStudent: 1, rank: 1, ec: 3 },
      Yellow: { members: 3, correct: 3, points: 3, perStudent: 1, rank: 1, ec: 3 },
    });
    // Next quiz: 3 of Red's 4 and all of Blue right, Yellow wrong. Red has the most right answers
    // (7) but Blue has more per student (6 / 3 = 2.0 against 7 / 4 = 1.75).
    const teams = await Promise.all(ss.map(teamOf));
    const right = ss.filter((s, i) => teams[i] === 1 || (teams[i] === 0 && s !== ss[9]));
    await quiz(t, ss, right);
    const after = await standings(t);
    expect(after.Blue).toEqual({ members: 3, correct: 6, points: 6, perStudent: 2, rank: 1, ec: 5 });
    expect(after.Red).toEqual({ members: 4, correct: 7, points: 7, perStudent: 1.75, rank: 2, ec: 3 });
    expect(after.Yellow).toEqual({ members: 3, correct: 3, points: 3, perStudent: 1, rank: 3, ec: 1 });
    expect((await board(t)).teams.map((g) => g.label)).toEqual(["Blue", "Red", "Yellow"]);
  });

  it("F24.2 two teams tied for 1st get 4 each; 0-point teams get 0; no ended quiz and no change -> all 0; every old field present", async () => {
    const t = setup();
    await openClass(t);
    const ss = await arrive(t, 1, 9);
    await t.mutation(internal.live.groups.lock, { channel: CH, force: true });
    expect(await sizes(ss)).toEqual([3, 3, 3]);
    // No quiz has ended and nobody changed points: nobody has extra credit yet.
    const first = await board(t);
    expect(first.questions).toBe(0);
    expect(first.teams.map((g) => g.ec)).toEqual([0, 0, 0]);
    for (const key of ["team", "color", "label", "members", "correct", "rank", "ec"]) expect(Object.keys(first.teams[0])).toContain(key);
    const teams = await Promise.all(ss.map(teamOf));
    await quiz(t, ss, ss.filter((_, i) => teams[i] !== 2));
    expect(await standings(t)).toEqual({
      Red: { members: 3, correct: 3, points: 3, perStudent: 1, rank: 1, ec: 4 },
      Blue: { members: 3, correct: 3, points: 3, perStudent: 1, rank: 1, ec: 4 },
      Yellow: { members: 3, correct: 0, points: 0, perStudent: 0, rank: 3, ec: 0 }, // 3rd place, but 0 points
    });
  });

  it("F24.2 empty teams rank last with 0 extra credit", async () => {
    const t = setup();
    await openClass(t);
    const [s1, s2, s3, s4] = await arrive(t, 1, 4); // Red: 1 and 4, Blue: 2, Yellow: 3
    await quiz(t, [s1, s2, s3, s4], [s3]);
    // Yellow's one student's check-in is removed, so Yellow has nobody left.
    await t.run(async (ctx) => {
      const row = await ctx.db.query("checkins").withIndex("by_channel_and_user", (q) => q.eq("channel", CH).eq("user", userOf(3))).first();
      await ctx.db.delete("checkins", row!._id);
    });
    const b = await board(t);
    expect(b.teams.map((g) => [g.label, g.members, g.rank, g.ec])).toEqual([
      ["Red", 2, 1, 0],
      ["Blue", 1, 1, 0],
      ["Yellow", 0, 3, 0],
    ]);
  });

  it("a member whose checkins row is deleted (t.run, as removeCheckin does) no longer counts as a member, adds no right answers, and gets no groupResults row at End day", async () => {
    const t = setup();
    await openClass(t);
    const ss = await arrive(t, 1, 4); // Red: 1 and 4, Blue: 2, Yellow: 3
    await quiz(t, ss, [ss[0], ss[1], ss[3]]);
    expect((await standings(t)).Red).toMatchObject({ members: 2, correct: 2 });
    await t.run(async (ctx) => {
      const row = await ctx.db.query("checkins").withIndex("by_channel_and_user", (q) => q.eq("channel", CH).eq("user", userOf(4))).first();
      await ctx.db.delete("checkins", row!._id);
    });
    expect((await standings(t)).Red).toMatchObject({ members: 1, correct: 1, perStudent: 1 });
    expect(await ss[3].query(api.live.groups.mine, { channel: CH })).toBeNull();
    expect((await admin(t).query(api.live.groups.roster, { channel: CH })).map((r) => r.name)).not.toContain("Sample student 4");
    await admin(t).mutation(api.live.groups.endDay, { channel: CH });
    expect((await saved(t)).map((r) => r.user).sort()).toEqual([userOf(1), userOf(2), userOf(3)]);
  });
});

describe("F8 teams per class", () => {
  it("F8 a lock queued in the last class does nothing in the new class", async () => {
    const t = setup();
    const first = await openClass(t);
    await arrive(t, 1, 3); // the lock is queued for 5 minutes after the first scan, for this class
    const queued = await t.run(async (ctx) =>
      (await ctx.db.system.query("_scheduled_functions").take(20)).filter((j) => j.name.includes("groups") && j.state.kind === "pending").map((j) => j.args[0]),
    );
    expect(queued).toEqual([{ channel: CH, lecture: first }]);
    vi.advanceTimersByTime(2 * MIN);
    await endClass(t);
    vi.advanceTimersByTime(MIN);
    await openClass(t);
    const next = await arrive(t, 4, 6);
    expect(await sizes(next)).toEqual([1, 1, 1]);
    // The first class's lock comes due now.
    vi.advanceTimersByTime(2 * MIN);
    await t.finishInProgressScheduledFunctions();
    expect((await t.query(api.live.groups.status, { channel: CH })).locked).toBe(false);
    expect(await sizes(next)).toEqual([1, 1, 1]);
    // A lock queued with no class (before classes existed) acts on the open class.
    await t.mutation(internal.live.groups.lock, { channel: CH, force: true });
    expect((await t.query(api.live.groups.status, { channel: CH })).locked).toBe(true);
    expect(await sizes(next)).toEqual([3]);
  });

  it("F8 a student with a class-1 groups row and a class-1 groupSettings row present: mine, join, status and leaderboard in class 2 read only class 2 (no unique() error)", async () => {
    const t = setup();
    await openClass(t);
    const [s1, s2] = await arrive(t, 1, 2);
    await admin(t).mutation(api.live.groups.setSize, { channel: CH, size: 3 });
    await t.mutation(internal.live.groups.lock, { channel: CH, force: true });
    await quiz(t, [s1, s2], [s1]);
    expect(await teamOf(s2)).toBe(0); // the lock put both on Red
    await endClass(t);
    await openClass(t);
    await checkInAgain(t, 2);
    await checkInAgain(t, 1);
    expect(await s1.query(api.live.groups.mine, { channel: CH })).toBeNull(); // checked in, no team yet in this class
    expect(await s1.mutation(api.live.groups.join, { channel: CH })).toEqual({ team: 1, color: "blue", label: "Blue" });
    expect(await s2.query(api.live.groups.mine, { channel: CH })).toEqual({ team: 0, color: "red", label: "Red" });
    const status = await t.query(api.live.groups.status, { channel: CH });
    expect(status).toMatchObject({ size: 3, locked: false }); // the size carries over; the lock doesn't
    expect(status.locksAt).toBeGreaterThan(Date.now());
    const b = await board(t);
    expect(b.questions).toBe(0);
    expect(b.teams.map((g) => [g.label, g.members, g.correct])).toEqual([
      ["Red", 1, 0],
      ["Blue", 1, 0],
    ]);
  });
});

describe("F28 the professor's point changes", () => {
  it("F28.3 adjust is host-only; exactly one target; |delta| 1 to 5 whole; another channel's check-in refused; a team with no members refused; default reasons; the stored user comes from the checkins row", async () => {
    const t = setup();
    await openClass(t);
    const [s1] = await arrive(t, 1, 3);
    await checkIn(t, student(t, 4), "other"); // a check-in on another channel
    const ids = await checkinIds(t);
    const other = await t.run(async (ctx) => (await ctx.db.query("checkins").withIndex("by_channel", (q) => q.eq("channel", "other")).first())!._id);
    const as = admin(t);
    await expect(s1.mutation(api.live.groups.adjust, { channel: CH, team: 0, delta: 1 })).rejects.toThrow("Only professors can do that.");
    await expect(as.mutation(api.live.groups.adjust, { channel: CH, delta: 1 })).rejects.toThrow("Pick a team or a student.");
    await expect(as.mutation(api.live.groups.adjust, { channel: CH, team: 0, checkin: ids["Sample student 1"], delta: 1 })).rejects.toThrow("Pick a team or a student.");
    for (const delta of [0, 6, -6, 1.5, Number.NaN, Number.POSITIVE_INFINITY])
      await expect(as.mutation(api.live.groups.adjust, { channel: CH, team: 0, delta }), `delta ${delta}`).rejects.toThrow("Change points by 1 to 5.");
    await expect(as.mutation(api.live.groups.adjust, { channel: CH, checkin: other, delta: 1 })).rejects.toThrow("That student isn't checked in to this class.");
    for (const team of [3, 7, -1, 0.5])
      await expect(as.mutation(api.live.groups.adjust, { channel: CH, team, delta: 1 }), `team ${team}`).rejects.toThrow("No team with that number.");

    const plus = await as.mutation(api.live.groups.adjust, { channel: CH, team: 0, delta: 5 });
    const minus = await as.mutation(api.live.groups.adjust, { channel: CH, checkin: ids["Sample student 2"], delta: -5 });
    const why = await as.mutation(api.live.groups.adjust, { channel: CH, team: 2, delta: 2, reason: "  Helped \u202E  Blue\n out  " });
    const long = await as.mutation(api.live.groups.adjust, { channel: CH, team: 2, delta: -1, reason: "x".repeat(200) });
    const rows = await t.run(async (ctx) => Promise.all([plus, minus, why, long].map((id) => ctx.db.get("groupPoints", id))));
    expect(rows.map((r) => [r!.team, r!.user, r!.delta, r!.reason])).toEqual([
      [0, undefined, 5, "Bonus"],
      [undefined, userOf(2), -5, "Deduction"], // the user from the checkins row, never the caller
      [2, undefined, 2, "Helped Blue out"],
      [2, undefined, -1, "x".repeat(80)],
    ]);
  });

  it("F28.3 a team change counts for the team; a student change counts for the student's current team, also after the lock re-deals", async () => {
    const t = setup();
    await openClass(t);
    const ss = await arrive(t, 1, 7); // Red: 1, 4, 7; Blue: 2, 5; Yellow: 3, 6
    const ids = await checkinIds(t);
    await admin(t).mutation(api.live.groups.adjust, { channel: CH, team: 0, delta: 3 });
    await admin(t).mutation(api.live.groups.adjust, { channel: CH, checkin: ids["Sample student 6"], delta: 2 });
    const before = await board(t);
    expect(before.teams.map((g) => [g.label, g.changes, g.points])).toEqual([
      ["Red", 3, 3],
      ["Yellow", 2, 2],
      ["Blue", 0, 0],
    ]);
    // The lock re-deals 7 students into 2 teams: student 6 moves to Blue, and their 2 points go too.
    // Red's 3 stays with students 1, 4 and 7 (UB-r3-check-3), and student 4 moves to Blue.
    await t.mutation(internal.live.groups.lock, { channel: CH, force: true });
    expect(await teamOf(ss[5])).toBe(1);
    expect(await teamOf(ss[3])).toBe(1);
    const after = await board(t);
    expect(after.teams.map((g) => [g.label, g.members, g.changes, g.points])).toEqual([
      ["Blue", 3, 3, 3],
      ["Red", 4, 2, 2],
    ]);
    expect(after.teams.map((g) => g.ec)).toEqual([5, 3]); // 3 / 3 = 1.0 a student against 2 / 4
    const roster = await admin(t).query(api.live.groups.roster, { channel: CH });
    expect(roster.find((r) => r.name === "Sample student 6")).toMatchObject({ team: { label: "Blue" }, changes: 2, points: 2 });
  });

  it("F28.3 a dealt team whose students all left the class is refused ('No team with that number.')", async () => {
    const t = setup();
    await openClass(t);
    await arrive(t, 1, 3); // Red: 1, Blue: 2, Yellow: 3
    await t.run(async (ctx) => {
      const row = await ctx.db.query("checkins").withIndex("by_channel_and_user", (q) => q.eq("channel", CH).eq("user", userOf(1))).first();
      await ctx.db.delete("checkins", row!._id);
    });
    await expect(admin(t).mutation(api.live.groups.adjust, { channel: CH, team: 0, delta: 1 })).rejects.toThrow("No team with that number.");
    expect(await admin(t).mutation(api.live.groups.adjust, { channel: CH, team: 1, delta: 1 })).toBeTruthy();
  });

  // Every change the board counts and every change pointLog lists, added up.
  async function changeTotals(t: T) {
    const b = await board(t);
    const log = await admin(t).query(api.live.groups.pointLog, { channel: CH });
    return { board: b.teams.reduce((sum, g) => sum + g.changes, 0), log: log.reduce((sum, c) => sum + c.delta, 0) };
  }

  it("UB-convex-1 a change for a team the lock deals away follows that team's students, so nothing drops off the board", async () => {
    const t = setup();
    await openClass(t);
    const ss = await arrive(t, 1, 7); // Red: 1, 4, 7; Blue: 2, 5; Yellow: 3, 6
    await admin(t).mutation(api.live.groups.adjust, { channel: CH, team: 2, delta: 2, reason: "Helped out" });
    expect(await changeTotals(t)).toEqual({ board: 2, log: 2 });
    // The lock re-deals 7 students into 2 teams: Yellow is gone; student 3 lands on Red, 6 on Blue.
    await t.mutation(internal.live.groups.lock, { channel: CH, force: true });
    expect([await teamOf(ss[2]), await teamOf(ss[5])]).toEqual([0, 1]);
    expect(await changeTotals(t)).toEqual({ board: 2, log: 2 });
    expect((await board(t)).teams.map((g) => [g.label, g.members, g.changes])).toEqual([
      // 1 / 4 and 1 / 3 a student both show 0.3, so they tie and list by team number.
      ["Red", 4, 1],
      ["Blue", 3, 1],
    ]);
    const log = await admin(t).query(api.live.groups.pointLog, { channel: CH });
    expect(log.map((c) => [c.name, c.team?.label, c.delta, c.reason]).sort()).toEqual([
      ["Sample student 3", "Red", 1, "Helped out"],
      ["Sample student 6", "Blue", 1, "Helped out"],
    ]);
    const roster = await admin(t).query(api.live.groups.roster, { channel: CH });
    expect(roster.filter((r) => r.changes !== 0).map((r) => [r.name, r.changes]).sort()).toEqual([
      ["Sample student 3", 1],
      ["Sample student 6", 1],
    ]);
  });

  it("UB-convex-1 a new size after the lock keeps every team change, and a new team never takes an emptied team's points", async () => {
    const t = setup();
    await openClass(t);
    await admin(t).mutation(api.live.groups.setSize, { channel: CH, size: 3 });
    const ss = await arrive(t, 1, 12);
    await t.mutation(internal.live.groups.lock, { channel: CH, force: true });
    expect(await sizes(ss)).toEqual([3, 3, 3, 3]);
    await admin(t).mutation(api.live.groups.adjust, { channel: CH, team: 3, delta: 5 }); // Green
    await admin(t).mutation(api.live.groups.adjust, { channel: CH, team: 3, delta: -1 });
    await admin(t).mutation(api.live.groups.setSize, { channel: CH, size: 4 }); // teamsFor(12, 4) = 3: Green is gone
    expect(await sizes(ss)).toEqual([4, 4, 4]);
    expect(await changeTotals(t)).toEqual({ board: 4, log: 4 });
    expect((await board(t)).teams.map((g) => g.label)).not.toContain("Green");

    // 6 students lock into Red and Blue; Blue gets 5 points, then all of Blue's check-ins are removed.
    const u = setup();
    await openClass(u);
    const six = await arrive(u, 1, 6);
    await u.mutation(internal.live.groups.lock, { channel: CH, force: true });
    expect(await sizes(six)).toEqual([3, 3]);
    await admin(u).mutation(api.live.groups.adjust, { channel: CH, team: 1, delta: 5 });
    await u.run(async (ctx) => {
      for (const n of [2, 4, 6]) {
        const row = await ctx.db.query("checkins").withIndex("by_channel_and_user", (q) => q.eq("channel", CH).eq("user", userOf(n))).first();
        await ctx.db.delete("checkins", row!._id);
      }
    });
    // Red fills to 5, then the next arrival opens a new team: Yellow, not Blue with Blue's 5 points.
    const late = await arrive(u, 7, 9);
    expect(await Promise.all(late.map(teamOf))).toEqual([0, 0, 2]);
    const yellow = (await board(u)).teams.find((g) => g.label === "Yellow")!;
    expect(yellow).toMatchObject({ members: 1, changes: 0, points: 0 });
    expect((await board(u)).teams.find((g) => g.label === "Blue")).toMatchObject({ members: 0, changes: 5, ec: 0 });
  });

  it("F28.4 removePoints restores the totals from before; a change from an ended class is refused; a missing id returns null", async () => {
    const t = setup();
    await openClass(t);
    const ss = await arrive(t, 1, 3);
    await quiz(t, ss, [ss[0]]);
    const before = await board(t);
    const id = await admin(t).mutation(api.live.groups.adjust, { channel: CH, team: 1, delta: 4 });
    expect((await board(t)).teams[0]).toMatchObject({ label: "Blue", points: 4, ec: 5 });
    expect(await admin(t).mutation(api.live.groups.removePoints, { id })).toBeNull();
    expect(await board(t)).toEqual(before);
    expect(await admin(t).query(api.live.groups.pointLog, { channel: CH })).toEqual([]);
    expect(await admin(t).mutation(api.live.groups.removePoints, { id })).toBeNull(); // already gone

    const last = await admin(t).mutation(api.live.groups.adjust, { channel: CH, team: 2, delta: -1 });
    vi.advanceTimersByTime(1_000);
    await admin(t).mutation(api.live.groups.endDay, { channel: CH });
    await expect(admin(t).mutation(api.live.groups.removePoints, { id: last })).rejects.toThrow("That class has ended.");
    await openClass(t);
    await expect(admin(t).mutation(api.live.groups.removePoints, { id: last })).rejects.toThrow("That class has ended.");
    expect(await t.run((ctx) => ctx.db.get("groupPoints", last))).not.toBeNull();
  });

  it("F28.5 roster and pointLog are host-only, this class only, names from checkins, and no result object has a user field", async () => {
    const t = setup();
    await openClass(t);
    const ss = await arrive(t, 1, 3);
    await expect(ss[0].query(api.live.groups.roster, { channel: CH })).rejects.toThrow("Only professors can do that.");
    await expect(ss[0].query(api.live.groups.pointLog, { channel: CH })).rejects.toThrow("Only professors can do that.");
    await quiz(t, ss, [ss[1]]);
    const ids = await checkinIds(t);
    await admin(t).mutation(api.live.groups.adjust, { channel: CH, checkin: ids["Sample student 1"], delta: 1, reason: "Good question" });
    vi.advanceTimersByTime(1_000);
    await admin(t).mutation(api.live.groups.adjust, { channel: CH, team: 1, delta: -1 });

    const roster = await admin(t).query(api.live.groups.roster, { channel: CH });
    expect(roster.map((r) => [r.name, r.email, r.team?.label, r.right, r.answered, r.changes, r.points, r.ec])).toEqual([
      ["Sample student 2", "student2@example.edu", "Blue", 1, 1, 0, 1, 0], // same points as student 1, more right answers
      ["Sample student 1", "student1@example.edu", "Red", 0, 1, 1, 1, 0],
      ["Sample student 3", "student3@example.edu", "Yellow", 0, 1, 0, 0, 0],
    ]);
    const log = await admin(t).query(api.live.groups.pointLog, { channel: CH });
    expect(log.map((c) => [c.delta, c.reason, c.team?.label, c.name])).toEqual([
      [-1, "Deduction", "Blue", null],
      [1, "Good question", "Red", "Sample student 1"],
    ]);
    for (const result of [roster, log]) {
      expect(keysDeep(result)).not.toContain("user");
      expect(JSON.stringify(result)).not.toContain(TYPED_ISSUER);
    }

    // The next class: last class's students and changes are gone from both lists.
    await admin(t).mutation(api.live.groups.endDay, { channel: CH });
    await openClass(t);
    await arrive(t, 4, 5);
    expect((await admin(t).query(api.live.groups.roster, { channel: CH })).map((r) => r.name)).toEqual(["Sample student 4", "Sample student 5"]);
    expect(await admin(t).query(api.live.groups.pointLog, { channel: CH })).toEqual([]);
  });
});

describe("F29 End day", () => {
  it("F29.1 endDay refused while a poll is open; saves one row per member with the leaderboard's rank, points and extra credit read just before; ends the class", async () => {
    const t = setup();
    const lecture = await openClass(t);
    const ss = await arrive(t, 1, 7);
    await t.mutation(internal.live.groups.lock, { channel: CH, force: true }); // Red: 1, 3, 5, 7; Blue: 2, 4, 6
    await quiz(t, ss, [ss[0], ss[2], ss[1], ss[3], ss[5]]);
    await admin(t).mutation(api.live.groups.adjust, { channel: CH, team: 0, delta: 1 });
    await admin(t).mutation(api.checkin.quiz.ask, { channel: CH, kind: "vote", question: "Pizza or tacos?", choices: ["Pizza", "Tacos"] });
    await expect(admin(t).mutation(api.live.groups.endDay, { channel: CH })).rejects.toThrow("End the open question first.");
    expect(await saved(t)).toEqual([]);
    expect(await classNow(t)).toBe(lecture);

    const poll = (await t.query(api.checkin.quiz.current, { channel: CH }))!.id;
    await admin(t).mutation(api.checkin.quiz.end, { poll });
    const before = await board(t);
    expect(before.teams.map((g) => [g.label, g.points, g.perStudent, g.rank, g.ec])).toEqual([
      ["Blue", 3, 1, 1, 5],
      ["Red", 3, 0.75, 2, 3],
    ]);
    expect(await admin(t).mutation(api.live.groups.endDay, { channel: CH })).toBe(
      "Blue came 1st with 3 points, 1.0 per student. Saved extra credit for 7 students. The next class starts from 0 points.",
    );
    const rows = await saved(t);
    expect(rows).toHaveLength(7);
    expect(new Set(rows.map((r) => r.user)).size).toBe(7);
    for (const r of rows) {
      const g = before.teams.find((x) => x.team === r.team)!;
      expect({ lecture: r.lecture, rank: r.rank, points: r.points, ec: r.ec }).toEqual({ lecture, rank: g.rank, points: g.points, ec: g.ec });
    }
    expect(await classNow(t)).toBeNull();
  });

  it("F29.2 a second endDay saves nothing; F29.3 after End day the board shows no teams and 0 points, and the next class deals fresh teams in check-in order", async () => {
    const t = setup();
    await openClass(t);
    const ss = await arrive(t, 1, 4); // Red: 1 and 4, Blue: 2, Yellow: 3
    await quiz(t, ss, [ss[0]]);
    expect(await admin(t).mutation(api.live.groups.endDay, { channel: CH })).toBe(
      "Red came 1st with 1 point, 0.5 per student. Saved extra credit for 2 students. The next class starts from 0 points.",
    );
    expect(await saved(t)).toHaveLength(4);
    expect(await admin(t).mutation(api.live.groups.endDay, { channel: CH })).toBe("No class is running.");
    expect(await saved(t)).toHaveLength(4);

    expect(await board(t)).toEqual({ questions: 0, teams: [] });
    expect(await t.query(api.live.groups.status, { channel: CH })).toEqual({ size: 4, locked: false, locksAt: null });
    expect(await teamOf(ss[0])).toBeNull();

    // The next class: the same four arrive in the opposite order and are dealt from Red again.
    await openClass(t);
    for (const n of [4, 3, 2, 1]) await checkInAgain(t, n);
    await ss[0].mutation(api.live.groups.join, { channel: CH });
    expect(await Promise.all([ss[3], ss[2], ss[1], ss[0]].map(teamOf))).toEqual([0, 1, 2, 0]);
    expect((await board(t)).teams.map((g) => [g.label, g.members, g.points])).toEqual([
      ["Red", 2, 0],
      ["Blue", 1, 0],
      ["Yellow", 1, 0],
    ]);
  });

  it("F29.4 with no ended quiz and no point change End day saves nothing, says so, and still ends the class", async () => {
    const t = setup();
    await openClass(t);
    await arrive(t, 1, 3);
    expect(await admin(t).mutation(api.live.groups.endDay, { channel: CH })).toBe("Class ended. No quiz ended, so there is no extra credit to save.");
    expect(await saved(t)).toEqual([]);
    expect(await classNow(t)).toBeNull();
    // Points changed but every team ended at 0 or below: the rows are saved with no extra credit.
    await openClass(t);
    for (const n of [1, 2]) await checkInAgain(t, n);
    await student(t, 1).mutation(api.live.groups.join, { channel: CH });
    await admin(t).mutation(api.live.groups.adjust, { channel: CH, team: 1, delta: -2 });
    expect(await admin(t).mutation(api.live.groups.endDay, { channel: CH })).toBe("Class ended. No team scored a point, so nobody gets extra credit.");
    expect((await saved(t)).map((r) => r.ec)).toEqual([0, 0]);
  });

  it("F29.5 results lists the saved extra credit per student with names from checkins, for one class or every class; roster's ec adds it up", async () => {
    const t = setup();
    const first = await openClass(t);
    const ss = await arrive(t, 1, 3);
    await quiz(t, ss, [ss[0]]);
    await admin(t).mutation(api.live.groups.endDay, { channel: CH });
    const second = await openClass(t);
    await checkInAgain(t, 1);
    await ss[0].mutation(api.live.groups.join, { channel: CH }); // Red
    await arrive(t, 4, 4); // Blue
    await admin(t).mutation(api.live.groups.adjust, { channel: CH, team: 0, delta: 1 });
    expect((await admin(t).query(api.live.groups.roster, { channel: CH })).map((r) => [r.name, r.ec])).toEqual([
      ["Sample student 1", 5],
      ["Sample student 4", 0],
    ]);
    await admin(t).mutation(api.live.groups.endDay, { channel: CH });

    const page = { numItems: 200, cursor: null };
    const res = await admin(t).query(api.live.groups.results, { channel: CH, paginationOpts: page });
    expect(res.isDone).toBe(true);
    const all = res.page;
    expect(all.map((r) => [r.lecture === first ? 1 : r.lecture === second ? 2 : 0, r.name, r.email, r.team.label, r.rank, r.points, r.ec])).toEqual([
      [1, "Sample student 1", "student1@example.edu", "Red", 1, 1, 5],
      [1, "Sample student 2", "student2@example.edu", "Blue", 2, 0, 0],
      [1, "Sample student 3", "student3@example.edu", "Yellow", 2, 0, 0],
      [2, "Sample student 1", "student1@example.edu", "Red", 1, 1, 5],
      [2, "Sample student 4", "student4@example.edu", "Blue", 2, 0, 0],
    ]);
    expect((await admin(t).query(api.live.groups.results, { channel: CH, lecture: first, paginationOpts: page })).page.map((r) => r.name)).toEqual(["Sample student 1", "Sample student 2", "Sample student 3"]);
    expect(keysDeep(all)).not.toContain("user");
  });
});

describe("F28.3/F28.5/F29.5 the Points tab is for professors and admins", () => {
  // A class with one student on Red, written straight to the tables.
  async function oneTeam(t: T) {
    await t.run(async (ctx) => {
      await ensureLecture(ctx, CH);
      await ctx.db.insert("checkins", { channel: CH, user: userOf(1), name: "Sample student 1", at: Date.now() });
      await ctx.db.insert("groups", { channel: CH, user: userOf(1), team: 0 });
    });
  }

  it("F28.3/F28.5/F29.5 authMatrix for roster, adjust, removePoints, pointLog, endDay and results: refused signed out, as a student, a scanner, a paired iPad and a typed sign-in on prod; allowed for a professor and an admin", async () => {
    await authMatrix(HOST_ONLY, (as) => as.query(api.live.groups.roster, { channel: CH }));
    await authMatrix(HOST_ONLY, async (as, t) => {
      await oneTeam(t);
      await as.mutation(api.live.groups.adjust, { channel: CH, team: 0, delta: 1 });
    });
    await authMatrix(HOST_ONLY, async (as, t) => {
      await oneTeam(t);
      const id = await t.run((ctx) => ctx.db.insert("groupPoints", { channel: CH, team: 0, delta: 1, reason: "Bonus", at: Date.now() }));
      await as.mutation(api.live.groups.removePoints, { id });
    });
    await authMatrix(HOST_ONLY, (as) => as.query(api.live.groups.pointLog, { channel: CH }));
    await authMatrix(HOST_ONLY, async (as, t) => {
      await oneTeam(t);
      await as.mutation(api.live.groups.endDay, { channel: CH });
    });
    await authMatrix(HOST_ONLY, (as) => as.query(api.live.groups.results, { channel: CH, paginationOpts: { numItems: 10, cursor: null } }));
  });
});
