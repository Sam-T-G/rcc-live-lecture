// convex/lib.ts: who is signed in, who is a host, the class window, and the small helpers every
// module uses. Also the two pieces of live/groups.ts the class model and the professor view build on.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { checkedIn, cleanName, endLecture, ensureLecture, LECTURE_MS, lectureWindow, metersBetween, randomCode, requireHost, requireUser } from "./lib";
import * as lib from "./lib";
import { describe as teamOf, teamInfo } from "./live/groups";
import {
  ADMIN_EMAIL,
  admin,
  at,
  google,
  GOOGLE_ISSUER,
  grant,
  PROD_URL,
  PROF_EMAIL,
  profEnv,
  professor,
  SCANNER_EMAIL,
  setup,
  TYPED_ISSUER,
  typed,
  type T,
} from "./test.helpers";

describe("F1 hosts are professors and admins on the staff list", () => {
  it("ROLES requireHost is the same check as requireProf: 'Sign in first.' signed out, 'Only professors can do that.' for a student, a scanner and a typed sign-in with the admin's email on prod; a professor and an admin get their identity back", async () => {
    profEnv();
    vi.stubEnv("CONVEX_CLOUD_URL", PROD_URL);
    vi.stubEnv("HOST_EMAILS", "host@example.edu");
    const t = setup();
    await grant(t, SCANNER_EMAIL, "scanner");
    await expect(t.run((ctx) => requireUser(ctx))).rejects.toThrow("Sign in first.");
    await expect(t.run((ctx) => requireHost(ctx))).rejects.toThrow("Sign in first.");
    const me = await typed(t, "Sample student 1", "student1@example.edu").run((ctx) => requireUser(ctx));
    expect(me).toMatchObject({ issuer: TYPED_ISSUER, email: "student1@example.edu" });
    // HOST_EMAILS no longer makes anyone a host.
    for (const as of [typed(t, "Sample student 1", "student1@example.edu"), google(t, "Sample scanner", SCANNER_EMAIL), typed(t, "Sample admin", ADMIN_EMAIL), google(t, "Sample host", "host@example.edu")])
      await expect(as.run((ctx) => requireHost(ctx))).rejects.toThrow("Only professors can do that.");
    expect(await (await professor(t)).run((ctx) => requireHost(ctx))).toMatchObject({ issuer: GOOGLE_ISSUER, email: PROF_EMAIL });
    expect(await admin(t).run((ctx) => requireHost(ctx))).toMatchObject({ issuer: GOOGLE_ISSUER, email: ADMIN_EMAIL });
    // The HOST_EMAILS checks are gone from lib.ts; roles live in convex/checkin/prof.ts.
    expect(Object.keys(lib)).not.toContain("isHostEmail");
    expect(Object.keys(lib)).not.toContain("isHostIdentity");
  });
});

