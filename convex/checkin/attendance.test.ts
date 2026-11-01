// checkin/attendance: the professor's attendance sheet for each class, past classes, removing a
// wrong check-in, the class start time and the team lock it queues, and the late banner's feed
// with each student's opt-out. Late minutes are worked out when read, from each check-in's time
// and its class's start plus grace.
//
// A class opens here the way the professor's actions open one (lib.ensureLecture: saving a start
// time, a deck press, a scan) and ends the way End day ends it (lib.endLecture). A student who
// comes back in a later class gets a second checkins row written straight to the table, the way
// pass.scan writes one per class, so these tests don't depend on how pass.scan finds last class's
// row.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { endLecture, ensureLecture } from "../lib";
import {
  ADMIN_EMAIL,
  admin,
  at,
  authMatrix,
  checkIn,
  google,
  HOST_ONLY,
  profEnv,
  professor,
  setup,
  type T,
  typed,
  TYPED_ISSUER,
} from "../test.helpers";

const CH = "gdg";
const T0 = at(2026, 11, 5, 21, 30); // class starts
const MIN = 60_000;
const HOUR = 60 * MIN;
const WEEK = 7 * 24 * HOUR;
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

const setStart = (t: T, graceMin: number, startsAt = T0) =>
  admin(t).mutation(api.checkin.attendance.setClassStart, { channel: CH, startsAt, graceMin });
const sheet = (t: T, lecture?: Id<"lectures"> | "earlier") =>
  admin(t).query(api.checkin.attendance.sheet, lecture === undefined ? { channel: CH } : { channel: CH, lecture });
const lectures = (t: T) => admin(t).query(api.checkin.attendance.lectures, { channel: CH });
const classStart = (t: T) => t.query(api.checkin.attendance.classStart, { channel: CH });
const feed = (t: T) => t.query(api.checkin.attendance.lateFeed, { channel: CH });
const count = (t: T) => t.query(api.checkin.read.count, { channel: CH });
const openClass = (t: T, channel = CH) => t.run((ctx) => ensureLecture(ctx, channel));
const endClass = (t: T) => t.run((ctx) => endLecture(ctx, CH));

// Student n checks in now under `name`, written straight to the table (see the top of the file).
// `lateMin` is for rows from before classes existed, which stored it at scan time.
const arrive = (t: T, n: number, name = `Sample student ${n}`, lateMin?: number) =>
  t.run((ctx) => ctx.db.insert("checkins", { channel: CH, user: userOf(n), name, email: `student${n}@example.edu`, at: Date.now(), lateMin }));

// The team lock jobs still waiting to run: what each was queued with, and when it runs.
const lockJobs = (t: T) =>
  t.run(async (ctx) =>
    (await ctx.db.system.query("_scheduled_functions").take(50))
      .filter((j) => j.name.includes("live/groups") && j.state.kind === "pending")
      .map((j) => ({ args: j.args[0], at: j.scheduledTime })),
  );

