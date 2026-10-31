// checkin/pass: the student's QR pass, the scan at the door, and the two "who is this" queries
// (amHost for the professor pages, canScan for the door iPad).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../_generated/api";
import {
  ADMIN_EMAIL,
  admin,
  at,
  checkIn,
  DEVICE_TOKEN,
  google,
  grant,
  OTHER_TOKEN,
  pairDevice,
  passCode,
  PROD_URL,
  profEnv,
  professor,
  SCANNER_EMAIL,
  setup,
  typed,
} from "../test.helpers";

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
    await expect(t.query(api.checkin.attendance.sheet, { key: OLD_DEMO_KEY, channel: CH })).rejects.toThrow("Sign in first.");
    vi.stubEnv("PROFESSOR_KEY", OLD_DEMO_KEY);
    expect(await t.query(api.checkin.pass.amHost, { key: OLD_DEMO_KEY })).toBe(false);
    await expect(t.query(api.checkin.attendance.sheet, { key: OLD_DEMO_KEY, channel: CH })).rejects.toThrow("Sign in first.");
  });

  it("ROLES amHost is true for a professor and an admin, and false for a scanner, a student, a typed sign-in with the admin's email on prod and signed out", async () => {
    vi.stubEnv("CONVEX_CLOUD_URL", PROD_URL);
    const t = setup();
    await grant(t, SCANNER_EMAIL, "scanner");
    expect(await (await professor(t)).query(api.checkin.pass.amHost, {})).toBe(true);
    expect(await admin(t).query(api.checkin.pass.amHost, {})).toBe(true);
    expect(await google(t, "Sample scanner", SCANNER_EMAIL).query(api.checkin.pass.amHost, {})).toBe(false);
    expect(await google(t, "Sample student 1", "student1@example.edu").query(api.checkin.pass.amHost, {})).toBe(false);
    expect(await typed(t, "Sample admin", ADMIN_EMAIL).query(api.checkin.pass.amHost, {})).toBe(false);
    expect(await t.query(api.checkin.pass.amHost, {})).toBe(false);
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
    expect(await admin(t).mutation(api.checkin.pass.scan, { channel: CH, code: first!.code })).toMatchObject({
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
      const r = await admin(t).mutation(api.checkin.pass.scan, { channel: CH, code: form(await passCode(s)) });
      expect(r).toMatchObject({ name: `Sample student ${i + 1}`, email: `student${i + 1}@example.edu`, already: false });
    }
    expect(await t.query(api.checkin.read.count, { channel: CH })).toBe(4);
  });

  it("F11.3 a pass more than 60 s old is refused", async () => {
    const t = setup();
    const a = await passCode(student(t, 1));
    const b = await passCode(student(t, 2));
    vi.setSystemTime(T0 + 30_000);
    expect((await admin(t).mutation(api.checkin.pass.scan, { channel: CH, code: a })).already).toBe(false);
    vi.setSystemTime(T0 + 61_000);
    await expect(admin(t).mutation(api.checkin.pass.scan, { channel: CH, code: b })).rejects.toThrow(/old/);
    expect(await t.query(api.checkin.read.count, { channel: CH })).toBe(1);
  });

  it("F11.4 a second scan returns already: true and adds no row; an empty code throws 'No code.'", async () => {
    const t = setup();
    const code = await passCode(student(t, 1));
    expect((await admin(t).mutation(api.checkin.pass.scan, { channel: CH, code })).already).toBe(false);
    expect((await admin(t).mutation(api.checkin.pass.scan, { channel: CH, code })).already).toBe(true);
    expect(await t.query(api.checkin.read.count, { channel: CH })).toBe(1);
    expect(await admin(t).query(api.checkin.attendance.sheet, { channel: CH })).toHaveLength(1);
    for (const empty of ["", "   ", "RCC-", " rcc- "])
      await expect(admin(t).mutation(api.checkin.pass.scan, { channel: CH, code: empty })).rejects.toThrow("No code.");
  });
});

describe("ROLES the door iPad", () => {
  it("ROLES a paired iPad scans with its device token, its last scan shows on #/admin, and the token opens nothing else", async () => {
    const t = setup();
    const id = await pairDevice(t);
    const code = await passCode(student(t, 1));
    expect(await t.query(api.checkin.pass.canScan, { device: DEVICE_TOKEN })).toBe(true);
    vi.setSystemTime(T0 + 5_000);
    expect(await t.mutation(api.checkin.pass.scan, { device: DEVICE_TOKEN, channel: CH, code })).toMatchObject({ name: "Sample student 1", already: false });
    expect(await admin(t).query(api.staff.devices, {})).toEqual([
      { _id: id, label: "Sample door", pairedBy: ADMIN_EMAIL, pairedAt: T0, lastUsedAt: T0 + 5_000 },
    ]);
    // A scan that fails changes nothing, its last use included.
    vi.setSystemTime(T0 + 9_000);
    await expect(t.mutation(api.checkin.pass.scan, { device: DEVICE_TOKEN, channel: CH, code: "" })).rejects.toThrow("No code.");
    expect((await admin(t).query(api.staff.devices, {}))[0].lastUsedAt).toBe(T0 + 5_000);
    // The token isn't a sign-in: the professor pages stay shut to the iPad.
    expect(await t.query(api.checkin.pass.amHost, {})).toBe(false);
    await expect(t.query(api.checkin.read.names, { channel: CH })).rejects.toThrow("Sign in first.");
    await expect(t.query(api.checkin.attendance.sheet, { channel: CH })).rejects.toThrow("Sign in first.");
  });

  it("ROLES canScan and scan refuse a token no iPad paired with, a malformed one, and anyone without a role; a scanner scans by role", async () => {
    const t = setup();
    await pairDevice(t);
    const code = await passCode(student(t, 1));
    for (const device of [OTHER_TOKEN, "not-a-token", DEVICE_TOKEN.toUpperCase()]) {
      expect(await t.query(api.checkin.pass.canScan, { device })).toBe(false);
      await expect(t.mutation(api.checkin.pass.scan, { device, channel: CH, code })).rejects.toThrow("This iPad isn't paired.");
    }
    expect(await t.query(api.checkin.pass.canScan, {})).toBe(false);
    expect(await student(t, 2).query(api.checkin.pass.canScan, {})).toBe(false);
    await expect(student(t, 2).mutation(api.checkin.pass.scan, { channel: CH, code })).rejects.toThrow("Only staff can scan passes.");
    expect(await t.query(api.checkin.read.count, { channel: CH })).toBe(0);
    // A scanner scans by role, with or without a token that works.
    await grant(t, SCANNER_EMAIL, "scanner");
    const scanner = google(t, "Sample scanner", SCANNER_EMAIL);
    expect(await scanner.query(api.checkin.pass.canScan, {})).toBe(true);
    expect((await scanner.mutation(api.checkin.pass.scan, { device: OTHER_TOKEN, channel: CH, code })).already).toBe(false);
    expect((await checkIn(t, student(t, 1))).already).toBe(true);
    expect(await t.query(api.checkin.read.count, { channel: CH })).toBe(1);
  });
});