describe("F39.6 small helpers", () => {
  it("F39.6 randomCode uses only its alphabet and length", () => {
    const LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const code = randomCode(6, LETTERS);
      expect(code).toHaveLength(6);
      for (const c of code) {
        expect(LETTERS).toContain(c);
        seen.add(c);
      }
    }
    expect(seen.size).toBeGreaterThan(20); // not one letter over and over
    expect(randomCode(10)).toMatch(/^[a-z0-9]{10}$/);
    expect(randomCode(0)).toBe("");
  });

  it("F39.6 metersBetween matches a known distance", () => {
    // One degree of latitude along a meridian is 2 * pi * 6,371,000 m / 360 = 111,194.93 m.
    expect(metersBetween(0, 0, 1, 0)).toBeCloseTo(111_194.93, 1);
    // A quarter of the way around the equator.
    expect(metersBetween(0, 0, 0, 90)).toBeCloseTo((Math.PI / 2) * 6_371_000, 3);
    expect(metersBetween(33.97, -117.38, 33.97, -117.38)).toBe(0);
    expect(metersBetween(33.97, -117.38, 34.0, -117.4)).toBeCloseTo(metersBetween(34.0, -117.4, 33.97, -117.38), 6);
  });

  it("cleanName('   ') = 'Student', cleanName('jane.doe@example.edu') = 'jane.doe', a 200-character name is cut to 60, control characters are dropped", () => {
    const ch = (...codes: number[]) => String.fromCodePoint(...codes);
    expect(cleanName("   ")).toBe("Student");
    expect(cleanName("")).toBe("Student");
    expect(cleanName(undefined)).toBe("Student");
    expect(cleanName(null, "Someone")).toBe("Someone");
    expect(cleanName("jane.doe@example.edu")).toBe("jane.doe");
    expect(cleanName("  jane.doe@example.edu  ")).toBe("jane.doe");
    expect(cleanName("x".repeat(200))).toBe("x".repeat(60));
    // Control characters (NUL, BEL, DEL, a C1 code) are dropped; tabs and line breaks are spaces.
    expect(cleanName("Ja" + ch(0) + "ne" + ch(7) + " D" + ch(0x7f) + "oe" + ch(0x9b))).toBe("Jane Doe");
    expect(cleanName("  Jane" + ch(9) + ch(9) + "Doe" + ch(10, 13) + " ")).toBe("Jane Doe");
    // A bidi override or isolate would flip the banner's text after the name; a name of only
    // invisible characters would show as a blank, so it gets the fallback.
    expect(cleanName("Jane" + ch(0x202e) + " Doe" + ch(0x2066))).toBe("Jane Doe");
    expect(cleanName("Ja" + ch(0x200e) + "ne" + ch(0x2060) + " Doe" + ch(0xad))).toBe("Jane Doe");
    expect(cleanName(ch(0x200b, 0xfeff, 0x200b))).toBe("Student");
    expect(cleanName(ch(0x2060, 0x200d))).toBe("Student");
    expect(cleanName(ch(0x301, 0x301))).toBe("Student"); // accent marks with no letter under them
    // Letters and symbols that draw nothing (Hangul fillers, the blank Braille pattern, the null
    // notehead U+1D159) and the combining grapheme joiner are dropped too, so a name made of them
    // gets the fallback.
    for (const blank of [0x3164, 0x115f, 0x1160, 0xffa0, 0x2800, 0x34f, 0x1d159]) {
      expect(cleanName(ch(blank))).toBe("Student");
      expect(cleanName(ch(blank, blank, blank))).toBe("Student");
      expect(cleanName("Jane" + ch(blank) + " Doe " + ch(blank))).toBe("Jane Doe");
    }
    expect(cleanName(ch(0x2800, 0x2800) + " " + ch(0x3164))).toBe("Student");
    // A Braille pattern with dots is a symbol people can see, so it stays.
    expect(cleanName(ch(0x2801))).toBe(ch(0x2801));
    // The zero-width joiner stays inside an emoji built from several (a person at a laptop).
    expect(cleanName("Sam " + ch(0x1f469, 0x200d, 0x1f4bb))).toBe("Sam " + ch(0x1f469, 0x200d, 0x1f4bb));
    // No email ever survives: an "@" word in a longer name is dropped.
    expect(cleanName("Jane Doe <jane.doe@example.edu>")).toBe("Jane Doe");
    expect(cleanName("@jane")).toBe("Student");
    expect(cleanName("José Núñez")).toBe("José Núñez");
    // Cut by characters, so an emoji is never split in half.
    expect(cleanName(ch(0x1f600).repeat(70))).toBe(ch(0x1f600).repeat(60));
  });
});

// ---------- Classes: the lectures window ----------

const CH = "gdg";
const T0 = at(2026, 11, 5, 21, 0); // the first class opens
const MIN = 60_000;
const HOUR = 60 * MIN;

// What a check-in row looks like, inserted straight into the table so a student can have rows in
// two classes (pass.scan refuses a second one until the class model reaches it).
const checkinRow = (user: string, name = "Sample student") => ({ channel: CH, user, name, at: Date.now() });
const win = (t: T, channel = CH) => t.run((ctx) => lectureWindow(ctx, channel));
const open = (t: T, channel = CH) => t.run((ctx) => ensureLecture(ctx, channel));
const end = (t: T, channel = CH) => t.run((ctx) => endLecture(ctx, channel));
const lecture = (t: T, id: Id<"lectures">) => t.run((ctx) => ctx.db.get("lectures", id));
const isIn = (t: T, user: string, channel = CH) => t.run((ctx) => checkedIn(ctx, channel, user));