describe("F14 attendance for the professor", () => {
  it("F14.1 one checkins row per student with name, email and time", async () => {
    const t = setup();
    const a = student(t, 1);
    await checkIn(t, a);
    vi.setSystemTime(T0 - 5 * MIN);
    await checkIn(t, student(t, 2));
    await checkIn(t, a); // scanned twice: still one row
    expect(await sheet(t)).toEqual([
      { name: "Sample student 1", email: "student1@example.edu", at: T0 - 10 * MIN, lateMin: null },
      { name: "Sample student 2", email: "student2@example.edu", at: T0 - 5 * MIN, lateMin: null },
    ]);
  });

  it("F14.4 sheet is for professors and admins only", async () => {
    const t = setup();
    await checkIn(t, student(t, 1));
    await expect(t.query(api.checkin.attendance.sheet, { channel: CH })).rejects.toThrow("Sign in first.");
    await expect(student(t, 1).query(api.checkin.attendance.sheet, { channel: CH })).rejects.toThrow("Only professors can do that.");
    await expect(typed(t, "Sample admin", ADMIN_EMAIL).query(api.checkin.attendance.sheet, { channel: CH })).rejects.toThrow("Only professors can do that.");
    await expect(google(t, "Sample student 2", "student2@example.edu").query(api.checkin.attendance.sheet, { channel: CH })).rejects.toThrow(
      "Only professors can do that.",
    );
    expect(await (await professor(t)).query(api.checkin.attendance.sheet, { channel: CH })).toHaveLength(1);
    expect(await sheet(t)).toHaveLength(1);
  });

  it("F14.4 authMatrix for sheet, lectures and removeCheckin: refused signed out, as a Google student, an unverified Google admin, a typed sign-in on prod, a scanner and a door iPad; allowed for professors and admins", async () => {
    await authMatrix(HOST_ONLY, (as) => as.query(api.checkin.attendance.sheet, { channel: CH }));
    await authMatrix(HOST_ONLY, (as) => as.query(api.checkin.attendance.lectures, { channel: CH }));
    await authMatrix(HOST_ONLY, async (as, t) => {
      await checkIn(t, student(t, 1));
      const [row] = await admin(t).query(api.checkin.read.names, { channel: CH });
      await as.mutation(api.checkin.attendance.removeCheckin, { checkin: row.id });
    });
  });
});

describe("F8 attendance by class", () => {
  it("F8.4/F14.6 sheet({ lecture }) returns that class's rows; the current sheet has only this class; lectures lists both", async () => {
    const t = setup();
    // Class 1: the professor saves the start, which opens the class; two scans; End day.
    await setStart(t, 5);
    const [first] = await lectures(t);
    expect(first).toMatchObject({ open: true, count: 0 }); // the class running now, before its first check-in
    vi.setSystemTime(T0 - 5 * MIN);
    await checkIn(t, student(t, 1));
    vi.setSystemTime(T0 + 12 * MIN);
    await checkIn(t, student(t, 2));
    vi.setSystemTime(T0 + 2 * HOUR);
    await endClass(t);
    // A class nobody checked in to (a deck rehearsal): left out of the list.
    vi.setSystemTime(T0 + 3 * HOUR);
    await openClass(t);
    vi.setSystemTime(T0 + 4 * HOUR);
    await endClass(t);
    // Class 2 a week later: a new student scans, and student 1 comes back 20 minutes late.
    vi.setSystemTime(T0 + WEEK - 10 * MIN);
    await setStart(t, 5, T0 + WEEK);
    vi.setSystemTime(T0 + WEEK + MIN);
    await checkIn(t, student(t, 3));
    vi.setSystemTime(T0 + WEEK + 20 * MIN);
    await arrive(t, 1);

    expect(await sheet(t)).toEqual([
      { name: "Sample student 3", email: "student3@example.edu", at: T0 + WEEK + MIN, lateMin: null },
      { name: "Sample student 1", email: "student1@example.edu", at: T0 + WEEK + 20 * MIN, lateMin: 20 },
    ]);
    expect(await sheet(t, first.lecture)).toEqual([
      { name: "Sample student 1", email: "student1@example.edu", at: T0 - 5 * MIN, lateMin: null },
      { name: "Sample student 2", email: "student2@example.edu", at: T0 + 12 * MIN, lateMin: 12 },
    ]);
    const list = await lectures(t);
    expect(list).toEqual([
      { lecture: expect.any(String), open: true, startedAt: T0 + WEEK - 10 * MIN, startsAt: T0 + WEEK, graceMin: 5, endedAt: null, count: 2 },
      { lecture: first.lecture, open: false, startedAt: T0 - 10 * MIN, startsAt: T0, graceMin: 5, endedAt: T0 + 2 * HOUR, count: 2 },
    ]);
    expect(await sheet(t, list[0].lecture)).toEqual(await sheet(t));
    expect(await count(t)).toBe(2);

    // A class on another channel isn't one of this channel's.
    const other = await openClass(t, "another-channel");
    await expect(sheet(t, other._id)).rejects.toThrow("That class isn't on this channel.");
  });

  it("F8.4 check-ins from before the first class keep the minutes late stored with them: this class until a class opens, then 'earlier' after the classes", async () => {
    const t = setup();
    // Rows the old pass.scan wrote before classes existed, with the lateMin it stored.
    vi.setSystemTime(at(2026, 10, 29, 22, 20));
    await arrive(t, 1, "Sample student 1", 5);
    vi.setSystemTime(at(2026, 10, 30, 22, 0));
    await arrive(t, 2);
    const old = [
      ["Sample student 1", 5],
      ["Sample student 2", null],
    ];
    const earlier = { lecture: "earlier", open: false, startedAt: at(2026, 10, 29, 22, 20), startsAt: null, graceMin: 0, endedAt: at(2026, 10, 30, 22, 0), count: 2 };
    expect((await sheet(t)).map((r) => [r.name, r.lateMin])).toEqual(old);
    expect((await sheet(t, "earlier")).map((r) => [r.name, r.lateMin])).toEqual(old);
    expect(await lectures(t)).toEqual([earlier]);

    // The first class opens: it starts empty, and the old rows are "earlier".
    vi.setSystemTime(T0 - 10 * MIN);
    await setStart(t, 0);
    expect(await sheet(t)).toEqual([]);
    expect(await count(t)).toBe(0);
    expect((await sheet(t, "earlier")).map((r) => [r.name, r.lateMin])).toEqual(old);
    const list = await lectures(t);
    expect(list.map((c) => [c.lecture === "earlier" ? "earlier" : "class", c.open, c.count])).toEqual([
      ["class", true, 0],
      ["earlier", false, 2],
    ]);
    expect(list[1]).toEqual(earlier);
  });
});

