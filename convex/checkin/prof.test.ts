// checkin/prof: who holds a role (staffRole, requireProf, requireAdmin, requireScanner), the
// keys that no longer open anything, and the authMatrix of every host-only function in checkin/
// and live/. The staff list's and the door iPads' own functions are tested in convex/staff.test.ts.
import { describe, expect, it, vi } from "vitest";
import { api } from "../_generated/api";
import type { ActionCtx, MutationCtx } from "../_generated/server";
import {
  ADMIN_EMAIL,
  ADMIN_ONLY,
  admin,
  authMatrix,
  type Caller,
  DEV_URL,
  DEVICE_TOKEN,
  google,
  grant,
  HOST_ONLY,
  OTHER_TOKEN,
  pairDevice,
  passCode,
  PROD_URL,
  PROF_EMAIL,
  profEnv,
  professor,
  SCANNER,
  SCANNER_EMAIL,
  setup,
  type T,
  TEST_PROF_EMAIL,
  testGrant,
  typed,
  unverified,
} from "../test.helpers";
import * as prof from "./prof";

const CH = "gdg";
// The key that was hardcoded for the 10-29 demos, put together here so `git grep` for it finds nothing.
const OLD_DEMO_KEY = ["gdg", "demo", "1029"].join("-");
const student = (t: T, n: number) => typed(t, `Sample student ${n}`, `student${n}@example.edu`);

// Runs a check as `as` in a transaction (convex-test's t.run, which takes the caller's sign-in).
type Runner = Pick<T, "run">;
const role = (as: Runner) => as.run((ctx) => prof.staffRole(ctx));
const check = (as: Runner, f: (ctx: MutationCtx) => Promise<unknown>) => as.run((ctx) => f(ctx));
const scanCheck = (as: Runner, device?: string) => as.run(async (ctx) => (await prof.requireScanner(ctx, device))?._id ?? null);

describe("F6 the demo key is gone", () => {
  it("F6.2 prof.ts exports no DEMO_KEY", () => {
    expect(Object.keys(prof)).not.toContain("DEMO_KEY");
  });
});

describe("ROLES no keys", () => {
  it("ROLES no keys: prof.ts has no key checks, and PROFESSOR_KEY, KIOSK_KEY, HOST_EMAILS and the old demo key open nothing", async () => {
    expect(Object.keys(prof)).not.toContain("keyOk");
    expect(Object.keys(prof)).not.toContain("kioskKeyOk");
    vi.stubEnv("PROFESSOR_KEY", "sample-professor-key");
    vi.stubEnv("KIOSK_KEY", "sample-kiosk-key-0123");
    vi.stubEnv("HOST_EMAILS", "host@example.edu");
    const t = setup();
    for (const key of ["sample-professor-key", "sample-kiosk-key-0123", OLD_DEMO_KEY]) {
      expect(await t.query(api.checkin.pass.amHost, { key })).toBe(false);
      expect(await t.query(api.checkin.pass.canScan, { key })).toBe(false);
      await expect(t.query(api.checkin.read.names, { key, channel: CH })).rejects.toThrow("Sign in first.");
      await expect(t.mutation(api.checkin.pass.scan, { key, channel: CH, code: "ABC234" })).rejects.toThrow("Sign in first.");
    }
    // A Google account on HOST_EMAILS has no role until staff:importHostEmails adds it.
    const host = google(t, "Sample host", "host@example.edu");
    expect(await host.query(api.checkin.pass.amHost, {})).toBe(false);
    await expect(host.query(api.checkin.read.names, { channel: CH })).rejects.toThrow("Only professors can do that.");
  });
});

