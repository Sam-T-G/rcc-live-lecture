// checkin/attendance: the professor's attendance sheet, the class start time, and the late
// banner's feed with each student's opt-out. Late minutes are read through sheet and lateFeed.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../_generated/api";
import { at, checkIn, google, googleHost, HOST_EMAIL, PROF_KEY, profEnv, setup, typed, TYPED_ISSUER, WRONG_KEY } from "../test.helpers";

const CH = "gdg";
const T0 = at(2026, 11, 5, 21, 30); // class starts
const MIN = 60_000;
const student = (t: ReturnType<typeof setup>, n: number) => typed(t, `Sample student ${n}`, `student${n}@example.edu`);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0 - 10 * MIN);
  profEnv();
});
afterEach(() => {
  vi.useRealTimers();
});

const setStart = (t: ReturnType<typeof setup>, graceMin: number) =>
  t.mutation(api.checkin.attendance.setClassStart, { key: PROF_KEY, channel: CH, startsAt: T0, graceMin });
const sheet = (t: ReturnType<typeof setup>) => t.query(api.checkin.attendance.sheet, { key: PROF_KEY, channel: CH });

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

  it("F14.4 sheet is host-only", async () => {
    const t = setup();
    await checkIn(t, student(t, 1));
    await expect(t.query(api.checkin.attendance.sheet, { channel: CH })).rejects.toThrow("Sign in first.");
    await expect(student(t, 1).query(api.checkin.attendance.sheet, { channel: CH })).rejects.toThrow("Only hosts can do that.");
    await expect(typed(t, "Sample professor", HOST_EMAIL).query(api.checkin.attendance.sheet, { channel: CH })).rejects.toThrow("Only hosts can do that.");
    await expect(google(t, "Sample student 2", "student2@example.edu").query(api.checkin.attendance.sheet, { channel: CH })).rejects.toThrow("Only hosts can do that.");
    await expect(t.query(api.checkin.attendance.sheet, { key: WRONG_KEY, channel: CH })).rejects.toThrow("That professor key is wrong.");
    expect(await googleHost(t).query(api.checkin.attendance.sheet, { channel: CH })).toHaveLength(1);
    expect(await sheet(t)).toHaveLength(1);
  });
});

describe("F15 late from the class start plus grace minutes", () => {
  it("F15.2 grace -1, 61 throw; 0 and 60 are saved", async () => {
    const t = setup();
    for (const graceMin of [-1, 61])
      await expect(setStart(t, graceMin)).rejects.toThrow("Grace has to be 0 to 60 minutes.");
    expect(await t.query(api.checkin.attendance.classStart, { channel: CH })).toBeNull();
    await setStart(t, 0);
    expect(await t.query(api.checkin.attendance.classStart, { channel: CH })).toEqual({ startsAt: T0, graceMin: 0 });
    await setStart(t, 60);
    expect(await t.query(api.checkin.attendance.classStart, { channel: CH })).toEqual({ startsAt: T0, graceMin: 60 });
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
    expect((await t.query(api.checkin.attendance.lateFeed, { channel: CH })).map((f) => f.lateMin)).toEqual([12]);
  });

  it("F15.4 no start means nobody is late", async () => {
    const t = setup();
    vi.setSystemTime(T0 + 3 * 60 * MIN);
    await checkIn(t, student(t, 1));
    expect(await t.query(api.checkin.attendance.classStart, { channel: CH })).toBeNull();
    expect((await sheet(t))[0].lateMin).toBeNull();
    expect(await t.query(api.checkin.attendance.lateFeed, { channel: CH })).toEqual([]);
  });
});

describe("F16 the late banner's feed", () => {
  // Students 1 to n check in late, one a minute, from 10 minutes after the start. Set the start first.
  async function lateArrivals(t: ReturnType<typeof setup>, n: number) {
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
    const feed = await t.query(api.checkin.attendance.lateFeed, { channel: CH });
    // Six arrivals, 10 to 15 minutes late: the newest five, newest first.
    expect(feed.map((f) => f.lateMin)).toEqual([15, 14, 13, 12, 11]);
    expect(feed.map((f) => f.at)).toEqual([15, 14, 13, 12, 11].map((m) => T0 + m * MIN));
    for (const f of feed) {
      expect(Object.keys(f).sort()).toEqual(["at", "first", "id", "lateMin"]);
      expect(f.first).toBe("Sample");
    }
    expect(JSON.stringify(feed)).not.toMatch(/student|@|example\.edu/);
    expect(JSON.stringify(feed)).not.toContain(TYPED_ISSUER);
  });

  it("F16.4 the opt-out removes and restores; setHideLate before a pass throws 'Open your pass first.'", async () => {
    const t = setup();
    await setStart(t, 5);
    const [first] = await lateArrivals(t, 1);
    expect(await first.query(api.checkin.attendance.myHideLate, {})).toBe(false);
    await first.mutation(api.checkin.attendance.setHideLate, { hide: true });
    expect(await first.query(api.checkin.attendance.myHideLate, {})).toBe(true);
    expect(await t.query(api.checkin.attendance.lateFeed, { channel: CH })).toEqual([]);
    await first.mutation(api.checkin.attendance.setHideLate, { hide: false });
    expect(await first.query(api.checkin.attendance.myHideLate, {})).toBe(false);
    expect((await t.query(api.checkin.attendance.lateFeed, { channel: CH })).map((f) => f.lateMin)).toEqual([10]);

    await expect(student(t, 2).mutation(api.checkin.attendance.setHideLate, { hide: true })).rejects.toThrow(/pass first/);
    await expect(t.mutation(api.checkin.attendance.setHideLate, { hide: true })).rejects.toThrow("Sign in first.");
    expect(await t.query(api.checkin.attendance.myHideLate, {})).toBe(false);
  });
});
