// LX (F8): two classes on one channel, end to end, across every module, through the functions the
// pages call. Class 1 runs on Thursday 5 Nov 2026 (start 21:30 UTC, 5 minutes of grace): the deck,
// 4 scans with 1 late, the team lock, a quiz ended, a question, an I'm lost tap, a +1 and End day.
// Class 2 runs the next Thursday on the same channel ("gdg", src/blocks/deck.ts), opened by the
// deck's first press or the door's first scan. Then a class nobody ended (the 12-hour close), and a
// backend with rows from before classes existed (prod right after the deploy that added them).
//
// Ported from the audit's second-class probes (rt-8, live-frontend-8, host-frontend-7, F8,
// live-backend-6, core-backend-3, blocks-frontend-3), which found class 2 showing class 1's
// check-ins, open quiz, locked teams, questions, slides, late list and leaderboard. views() reads
// every screen at once, so each test compares what the room sees in one place.
//
// The clock: until(t, when) moves it the way time passes in class, so a job that comes due on the
// way (the team lock, the 12-hour close) runs then. vi.setSystemTime jumps instead, and moves every
// queued job along with the clock, so a job that was due in between never runs: that is how a
// missed 12-hour close looks.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { LECTURE_MS, lectureWindow } from "./lib";
import { admin, at, type Caller, checkIn, passCode, professor, profEnv, setup, slide, type T, TYPED_ISSUER, typed } from "./test.helpers";

const CH = "gdg";
const MIN = 60_000;
const HOUR = 60 * MIN;
const WEEK = 7 * 24 * HOUR;
const C1 = at(2026, 11, 5, 21, 30); // class 1 starts, Thursday
const C2 = C1 + WEEK; // class 2, the Thursday after

const QUIZ = "What stops a recursion?";
const QUESTION = "Why does the stack grow with each call?";
const VOTE = "How many classes are you taking?";
const END_LINE = "Red came 1st with 4 points, 1.0 per student. Saved extra credit for 4 students. The next class starts from 0 points.";

const student = (t: T, n: number) => typed(t, `Sample student ${n}`, `student${n}@example.edu`);
const name = (n: number) => `Sample student ${n}`;
const email = (n: number) => `student${n}@example.edu`;
const userOf = (n: number) => `${TYPED_ISSUER}|student${n}@example.edu`;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(C1 - HOUR);
  profEnv();
});
afterEach(() => {
  vi.useRealTimers();
});

// Moves the clock forward to `when`; jobs that come due on the way run and finish first.
async function until(t: T, when: number) {
  if (when < Date.now()) throw new Error("until: that time has passed");
  vi.advanceTimersByTime(when - Date.now());
  await t.finishInProgressScheduledFunctions();
}

// Every class on the channel, oldest first: when it opened and when it ended (undefined while open).
const classes = (t: T) =>
  t.run(async (ctx) =>
    (await ctx.db.query("lectures").withIndex("by_channel", (q) => q.eq("channel", CH)).collect()).map((l) => ({ startedAt: l.startedAt, endedAt: l.endedAt })),
  );
const openClass = async (t: T) => (await t.run((ctx) => lectureWindow(ctx, CH))).lecture;

// The extra credit saved for one class (live.groups.results, the professor's CSV): name, team,
// place, the team's points and the extra credit.
async function savedFor(prof: Caller, lecture: Id<"lectures">) {
  const { page } = await prof.query(api.live.groups.results, { channel: CH, lecture, paginationOpts: { numItems: 50, cursor: null } });
  return page.map((r) => `${r.name} ${r.team.label} ${r.rank} ${r.points} ${r.ec}`);
}
// What End day (or the 12-hour close) saves for class 1: Red came 1st with 4 points.
const SAVED_ONE = [1, 2, 3, 4].map((n) => `${name(n)} Red 1 4 5`);

