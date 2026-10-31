// checkin/pass: the student's QR pass, the scan at the door, and the two "who is this" queries
// (amHost for the professor pages, canScan for the door kiosk).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../_generated/api";
import { at, checkIn, googleHost, HOST_EMAIL, KIOSK_KEY, kioskEnv, passCode, PROF_KEY, profEnv, setup, typed, WRONG_KEY } from "../test.helpers";

const CH = "gdg";
const T0 = at(2026, 11, 5, 21, 30);
const LETTERS = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/;
// The key that was hardcoded for the 10-29 demos, put together here so `git grep` for it finds nothing.
const OLD_DEMO_KEY = ["gdg", "demo", "1029"].join("-");

const student = (t: ReturnType<typeof setup>, n: number) => typed(t, `Sample student ${n}`, `student${n}@example.edu`);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  profEnv();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("F6 the demo key is gone", () => {
  it("F6.4 amHost with the old demo key is false and attendance.sheet with it throws", async () => {
    const t = setup();
    await checkIn(t, student(t, 1));
    expect(await t.query(api.checkin.pass.amHost, { key: OLD_DEMO_KEY })).toBe(false);
    await expect(t.query(api.checkin.attendance.sheet, { key: OLD_DEMO_KEY, channel: CH })).rejects.toThrow("That professor key is wrong.");
    vi.stubEnv("PROFESSOR_KEY", undefined);
    expect(await t.query(api.checkin.pass.amHost, { key: OLD_DEMO_KEY })).toBe(false);
    await expect(t.query(api.checkin.attendance.sheet, { key: OLD_DEMO_KEY, channel: CH })).rejects.toThrow("That professor key is wrong.");
  });

  it("F6.5 amHost is true for PROFESSOR_KEY, with or without spaces around it, and for a Google host", async () => {
    const t = setup();
    expect(await t.query(api.checkin.pass.amHost, { key: PROF_KEY })).toBe(true);
    expect(await t.query(api.checkin.pass.amHost, { key: `  ${PROF_KEY} ` })).toBe(true);
    expect(await googleHost(t).query(api.checkin.pass.amHost, {})).toBe(true);
    expect(await t.query(api.checkin.pass.amHost, {})).toBe(false);
    expect(await t.query(api.checkin.pass.amHost, { key: WRONG_KEY })).toBe(false);
    expect(await typed(t, "Sample professor", HOST_EMAIL).query(api.checkin.pass.amHost, {})).toBe(false);
  });
});

describe("F10 the pass", () => {
  it("F10.5 refresh creates the pass, keeps the code under 20 s, rotates at 20 s with the old one in prevCode", async () => {
    const t = setup();
    const s = student(t, 1);
    expect(await s.query(api.checkin.pass.mine, {})).toBeNull();
    await s.mutation(api.checkin.pass.refresh, {});
    const first = await s.query(api.checkin.pass.mine, {});
    expect(first).toMatchObject({ name: "Sample student 1", email: "student1@example.edu" });
    expect(first!.code).toMatch(LETTERS);

    vi.setSystemTime(T0 + 19_999);
    expect(await passCode(s)).toBe(first!.code);
    vi.setSystemTime(T0 + 20_000);
    const second = await passCode(s);
    expect(second).toMatch(LETTERS);
    expect(second).not.toBe(first!.code);
    // The replaced code is the pass's prevCode now, so a scan of it still checks the student in.
    expect(await t.mutation(api.checkin.pass.scan, { key: PROF_KEY, channel: CH, code: first!.code })).toMatchObject({
      name: "Sample student 1",
      already: false,
    });
  });

  it("F10.5 refresh signed out throws 'Sign in first.'", async () => {
    const t = setup();
    await expect(t.mutation(api.checkin.pass.refresh, {})).rejects.toThrow("Sign in first.");
    expect(await t.query(api.checkin.pass.mine, {})).toBeNull();
  });
});