describe("ROLES who holds a role", () => {
  it("ROLES staffRole: ADMIN_EMAILS admins in any case, professors and scanners from the staff table, null for a student, signed out and an unverified Google email", async () => {
    vi.stubEnv("ADMIN_EMAILS", ` ${ADMIN_EMAIL.toUpperCase()} , ,second@example.edu`);
    const t = setup();
    await grant(t, PROF_EMAIL, "professor");
    await grant(t, SCANNER_EMAIL, "scanner");
    expect(await role(admin(t))).toBe("admin");
    expect(await role(google(t, "Sample admin 2", "Second@Example.edu"))).toBe("admin");
    expect(await role(google(t, "Sample professor", "PROF@example.edu"))).toBe("professor");
    expect(await role(google(t, "Sample scanner", SCANNER_EMAIL))).toBe("scanner");
    expect(await role(google(t, "Sample student 1", "student1@example.edu"))).toBeNull();
    expect(await role(t)).toBeNull();
    expect(await role(unverified(t, "Sample admin", ADMIN_EMAIL))).toBeNull();
    expect(await role(unverified(t, "Sample professor", PROF_EMAIL))).toBeNull();
    // An ADMIN_EMAILS admin stays an admin whatever their staff row says.
    await grant(t, "second@example.edu", "scanner");
    expect(await role(google(t, "Sample admin 2", "second@example.edu"))).toBe("admin");
  });

  it("ROLES typed identity never holds a role on a prod URL", async () => {
    profEnv();
    const t = setup();
    await grant(t, PROF_EMAIL, "professor");
    await grant(t, SCANNER_EMAIL, "scanner");
    // Prod's URL in any case, and a backend with no CONVEX_CLOUD_URL at all, count as prod.
    for (const url of [PROD_URL, PROD_URL.toUpperCase(), undefined, ""]) {
      vi.stubEnv("CONVEX_CLOUD_URL", url);
      expect(prof.isDevBackend()).toBe(false);
      for (const email of [ADMIN_EMAIL, PROF_EMAIL, SCANNER_EMAIL]) {
        const as = typed(t, "Sample staff", email);
        expect(await as.query(api.staff.me, {})).toEqual({ email, role: null, canHoldRole: false });
        expect(await role(as)).toBeNull();
        expect(await as.query(api.checkin.pass.amHost, {})).toBe(false);
        expect(await as.query(api.checkin.pass.canScan, {})).toBe(false);
        await expect(as.query(api.checkin.read.names, { channel: CH })).rejects.toThrow("Only professors can do that.");
        await expect(as.mutation(api.checkin.pass.scan, { channel: CH, code: "ABC234" })).rejects.toThrow("Only staff can scan passes.");
        await expect(as.query(api.staff.people, {})).rejects.toThrow("Only admins can do that.");
      }
      // The same emails signed in with Google keep their roles on prod.
      expect(await role(google(t, "Sample professor", PROF_EMAIL))).toBe("professor");
      expect(await role(admin(t))).toBe("admin");
    }
    // On a dev backend a typed sign-in holds a devGrant role on a test email, so browser checks can
    // sign in that way. The staff's real emails still hold nothing typed: the typed key is public.
    vi.stubEnv("CONVEX_CLOUD_URL", DEV_URL);
    expect(prof.isDevBackend()).toBe(true);
    await testGrant(t, TEST_PROF_EMAIL, "professor");
    expect(await typed(t, "Sample professor 1", TEST_PROF_EMAIL).query(api.staff.me, {})).toEqual({
      email: TEST_PROF_EMAIL,
      role: "professor",
      canHoldRole: true,
    });
    for (const email of [ADMIN_EMAIL, PROF_EMAIL, SCANNER_EMAIL, "student1@example.edu"]) {
      expect(await typed(t, "Sample staff", email).query(api.staff.me, {})).toEqual({ email, role: null, canHoldRole: false });
    }
    expect(await typed(t, "Sample student 2", "student2@test.local").query(api.staff.me, {})).toEqual({
      email: "student2@test.local",
      role: null,
      canHoldRole: true,
    });
  });

  it("ROLES requireProf, requireAdmin and requireScanner refuse with these messages, and say who got through", async () => {
    profEnv();
    const t = setup();
    await grant(t, SCANNER_EMAIL, "scanner");
    const iPad = await pairDevice(t);
    const scanner = google(t, "Sample scanner", SCANNER_EMAIL);
    const professorAs = await professor(t);

    await expect(check(t, prof.requireProf)).rejects.toThrow("Sign in first.");
    await expect(check(student(t, 1), prof.requireProf)).rejects.toThrow("Only professors can do that.");
    await expect(check(scanner, prof.requireProf)).rejects.toThrow("Only professors can do that.");
    expect(await check(professorAs, prof.requireProf)).toEqual({ email: PROF_EMAIL, role: "professor" });
    expect(await check(admin(t), prof.requireProf)).toEqual({ email: ADMIN_EMAIL, role: "admin" });

    await expect(check(t, prof.requireAdmin)).rejects.toThrow("Sign in first.");
    await expect(check(professorAs, prof.requireAdmin)).rejects.toThrow("Only admins can do that.");
    expect(await check(admin(t), prof.requireAdmin)).toEqual({ email: ADMIN_EMAIL, role: "admin" });

    await expect(scanCheck(t)).rejects.toThrow("Sign in first.");
    await expect(scanCheck(student(t, 1))).rejects.toThrow("Only staff can scan passes.");
    await expect(scanCheck(t, OTHER_TOKEN)).rejects.toThrow("This iPad isn't paired.");
    await expect(scanCheck(t, "not-a-token")).rejects.toThrow("This iPad isn't paired.");
    // A role gets through whatever token comes with it; the paired iPad's token gets through signed out.
    expect(await scanCheck(scanner)).toBeNull();
    expect(await scanCheck(professorAs, OTHER_TOKEN)).toBeNull();
    expect(await scanCheck(t, DEVICE_TOKEN)).toBe(iPad);
  });

  it("ROLES requireProf and requireAdmin work in an action, which asks staff.me as the same caller", async () => {
    profEnv();
    const t = setup();
    const professorAs = await professor(t);
    const profInAction = (ctx: ActionCtx) => prof.requireProf(ctx);
    const adminInAction = (ctx: ActionCtx) => prof.requireAdmin(ctx);
    const roleInAction = (ctx: ActionCtx) => prof.staffRole(ctx);
    expect(await admin(t).action(profInAction)).toEqual({ email: ADMIN_EMAIL, role: "admin" });
    expect(await professorAs.action(profInAction)).toEqual({ email: PROF_EMAIL, role: "professor" });
    expect(await professorAs.action(roleInAction)).toBe("professor");
    await expect(t.action(profInAction)).rejects.toThrow("Sign in first.");
    await expect(google(t, "Sample student 1", "student1@example.edu").action(profInAction)).rejects.toThrow("Only professors can do that.");
    await expect(professorAs.action(adminInAction)).rejects.toThrow("Only admins can do that.");
    expect(await admin(t).action(adminInAction)).toEqual({ email: ADMIN_EMAIL, role: "admin" });
  });
});