describe("F15 late from the class start plus grace minutes", () => {
  it("F15.2 setClassStart refuses a NaN start, a start 13 h away, and grace 2.5, -1 and 61", async () => {
    const t = setup();
    const now = Date.now();
    for (const startsAt of [NaN, Infinity, -Infinity, now + 13 * HOUR, now - 13 * HOUR])
      await expect(setStart(t, 5, startsAt)).rejects.toThrow("Pick a time within 12 hours of now.");
    for (const graceMin of [2.5, NaN, Infinity]) await expect(setStart(t, graceMin)).rejects.toThrow("Grace has to be a whole number of minutes.");
    for (const graceMin of [-1, 61]) await expect(setStart(t, graceMin)).rejects.toThrow("Grace has to be 0 to 60 minutes.");
    // Nothing was saved, and no class opened.
    expect(await classStart(t)).toBeNull();
    expect(await lectures(t)).toEqual([]);
    // 12 hours either way, and grace 0 and 60, are saved.
    await setStart(t, 0, now + 12 * HOUR);
    expect(await classStart(t)).toEqual({ startsAt: now + 12 * HOUR, graceMin: 0 });
    await setStart(t, 60, now - 12 * HOUR);
    expect(await classStart(t)).toEqual({ startsAt: now - 12 * HOUR, graceMin: 60 });
  });

  it("F15.3 start 12 min ago with 5 min grace makes the sheet show 12 for that scan, start + 4 min shows none", async () => {
    const t = setup();
    await setStart(t, 5);
    vi.setSystemTime(T0 + 4 * MIN);
    await checkIn(t, student(t, 1));
    vi.setSystemTime(T0 + 12 * MIN);
    await checkIn(t, student(t, 2));
    const rows = await sheet(t);
    expect(rows.map((r) => [r.name, r.lateMin])).toEqual([
      ["Sample student 1", null],
      ["Sample student 2", 12],
    ]);
    expect((await feed(t)).map((f) => f.lateMin)).toEqual([12]);
  });

  it("F15.4 no start means nobody is late", async () => {
    const t = setup();
    vi.setSystemTime(T0 + 3 * 60 * MIN);
    await checkIn(t, student(t, 1));
    expect(await classStart(t)).toBeNull();
    expect((await sheet(t))[0].lateMin).toBeNull();
    expect(await feed(t)).toEqual([]);
  });

  it("F15.5 a start saved in an earlier class doesn't make today's arrivals late", async () => {
    const t = setup();
    await setStart(t, 5);
    expect(await classStart(t)).toEqual({ startsAt: T0, graceMin: 5 });
    vi.setSystemTime(T0 + 2 * HOUR);
    await endClass(t);
    expect(await classStart(t)).toBeNull();
    // A week later a deck press opens class 2, and nobody saves a start time.
    vi.setSystemTime(T0 + WEEK - 30 * MIN);
    await openClass(t);
    expect(await classStart(t)).toBeNull();
    vi.setSystemTime(T0 + WEEK - 20 * MIN); // 10 minutes before last week's start time of day
    await checkIn(t, student(t, 1));
    vi.setSystemTime(T0 + WEEK + 40 * MIN);
    await checkIn(t, student(t, 2));
    expect((await sheet(t)).map((r) => r.lateMin)).toEqual([null, null]);
    expect(await feed(t)).toEqual([]);
  });

  it("rt-9 a start saved after arrivals marks them late in the sheet; the late banner never announces them (CKA-risk-1)", async () => {
    const t = setup();
    // A deck press opens the class before anyone saves a start time.
    await openClass(t);
    vi.setSystemTime(T0 + 2 * MIN);
    await checkIn(t, student(t, 1));
    vi.setSystemTime(T0 + 5 * MIN);
    await checkIn(t, student(t, 2));
    expect((await sheet(t)).map((r) => r.lateMin)).toEqual([null, null]);
    expect(await feed(t)).toEqual([]);
    // The professor then says class started at T0 with no grace.
    vi.setSystemTime(T0 + 6 * MIN);
    await setStart(t, 0);
    expect((await sheet(t)).map((r) => r.lateMin)).toEqual([2, 5]);
    // They weren't late when they were scanned, so the banner doesn't announce them now.
    expect(await feed(t)).toEqual([]);
    // A corrected start moves them again.
    await setStart(t, 0, T0 + 3 * MIN);
    expect((await sheet(t)).map((r) => r.lateMin)).toEqual([null, 2]);
  });
});