// What every screen shows for the class running now, read the way the pages read it: the phones
// (#/live, #/portal, #/checkin/student, the iOS app) as `reader`, the stage and the late banner
// signed out, and the professor's pages (#/host, #/checkin/teacher, #/checkin/quiz) as `prof`.
// Lost counts are for slide 3 (index 2), questions for every slide and for slide 2 (index 1).
async function views(t: T, prof: Caller, reader: Caller) {
  const board = await t.query(api.live.groups.leaderboard, { channel: CH });
  return {
    deck: (await t.query(api.deck.current, { channel: CH }))?.title ?? null,
    slides: (await t.query(api.deck.slides, { channel: CH })).map((s) => s.title),
    count: await t.query(api.checkin.read.count, { channel: CH }),
    me: await reader.query(api.checkin.read.me, { channel: CH }),
    names: (await prof.query(api.checkin.read.names, { channel: CH })).map((r) => r.name),
    sheet: (await prof.query(api.checkin.attendance.sheet, { channel: CH })).map((r) => [r.name, r.lateMin]),
    late: (await t.query(api.checkin.attendance.lateFeed, { channel: CH })).map((r) => r.lateMin),
    start: await t.query(api.checkin.attendance.classStart, { channel: CH }),
    quiz: (await t.query(api.checkin.quiz.current, { channel: CH }))?.question ?? null,
    history: (await prof.query(api.checkin.quiz.history, { channel: CH })).map((p) => p.question),
    past: (await reader.query(api.live.past.past, { channel: CH })).map((p) => p.question),
    missing: (await prof.query(api.checkin.quiz.missing, { channel: CH }))?.question ?? null,
    questions: (await reader.query(api.live.questions.list, { channel: CH })).map((q) => q.text),
    slide2Questions: (await reader.query(api.live.questions.list, { channel: CH, index: 1 })).map((q) => q.text),
    hostQuestions: (await prof.query(api.live.questions.forHost, { channel: CH })).map((q) => q.text),
    lost: await t.query(api.live.read.lostCount, { channel: CH, index: 2 }),
    lostBySlide: await t.query(api.live.read.lostBySlide, { channel: CH }),
    lostMine: await reader.query(api.live.read.mine, { channel: CH, index: 2 }),
    status: await t.query(api.live.groups.status, { channel: CH }),
    quizzes: board.questions,
    teams: board.teams.map((g) => `${g.label} ${g.members} ${g.points}`),
    team: (await reader.query(api.live.groups.mine, { channel: CH }))?.label ?? null,
    roster: (await prof.query(api.live.groups.roster, { channel: CH })).map((r) => `${r.name} ${r.points}`),
    pointLog: (await prof.query(api.live.groups.pointLog, { channel: CH })).map((c) => c.reason),
  };
}

// Every screen with nothing from any class: between classes, and before anything happens in one.
const EMPTY = {
  deck: null,
  slides: [],
  count: 0,
  me: false,
  names: [],
  sheet: [],
  late: [],
  start: null,
  quiz: null,
  history: [],
  past: [],
  missing: null,
  questions: [],
  slide2Questions: [],
  hostQuestions: [],
  lost: 0,
  lostBySlide: [],
  lostMine: false,
  status: { size: 4, locked: false, locksAt: null },
  quizzes: 0,
  teams: [],
  team: null,
  roster: [],
  pointLog: [],
};

// Class 1's screens just before End day, read as student 2 (who answered wrong and is lost on
// slide 3).
const CLASS_ONE = {
  deck: "Base cases",
  slides: ["Recursion", "The call stack", "Base cases"],
  count: 4,
  me: true,
  names: [name(4), name(3), name(2), name(1)],
  sheet: [
    [name(1), null],
    [name(2), null],
    [name(3), null],
    [name(4), 10],
  ],
  late: [10],
  start: { startsAt: C1, graceMin: 5 },
  quiz: QUIZ,
  history: [QUIZ],
  past: [QUIZ],
  missing: QUIZ,
  questions: [QUESTION],
  slide2Questions: [QUESTION],
  hostQuestions: [QUESTION],
  lost: 1,
  lostBySlide: [{ index: 2, count: 1 }],
  lostMine: true,
  status: { size: 4, locked: true, locksAt: null },
  quizzes: 1,
  teams: ["Red 4 4"],
  team: "Red",
  roster: [`${name(1)} 1`, `${name(3)} 1`, `${name(4)} 1`, `${name(2)} 0`],
  pointLog: ["Helped a classmate"],
};