// Every host-only function in checkin/ and live/: refused signed out, for a Google student, an
// unverified Google admin, a typed sign-in with an admin's email on prod, an unknown device
// token, a scanner and the paired iPad; allowed for a typed professor on a dev backend, a Google
// professor and the admin. The door scanner also lets a scanner and the paired iPad in. Each row
// runs on its own backend, and authMatrix fails the test when a row differs.
describe("ROLES authMatrix by role for every host-only function", () => {
  it("ROLES authMatrix for checkin.read.names", async () => {
    await authMatrix(HOST_ONLY, (as) => as.query(api.checkin.read.names, { channel: CH }));
  });

  it("ROLES authMatrix for checkin.quiz.ask", async () => {
    await authMatrix(HOST_ONLY, (as) =>
      as.mutation(api.checkin.quiz.ask, { channel: CH, kind: "quiz", question: "Which one is a vowel?", choices: ["A", "B"], correct: 0 }),
    );
  });

  it("ROLES authMatrix for checkin.quiz.end", async () => {
    await authMatrix(HOST_ONLY, async (as, t) => {
      const poll = await admin(t).mutation(api.checkin.quiz.ask, { channel: CH, kind: "vote", question: "Pizza or tacos?", choices: ["Pizza", "Tacos"] });
      await as.mutation(api.checkin.quiz.end, { poll });
    });
  });

  it("ROLES authMatrix for checkin.quiz.stats", async () => {
    await authMatrix(HOST_ONLY, async (as, t) => {
      const poll = await admin(t).mutation(api.checkin.quiz.ask, { channel: CH, kind: "quiz", question: "Which one is a vowel?", choices: ["A", "B"], correct: 0 });
      await as.query(api.checkin.quiz.stats, { poll });
    });
  });

  it("ROLES authMatrix for checkin.quiz.history", async () => {
    await authMatrix(HOST_ONLY, (as) => as.query(api.checkin.quiz.history, { channel: CH }));
  });

  it("ROLES authMatrix for checkin.attendance.setClassStart", async () => {
    await authMatrix(HOST_ONLY, (as) => as.mutation(api.checkin.attendance.setClassStart, { channel: CH, startsAt: Date.now(), graceMin: 5 }));
  });

  it("ROLES authMatrix for checkin.attendance.sheet", async () => {
    await authMatrix(HOST_ONLY, (as) => as.query(api.checkin.attendance.sheet, { channel: CH }));
  });

  it("ROLES authMatrix for live.groups.setSize", async () => {
    await authMatrix(HOST_ONLY, (as) => as.mutation(api.live.groups.setSize, { channel: CH, size: 3 }));
  });

  it("ROLES authMatrix for checkin.pass.amHost (it answers false instead of refusing)", async () => {
    await authMatrix(HOST_ONLY, async (as) => {
      if (!(await as.query(api.checkin.pass.amHost, {}))) throw new Error("amHost said no");
    });
  });

  it("ROLES authMatrix for checkin.pass.scan (a scanner and the paired iPad scan too)", async () => {
    await authMatrix(SCANNER, async (as, t, device) => {
      const code = await passCode(student(t, 1));
      await as.mutation(api.checkin.pass.scan, { device, channel: CH, code });
    });
  });

  it("ROLES authMatrix for checkin.pass.canScan (it answers false instead of refusing)", async () => {
    await authMatrix(SCANNER, async (as, t, device) => {
      if (!(await as.query(api.checkin.pass.canScan, { device }))) throw new Error("canScan said no");
    });
  });

  it("ROLES a refused row throws the sign-in, role or iPad message", async () => {
    const m = await authMatrix(HOST_ONLY, (as) => as.query(api.checkin.read.names, { channel: CH }));
    expect(m.errors).toEqual({
      signedOut: expect.stringContaining("Sign in first."),
      googleStudent: expect.stringContaining("Only professors can do that."),
      unverifiedAdmin: expect.stringContaining("Only professors can do that."),
      typedProdAdmin: expect.stringContaining("Only professors can do that."),
      unknownDevice: expect.stringContaining("Sign in first."),
      scanner: expect.stringContaining("Only professors can do that."),
      pairedDevice: expect.stringContaining("Sign in first."),
    });
    const s = await authMatrix(SCANNER, async (as, t, device) => {
      const code = await passCode(student(t, 1));
      await as.mutation(api.checkin.pass.scan, { device, channel: CH, code });
    });
    expect(s.errors).toEqual({
      signedOut: expect.stringContaining("Sign in first."),
      googleStudent: expect.stringContaining("Only staff can scan passes."),
      unverifiedAdmin: expect.stringContaining("Only staff can scan passes."),
      typedProdAdmin: expect.stringContaining("Only staff can scan passes."),
      unknownDevice: expect.stringContaining("This iPad isn't paired."),
    });
  });
});

