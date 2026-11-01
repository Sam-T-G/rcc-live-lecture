// CKP-risk-1: right after the deploy that added classes, prod has check-ins from 10-29 and no
// lectures rows, so every read counts them (lib.lectureWindow: start 0) and a 10-29 student's pass
// page says "You're checked in." with no QR until something opens a class. internal.lectures.endEarlier,
// run once on prod right after that deploy, adds a class that is already over, so nobody counts as
// checked in until the next class opens, and the 10-29 rows stay under "Earlier" on attendance.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { admin, at, checkIn, profEnv, setup, type T, TYPED_ISSUER, typed } from "./test.helpers";

const CH = "gdg";
const OCT29 = at(2026, 10, 29, 21, 30);
const NOV5 = at(2026, 11, 5, 21, 20);

const student = (t: T, n: number) => typed(t, `Sample student ${n}`, `student${n}@example.edu`);
// A check-in written on 10-29, before classes existed.
const oldCheckin = (t: T, n: number) =>
  t.run(async (ctx) => {
    const user = `${TYPED_ISSUER}|student${n}@example.edu`;
    await ctx.db.insert("checkins", { channel: CH, user, name: `Sample student ${n}`, email: `student${n}@example.edu`, at: Date.now() });
  });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(OCT29);
  profEnv();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("CKP-risk-1 the 10-29 check-ins stop counting once endEarlier runs", () => {
  it("before it runs, a 10-29 student reads as checked in a week later", async () => {
    const t = setup();
    await oldCheckin(t, 1);
    vi.setSystemTime(NOV5);
    expect(await student(t, 1).query(api.checkin.read.me, { channel: CH })).toBe(true);
    expect(await t.query(api.checkin.read.count, { channel: CH })).toBe(1);
  });

  it("after it runs, nobody counts until a class opens; the 10-29 rows stay under 'Earlier'; the next scan opens a class and checks the student in", async () => {
    const t = setup();
    await oldCheckin(t, 1);
    await oldCheckin(t, 2);
    vi.setSystemTime(NOV5);
    expect(await t.mutation(internal.lectures.endEarlier, { channel: CH })).toBe(true);
    const s = student(t, 1);
    expect(await s.query(api.checkin.read.me, { channel: CH })).toBe(false);
    expect(await t.query(api.checkin.read.count, { channel: CH })).toBe(0);
    expect(await t.query(api.checkin.attendance.lateFeed, { channel: CH })).toEqual([]);
    const prof = admin(t);
    const past = await prof.query(api.checkin.attendance.lectures, { channel: CH });
    expect(past).toHaveLength(1);
    expect(past[0]).toMatchObject({ lecture: "earlier", count: 2 });
    expect(await prof.query(api.checkin.attendance.sheet, { channel: CH, lecture: "earlier" })).toHaveLength(2);

    // Run again: there is a class already, so it changes nothing.
    vi.setSystemTime(NOV5 + 60_000);
    expect(await t.mutation(internal.lectures.endEarlier, { channel: CH })).toBe(false);
    const rows = await t.run((ctx) => ctx.db.query("lectures").withIndex("by_channel", (q) => q.eq("channel", CH)).collect());
    expect(rows.map((l) => [l.startedAt, l.endedAt])).toEqual([[NOV5, NOV5]]);

    // The door scans student 1: a new class opens and they're checked in to it.
    vi.setSystemTime(NOV5 + 2 * 60_000);
    expect((await checkIn(t, s)).already).toBe(false);
    expect(await s.query(api.checkin.read.me, { channel: CH })).toBe(true);
    expect(await student(t, 2).query(api.checkin.read.me, { channel: CH })).toBe(false);
  });
});