// Class 1, up to End day (the tests press it, or leave the class to the 12-hour close).
async function classOne(t: T) {
  const prof = await professor(t);
  const s = [1, 2, 3, 4].map((n) => student(t, n));
  // 21:20 The professor presents. The first press opens the class; slide 1 shows its 3rd press.
  await until(t, C1 - 10 * MIN);
  await slide(t, CH, 0, { title: "Recursion", beat: 2, lines: ["A function", "that calls", "itself"] });
  await until(t, C1 - 9 * MIN);
  await slide(t, CH, 1, { title: "The call stack" });
  await until(t, C1 - 8 * MIN);
  await slide(t, CH, 2, { title: "Base cases", lines: ["Every recursion needs one"] });
  // 21:23 The start: 21:30, late after 21:35. The teams lock at 21:35.
  await until(t, C1 - 7 * MIN);
  await prof.mutation(api.checkin.attendance.setClassStart, { channel: CH, startsAt: C1, graceMin: 5 });
  // 21:25 to 21:27 Students 1 to 3, on time: Red, Blue and Yellow until the lock.
  for (const [i, x] of s.slice(0, 3).entries()) {
    await until(t, C1 - (5 - i) * MIN);
    expect(await checkIn(t, x)).toMatchObject({ already: false });
  }
  // 21:35 The lock: 3 students make one team, Red.
  await until(t, C1 + 6 * MIN);
  // 21:40 Student 4 walks in 10 minutes late and joins Red.
  await until(t, C1 + 10 * MIN);
  expect(await checkIn(t, s[3])).toMatchObject({ already: false });
  // 21:45 A quiz on slide 3, ended at 21:47: students 1, 3 and 4 right, student 2 wrong.
  await until(t, C1 + 15 * MIN);
  const poll = await prof.mutation(api.checkin.quiz.ask, { channel: CH, kind: "quiz", question: QUIZ, choices: ["A base case", "Another call"], correct: 0 });
  for (const [i, x] of s.entries()) await x.mutation(api.checkin.quiz.answer, { poll, choice: i === 1 ? 1 : 0 });
  await until(t, C1 + 17 * MIN);
  await prof.mutation(api.checkin.quiz.end, { poll });
  // 21:48 Student 1 asks about slide 2. 21:49 Student 2 is lost on slide 3. 21:50 Red +1.
  await until(t, C1 + 18 * MIN);
  await s[0].mutation(api.live.questions.ask, { channel: CH, index: 1, text: QUESTION, anonymous: false });
  await until(t, C1 + 19 * MIN);
  expect(await s[1].mutation(api.live.lost.toggle, { channel: CH, index: 2 })).toBe(true);
  await until(t, C1 + 20 * MIN);
  await prof.mutation(api.live.groups.adjust, { channel: CH, team: 0, delta: 1, reason: "Helped a classmate" });
  const lecture = await openClass(t);
  if (!lecture) throw new Error("classOne: no class is open");
  return { prof, s, lecture };
}

// 22:30 End day (the Professor view's Points tab, or End class on #/checkin/teacher).
async function endDay(t: T, prof: Caller) {
  await until(t, C1 + HOUR);
  return await prof.mutation(api.live.groups.endDay, { channel: CH });
}

// Class 2: the deck's first press opens it at 21:20, the professor saves 21:30 again, and the door
// scans student 5 (new) at 21:25 and student 3 (back from class 1) at 21:26.
async function classTwo(t: T, prof: Caller) {
  await until(t, C2 - 10 * MIN);
  await slide(t, CH, 0, { title: "Sorting", lines: ["Put the cards in order"] });
  await until(t, C2 - 9 * MIN);
  await prof.mutation(api.checkin.attendance.setClassStart, { channel: CH, startsAt: C2, graceMin: 5 });
  const s5 = student(t, 5);
  const s3 = student(t, 3);
  await until(t, C2 - 5 * MIN);
  expect(await checkIn(t, s5)).toMatchObject({ already: false });
  await until(t, C2 - 4 * MIN);
  const back = await checkIn(t, s3);
  const lecture = await openClass(t);
  if (!lecture) throw new Error("classTwo: no class is open");
  return { s3, s5, back, lecture };
}

