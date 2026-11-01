// checkin/pass: the pass says "A screenshot stops working within a minute." (Student.tsx), so no
// code scans once it's over 60 s old, even as the code before the current one (CKP-spec-2,
// CKP-risk-5); a code that ran out before its phone woke still gets "That code is old." after the
// phone gets a new one (CKP-check-2); and scan stores no lateMin, since attendance works lateness
// out when read (CKP-spec-3).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../_generated/api";
import { admin, at, type Caller, passCode, profEnv, setup, type T, typed } from "../test.helpers";

const CH = "gdg";
const T0 = at(2026, 11, 5, 21, 30);
const SEC = 1000;
const MIN = 60 * SEC;
const OLD = "That code is old. Ask them to open their pass again.";
const NOT_A_PASS = "That code isn't a pass. Ask them to open their pass again.";

const student = (t: T, n: number) => typed(t, `Sample student ${n}`, `student${n}@example.edu`);
const scan = (t: T, code: string) => admin(t).mutation(api.checkin.pass.scan, { channel: CH, code });
async function refreshAt(s: Caller, ...times: number[]) {
  for (const time of times) {
    vi.setSystemTime(time);
    await s.mutation(api.checkin.pass.refresh, { channel: CH });
  }
}
const codeOf = async (s: Caller) => (await s.query(api.checkin.pass.mine, {}))!.code;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  profEnv();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("CKP-spec-2 CKP-risk-5 a screenshot stops working within a minute", () => {
  it("a code replaced when its phone comes back 50 s in scans until it's 60 s old, then 'That code is old.'", async () => {
    const t = setup();
    const a = student(t, 1);
    const b = student(t, 2);
    const a1 = await passCode(a);
    const b1 = await passCode(b);
    // Both students switch away (a screenshot goes to a friend) and come back to the pass 50 s in,
    // so a1 and b1 become the codes before the new ones; then both phones lock.
    await refreshAt(a, T0 + 50 * SEC);
    await refreshAt(b, T0 + 50 * SEC);
    vi.setSystemTime(T0 + 60 * SEC);
    expect((await scan(t, a1)).already).toBe(false);
    vi.setSystemTime(T0 + 60 * SEC + 1);
    await expect(scan(t, b1)).rejects.toThrow(OLD);
    vi.setSystemTime(T0 + 84 * SEC);
    await expect(scan(t, b1)).rejects.toThrow(OLD);
    expect(await t.query(api.checkin.read.count, { channel: CH })).toBe(1);
  });

  it("the longest any code scans is 60 s: replaced 59 s in, it's refused 1 ms after it turns 60 s old", async () => {
    const t = setup();
    const s = student(t, 1);
    const code = await passCode(s);
    await refreshAt(s, T0 + 59 * SEC);
    vi.setSystemTime(T0 + 60 * SEC + 1);
    await expect(scan(t, code)).rejects.toThrow(OLD);
    // The new code scans.
    expect((await scan(t, await codeOf(s))).already).toBe(false);
  });
});

describe("CKP-check-2 a code that ran out stays 'old' after its phone wakes", () => {
  it("the phone sleeps 90 s and gets a new code: the old one gets 'That code is old.', the new one scans", async () => {
    const t = setup();
    const s = student(t, 1);
    const old = await passCode(s);
    await refreshAt(s, T0 + 90 * SEC);
    await expect(scan(t, old)).rejects.toThrow(OLD);
    expect((await scan(t, await codeOf(s))).already).toBe(false);
    // Once a second new code replaces that one too, the old code is on no pass.
    await refreshAt(s, T0 + 110 * SEC);
    await expect(scan(t, old)).rejects.toThrow(NOT_A_PASS);
  });
});

describe("CKP-spec-3 scan stores no lateMin; attendance works lateness out when read", () => {
  it("a scan 12 min after a saved start is 12 min late on the sheet and in lateFeed, with no lateMin on the row; moving the start later makes it on time", async () => {
    const t = setup();
    const prof = admin(t);
    await prof.mutation(api.checkin.attendance.setClassStart, { channel: CH, startsAt: T0, graceMin: 5 });
    vi.setSystemTime(T0 + 12 * MIN);
    await scan(t, await passCode(student(t, 1)));
    const rows = await t.run((ctx) => ctx.db.query("checkins").withIndex("by_channel", (q) => q.eq("channel", CH)).collect());
    expect(rows.map((r) => r.lateMin)).toEqual([undefined]);
    expect((await prof.query(api.checkin.attendance.sheet, { channel: CH })).map((r) => r.lateMin)).toEqual([12]);
    expect((await t.query(api.checkin.attendance.lateFeed, { channel: CH })).map((r) => r.lateMin)).toEqual([12]);
    await prof.mutation(api.checkin.attendance.setClassStart, { channel: CH, startsAt: T0 + 15 * MIN, graceMin: 5 });
    expect((await prof.query(api.checkin.attendance.sheet, { channel: CH })).map((r) => r.lateMin)).toEqual([null]);
  });
});