describe("F24 the team lock follows the class start", () => {
  it("live-backend-13 moving the start earlier before the lock reschedules the lock (fake timers)", async () => {
    const t = setup();
    // 15 minutes before T0 the professor says class starts at T0 + 10 minutes: teams lock at T0 + 15.
    vi.setSystemTime(T0 - 15 * MIN);
    await setStart(t, 5, T0 + 10 * MIN);
    vi.advanceTimersByTime(5 * MIN);
    for (let n = 1; n <= 7; n++) {
      await checkIn(t, student(t, n));
      vi.advanceTimersByTime(1_000);
    }
    // At T0 - 6 minutes the start moves to T0, so teams lock at T0 + 5.
    vi.advanceTimersByTime(T0 - 6 * MIN - Date.now());
    await setStart(t, 5, T0);
    vi.advanceTimersByTime(T0 + 5 * MIN + 1_000 - Date.now());
    await t.finishInProgressScheduledFunctions();
    expect(await t.query(api.live.groups.status, { channel: CH })).toMatchObject({ locked: true });
  });

  it("live-backend-13 the lock job setClassStart queues carries the open lecture; once this class's teams lock, saving the start queues none", async () => {
    const t = setup();
    await setStart(t, 5);
    const [open] = await lectures(t);
    expect(await lockJobs(t)).toEqual([{ args: { channel: CH, lecture: open.lecture }, at: T0 + 5 * MIN }]);
    await checkIn(t, student(t, 1));
    vi.advanceTimersByTime(T0 + 6 * MIN - Date.now());
    await t.finishInProgressScheduledFunctions();
    expect(await t.query(api.live.groups.status, { channel: CH })).toMatchObject({ locked: true });
    expect(await lockJobs(t)).toEqual([]);
    await setStart(t, 10);
    expect(await lockJobs(t)).toEqual([]);
  });
});

