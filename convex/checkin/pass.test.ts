// checkin/pass: the student's QR pass, the scan at the door, and the two "who is this" queries
// (amHost for the professor pages, canScan for the door iPad).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../_generated/api";
import { endLecture } from "../lib";
import {
  ADMIN_EMAIL,
  admin,
  at,
  type Caller,
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
  type T,
  typed,
} from "../test.helpers";

const CH = "gdg";
const T0 = at(2026, 11, 5, 21, 30);
const SEC = 1000;
const HOUR = 60 * 60 * SEC;
const DAY = 24 * HOUR;
const LETTERS = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/;
// The two reasons a scan refuses a code (pass.ts).
const OLD = "That code is old. Ask them to open their pass again.";
const NOT_A_PASS = "That code isn't a pass. Ask them to open their pass again.";
// The key that was hardcoded for the 10-29 demos, put together here so `git grep` for it finds nothing.
const OLD_DEMO_KEY = ["gdg", "demo", "1029"].join("-");

const student = (t: T, n: number) => typed(t, `Sample student ${n}`, `student${n}@example.edu`);
// A call that still sends the old `key` arg. No function takes one any more, so TypeScript
// refuses it in the code; the cast sends it anyway, the way an old open tab would. The arg
// validator refuses it before the handler runs (convex-test says "Unexpected field `key`", a
// deployment "extra field `key`").
const withKey = <A extends object>(args: A, key: string) => ({ ...args, key }) as A;
const EXTRA_KEY = /(Unexpected|extra) field `key`/;