describe("F8 the next class on the same channel starts clean", () => {
  it("F8.1 End day, then the first deck press or scan opens a new class with no code change", async () => {
    const t = setup();
    const one = await classOne(t);
    expect(await endDay(t, one.prof)).toBe(END_LINE);
    expect(await classes(t)).toEqual([{ startedAt: C1 - 10 * MIN, endedAt: C1 + HOUR }]);
    expect(await openClass(t)).toBeNull();
    // A second press of End day finds no class to end.
    expect(await one.prof.mutation(api.live.groups.endDay, { channel: CH })).toBe("No class is running.");

    // The next Thursday the deck's first press, on the same channel, opens class 2.
    await until(t, C2 - 10 * MIN);
    await slide(t, CH, 0, { title: "Sorting" });
    expect(await classes(t)).toEqual([
      { startedAt: C1 - 10 * MIN, endedAt: C1 + HOUR },
      { startedAt: C2 - 10 * MIN, endedAt: undefined },
    ]);
    const two = await openClass(t);
    expect(two).not.toBeNull();
    expect(two).not.toBe(one.lecture);
    // The next press stays in class 2.
    await until(t, C2 - 9 * MIN);
    await slide(t, CH, 1, { title: "Merge sort" });
    expect(await openClass(t)).toBe(two);

    // End class on #/checkin/teacher (the same live.groups.endDay). Class 2 had no quiz.
    await until(t, C2 + HOUR);
    expect(await one.prof.mutation(api.live.groups.endDay, { channel: CH })).toBe("Class ended. No quiz ended, so there is no extra credit to save.");
    // The Thursday after, the door scans student 1 before the deck sends anything: the scan opens
    // class 3, and the deck's first press joins it.
    await until(t, C2 + WEEK - 5 * MIN);
    expect(await checkIn(t, one.s[0])).toMatchObject({ already: false });
    const all = await classes(t);
    expect(all).toHaveLength(3);
    expect(all[2]).toEqual({ startedAt: C2 + WEEK - 5 * MIN, endedAt: undefined });
    expect(await one.s[0].query(api.checkin.read.me, { channel: CH })).toBe(true);
    await until(t, C2 + WEEK - 4 * MIN);
    await slide(t, CH, 0, { title: "Graphs" });
    expect(await classes(t)).toHaveLength(3);
    expect(await t.query(api.deck.current, { channel: CH })).toMatchObject({ index: 0, title: "Graphs" });
  });

  it("F8.2 in the new class deck.current (until the first press), deck.slides, check-ins, the late list, quiz current/history/past, questions, lost counts, teams, the leaderboard and status (unlocked, locksAt set) all start empty", async () => {
    const t = setup();
    const one = await classOne(t);
    const s2 = one.s[1];
    // Class 1's screens show class 1, so the empty screens below come from the class window.
    expect(await views(t, one.prof, s2)).toEqual(CLASS_ONE);

    expect(await endDay(t, one.prof)).toBe(END_LINE);
    // Between classes every screen is empty: no slide, no check-ins, no quiz, no teams.
    expect(await views(t, one.prof, s2)).toEqual(EMPTY);

    // The next Thursday the door scans student 5 first: the scan opens class 2, and the deck
    // hasn't sent a slide in it yet. Only student 5's check-in and team show; student 2 isn't
    // checked in. The teams lock 5 minutes after that first check-in.
    await until(t, C2 - 10 * MIN);
    expect(await checkIn(t, student(t, 5))).toMatchObject({ already: false });
    expect(await views(t, one.prof, s2)).toEqual({
      ...EMPTY,
      count: 1,
      names: [name(5)],
      sheet: [[name(5), null]],
      status: { size: 4, locked: false, locksAt: C2 - 5 * MIN },
      teams: ["Red 1 0"],
      roster: [`${name(5)} 0`],
    });

    // The deck's first press in class 2, the same deck from the top: it is the live slide and the
    // only slide to page back to, at its first press. Class 1 showed that slide to its 3rd press,
    // and that version doesn't stay in place of this one.
    await until(t, C2 - 9 * MIN);
    await slide(t, CH, 0, { title: "Recursion", lines: ["A function"] });
    expect(await t.query(api.deck.current, { channel: CH })).toMatchObject({ index: 0, beat: 0, title: "Recursion", lines: ["A function"] });
    expect((await t.query(api.deck.slides, { channel: CH })).map(({ index, beat, lines }) => ({ index, beat, lines }))).toEqual([
      { index: 0, beat: 0, lines: ["A function"] },
    ]);
    // Student 2 can't tap I'm lost or post on class 2's slides before the door scans them.
    await expect(s2.mutation(api.live.lost.toggle, { channel: CH, index: 0 })).rejects.toThrow("Check in first.");
    await expect(s2.mutation(api.live.questions.ask, { channel: CH, index: 0, text: "Is this on the test?", anonymous: true })).rejects.toThrow("Check in first.");
    expect(await classes(t)).toHaveLength(2);
  });

  it("F8.3 a returning student checks in again (already: false) and gets a fresh team", async () => {
    const t = setup();
    const one = await classOne(t);
    const [s1, s2, s3] = one.s;
    expect(await s3.query(api.live.groups.mine, { channel: CH })).toMatchObject({ label: "Red" });
    await endDay(t, one.prof);

    // The next Thursday, before the door scans them, student 3's phone shows the pass (read.me
    // false) and no team.
    await until(t, C2 - 10 * MIN);
    expect(await s3.query(api.checkin.read.me, { channel: CH })).toBe(false);
    expect(await s3.query(api.live.groups.mine, { channel: CH })).toBeNull();

    const two = await classTwo(t, one.prof);
    expect(two.back).toEqual({ name: name(3), email: email(3), already: false });
    expect(await s3.query(api.checkin.read.me, { channel: CH })).toBe(true);
    // Dealt fresh in class 2's arrival order: student 5 first (Red), student 3 second (Blue), both
    // at 0 points. Class 1 ended with student 3 on Red at 4.
    expect(await s3.query(api.live.groups.mine, { channel: CH })).toEqual({ team: 1, color: "blue", label: "Blue" });
    expect(await two.s5.query(api.live.groups.mine, { channel: CH })).toMatchObject({ label: "Red" });
    expect((await t.query(api.live.groups.leaderboard, { channel: CH })).teams.map((g) => `${g.label} ${g.members} ${g.points}`)).toEqual(["Red 1 0", "Blue 1 0"]);
    // Scanned again in class 2, student 3 is already checked in.
    expect(await checkIn(t, s3)).toEqual({ name: name(3), email: email(3), already: true });

    // 21:35 Class 2's lock re-deals only class 2's students: 2 students make one team. Class 1's
    // 4 team rows stay as they were.
    await until(t, C2 + 6 * MIN);
    expect(await t.query(api.live.groups.status, { channel: CH })).toEqual({ size: 4, locked: true, locksAt: null });
    const teamRows = await t.run((ctx) => ctx.db.query("groups").withIndex("by_channel", (q) => q.eq("channel", CH)).collect());
    const dealt = (from: number, to: number) => teamRows.filter((g) => g._creationTime >= from && g._creationTime < to).map((g) => [g.user, g.team]);
    expect(dealt(0, C2 - 10 * MIN)).toEqual([1, 2, 3, 4].map((n) => [userOf(n), 0]));
    expect(dealt(C2 - 10 * MIN, Infinity)).toEqual([
      [userOf(5), 0],
      [userOf(3), 0],
    ]);

    // 21:50 Student 1, back from class 1, walks in 20 minutes late: a new check-in with class 2's
    // late minutes, on the late banner, and a place on class 2's team.
    await until(t, C2 + 20 * MIN);
    expect(await checkIn(t, s1)).toEqual({ name: name(1), email: email(1), already: false });
    expect(await s1.query(api.live.groups.mine, { channel: CH })).toMatchObject({ label: "Red" });
    expect((await one.prof.query(api.checkin.attendance.sheet, { channel: CH })).map((r) => [r.name, r.lateMin])).toEqual([
      [name(5), null],
      [name(3), null],
      [name(1), 20],
    ]);
    expect((await t.query(api.checkin.attendance.lateFeed, { channel: CH })).map((r) => r.lateMin)).toEqual([20]);
    // Each returning student has one check-in per class, and class 1's keeps its time.
    const checkinsOf = (n: number) =>
      t.run(async (ctx) => (await ctx.db.query("checkins").withIndex("by_channel_and_user", (q) => q.eq("channel", CH).eq("user", userOf(n))).collect()).map((c) => c.at));
    expect(await checkinsOf(3)).toEqual([C1 - 3 * MIN, C2 - 4 * MIN]);
    expect(await checkinsOf(1)).toEqual([C1 - 5 * MIN, C2 + 20 * MIN]);

    // Class 2's quiz: students 3 and 1 answer; student 2, checked in to class 1 only, can't.
    await until(t, C2 + 25 * MIN);
    const poll = await one.prof.mutation(api.checkin.quiz.ask, { channel: CH, kind: "quiz", question: "Which sort splits the list in half?", choices: ["Merge sort", "Bubble sort"], correct: 0 });
    await s3.mutation(api.checkin.quiz.answer, { poll, choice: 0 });
    await s1.mutation(api.checkin.quiz.answer, { poll, choice: 1 });
    await expect(s2.mutation(api.checkin.quiz.answer, { poll, choice: 0 })).rejects.toThrow("Check in first.");
    expect(await one.prof.query(api.checkin.quiz.stats, { poll })).toMatchObject({ answered: 2, checkedIn: 3 });
  });

  it("F8.4 the last class's sheet still returns its rows through attendance.sheet({ lecture })", async () => {
    const t = setup();
    const one = await classOne(t);
    await endDay(t, one.prof);
    const two = await classTwo(t, one.prof);

    // Class 1's attendance, as Past classes downloads it, with its own late minutes.
    expect(await one.prof.query(api.checkin.attendance.sheet, { channel: CH, lecture: one.lecture })).toEqual([
      { name: name(1), email: email(1), at: C1 - 5 * MIN, lateMin: null },
      { name: name(2), email: email(2), at: C1 - 4 * MIN, lateMin: null },
      { name: name(3), email: email(3), at: C1 - 3 * MIN, lateMin: null },
      { name: name(4), email: email(4), at: C1 + 10 * MIN, lateMin: 10 },
    ]);
    // This class's sheet (Download attendance) has class 2's two check-ins and nothing from class 1.
    expect(await one.prof.query(api.checkin.attendance.sheet, { channel: CH })).toEqual([
      { name: name(5), email: email(5), at: C2 - 5 * MIN, lateMin: null },
      { name: name(3), email: email(3), at: C2 - 4 * MIN, lateMin: null },
    ]);
    // Past classes on #/checkin/teacher: class 2 running, then class 1 with its start, its end and
    // its 4 check-ins.
    expect(await one.prof.query(api.checkin.attendance.lectures, { channel: CH })).toEqual([
      { lecture: two.lecture, open: true, startedAt: C2 - 10 * MIN, startsAt: C2, graceMin: 5, endedAt: null, count: 2 },
      { lecture: one.lecture, open: false, startedAt: C1 - 10 * MIN, startsAt: C1, graceMin: 5, endedAt: C1 + HOUR, count: 4 },
    ]);
    // The extra credit End day saved stays with class 1; class 2 has none yet.
    expect(await savedFor(one.prof, one.lecture)).toEqual(SAVED_ONE);
    expect(await savedFor(one.prof, two.lecture)).toEqual([]);
    // A past class's sheet is for professors and admins, on that class's own channel.
    await expect(two.s5.query(api.checkin.attendance.sheet, { channel: CH, lecture: one.lecture })).rejects.toThrow("Only professors can do that.");
    await expect(one.prof.query(api.checkin.attendance.sheet, { channel: "another-channel", lecture: one.lecture })).rejects.toThrow("That class isn't on this channel.");
  });

  it("F8 a class open for more than 12 h rolls over at the next scan; with no End day and no scan, the scheduled close ends it at 12 h, and next week a returning student's read.me is false so the pass page shows a QR", async () => {
    {
      // Nobody presses End day, a vote is left open, and the class's 12-hour close never ran (the
      // jump moves that job along with the clock).
      const t = setup();
      const one = await classOne(t);
      await until(t, C1 + 25 * MIN);
      const vote = await one.prof.mutation(api.checkin.quiz.ask, { channel: CH, kind: "vote", question: VOTE, choices: ["1 or 2", "3 or more"] });
      vi.setSystemTime(C1 + 13 * HOUR);
      expect(await classes(t)).toEqual([{ startedAt: C1 - 10 * MIN, endedAt: undefined }]);
      // The door's first scan ends class 1 where it should have closed, 12 h after its 21:30
      // start, saves its extra credit the way End day does, and opens a new class.
      expect(await checkIn(t, one.s[0])).toMatchObject({ already: false });
      expect(await classes(t)).toEqual([
        { startedAt: C1 - 10 * MIN, endedAt: C1 + LECTURE_MS },
        { startedAt: C1 + 13 * HOUR, endedAt: undefined },
      ]);
      expect(await savedFor(one.prof, one.lecture)).toEqual(SAVED_ONE);
      // The new class shows only that scan. Class 1's open vote is gone from every screen and
      // can't be answered.
      expect(await views(t, one.prof, one.s[1])).toEqual({
        ...EMPTY,
        count: 1,
        names: [name(1)],
        sheet: [[name(1), null]],
        status: { size: 4, locked: false, locksAt: C1 + 13 * HOUR + 5 * MIN },
        teams: ["Red 1 0"],
        roster: [`${name(1)} 0`],
      });
      await expect(one.s[0].mutation(api.checkin.quiz.answer, { poll: vote, choice: 0 })).rejects.toThrow("That question is gone.");
    }
    // A new backend on the same Thursday; the first one's queued jobs are dropped with its clock.
    vi.clearAllTimers();
    vi.setSystemTime(C1 - HOUR);
    {
      // Nobody presses End day and nobody scans: the scheduled close ends class 1 12 h after its
      // 21:30 start (its first run, 12 h after the 21:20 press, waits for that).
      const t = setup();
      const one = await classOne(t);
      const s1 = one.s[0];
      await until(t, C1 + LECTURE_MS - MIN);
      expect(await openClass(t)).toBe(one.lecture);
      expect(await s1.query(api.checkin.read.me, { channel: CH })).toBe(true);
      await until(t, C1 + LECTURE_MS);
      expect(await classes(t)).toEqual([{ startedAt: C1 - 10 * MIN, endedAt: C1 + LECTURE_MS }]);
      expect(await savedFor(one.prof, one.lecture)).toEqual(SAVED_ONE);
      // The next week, before any scan, press or quiz: every screen is empty, and student 1's pass
      // page shows a QR again (read.me false), with a code the door scans into the next class.
      await until(t, C2 - 10 * MIN);
      expect(await views(t, one.prof, s1)).toEqual(EMPTY);
      const code = await passCode(s1);
      expect(await admin(t).mutation(api.checkin.pass.scan, { channel: CH, code: `RCC-${code}` })).toEqual({ name: name(1), email: email(1), already: false });
      expect(await s1.query(api.checkin.read.me, { channel: CH })).toBe(true);
      expect(await classes(t)).toHaveLength(2);
    }
  });

  it("F8 legacy rows with no lectures read as today until the first class opens, then drop out of current views", async () => {
    const t = setup();
    const prof = await professor(t);
    const [s1, s2, s3] = [1, 2, 3].map((n) => student(t, n));
    // 21:45 on Thursday 5 Nov, the way prod looks right after the deploy that added classes:
    // today's rows from before classes existed, in the shapes the 10-29 code wrote (late minutes
    // stored at the scan), and no lectures row. Student 1 came on time, student 2 ten minutes late.
    await until(t, C1 + 15 * MIN);
    const vote = await t.run(async (ctx) => {
      await ctx.db.insert("classStarts", { channel: CH, startsAt: C1, graceMin: 5 });
      for (const [index, title] of ["Recursion", "The call stack", "Base cases"].entries())
        await ctx.db.insert("deckSlides", { channel: CH, index, beat: 0, title, lines: [], at: C1 - (10 - index) * MIN });
      await ctx.db.insert("deckChannels", { channel: CH, index: 2, beat: 0, count: 10, title: "Base cases", lines: [], at: C1 - 8 * MIN });
      await ctx.db.insert("checkins", { channel: CH, user: userOf(1), name: name(1), email: email(1), at: C1 - 5 * MIN });
      await ctx.db.insert("checkins", { channel: CH, user: userOf(2), name: name(2), email: email(2), at: C1 + 10 * MIN, lateMin: 10 });
      for (const n of [1, 2]) await ctx.db.insert("groups", { channel: CH, user: userOf(n), team: 0 });
      await ctx.db.insert("groupSettings", { channel: CH, size: 4, lockedAt: C1 + 5 * MIN });
      const quiz = await ctx.db.insert("polls", { channel: CH, question: QUIZ, choices: ["A base case", "Another call"], correct: 0, open: false, at: C1 + 11 * MIN, closedAt: C1 + 13 * MIN });
      await ctx.db.insert("pollAnswers", { poll: quiz, user: userOf(1), choice: 0, at: C1 + 12 * MIN });
      await ctx.db.insert("questions", { channel: CH, index: 1, user: userOf(1), name: name(1), text: QUESTION, votes: 0, at: C1 + 14 * MIN });
      await ctx.db.insert("lost", { channel: CH, index: 2, user: userOf(2), at: C1 + 14 * MIN });
      // A vote nobody ended, like the 10-29 one still open on 10-30 (rt-8).
      return await ctx.db.insert("polls", { channel: CH, question: VOTE, choices: ["1 or 2", "3 or more"], kind: "vote", open: true, at: C1 + 15 * MIN });
    });

    // Until a class opens, they are today's class, read as student 2.
    expect(await views(t, prof, s2)).toEqual({
      deck: "Base cases",
      slides: ["Recursion", "The call stack", "Base cases"],
      count: 2,
      me: true,
      names: [name(2), name(1)],
      sheet: [
        [name(1), null],
        [name(2), 10],
      ],
      late: [10],
      start: { startsAt: C1, graceMin: 5 },
      quiz: VOTE,
      history: [VOTE, QUIZ],
      past: [QUIZ],
      missing: QUIZ,
      questions: [QUESTION],
      slide2Questions: [QUESTION],
      hostQuestions: [QUESTION],
      lost: 1,
      lostBySlide: [{ index: 2, count: 1 }],
      lostMine: true,
      status: { size: 4, locked: true, locksAt: null },
      quizzes: 1,
      teams: ["Red 2 1"],
      team: "Red",
      roster: [`${name(1)} 1`, `${name(2)} 0`],
      pointLog: [],
    });

    // 21:50 The first class opens: the door scans student 3. Every older row drops out of the
    // screens; only student 3's check-in and team show.
    await until(t, C1 + 20 * MIN);
    expect(await checkIn(t, s3)).toMatchObject({ already: false });
    expect(await views(t, prof, s2)).toEqual({
      ...EMPTY,
      count: 1,
      names: [name(3)],
      sheet: [[name(3), null]],
      status: { size: 4, locked: false, locksAt: C1 + 25 * MIN },
      teams: ["Red 1 0"],
      roster: [`${name(3)} 0`],
    });
    // The open vote can't be answered, and student 1 checks in again, to this class.
    await expect(s1.mutation(api.checkin.quiz.answer, { poll: vote, choice: 0 })).rejects.toThrow("That question is gone.");
    await until(t, C1 + 21 * MIN);
    expect(await checkIn(t, s1)).toMatchObject({ already: false });
    // The older rows stay as the attendance from before the first class ("Earlier" in Past
    // classes), with the late minutes stored for them.
    expect((await prof.query(api.checkin.attendance.sheet, { channel: CH, lecture: "earlier" })).map((r) => [r.name, r.lateMin])).toEqual([
      [name(1), null],
      [name(2), 10],
    ]);
    expect((await prof.query(api.checkin.attendance.lectures, { channel: CH })).map((c) => [c.lecture === "earlier" ? "earlier" : "class", c.open, c.count])).toEqual([
      ["class", true, 2],
      ["earlier", false, 2],
    ]);
  });
});