// authMatrix compares the rows with HOST_ONLY, ADMIN_ONLY or SCANNER itself, so a test that only
// awaits it still fails when a function lets the wrong caller in.
describe("F39.3 authMatrix checks its own rows", () => {
  it("F39.3 authMatrix fails a test that asserts nothing else when a function lets every caller in", async () => {
    // checkin.read.count is open to anyone, like a host-only function without its requireProf.
    await expect(authMatrix(HOST_ONLY, (as) => as.query(api.checkin.read.count, { channel: CH }))).rejects.toThrow(
      "authMatrix: rows that differ from HOST_ONLY: signedOut got through; googleStudent got through; unverifiedAdmin got through; typedProdAdmin got through; unknownDevice got through; scanner got through; pairedDevice got through",
    );
  });

  it("F39.3 authMatrix fails a row that should have finished, and says what it threw", async () => {
    // checkin.read.names refuses a scanner and the paired iPad, which SCANNER lets in.
    await expect(authMatrix(SCANNER, (as) => as.query(api.checkin.read.names, { channel: CH }))).rejects.toThrow(
      "authMatrix: rows that differ from SCANNER: scanner was refused (Only professors can do that.); pairedDevice was refused (Sign in first.)",
    );
    // A professor function lets professors in, which ADMIN_ONLY refuses.
    await expect(authMatrix(ADMIN_ONLY, (as) => as.query(api.checkin.read.names, { channel: CH }))).rejects.toThrow(
      "authMatrix: rows that differ from ADMIN_ONLY: typedDevProf got through; googleProf got through",
    );
  });

  it("F39.3 authMatrix takes HOST_ONLY, ADMIN_ONLY or SCANNER themselves, never a copy or a matrix of its own", async () => {
    const names = (as: Caller) => as.query(api.checkin.read.names, { channel: CH });
    await expect(authMatrix({ ...HOST_ONLY }, names)).rejects.toThrow("authMatrix takes HOST_ONLY, ADMIN_ONLY or SCANNER");
    await expect(authMatrix({ ...HOST_ONLY, googleStudent: true } as unknown as typeof HOST_ONLY, names)).rejects.toThrow(
      "authMatrix takes HOST_ONLY, ADMIN_ONLY or SCANNER",
    );
    expect(Object.isFrozen(HOST_ONLY) && Object.isFrozen(ADMIN_ONLY) && Object.isFrozen(SCANNER)).toBe(true);
  });

  it("F39.3 authMatrix puts CONVEX_CLOUD_URL back the way the test had it", async () => {
    vi.stubEnv("CONVEX_CLOUD_URL", DEV_URL);
    await authMatrix(HOST_ONLY, (as) => as.query(api.checkin.read.names, { channel: CH }));
    expect(process.env.CONVEX_CLOUD_URL).toBe(DEV_URL);
  });
});
