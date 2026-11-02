// checkin.pass.scan tells only professors and admins the scanned student's email. A paired door
// iPad and the scanner role get the name (and whether they were already in) with an empty email,
// since students' emails are otherwise professor-only (attendance.sheet). ROLES-UI-access-2.
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
} from "../test.helpers";

const CH = "gdg";
const student = (t: ReturnType<typeof setup>, n: number) => typed(t, `Sample student ${n}`, `student${n}@example.edu`);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(at(2026, 11, 5, 21, 30));
  profEnv();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("ROLES-UI-access-2 scan shows the student's email only to professors and admins", () => {
  it("a signed-out paired iPad gets the name and no email, first scan and repeat", async () => {
    const t = setup();
    await pairDevice(t);
    const code = await passCode(student(t, 7));
    const first = await t.mutation(api.checkin.pass.scan, { device: DEVICE_TOKEN, channel: CH, code });
    expect(first).toEqual({ name: "Sample student 7", short: "Sample 7.", email: "", already: false });
    const again = await t.mutation(api.checkin.pass.scan, { device: DEVICE_TOKEN, channel: CH, code });
    expect(again).toEqual({ name: "Sample student 7", short: "Sample 7.", email: "", already: true });
  });

  it("the scanner role gets the name and no email", async () => {
    const t = setup();
    await grant(t, SCANNER_EMAIL, "scanner");
    const code = await passCode(student(t, 8));
    const r = await google(t, "Sample scanner", SCANNER_EMAIL).mutation(api.checkin.pass.scan, { channel: CH, code });
    expect(r).toEqual({ name: "Sample student 8", short: "Sample 8.", email: "", already: false });
  });

  it("a professor and an admin get the email, and the attendance row keeps it either way", async () => {
    const t = setup();
    const prof = await professor(t);
    const a = await passCode(student(t, 1));
    expect(await prof.mutation(api.checkin.pass.scan, { channel: CH, code: a })).toEqual({
      name: "Sample student 1",
      short: "Sample 1.",
      email: "student1@example.edu",
      already: false,
    });
    const b = await passCode(student(t, 2));
    expect((await admin(t).mutation(api.checkin.pass.scan, { channel: CH, code: b })).email).toBe("student2@example.edu");

    // The iPad's empty reply changes nothing stored: the professor's sheet still has the email.
    await pairDevice(t);
    const c = await passCode(student(t, 3));
    await t.mutation(api.checkin.pass.scan, { device: DEVICE_TOKEN, channel: CH, code: c });
    const sheet = await prof.query(api.checkin.attendance.sheet, { channel: CH });
    expect(sheet.map((r) => r.email).sort()).toEqual(["student1@example.edu", "student2@example.edu", "student3@example.edu"]);
  });
});