describe("removing a wrong check-in", () => {
  const remove = api.checkin.attendance.removeCheckin;
  const names = (t: T) => admin(t).query(api.checkin.read.names, { channel: CH });

  it("removeCheckin is host-only, removes one row, and the student can be scanned again", async () => {
    const t = setup();
    await setStart(t, 5);
    const [a, b] = [student(t, 1), student(t, 2)];
    await checkIn(t, a);
    vi.advanceTimersByTime(MIN);
    await checkIn(t, b);
    const [rowB, rowA] = await names(t);
    expect([rowA.name, rowB.name]).toEqual(["Sample student 1", "Sample student 2"]);

    await expect(t.mutation(remove, { checkin: rowA.id })).rejects.toThrow("Sign in first.");
    await expect(a.mutation(remove, { checkin: rowA.id })).rejects.toThrow("Only professors can do that.");
    expect(await count(t)).toBe(2);

    expect(await (await professor(t)).mutation(remove, { checkin: rowA.id })).toBeNull();
    expect(await names(t)).toEqual([rowB]);
    expect(await count(t)).toBe(1);
    expect(await a.query(api.checkin.read.me, { channel: CH })).toBe(false);
    expect(await b.query(api.checkin.read.me, { channel: CH })).toBe(true);
    // A second press changes nothing.
    expect(await admin(t).mutation(remove, { checkin: rowA.id })).toBeNull();
    expect(await count(t)).toBe(1);

    vi.advanceTimersByTime(MIN);
    expect((await checkIn(t, a)).already).toBe(false);
    expect(await count(t)).toBe(2);
    expect(await a.query(api.checkin.read.me, { channel: CH })).toBe(true);
  });

  it("removeCheckin refuses a check-in from an earlier class: that class's attendance keeps it", async () => {
    const t = setup();
    await setStart(t, 5);
    await checkIn(t, student(t, 1));
    const [row] = await names(t);
    const [first] = await lectures(t);
    vi.setSystemTime(T0 + 2 * HOUR);
    await endClass(t);
    await expect(admin(t).mutation(remove, { checkin: row.id })).rejects.toThrow("That check-in is from an earlier class.");
    vi.setSystemTime(T0 + WEEK);
    await openClass(t);
    await expect(admin(t).mutation(remove, { checkin: row.id })).rejects.toThrow("That check-in is from an earlier class.");
    expect(await sheet(t, first.lecture)).toHaveLength(1);
  });
});