describe("F11 scan rules", () => {
  it("F11.1 scan accepts the code with or without 'RCC-', any case, surrounding spaces", async () => {
    const t = setup();
    const forms = [
      (c: string) => c,
      (c: string) => "RCC-" + c,
      (c: string) => "  rcc-" + c.toLowerCase() + "  ",
      (c: string) => " " + c.toLowerCase() + " ",
    ];
    for (const [i, form] of forms.entries()) {
      const s = student(t, i + 1);
      const r = await t.mutation(api.checkin.pass.scan, { key: PROF_KEY, channel: CH, code: form(await passCode(s)) });
      expect(r).toMatchObject({ name: `Sample student ${i + 1}`, email: `student${i + 1}@example.edu`, already: false });
    }
    expect(await t.query(api.checkin.read.count, { channel: CH })).toBe(4);
  });

  it("F11.3 a pass more than 60 s old is refused", async () => {
    const t = setup();
    const a = await passCode(student(t, 1));
    const b = await passCode(student(t, 2));
    vi.setSystemTime(T0 + 30_000);
    expect((await t.mutation(api.checkin.pass.scan, { key: PROF_KEY, channel: CH, code: a })).already).toBe(false);
    vi.setSystemTime(T0 + 61_000);
    await expect(t.mutation(api.checkin.pass.scan, { key: PROF_KEY, channel: CH, code: b })).rejects.toThrow(/old/);
    expect(await t.query(api.checkin.read.count, { channel: CH })).toBe(1);
  });

  it("F11.4 a second scan returns already: true and adds no row; an empty code throws 'No code.'", async () => {
    const t = setup();
    const code = await passCode(student(t, 1));
    expect((await t.mutation(api.checkin.pass.scan, { key: PROF_KEY, channel: CH, code })).already).toBe(false);
    expect((await t.mutation(api.checkin.pass.scan, { key: PROF_KEY, channel: CH, code })).already).toBe(true);
    expect(await t.query(api.checkin.read.count, { channel: CH })).toBe(1);
    expect(await t.query(api.checkin.attendance.sheet, { key: PROF_KEY, channel: CH })).toHaveLength(1);
    for (const empty of ["", "   ", "RCC-", " rcc- "])
      await expect(t.mutation(api.checkin.pass.scan, { key: PROF_KEY, channel: CH, code: empty })).rejects.toThrow("No code.");
  });
});

describe("D11 the kiosk key", () => {
  it("D11 the kiosk key scans a pass and passes canScan, and opens nothing else", async () => {
    kioskEnv();
    const t = setup();
    const code = await passCode(student(t, 1));
    expect(await t.query(api.checkin.pass.canScan, { key: KIOSK_KEY })).toBe(true);
    expect(await t.mutation(api.checkin.pass.scan, { key: KIOSK_KEY, channel: CH, code })).toMatchObject({ name: "Sample student 1", already: false });
    expect(await t.query(api.checkin.pass.amHost, { key: KIOSK_KEY })).toBe(false);
    await expect(t.query(api.checkin.read.names, { key: KIOSK_KEY, channel: CH })).rejects.toThrow("That professor key is wrong.");
    await expect(t.query(api.checkin.attendance.sheet, { key: KIOSK_KEY, channel: CH })).rejects.toThrow("That professor key is wrong.");
  });

  it("D11 without KIOSK_KEY set, the professor key still scans and canScan refuses any other key", async () => {
    const t = setup();
    expect(await t.query(api.checkin.pass.canScan, { key: PROF_KEY })).toBe(true);
    expect(await t.query(api.checkin.pass.canScan, { key: ` ${PROF_KEY} ` })).toBe(true);
    expect(await t.query(api.checkin.pass.canScan, { key: KIOSK_KEY })).toBe(false);
    expect(await t.query(api.checkin.pass.canScan, {})).toBe(false);
    expect(await googleHost(t).query(api.checkin.pass.canScan, {})).toBe(true);
    expect(await typed(t, "Sample professor", HOST_EMAIL).query(api.checkin.pass.canScan, {})).toBe(false);
    const code = await passCode(student(t, 1));
    await expect(t.mutation(api.checkin.pass.scan, { key: KIOSK_KEY, channel: CH, code })).rejects.toThrow("That professor key is wrong.");
    expect((await checkIn(t, student(t, 1))).already).toBe(false);
  });

  it("D11 a KIOSK_KEY shorter than 16 characters opens nothing", async () => {
    const short = "kiosk-key-15-ch"; // 15 characters
    vi.stubEnv("KIOSK_KEY", short);
    const t = setup();
    const code = await passCode(student(t, 1));
    expect(await t.query(api.checkin.pass.canScan, { key: short })).toBe(false);
    await expect(t.mutation(api.checkin.pass.scan, { key: short, channel: CH, code })).rejects.toThrow("That professor key is wrong.");
  });
});
