// checkin/read: what the other modules read from Check-in (docs/contracts.md), for this class.
// A class opens here the way the professor's actions open one (lib.ensureLecture) and ends the way
// End day ends it (lib.endLecture). A student who comes back in a later class gets a second
// checkins row written straight to the table, the way pass.scan writes one per class.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../_generated/api";
import { endLecture, ensureLecture } from "../lib";
import { admin, at, checkIn, google, profEnv, professor, setup, type T, typed, TYPED_ISSUER } from "../test.helpers";

const CH = "gdg";
const T0 = at(2026, 11, 5, 21, 30);
const MIN = 60_000;
const WEEK = 7 * 24 * 60 * MIN;
const student = (t: T, n: number, name = `Sample student ${n}`) => typed(t, name, `student${n}@example.edu`);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  profEnv();
});
afterEach(() => {
  vi.useRealTimers();
});

const count = (t: T) => t.query(api.checkin.read.count, { channel: CH });
const names = (t: T) => admin(t).query(api.checkin.read.names, { channel: CH });
const openClass = (t: T) => t.run((ctx) => ensureLecture(ctx, CH));
const endClass = (t: T) => t.run((ctx) => endLecture(ctx, CH));

describe("checkin.read", () => {
  it("count is how many checked in on the channel, and anyone can read it", async () => {
    const t = setup();
    expect(await count(t)).toBe(0);
    await checkIn(t, student(t, 1));
    await checkIn(t, student(t, 2));
    await checkIn(t, student(t, 3), "another-channel");
    expect(await count(t)).toBe(2);
    expect(await student(t, 9).query(api.checkin.read.count, { channel: CH })).toBe(2);
    expect(await t.query(api.checkin.read.count, { channel: "another-channel" })).toBe(1);
  });

  it("me is true only for a student checked in on that channel", async () => {
    const t = setup();
    const s = student(t, 1);
    expect(await t.query(api.checkin.read.me, { channel: CH })).toBe(false);
    expect(await s.query(api.checkin.read.me, { channel: CH })).toBe(false);
    await checkIn(t, s);
    expect(await s.query(api.checkin.read.me, { channel: CH })).toBe(true);
    expect(await s.query(api.checkin.read.me, { channel: "another-channel" })).toBe(false);
    expect(await student(t, 2).query(api.checkin.read.me, { channel: CH })).toBe(false);
  });

  it("names lists who checked in, newest first, with the time and the check-in's id; professors and admins only", async () => {
    const t = setup();
    await checkIn(t, student(t, 1));
    vi.setSystemTime(T0 + 60_000);
    await checkIn(t, student(t, 2));
    vi.setSystemTime(T0 + 120_000);
    await checkIn(t, student(t, 3));
    const list = await names(t);
    expect(list.map(({ name, at }) => ({ name, at }))).toEqual([
      { name: "Sample student 3", at: T0 + 120_000 },
      { name: "Sample student 2", at: T0 + 60_000 },
      { name: "Sample student 1", at: T0 },
    ]);
    // The id is the student's checkins row, for attendance.removeCheckin.
    const ids = await t.run(async (ctx) =>
      (
        await ctx.db
          .query("checkins")
          .withIndex("by_channel", (q) => q.eq("channel", CH))
          .order("desc")
          .take(10)
      ).map((r) => r._id),
    );
    expect(list.map((n) => n.id)).toEqual(ids);
    expect(await (await professor(t)).query(api.checkin.read.names, { channel: CH })).toEqual(list);

    await expect(t.query(api.checkin.read.names, { channel: CH })).rejects.toThrow("Sign in first.");
    await expect(student(t, 1).query(api.checkin.read.names, { channel: CH })).rejects.toThrow("Only professors can do that.");
    await expect(google(t, "Sample student 4", "student4@example.edu").query(api.checkin.read.names, { channel: CH })).rejects.toThrow(
      "Only professors can do that.",
    );
  });

  it("F8.3 read.me is false in a new class until the student is scanned, then true with two checkins rows for that student (no unique() error); count and names list only this class", async () => {
    const t = setup();
    const [a, b] = [student(t, 1), student(t, 2)];
    // Class 1: both scanned.
    await openClass(t);
    await checkIn(t, a);
    vi.setSystemTime(T0 + MIN);
    await checkIn(t, b);
    expect(await a.query(api.checkin.read.me, { channel: CH })).toBe(true);
    expect(await count(t)).toBe(2);
    vi.setSystemTime(T0 + 120 * MIN);
    await endClass(t);
    // Between classes nobody is checked in.
    expect(await a.query(api.checkin.read.me, { channel: CH })).toBe(false);
    expect(await count(t)).toBe(0);
    expect(await names(t)).toEqual([]);

    // Class 2 a week later: nobody is in until they're scanned.
    vi.setSystemTime(T0 + WEEK);
    await openClass(t);
    expect(await a.query(api.checkin.read.me, { channel: CH })).toBe(false);
    expect(await b.query(api.checkin.read.me, { channel: CH })).toBe(false);
    expect(await count(t)).toBe(0);
    vi.setSystemTime(T0 + WEEK + 5 * MIN);
    await t.run((ctx) =>
      ctx.db.insert("checkins", { channel: CH, user: `${TYPED_ISSUER}|student1@example.edu`, name: "Sample student 1", email: "student1@example.edu", at: Date.now() }),
    );
    const rowsForA = await t.run((ctx) =>
      ctx.db
        .query("checkins")
        .withIndex("by_channel_and_user", (q) => q.eq("channel", CH).eq("user", `${TYPED_ISSUER}|student1@example.edu`))
        .collect(),
    );
    expect(rowsForA).toHaveLength(2);
    expect(await a.query(api.checkin.read.me, { channel: CH })).toBe(true);
    expect(await b.query(api.checkin.read.me, { channel: CH })).toBe(false);
    expect(await count(t)).toBe(1);
    expect((await names(t)).map(({ name, at }) => ({ name, at }))).toEqual([{ name: "Sample student 1", at: T0 + WEEK + 5 * MIN }]);
  });

  it("F43.2 non-host check-in reads return no names or emails", async () => {
    const t = setup();
    await admin(t).mutation(api.checkin.attendance.setClassStart, { channel: CH, startsAt: T0, graceMin: 0 });
    // Late arrivals, one with a name typed as an email address.
    vi.setSystemTime(T0 + 10 * MIN);
    await checkIn(t, student(t, 1, "Ana Sample"));
    vi.setSystemTime(T0 + 11 * MIN);
    await checkIn(t, student(t, 2, "jane.doe@example.edu"));
    const callers = [t, student(t, 1, "Ana Sample"), student(t, 3), google(t, "Sample student 4", "student4@example.edu")];
    for (const who of callers) {
      const reads = [
        await who.query(api.checkin.read.count, { channel: CH }),
        await who.query(api.checkin.read.me, { channel: CH }),
        await who.query(api.checkin.attendance.classStart, { channel: CH }),
        await who.query(api.checkin.attendance.lateFeed, { channel: CH }),
      ];
      expect(JSON.stringify(reads)).not.toMatch(/@|example\.edu|Sample|student/i);
      await expect(who.query(api.checkin.read.names, { channel: CH })).rejects.toThrow(/Sign in first\.|Only professors can do that\./);
    }
    // The late banner shows first names only: "Ana", and no email for the name typed as one.
    const firsts = (await t.query(api.checkin.attendance.lateFeed, { channel: CH })).map((f) => f.first);
    expect(firsts).toHaveLength(2);
    expect(firsts[1]).toBe("Ana");
    expect(firsts[0]).not.toContain("@");
  });
});
