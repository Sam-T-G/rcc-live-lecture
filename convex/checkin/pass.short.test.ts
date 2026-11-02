// checkin.pass.scan's `short` (T1, 2026-11-01): the door iPad shows the scanned student's first
// name and last initial (lib.shortName), or "Someone" for a name that is the part of an email
// before the "@" (the late banner's rule, attendance.lateFeed). `name` stays the full check-in name:
// the teacher scanner shows it, and door iPads opened before `short` existed read it. The
// check-in row keeps the full name.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../_generated/api";
import {
  admin,
  at,
  DEVICE_TOKEN,
  google,
  grant,
  pairDevice,
  passCode,
  profEnv,
  professor,
  SCANNER_EMAIL,
  setup,
  typed,
  type T,
} from "../test.helpers";

const CH = "gdg";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(at(2026, 11, 5, 21, 30));
  profEnv();
});
afterEach(() => {
  vi.useRealTimers();
});

// The door iPad scans a student's pass with its device token.
async function atDoor(t: T, name: string, email: string) {
  return await t.mutation(api.checkin.pass.scan, { device: DEVICE_TOKEN, channel: CH, code: await passCode(typed(t, name, email)) });
}
const storedNames = async (t: T) => (await t.run((ctx) => ctx.db.query("checkins").withIndex("by_channel", (q) => q.eq("channel", CH)).take(20))).map((r) => r.name).sort();

describe("T1 the door iPad gets the first name and last initial as `short`; `name` stays whole", () => {
  it("T1 a paired iPad, the scanner role, a professor and an admin all get `short`; a repeat scan too; the check-in rows keep the full names", async () => {
    const t = setup();
    await pairDevice(t);
    expect(await atDoor(t, "Ivy Sample", "student1@example.edu")).toEqual({ name: "Ivy Sample", short: "Ivy S.", email: "", already: false });
    expect(await atDoor(t, "Ivy Sample", "student1@example.edu")).toEqual({ name: "Ivy Sample", short: "Ivy S.", email: "", already: true });

    await grant(t, SCANNER_EMAIL, "scanner");
    const scanner = google(t, "Sample scanner", SCANNER_EMAIL);
    const code2 = await passCode(typed(t, "Mary Ann Lee", "student2@example.edu"));
    expect(await scanner.mutation(api.checkin.pass.scan, { channel: CH, code: code2 })).toEqual({ name: "Mary Ann Lee", short: "Mary L.", email: "", already: false });

    const prof = await professor(t);
    const code3 = await passCode(typed(t, "Élodie Ñúñez", "student3@example.edu"));
    expect(await prof.mutation(api.checkin.pass.scan, { channel: CH, code: code3 })).toEqual({
      name: "Élodie Ñúñez",
      short: "Élodie Ñ.",
      email: "student3@example.edu",
      already: false,
    });
    const code4 = await passCode(typed(t, "  Mary-Jane   Watson-Parker ", "student4@example.edu"));
    expect(await admin(t).mutation(api.checkin.pass.scan, { channel: CH, code: code4 })).toMatchObject({ name: "Mary-Jane Watson-Parker", short: "Mary-Jane W." });

    // Never the short form in checkins: attendance, the CSV and the teacher's list read these.
    expect(await storedNames(t)).toEqual(["Ivy Sample", "Mary Ann Lee", "Mary-Jane Watson-Parker", "Élodie Ñúñez"].sort());
    expect((await prof.query(api.checkin.read.names, { channel: CH })).map((r) => r.name).sort()).toEqual(await storedNames(t));
  });

  it("T1 a repeat scan shortens the name on this class's check-in, not a name the pass got later", async () => {
    const t = setup();
    await pairDevice(t);
    const code = await passCode(typed(t, "Ivy Sample", "student1@example.edu"));
    await t.mutation(api.checkin.pass.scan, { device: DEVICE_TOKEN, channel: CH, code });
    // A pass renamed some other way (an old server, a direct write).
    await t.run(async (ctx) => {
      const p = await ctx.db.query("passes").withIndex("by_code", (q) => q.eq("code", code)).first();
      await ctx.db.patch("passes", p!._id, { name: "Sample Other" });
    });
    const again = await t.mutation(api.checkin.pass.scan, { device: DEVICE_TOKEN, channel: CH, code });
    expect(again).toEqual({ name: "Ivy Sample", short: "Ivy S.", email: "", already: true });
  });
});

describe("T1 a one-word name that is the part of an email before the '@' shows as 'Someone' at the door", () => {
  it("T1 typed as the sign-in's email, typed as another email, or the student's own email before the '@' in any case: 'Someone'; `name` keeps it", async () => {
    const t = setup();
    await pairDevice(t);
    expect(await atDoor(t, "jdoe1234@gmail.com", "jdoe1234@gmail.com")).toEqual({ name: "jdoe1234", short: "Someone", email: "", already: false });
    expect(await atDoor(t, "other.person@example.org", "student5@example.edu")).toMatchObject({ name: "other.person", short: "Someone" });
    expect(await atDoor(t, "JDoe5678", "jdoe5678@example.edu")).toMatchObject({ name: "JDoe5678", short: "Someone" });
    // A one-word name that isn't from an email stays as it is.
    expect(await atDoor(t, "Ana", "student6@example.edu")).toMatchObject({ name: "Ana", short: "Ana" });
    // The check-in rows keep the names, not "Someone": the professor's lists show them.
    expect(await storedNames(t)).toEqual(["Ana", "JDoe5678", "jdoe1234", "other.person"].sort());
  });

  it("T1 a pass from before names were cleaned, which holds the email itself, shows as 'Someone'", async () => {
    const t = setup();
    await pairDevice(t);
    await t.run(async (ctx) => {
      await ctx.db.insert("passes", { user: "legacy|student7", name: "legacy.student@example.edu", email: "student7@example.edu", code: "ABC234", prevCode: "", at: Date.now() });
    });
    expect(await t.mutation(api.checkin.pass.scan, { device: DEVICE_TOKEN, channel: CH, code: "RCC-ABC234" })).toEqual({
      name: "legacy.student",
      short: "Someone",
      email: "",
      already: false,
    });
  });
});
