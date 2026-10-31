// checkin/read: what the other modules read from Check-in (docs/contracts.md).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../_generated/api";
import { admin, at, checkIn, google, profEnv, professor, setup, typed } from "../test.helpers";

const CH = "gdg";
const T0 = at(2026, 11, 5, 21, 30);
const student = (t: ReturnType<typeof setup>, n: number) => typed(t, `Sample student ${n}`, `student${n}@example.edu`);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  profEnv();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("checkin.read", () => {
  it("count is how many checked in on the channel, and anyone can read it", async () => {
    const t = setup();
    expect(await t.query(api.checkin.read.count, { channel: CH })).toBe(0);
    await checkIn(t, student(t, 1));
    await checkIn(t, student(t, 2));
    await checkIn(t, student(t, 3), "another-channel");
    expect(await t.query(api.checkin.read.count, { channel: CH })).toBe(2);
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

  it("names lists who checked in, newest first, with the time; professors and admins only", async () => {
    const t = setup();
    await checkIn(t, student(t, 1));
    vi.setSystemTime(T0 + 60_000);
    await checkIn(t, student(t, 2));
    vi.setSystemTime(T0 + 120_000);
    await checkIn(t, student(t, 3));
    const names = await admin(t).query(api.checkin.read.names, { channel: CH });
    expect(names).toEqual([
      { name: "Sample student 3", at: T0 + 120_000 },
      { name: "Sample student 2", at: T0 + 60_000 },
      { name: "Sample student 1", at: T0 },
    ]);
    expect(await (await professor(t)).query(api.checkin.read.names, { channel: CH })).toEqual(names);

    await expect(t.query(api.checkin.read.names, { channel: CH })).rejects.toThrow("Sign in first.");
    await expect(student(t, 1).query(api.checkin.read.names, { channel: CH })).rejects.toThrow("Only professors can do that.");
    await expect(google(t, "Sample student 4", "student4@example.edu").query(api.checkin.read.names, { channel: CH })).rejects.toThrow(
      "Only professors can do that.",
    );
  });
});