describe("F16 the late banner's feed", () => {
  // Students 1 to n check in late, one a minute, from 10 minutes after the start. Set the start first.
  async function lateArrivals(t: T, n: number) {
    const out = [];
    for (let i = 1; i <= n; i++) {
      vi.setSystemTime(T0 + (9 + i) * MIN);
      const s = student(t, i);
      await checkIn(t, s);
      out.push(s);
    }
    return out;
  }

  it("F16.3 lateFeed returns first name, minutes late and time only, newest first, at most 5", async () => {
    const t = setup();
    await setStart(t, 5);
    vi.setSystemTime(T0 + MIN);
    await checkIn(t, student(t, 99)); // on time: never in the feed
    await lateArrivals(t, 6);
    const out = await feed(t);
    // Six arrivals, 10 to 15 minutes late: the newest five, newest first.
    expect(out.map((f) => f.lateMin)).toEqual([15, 14, 13, 12, 11]);
    expect(out.map((f) => f.at)).toEqual([15, 14, 13, 12, 11].map((m) => T0 + m * MIN));
    for (const f of out) {
      expect(Object.keys(f).sort()).toEqual(["at", "first", "id", "lateMin"]);
      expect(f.first).toBe("Sample");
    }
    expect(JSON.stringify(out)).not.toMatch(/student|@|example\.edu/);
    expect(JSON.stringify(out)).not.toContain(TYPED_ISSUER);
  });

  it("F16.3 lateFeed: this class only, first name only, never contains '@', newest first, at most 5, opt-out skipped", async () => {
    const t = setup();
    // Class 1: one late arrival, in the feed until End day.
    await setStart(t, 0);
    vi.setSystemTime(T0 + 20 * MIN);
    await arrive(t, 1, "Old Sample");
    expect((await feed(t)).map((f) => f.first)).toEqual(["Old"]);
    vi.setSystemTime(T0 + 2 * HOUR);
    await endClass(t);
    expect(await feed(t)).toEqual([]);

    // Class 2 a week later, 5 minutes of grace: one on time, then seven late, one a minute.
    vi.setSystemTime(T0 + WEEK - 10 * MIN);
    await setStart(t, 5, T0 + WEEK);
    vi.setSystemTime(T0 + WEEK + 2 * MIN);
    await arrive(t, 2, "On Time");
    const late = ["Ana Sample", "jane.doe@example.edu", "Bo@b Sample", "\u202EAlex Sample", "  Mia   Sample ", "Zoe Sample", "Li Sample"];
    for (const [i, name] of late.entries()) {
      vi.setSystemTime(T0 + WEEK + (10 + i) * MIN);
      await arrive(t, 3 + i, name);
    }
    // Zoe (student 8) turned the banner off.
    await student(t, 8).mutation(api.checkin.pass.refresh, {});
    await student(t, 8).mutation(api.checkin.attendance.setHideLate, { hide: true });

    const out = await feed(t);
    expect(out.map((f) => [f.first, f.lateMin])).toEqual([
      ["Li", 16],
      ["Mia", 14],
      ["Alex", 13],
      ["Someone", 12],
      ["Someone", 11],
    ]);
    expect(out.map((f) => f.at)).toEqual([16, 14, 13, 12, 11].map((m) => T0 + WEEK + m * MIN));
    expect(JSON.stringify(out)).not.toMatch(/@|Sample|Old|\u202E/);
  });

  it("F16.4 the opt-out removes and restores; setHideLate before a pass throws 'Open your pass first.'", async () => {
    const t = setup();
    await setStart(t, 5);
    const [first] = await lateArrivals(t, 1);
    expect(await first.query(api.checkin.attendance.myHideLate, {})).toBe(false);
    await first.mutation(api.checkin.attendance.setHideLate, { hide: true });
    expect(await first.query(api.checkin.attendance.myHideLate, {})).toBe(true);
    expect(await feed(t)).toEqual([]);
    await first.mutation(api.checkin.attendance.setHideLate, { hide: false });
    expect(await first.query(api.checkin.attendance.myHideLate, {})).toBe(false);
    expect((await feed(t)).map((f) => f.lateMin)).toEqual([10]);

    await expect(student(t, 2).mutation(api.checkin.attendance.setHideLate, { hide: true })).rejects.toThrow(/pass first/);
    await expect(t.mutation(api.checkin.attendance.setHideLate, { hide: true })).rejects.toThrow("Sign in first.");
    expect(await t.query(api.checkin.attendance.myHideLate, {})).toBe(false);
  });
});

describe("CKP-fixcheck-2 the late banner's clock", () => {
  it("clock answers with the server's time, signed out or in, and writes nothing", async () => {
    const t = setup();
    vi.setSystemTime(T0 + 90_000);
    expect(await t.mutation(api.checkin.attendance.clock, {})).toBe(T0 + 90_000);
    expect(await student(t, 1).mutation(api.checkin.attendance.clock, {})).toBe(T0 + 90_000);
    const rows = await t.run(async (ctx) => [
      ...(await ctx.db.query("lectures").take(1)),
      ...(await ctx.db.query("passes").take(1)),
      ...(await ctx.db.query("checkins").take(1)),
    ]);
    expect(rows).toEqual([]);
  });
});