// LX-convex-1: End class Monday evening, then saving Tuesday's start opens Tuesday's class at once
// (lib.ensureLecture), and lectureClosesAt keeps it open through Tuesday's class. A scan made that
// evening would land in Tuesday's class as on time, so Tuesday's pass page would show no QR and
// the sheet would list a student who may never come. Scans open 45 minutes before the saved start.
describe("LX-convex-1 a class opened by saving the next morning's start takes no scans until 45 minutes before it", () => {
  const MON_6PM = at(2026, 11, 9, 18, 0);
  const TUE_9AM = at(2026, 11, 10, 9, 0);
  const EARLY = "Scanning opens 45 minutes before class starts.";

  it("Monday 21:35 and Tuesday 8:14 are refused; 8:15 checks in to Tuesday's class, on time", async () => {
    const t = setup();
    const prof = await professor(t);
    const setStart = (startsAt: number) => prof.mutation(api.checkin.attendance.setClassStart, { channel: CH, startsAt, graceMin: 5 });
    vi.setSystemTime(MON_6PM - 10 * MIN);
    await setStart(MON_6PM);
    vi.setSystemTime(MON_6PM + 20 * MIN);
    await checkIn(t, student(t, 1));
    // 21:30: End class, then Tuesday 9:00 saved; that opens Tuesday's class now.
    vi.setSystemTime(MON_6PM + 3.5 * HOUR);
    await prof.mutation(api.live.groups.endDay, { channel: CH });
    await setStart(TUE_9AM);
    const tuesday = await openClass(t);
    expect(tuesday).not.toBeNull();
    // 21:35: a straggler's pass is scanned. Refused, and nothing changes.
    vi.setSystemTime(MON_6PM + 3.5 * HOUR + 5 * MIN);
    const s2 = student(t, 2);
    await expect(checkIn(t, s2)).rejects.toThrow(EARLY);
    expect(await s2.query(api.checkin.read.me, { channel: CH })).toBe(false);
    expect(await prof.query(api.checkin.attendance.sheet, { channel: CH })).toEqual([]);
    expect(await openClass(t)).toBe(tuesday);
    // Tuesday 8:14 is still too early; 8:15 checks in to Tuesday's class, on time.
    vi.setSystemTime(TUE_9AM - 46 * MIN);
    await expect(checkIn(t, s2)).rejects.toThrow(EARLY);
    vi.setSystemTime(TUE_9AM - 45 * MIN);
    expect(await checkIn(t, s2)).toMatchObject({ name: name(2), already: false });
    expect(await openClass(t)).toBe(tuesday);
    expect((await prof.query(api.checkin.attendance.sheet, { channel: CH })).map((r) => [r.name, r.lateMin])).toEqual([[name(2), null]]);
    expect(await s2.query(api.checkin.read.me, { channel: CH })).toBe(true);
  });
});