// The admin scans a code at the teacher scanner.
const scan = (t: T, code: string) => admin(t).mutation(api.checkin.pass.scan, { channel: CH, code });
// The pass page asking for a new code at each of these times, the way Student.tsx does.
async function refreshAt(s: Caller, ...times: number[]) {
  for (const time of times) {
    vi.setSystemTime(time);
    await s.mutation(api.checkin.pass.refresh, { channel: CH });
  }
}
// Every 5 s from `from` to `to`, both included: the pass page left open.
const every5s = (from: number, to: number) => Array.from({ length: Math.floor((to - from) / (5 * SEC)) + 1 }, (_, i) => from + i * 5 * SEC);
const codeOf = async (s: Caller) => (await s.query(api.checkin.pass.mine, {}))!.code;
const checkinRows = (t: T) => t.run((ctx) => ctx.db.query("checkins").withIndex("by_channel", (q) => q.eq("channel", CH)).collect());
const lectures = (t: T) => t.run((ctx) => ctx.db.query("lectures").withIndex("by_channel", (q) => q.eq("channel", CH)).collect());
// End day for the class that's open now (live.groups.endDay calls the same helper).
const endDay = (t: T) => t.run((ctx) => endLecture(ctx, CH));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  profEnv();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("F6 the demo key is gone", () => {
  it("F6.4 the old demo key opens nothing: amHost and attendance.sheet refuse a key arg, even with PROFESSOR_KEY set to it, and signed out amHost is false and sheet throws", async () => {
    const t = setup();
    await checkIn(t, student(t, 1));
    for (const professorKey of [undefined, OLD_DEMO_KEY]) {
      vi.stubEnv("PROFESSOR_KEY", professorKey);
      await expect(t.query(api.checkin.pass.amHost, withKey({}, OLD_DEMO_KEY))).rejects.toThrow(EXTRA_KEY);
      await expect(t.query(api.checkin.attendance.sheet, withKey({ channel: CH }, OLD_DEMO_KEY))).rejects.toThrow(EXTRA_KEY);
      expect(await t.query(api.checkin.pass.amHost, {})).toBe(false);
      await expect(t.query(api.checkin.attendance.sheet, { channel: CH })).rejects.toThrow("Sign in first.");
    }
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

  it("F11.5 mine returns at, when the code was made by the server's clock, so the pass page can tell an old code", async () => {
    const t = setup();
    const s = student(t, 1);
    await s.mutation(api.checkin.pass.refresh, { channel: CH });
    expect(await s.query(api.checkin.pass.mine, {})).toEqual({
      code: expect.stringMatching(LETTERS),
      name: "Sample student 1",
      email: "student1@example.edu",
      at: T0,
    });
    // A refresh that keeps the code keeps its time; a new code has the time it was made.
    await refreshAt(s, T0 + 19 * SEC);
    expect((await s.query(api.checkin.pass.mine, {}))!.at).toBe(T0);
    await refreshAt(s, T0 + 21 * SEC);
    expect((await s.query(api.checkin.pass.mine, {}))!.at).toBe(T0 + 21 * SEC);
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

  it("F11.2 with the pass page open, the code before the current one scans until the next new code replaces it, 20 to 25 s after it was replaced, and then it's on no pass", async () => {
    const t = setup();
    const s = student(t, 1);
    await refreshAt(s, ...every5s(T0, T0 + 15 * SEC));
    const c1 = await codeOf(s);
    await refreshAt(s, T0 + 20 * SEC); // c2 replaces c1
    expect((await scan(t, c1)).already).toBe(false);
    await refreshAt(s, ...every5s(T0 + 25 * SEC, T0 + 35 * SEC));
    vi.setSystemTime(T0 + 39_999);
    expect((await scan(t, c1)).already).toBe(true); // still scans 19.999 s after it was replaced
    await refreshAt(s, T0 + 40 * SEC); // c3 replaces c2: c1 is gone, 20 s after it was replaced
    await expect(scan(t, c1)).rejects.toThrow(NOT_A_PASS);

    // A refresh that lands 1 ms before the code turns 20 s old changes nothing, so the next one,
    // 5 s later, makes the new code: a code can last 25 s, and the one before it 25 s more.
    const c3 = await codeOf(s);
    await refreshAt(s, T0 + 45 * SEC, T0 + 50 * SEC, T0 + 55 * SEC, T0 + 59_999);
    expect(await codeOf(s)).toBe(c3);
    await refreshAt(s, T0 + 64_999); // c4 replaces c3, 24.999 s after c3 was made
    const replaced = T0 + 64_999;
    await refreshAt(s, replaced + 5 * SEC, replaced + 10 * SEC, replaced + 15 * SEC, replaced + 19_999);
    vi.setSystemTime(replaced + 24_998);
    expect((await scan(t, c3)).already).toBe(true); // 24.998 s after it was replaced
    await refreshAt(s, replaced + 24_999); // c5 replaces c4
    await expect(scan(t, c3)).rejects.toThrow(NOT_A_PASS);
  });

  it("F11.2 once the pass page stops asking, the code before the current one scans until 40 s after it was replaced, then 'That code is old.'", async () => {
    const t = setup();
    const a = student(t, 1);
    const b = student(t, 2);
    const a1 = await passCode(a);
    const b1 = await passCode(b);
    await refreshAt(a, T0 + 20 * SEC); // a1 and b1 replaced at T0 + 20 s; then both phones sleep
    await refreshAt(b, T0 + 20 * SEC);
    vi.setSystemTime(T0 + 20 * SEC + 39_999);
    expect((await scan(t, a1)).already).toBe(false);
    vi.setSystemTime(T0 + 20 * SEC + 40_000);
    await expect(scan(t, b1)).rejects.toThrow(OLD);
    expect(await t.query(api.checkin.read.count, { channel: CH })).toBe(1);
  });

  it("F11.3 a pass over 60 s old is refused, and its code stays refused once its phone wakes and gets a new one", async () => {
    const t = setup();
    const a = student(t, 1);
    const b = student(t, 2);
    const aCode = await passCode(a);
    const bCode = await passCode(b);
    vi.setSystemTime(T0 + 60_000);
    expect((await scan(t, aCode)).already).toBe(false); // exactly 60 s old still scans
    vi.setSystemTime(T0 + 60_001);
    await expect(scan(t, bCode)).rejects.toThrow(OLD);

    // b's phone wakes 90 s in and gets a new code. The old one is the code before the new one now,
    // but it had run out, so a screenshot of it stays refused as old (CKP-check-2).
    await refreshAt(b, T0 + 90 * SEC);
    await expect(scan(t, bCode)).rejects.toThrow(OLD);
    expect((await scan(t, await codeOf(b))).already).toBe(false);
    expect(await t.query(api.checkin.read.count, { channel: CH })).toBe(2);
  });

  it("F11.3 the longest a code scans is 60 s: its phone wakes 59 s in, while the code still scans, and sleeps again (CKP-spec-2)", async () => {
    const t = setup();
    const s = student(t, 1);
    const code = await passCode(s);
    await refreshAt(s, T0 + 59 * SEC); // the new code replaces it, so it's the code before the new one
    vi.setSystemTime(T0 + 60 * SEC);
    expect((await scan(t, code)).already).toBe(false);
    vi.setSystemTime(T0 + 60 * SEC + 1);
    await expect(scan(t, code)).rejects.toThrow(OLD);
    vi.setSystemTime(T0 + 59 * SEC + 39_999); // 40 s after it was replaced: the 10-29 rule's last moment
    await expect(scan(t, code)).rejects.toThrow(OLD);
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

  it("F11.6 a code on no pass gets 'That code isn't a pass...', a stale one 'That code is old...'", async () => {
    const t = setup();
    const s = student(t, 1);
    for (const code of ["RCC-ZZZZZZ", "zzzzzz", "RCC-12345678"]) await expect(scan(t, code)).rejects.toThrow(NOT_A_PASS);
    // The current code over 60 s old, and the code before it 40 s after it was replaced.
    const first = await passCode(s);
    vi.setSystemTime(T0 + 20 * SEC);
    const second = await passCode(s);
    vi.setSystemTime(T0 + 60 * SEC);
    await expect(scan(t, first)).rejects.toThrow(OLD);
    vi.setSystemTime(T0 + 80_001);
    await expect(scan(t, second)).rejects.toThrow(OLD);
    expect(await t.query(api.checkin.read.count, { channel: CH })).toBe(0);
  });
});

describe("F8 one check-in per student per class", () => {
  it("F8.3 a student checked in last class gets already: false and a new row in this class (no unique() error with two rows); a second scan in this class returns already: true", async () => {
    const t = setup();
    const s = student(t, 1);
    expect((await checkIn(t, s)).already).toBe(false); // the scan opens class 1
    expect((await checkIn(t, s)).already).toBe(true);
    vi.setSystemTime(T0 + HOUR);
    await endDay(t);

    vi.setSystemTime(T0 + 7 * DAY); // class 2, a week later
    expect((await checkIn(t, s)).already).toBe(false);
    expect((await checkIn(t, s)).already).toBe(true);

    // Nobody ends class 2: a scan 13 h later closes it at its 12-hour mark and opens class 3.
    vi.setSystemTime(T0 + 7 * DAY + 13 * HOUR);
    expect((await checkIn(t, s)).already).toBe(false);
    expect((await checkIn(t, s)).already).toBe(true);

    expect((await checkinRows(t)).map((r) => r.at)).toEqual([T0, T0 + 7 * DAY, T0 + 7 * DAY + 13 * HOUR]);
    expect((await lectures(t)).map((l) => [l.startedAt, l.endedAt])).toEqual([
      [T0, T0 + HOUR],
      [T0 + 7 * DAY, T0 + 7 * DAY + 12 * HOUR],
      [T0 + 7 * DAY + 13 * HOUR, undefined],
    ]);
  });

  it("F8 scan opens a class when none is open (ensureLecture) and still deals a team", async () => {
    const t = setup();
    const s = student(t, 1);
    const code = await passCode(s);
    expect(await lectures(t)).toEqual([]);
    vi.setSystemTime(T0 + 30 * SEC);
    expect((await scan(t, code)).already).toBe(false);
    const [open, ...more] = await lectures(t);
    expect(more).toEqual([]);
    expect(open).toMatchObject({ channel: CH, startedAt: T0 + 30 * SEC });
    expect(open.endedAt).toBeUndefined();
    expect(await s.query(api.live.groups.mine, { channel: CH })).toMatchObject({ team: expect.any(Number), label: expect.any(String) });

    // The next scan joins the same class, and its student gets a team too.
    const s2 = student(t, 2);
    vi.setSystemTime(T0 + 45 * SEC);
    expect((await checkIn(t, s2)).already).toBe(false);
    expect(await lectures(t)).toHaveLength(1);
    expect(await s2.query(api.live.groups.mine, { channel: CH })).not.toBeNull();
  });

  it("checkin-backend-2 a classStarts start saved on an earlier day doesn't make this class's scan late; the start saved for this class does (CKP-spec-3: worked out when read, never stored)", async () => {
    const t = setup();
    // Last week's start, in the classStarts row the way setClassStart wrote it on 10-29.
    await t.run((ctx) => ctx.db.insert("classStarts", { channel: CH, startsAt: T0 - 7 * DAY, graceMin: 5 }));
    await checkIn(t, student(t, 1));
    // Today's start, saved on the teacher page: a scan 12 minutes in is 12 minutes late.
    await admin(t).mutation(api.checkin.attendance.setClassStart, { channel: CH, startsAt: T0, graceMin: 5 });
    vi.setSystemTime(T0 + 12 * 60 * SEC);
    await checkIn(t, student(t, 2));
    expect((await admin(t).query(api.checkin.attendance.sheet, { channel: CH })).map((r) => [r.name, r.lateMin])).toEqual([
      ["Sample student 1", null],
      ["Sample student 2", 12],
    ]);
    expect((await checkinRows(t)).map((r) => r.lateMin)).toEqual([undefined, undefined]);
  });
});

describe("rt-7 and checkin-backend-11: the name on the pass", () => {
  it("rt-7 safe part: after a scan in this class, a second sign-in with the same email and another name doesn't rename the pass; before the scan, and in the next class before its scan, signing in again with a fixed name does; class 1's checkins row keeps its name", async () => {
    const t = setup();
    // A typed sign-in with the same email is the same student to the server, whatever the name.
    const as = (name: string) => typed(t, name, "student1@example.edu");
    // Signs in with this name and opens the pass page, which sends the channel; `oldPage` is a
    // page opened before the channel was sent.
    const signIn = async (name: string, oldPage = false) => {
      await as(name).mutation(api.checkin.pass.refresh, oldPage ? {} : { channel: CH });
      return (await as(name).query(api.checkin.pass.mine, {}))!.name;
    };

    expect(await signIn("Sampel student 1")).toBe("Sampel student 1"); // a typo
    expect(await signIn("Sample student 1")).toBe("Sample student 1"); // fixed before the scan
    expect((await checkIn(t, as("Sample student 1"))).name).toBe("Sample student 1");

    // Checked in to this class: another sign-in with the same email can't rename the pass, not
    // even when the code changes, and the scanner still sees the name it checked in.
    expect(await signIn("Someone else")).toBe("Sample student 1");
    vi.setSystemTime(T0 + 20 * SEC);
    expect(await signIn("Someone else")).toBe("Sample student 1");
    expect(await checkIn(t, as("Someone else"))).toMatchObject({ name: "Sample student 1", already: true });

    // The next class is open (another student was scanned first), and this one isn't in it yet:
    // a fixed name goes through. A page opened before the channel was sent never renames.
    vi.setSystemTime(T0 + HOUR);
    await endDay(t);
    vi.setSystemTime(T0 + 7 * DAY);
    await checkIn(t, student(t, 2));
    expect(await signIn("Sample Student One")).toBe("Sample Student One");
    expect(await signIn("Someone else", true)).toBe("Sample Student One");
    expect((await checkIn(t, as("Sample Student One"))).name).toBe("Sample Student One");

    // Each class's row keeps the name it was scanned with.
    const rows = (await checkinRows(t)).filter((r) => r.email === "student1@example.edu");
    expect(rows.map((r) => r.name)).toEqual(["Sample student 1", "Sample Student One"]);
  });

  it("checkin-backend-11 a spaces-only name is stored as 'Student'; an email-looking name as its local part", async () => {
    const t = setup();
    const blank = typed(t, "   ", "student1@example.edu");
    const emailed = typed(t, "sample.student2@example.edu", "sample.student2@example.edu");
    await blank.mutation(api.checkin.pass.refresh, { channel: CH });
    await emailed.mutation(api.checkin.pass.refresh, { channel: CH });
    expect((await blank.query(api.checkin.pass.mine, {}))!.name).toBe("Student");
    expect((await emailed.query(api.checkin.pass.mine, {}))!.name).toBe("sample.student2");
    expect((await checkIn(t, blank)).name).toBe("Student");
    expect((await checkIn(t, emailed)).name).toBe("sample.student2");

    // A pass made before names were cleaned can still hold the whole email: the scan checks the
    // student in with its local part, never the email.
    await t.run((ctx) =>
      ctx.db.insert("passes", { user: "legacy|student3", name: "student3@example.edu", email: "student3@example.edu", code: "LEGACY", prevCode: "", at: Date.now() }),
    );
    expect((await scan(t, "LEGACY")).name).toBe("student3");
    expect((await checkinRows(t)).map((r) => r.name)).toEqual(["Student", "sample.student2", "student3"]);
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