describe("F8 classes: one lectures window per class", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("F8 lectureWindow with no lectures returns start 0 and the legacy classStarts start and grace; with an open lecture returns its startedAt; with an ended one returns its endedAt and lecture null", async () => {
    profEnv();
    const t = setup();
    expect(await win(t)).toEqual({ lecture: null, start: 0, startsAt: null, graceMin: 0 });
    // Prod before the first class: the start time the professor saved the old way (a classStarts
    // row; attendance.setClassStart opens a class now) decides lateness.
    await t.run((ctx) => ctx.db.insert("classStarts", { channel: CH, startsAt: T0 + 30 * MIN, graceMin: 5 }));
    expect(await win(t)).toEqual({ lecture: null, start: 0, startsAt: T0 + 30 * MIN, graceMin: 5 });

    vi.setSystemTime(T0 + 10 * MIN);
    const first = await open(t);
    expect(first).toMatchObject({ channel: CH, startedAt: T0 + 10 * MIN });
    expect(first.endedAt).toBeUndefined();
    // An open class keeps its own start time; the legacy row no longer counts.
    expect(await win(t)).toEqual({ lecture: first._id, start: T0 + 10 * MIN, startsAt: null, graceMin: 0 });
    await t.run((ctx) => ctx.db.patch("lectures", first._id, { startsAt: T0 + 30 * MIN, graceMin: 10 }));
    expect(await win(t)).toEqual({ lecture: first._id, start: T0 + 10 * MIN, startsAt: T0 + 30 * MIN, graceMin: 10 });
    // Another channel has no class of its own.
    expect(await win(t, "another-channel")).toEqual({ lecture: null, start: 0, startsAt: null, graceMin: 0 });

    vi.setSystemTime(T0 + 2 * HOUR);
    await end(t);
    expect(await win(t)).toEqual({ lecture: null, start: T0 + 2 * HOUR, startsAt: null, graceMin: 0 });
  });

  it("F8 ensureLecture opens one when none is open, returns the open one under 12 h, and closes one open over 12 h (endedAt = startedAt + 12 h) before opening a new one", async () => {
    const t = setup();
    const first = await open(t);
    expect(first).toMatchObject({ channel: CH, startedAt: T0 });

    // Every professor action in the next 12 hours gets the same class.
    vi.setSystemTime(T0 + 3 * HOUR);
    expect((await open(t))._id).toBe(first._id);
    vi.setSystemTime(T0 + LECTURE_MS - 1);
    expect((await open(t))._id).toBe(first._id);

    // Its close job never ran (fake timers move with the clock), so the next action ends it at
    // the 12-hour mark and opens a new class.
    vi.setSystemTime(T0 + 13 * HOUR);
    const second = await open(t);
    expect(second._id).not.toBe(first._id);
    expect(second).toMatchObject({ startedAt: T0 + 13 * HOUR });
    expect(second.endedAt).toBeUndefined();
    expect((await lecture(t, first._id))?.endedAt).toBe(T0 + LECTURE_MS);
    expect(await win(t)).toMatchObject({ lecture: second._id, start: T0 + 13 * HOUR });

    // After End day the next action opens a fresh class.
    vi.setSystemTime(T0 + 14 * HOUR);
    await end(t);
    vi.setSystemTime(T0 + 15 * HOUR);
    const third = await open(t);
    expect([first._id, second._id]).not.toContain(third._id);
    expect((await lecture(t, second._id))?.endedAt).toBe(T0 + 14 * HOUR);
    expect(await t.run((ctx) => ctx.db.query("lectures").withIndex("by_channel", (q) => q.eq("channel", CH)).take(10))).toHaveLength(3);
  });

  it("F8 endLecture ends only the open lecture; a second call returns null", async () => {
    const t = setup();
    expect(await end(t)).toBeNull(); // no class yet

    const first = await open(t);
    vi.setSystemTime(T0 + HOUR);
    expect(await end(t)).toMatchObject({ _id: first._id, startedAt: T0, endedAt: T0 + HOUR });

    vi.setSystemTime(T0 + 2 * HOUR);
    const second = await open(t);
    const elsewhere = await open(t, "another-channel");
    vi.setSystemTime(T0 + 3 * HOUR);
    expect(await end(t)).toMatchObject({ _id: second._id, endedAt: T0 + 3 * HOUR });
    expect((await lecture(t, first._id))?.endedAt).toBe(T0 + HOUR); // the ended class keeps its end
    expect((await lecture(t, elsewhere._id))?.endedAt).toBeUndefined(); // another channel's class stays open

    vi.setSystemTime(T0 + 4 * HOUR);
    expect(await end(t)).toBeNull();
    expect((await lecture(t, second._id))?.endedAt).toBe(T0 + 3 * HOUR);
  });

  it("F8 internal.lectures.close (fake timers + finishAllScheduledFunctions): a lecture nobody ended has endedAt = startedAt + 12 h after 12 h, lectureWindow then returns lecture null, and checkedIn is false for its students", async () => {
    const t = setup();
    const first = await open(t);
    vi.setSystemTime(T0 + 5 * MIN);
    await t.run((ctx) => ctx.db.insert("checkins", checkinRow("test|student1")));
    expect(await isIn(t, "test|student1")).toBe(true);

    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await lecture(t, first._id))?.endedAt).toBe(T0 + LECTURE_MS);
    expect(await win(t)).toEqual({ lecture: null, start: T0 + LECTURE_MS, startsAt: null, graceMin: 0 });
    expect(await isIn(t, "test|student1")).toBe(false);
  });

  it("F8 the close job also runs when a test moves fake timers 12 h ahead (advanceTimersByTime + finishInProgressScheduledFunctions)", async () => {
    const t = setup();
    const first = await open(t);
    vi.advanceTimersByTime(LECTURE_MS - MIN);
    await t.finishInProgressScheduledFunctions();
    expect((await lecture(t, first._id))?.endedAt).toBeUndefined();
    vi.advanceTimersByTime(MIN);
    await t.finishInProgressScheduledFunctions();
    expect((await lecture(t, first._id))?.endedAt).toBe(T0 + LECTURE_MS);
  });

  it("F8 internal.lectures.close called directly on a lecture End day already ended changes nothing; on an open class it ends it at startedAt + 12 h, or now when run before then", async () => {
    const t = setup();
    const first = await open(t);
    vi.setSystemTime(T0 + 2 * HOUR);
    await end(t);
    // Run later than End day, so an overwrite would show as a different endedAt.
    vi.setSystemTime(T0 + 5 * HOUR);
    await t.mutation(internal.lectures.close, { lecture: first._id });
    await t.mutation(internal.lectures.close, { lecture: first._id, scheduled: true });
    expect((await lecture(t, first._id))?.endedAt).toBe(T0 + 2 * HOUR);

    // On an open class it sets the 12-hour end, even when it runs late.
    vi.setSystemTime(T0 + 3 * HOUR);
    const second = await open(t);
    vi.setSystemTime(T0 + 3 * HOUR + LECTURE_MS + HOUR);
    await t.mutation(internal.lectures.close, { lecture: second._id });
    expect((await lecture(t, second._id))?.endedAt).toBe(T0 + 3 * HOUR + LECTURE_MS);
    // A lecture that's gone changes nothing either.
    await t.run((ctx) => ctx.db.delete("lectures", second._id));
    await t.mutation(internal.lectures.close, { lecture: second._id });

    // Run by hand (npx convex run lectures:close) 1 hour into a class, it ends the class now, so
    // the class never has an end time in the future.
    vi.setSystemTime(T0 + 20 * HOUR);
    const third = await open(t);
    vi.setSystemTime(T0 + 21 * HOUR);
    await t.mutation(internal.lectures.close, { lecture: third._id });
    expect((await lecture(t, third._id))?.endedAt).toBe(T0 + 21 * HOUR);
    expect(await win(t)).toEqual({ lecture: null, start: T0 + 21 * HOUR, startsAt: null, graceMin: 0 });
  });

  it("F8 the scheduled close of a class End day already ended leaves its endedAt alone", async () => {
    const t = setup();
    const first = await open(t);
    vi.advanceTimersByTime(2 * HOUR);
    await end(t);
    vi.advanceTimersByTime(LECTURE_MS);
    await t.finishInProgressScheduledFunctions();
    expect((await lecture(t, first._id))?.endedAt).toBe(T0 + 2 * HOUR);
    expect(await win(t)).toEqual({ lecture: null, start: T0 + 2 * HOUR, startsAt: null, graceMin: 0 });
  });

  it("F8 a class opened the evening before, with the next morning's start saved, stays open until 12 h after that start", async () => {
    const t = setup();
    // 21:00: the professor saves tomorrow's 9:15 start, which opens the class.
    const first = await open(t);
    const startsAt = T0 + 12 * HOUR + 15 * MIN;
    await t.run((ctx) => ctx.db.patch("lectures", first._id, { startsAt, graceMin: 5 }));

    // 8:55: the morning's first scan joins the same class.
    vi.advanceTimersByTime(11 * HOUR + 55 * MIN);
    expect((await open(t))._id).toBe(first._id);
    await t.run((ctx) => ctx.db.insert("checkins", checkinRow("test|student1")));

    // 9:00, 12 h after the class opened: the close job runs and the class stays open.
    vi.advanceTimersByTime(5 * MIN);
    await t.finishInProgressScheduledFunctions();
    expect((await lecture(t, first._id))?.endedAt).toBeUndefined();
    expect(await win(t)).toEqual({ lecture: first._id, start: T0, startsAt, graceMin: 5 });
    expect(await isIn(t, "test|student1")).toBe(true);

    // It closes itself 12 h after the saved start.
    vi.advanceTimersByTime(startsAt + LECTURE_MS - Date.now() - MIN);
    await t.finishInProgressScheduledFunctions();
    expect((await lecture(t, first._id))?.endedAt).toBeUndefined();
    vi.advanceTimersByTime(MIN);
    await t.finishInProgressScheduledFunctions();
    expect((await lecture(t, first._id))?.endedAt).toBe(startsAt + LECTURE_MS);
    expect(await isIn(t, "test|student1")).toBe(false);
  });

  it("F8 ensureLecture keeps a class with a saved start open until 12 h after that start, then ends it there and opens a new one", async () => {
    const t = setup();
    const first = await open(t);
    const startsAt = T0 + 10 * HOUR;
    await t.run((ctx) => ctx.db.patch("lectures", first._id, { startsAt }));
    vi.setSystemTime(T0 + 13 * HOUR);
    expect((await open(t))._id).toBe(first._id);
    vi.setSystemTime(startsAt + LECTURE_MS + HOUR);
    const second = await open(t);
    expect(second._id).not.toBe(first._id);
    expect((await lecture(t, first._id))?.endedAt).toBe(startsAt + LECTURE_MS);
    // A saved start earlier than the class opened doesn't end it before 12 h.
    await t.run((ctx) => ctx.db.patch("lectures", second._id, { startsAt: second.startedAt - 2 * HOUR }));
    vi.setSystemTime(second.startedAt + LECTURE_MS - MIN);
    expect((await open(t))._id).toBe(second._id);
  });

  it("F8 checkedIn counts only check-ins inside the current window (uses .gte('_creationTime', start))", async () => {
    const t = setup();
    // Before any class opens (prod today), every check-in on the channel counts.
    await t.run(async (ctx) => {
      await ctx.db.insert("checkins", checkinRow("test|student1"));
      await ctx.db.insert("checkins", checkinRow("test|student2"));
      await ctx.db.insert("checkins", { ...checkinRow("test|student3"), channel: "another-channel" });
    });
    expect(await isIn(t, "test|student1")).toBe(true);
    expect(await isIn(t, "test|student3")).toBe(false); // checked in on another channel only
    // Two rows for one student in the same window (two scans that raced) still read as checked
    // in: checkedIn reads with .first(), where .unique() would throw and blank the page.
    await t.run((ctx) => ctx.db.insert("checkins", checkinRow("test|student2")));
    expect(await isIn(t, "test|student2")).toBe(true);

    // A class opens: last class's check-ins stop counting.
    vi.setSystemTime(T0 + HOUR);
    await open(t);
    expect(await isIn(t, "test|student1")).toBe(false);
    expect(await isIn(t, "test|student2")).toBe(false);

    // Student 1 checks in again in this class: two rows now, one per class, and .first() reads them.
    vi.setSystemTime(T0 + HOUR + 5 * MIN);
    await t.run((ctx) => ctx.db.insert("checkins", checkinRow("test|student1")));
    expect(await isIn(t, "test|student1")).toBe(true);
    expect(await isIn(t, "test|student2")).toBe(false);
    expect(await t.run((ctx) => ctx.db.query("checkins").withIndex("by_channel_and_user", (q) => q.eq("channel", CH).eq("user", "test|student1")).collect())).toHaveLength(2);

    // End day: between classes nobody is checked in.
    vi.setSystemTime(T0 + 3 * HOUR);
    await end(t);
    expect(await isIn(t, "test|student1")).toBe(false);
  });

  it("F8 a check-in the opening mutation itself inserts is inside its class, even when the class's startedAt reads later than its row's _creationTime", async () => {
    const t = setup();
    // The way pass.scan will run: open the class, then insert the check-in, in one mutation.
    await t.run(async (ctx) => {
      await ensureLecture(ctx, CH);
      await ctx.db.insert("checkins", checkinRow("test|student1"));
    });
    expect(await isIn(t, "test|student1")).toBe(true);

    // Convex doesn't promise that Date.now() in a mutation is at or before the _creationTime of
    // the rows it inserts. Here a class's startedAt reads 5 ms after its own row and its first
    // check-in were created: the window starts at the row's _creationTime, so the check-in counts.
    vi.setSystemTime(T0 + 2 * HOUR);
    await end(t);
    vi.setSystemTime(T0 + 3 * HOUR);
    const late = await t.run(async (ctx) => {
      const id = await ctx.db.insert("lectures", { channel: CH, startedAt: Date.now() + 5 });
      const checkin = await ctx.db.insert("checkins", checkinRow("test|student2"));
      const row = await ctx.db.get("lectures", id);
      const scan = await ctx.db.get("checkins", checkin);
      return { id, created: row?._creationTime ?? NaN, startedAt: row?.startedAt ?? NaN, scanned: scan?._creationTime ?? NaN };
    });
    expect(late.scanned).toBeLessThan(late.startedAt);
    expect(await win(t)).toMatchObject({ lecture: late.id, start: late.created });
    expect(await isIn(t, "test|student2")).toBe(true);
  });

  it("F8 internal.live.groups.lock takes the class it was queued for (lecture), so the attendance and teams code can pass it", async () => {
    const t = setup();
    const first = await open(t);
    await t.mutation(internal.live.groups.lock, { channel: CH, force: true, lecture: first._id });
    expect(await t.query(api.live.groups.status, { channel: CH })).toMatchObject({ locked: true });
  });

  it("F8 a lock that runs before its time queues itself again with the same lecture", async () => {
    const t = setup();
    const first = await open(t);
    // Class starts in 10 minutes, so teams lock in 15.
    await t.run((ctx) => ctx.db.insert("classStarts", { channel: CH, startsAt: T0 + 10 * MIN, graceMin: 0 }));
    await t.run((ctx) => ctx.scheduler.runAfter(0, internal.live.groups.lock, { channel: CH, lecture: first._id }));
    vi.advanceTimersByTime(5 * MIN);
    await t.finishInProgressScheduledFunctions();
    expect(await t.query(api.live.groups.status, { channel: CH })).toMatchObject({ locked: false });
    const queued = await t.run(async (ctx) =>
      (await ctx.db.system.query("_scheduled_functions").take(20))
        .filter((j) => j.name.includes("groups") && j.state.kind === "pending")
        .map((j) => j.args[0]),
    );
    expect(queued).toEqual([{ channel: CH, lecture: first._id }]);
  });
});

describe("F24 team labels the professor view reuses", () => {
  it("F24.1 live/groups exports describe and teamInfo: 0 is Red, 1 Blue, 2 Yellow, and past the last color the list repeats with a number", () => {
    expect(teamOf(0)).toEqual({ team: 0, color: "red", label: "Red" });
    expect(teamOf(1)).toEqual({ team: 1, color: "blue", label: "Blue" });
    expect(teamOf(2)).toEqual({ team: 2, color: "yellow", label: "Yellow" });
    expect(teamOf(12)).toEqual({ team: 12, color: "red", label: "Red 2" });
    expect(teamInfo.kind).toBe("object");
    expect(Object.keys(teamInfo.fields).sort()).toEqual(["color", "label", "team"]);
  });
});
