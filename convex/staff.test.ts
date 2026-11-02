// staff: who is signed in (me), the staff list on #/admin (people, add, setRole, remove,
// changes), the door iPads (requestPairing, deviceStatus, approvePairing, devices, unpair,
// dropPairing) and the two CLI functions (devGrant, importHostEmails). The checks themselves are
// tested in convex/checkin/prof.test.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { pairingCodeOk } from "./staff";
import {
  ADMIN_EMAIL,
  ADMIN_ONLY,
  admin,
  at,
  authMatrix,
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
  SCANNER_EMAIL,
  setup,
  type T,
  typed,
  unverified,
} from "./test.helpers";

const CH = "gdg";
const T0 = at(2026, 11, 5, 21, 30);
const MIN = 60_000;
const NEW_EMAIL = "new@example.edu";
// How People and Changes name who added someone when it wasn't a person.
const SETTINGS = "Server settings"; // ADMIN_EMAILS admins
const OLD_LIST = "Import from the old professor list"; // staff:importHostEmails
const TEST_SETUP = "Test setup on the dev server"; // staff:devGrant

// Every test runs on prod's URL, where only Google sign-ins hold roles, unless it says otherwise.
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  profEnv();
  vi.stubEnv("CONVEX_CLOUD_URL", PROD_URL);
});
afterEach(() => {
  vi.useRealTimers();
});

const student = (t: T, n: number) => typed(t, `Sample student ${n}`, `student${n}@example.edu`);
const sha256 = async (text: string) =>
  Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))), (b) => b.toString(16).padStart(2, "0")).join("");
// Every row of the four access tables.
const rows = (t: T) =>
  t.run(async (ctx) => ({
    staff: await ctx.db.query("staff").take(100),
    staffEvents: await ctx.db.query("staffEvents").take(100),
    devices: await ctx.db.query("devices").take(100),
    pairings: await ctx.db.query("pairings").take(100),
  }));
// The pairing code an iPad with this token gets.
async function codeFor(t: T, token: string) {
  const r = await t.mutation(api.staff.requestPairing, { token });
  if (r.status !== "waiting") throw new Error("codeFor: that iPad is paired already");
  return r.code;
}
// A device token made of one byte, repeated: "00" x 32, "01" x 32, ...
const tokenN = (n: number) => n.toString(16).padStart(2, "0").repeat(32);
// How many pairing requests are stored (rows() reads only 100).
const pairingCount = (t: T) => t.run(async (ctx) => (await ctx.db.query("pairings").take(1000)).length);

describe("ROLES staff.me", () => {
  it("ROLES staff.me is null signed out; otherwise it gives the email, the role and whether the sign-in can hold one", async () => {
    const t = setup();
    await grant(t, SCANNER_EMAIL, "scanner");
    expect(await t.query(api.staff.me, {})).toBeNull();
    expect(await admin(t).query(api.staff.me, {})).toEqual({ email: ADMIN_EMAIL, role: "admin", canHoldRole: true });
    expect(await (await professor(t)).query(api.staff.me, {})).toEqual({ email: PROF_EMAIL, role: "professor", canHoldRole: true });
    expect(await google(t, "Sample scanner", "Door@Example.edu").query(api.staff.me, {})).toEqual({ email: SCANNER_EMAIL, role: "scanner", canHoldRole: true });
    expect(await google(t, "Sample student 1", "student1@example.edu").query(api.staff.me, {})).toEqual({
      email: "student1@example.edu",
      role: null,
      canHoldRole: true,
    });
    expect(await unverified(t, "Sample admin", ADMIN_EMAIL).query(api.staff.me, {})).toEqual({ email: ADMIN_EMAIL, role: null, canHoldRole: false });
    expect(await typed(t, "Sample admin", ADMIN_EMAIL).query(api.staff.me, {})).toEqual({ email: ADMIN_EMAIL, role: null, canHoldRole: false });
  });
});

// The staff list's functions are admin-only and the door iPad list and pairing are for
// professors and admins (rows as in convex/test.helpers.ts).
describe("ROLES authMatrix by role for every host-only function", () => {
  it("ROLES authMatrix for staff.people", async () => {
    await authMatrix(ADMIN_ONLY, (as) => as.query(api.staff.people, {}));
  });

  it("ROLES authMatrix for staff.add", async () => {
    await authMatrix(ADMIN_ONLY, (as) => as.mutation(api.staff.add, { email: NEW_EMAIL, role: "professor" }));
  });

  it("ROLES authMatrix for staff.setRole", async () => {
    await authMatrix(ADMIN_ONLY, async (as, t) => {
      await grant(t, NEW_EMAIL, "professor");
      await as.mutation(api.staff.setRole, { email: NEW_EMAIL, role: "scanner" });
    });
  });

  it("ROLES authMatrix for staff.remove", async () => {
    await authMatrix(ADMIN_ONLY, async (as, t) => {
      await grant(t, NEW_EMAIL, "professor");
      await as.mutation(api.staff.remove, { email: NEW_EMAIL });
    });
  });

  it("ROLES authMatrix for staff.changes", async () => {
    await authMatrix(ADMIN_ONLY, (as) => as.query(api.staff.changes, {}));
  });

  it("ROLES authMatrix for staff.devices", async () => {
    await authMatrix(HOST_ONLY, (as) => as.query(api.staff.devices, {}));
  });

  it("ROLES authMatrix for staff.approvePairing", async () => {
    await authMatrix(HOST_ONLY, async (as, t) => {
      const code = await codeFor(t, OTHER_TOKEN);
      await as.mutation(api.staff.approvePairing, { code, label: "A-210 door" });
    });
  });

  it("ROLES authMatrix for staff.unpair", async () => {
    await authMatrix(HOST_ONLY, async (as, t) => {
      // Paired by a test email, so the typed test professor may unpair it too (a test sign-in
      // can't unpair a real professor's iPad: sweep1-access-2 below).
      const device = await pairDevice(t, OTHER_TOKEN, "Spare door");
      await t.run((ctx) => ctx.db.patch("devices", device, { pairedBy: "door1@test.local" }));
      await as.mutation(api.staff.unpair, { device });
    });
  });
});

describe("ROLES admin: only admins change roles, env admins locked, every change logged", () => {
  it("ROLES admin: an admin adds, changes and removes a person, each change works at once, and Changes lists each one", async () => {
    const t = setup();
    const boss = admin(t);
    const newcomer = google(t, "Sample professor 2", NEW_EMAIL);
    expect(await newcomer.query(api.checkin.pass.amHost, {})).toBe(false);

    await boss.mutation(api.staff.add, { email: "  New@Example.EDU ", role: "professor" });
    expect(await newcomer.query(api.checkin.pass.amHost, {})).toBe(true);
    expect(await boss.query(api.staff.people, {})).toEqual([
      { email: ADMIN_EMAIL, role: "admin", addedBy: SETTINGS, at: null, locked: true },
      { email: NEW_EMAIL, role: "professor", addedBy: ADMIN_EMAIL, at: T0, locked: false },
    ]);

    vi.setSystemTime(T0 + MIN);
    await boss.mutation(api.staff.setRole, { email: NEW_EMAIL, role: "scanner" });
    expect(await newcomer.query(api.checkin.pass.amHost, {})).toBe(false);
    expect(await newcomer.query(api.checkin.pass.canScan, {})).toBe(true);

    vi.setSystemTime(T0 + 2 * MIN);
    await boss.mutation(api.staff.remove, { email: NEW_EMAIL });
    expect(await newcomer.query(api.staff.me, {})).toMatchObject({ role: null });
    expect(await newcomer.query(api.checkin.pass.canScan, {})).toBe(false);
    expect(await boss.query(api.staff.people, {})).toEqual([{ email: ADMIN_EMAIL, role: "admin", addedBy: SETTINGS, at: null, locked: true }]);

    const changes = await boss.query(api.staff.changes, {});
    expect(changes.map((c) => [c.at, c.by, c.action, c.email, c.role, c.oldRole, c.label, c.text])).toEqual([
      [T0 + 2 * MIN, ADMIN_EMAIL, "remove", NEW_EMAIL, null, "scanner", null, `${ADMIN_EMAIL} removed ${NEW_EMAIL} (scanner).`],
      [T0 + MIN, ADMIN_EMAIL, "role", NEW_EMAIL, "scanner", "professor", null, `${ADMIN_EMAIL} changed ${NEW_EMAIL} from professor to scanner.`],
      [T0, ADMIN_EMAIL, "add", NEW_EMAIL, "professor", null, null, `${ADMIN_EMAIL} added ${NEW_EMAIL} as professor.`],
    ]);
  });

  it("ROLES admin: only admins change roles: a professor, a scanner, a student, a typed sign-in with the admin's email on prod and an unverified Google admin change nothing", async () => {
    const t = setup();
    await grant(t, SCANNER_EMAIL, "scanner");
    const professorAs = await professor(t);
    const before = await rows(t);
    for (const as of [professorAs, google(t, "Sample scanner", SCANNER_EMAIL), student(t, 1), typed(t, "Sample admin", ADMIN_EMAIL), unverified(t, "Sample admin", ADMIN_EMAIL)]) {
      await expect(as.mutation(api.staff.add, { email: NEW_EMAIL, role: "admin" })).rejects.toThrow("Only admins can do that.");
      await expect(as.mutation(api.staff.setRole, { email: PROF_EMAIL, role: "admin" })).rejects.toThrow("Only admins can do that.");
      await expect(as.mutation(api.staff.remove, { email: SCANNER_EMAIL })).rejects.toThrow("Only admins can do that.");
      await expect(as.query(api.staff.people, {})).rejects.toThrow("Only admins can do that.");
      await expect(as.query(api.staff.changes, {})).rejects.toThrow("Only admins can do that.");
    }
    await expect(t.mutation(api.staff.add, { email: NEW_EMAIL, role: "admin" })).rejects.toThrow("Sign in first.");
    expect(await rows(t)).toEqual(before);
  });

  it("ROLES admin: ADMIN_EMAILS admins are locked: People lists them first, and add, setRole and remove refuse them in any case", async () => {
    vi.stubEnv("ADMIN_EMAILS", `${ADMIN_EMAIL}, Second@Example.edu`);
    const t = setup();
    const boss = admin(t);
    for (const email of [ADMIN_EMAIL, " SECOND@example.edu "]) {
      await expect(boss.mutation(api.staff.add, { email, role: "professor" })).rejects.toThrow(`${email.trim().toLowerCase()} is a permanent admin already (set in the server settings).`);
      await expect(boss.mutation(api.staff.setRole, { email, role: "scanner" })).rejects.toThrow(
        `${email.trim().toLowerCase()} is a permanent admin (set in the server settings), so their role can't change here.`,
      );
      await expect(boss.mutation(api.staff.remove, { email })).rejects.toThrow(
        `${email.trim().toLowerCase()} is a permanent admin (set in the server settings), so they can't be removed here.`,
      );
    }
    // The second ADMIN_EMAILS admin can't remove the first either.
    await expect(google(t, "Sample admin 2", "second@example.edu").mutation(api.staff.remove, { email: ADMIN_EMAIL })).rejects.toThrow(
      "so they can't be removed here.",
    );
    // A staff row with another role doesn't demote an ADMIN_EMAILS admin, and People still shows them locked.
    await grant(t, "second@example.edu", "scanner");
    await grant(t, PROF_EMAIL, "professor");
    expect(await google(t, "Sample admin 2", "second@example.edu").query(api.staff.me, {})).toMatchObject({ role: "admin" });
    expect(await boss.query(api.staff.people, {})).toEqual([
      { email: ADMIN_EMAIL, role: "admin", addedBy: SETTINGS, at: null, locked: true },
      { email: "second@example.edu", role: "admin", addedBy: SETTINGS, at: null, locked: true },
      { email: PROF_EMAIL, role: "professor", addedBy: ADMIN_EMAIL, at: T0, locked: false },
    ]);
    expect(await boss.query(api.staff.changes, {})).toEqual([]);
  });

  it("ROLES admin: every change is logged once: a repeated add, the same role again and removing someone not listed log nothing", async () => {
    const t = setup();
    const boss = admin(t);
    await boss.mutation(api.staff.add, { email: NEW_EMAIL, role: "professor" });
    await boss.mutation(api.staff.add, { email: NEW_EMAIL, role: "professor" }); // a retry: nothing new
    await boss.mutation(api.staff.setRole, { email: NEW_EMAIL, role: "professor" });
    await boss.mutation(api.staff.remove, { email: "nobody@example.edu" });
    await expect(boss.mutation(api.staff.add, { email: NEW_EMAIL, role: "scanner" })).rejects.toThrow(
      `${NEW_EMAIL} is on the staff list already (professor). Change the role in the list.`,
    );
    await expect(boss.mutation(api.staff.setRole, { email: "nobody@example.edu", role: "scanner" })).rejects.toThrow("nobody@example.edu isn't on the staff list.");
    for (const email of ["", "   ", "new", "new@", "@example.edu", "new@example", "a b@example.edu"])
      await expect(boss.mutation(api.staff.add, { email, role: "professor" })).rejects.toThrow("Type a whole email address, like name@example.edu.");
    const { staff, staffEvents } = await rows(t);
    expect(staff.map((s) => [s.email, s.role])).toEqual([[NEW_EMAIL, "professor"]]);
    expect(staffEvents.map((e) => [e.by, e.action, e.email])).toEqual([[ADMIN_EMAIL, "add", NEW_EMAIL]]);

    // An admin added on #/admin (a staff row, not ADMIN_EMAILS) manages the list too, and Changes names them.
    await boss.mutation(api.staff.add, { email: "dean@example.edu", role: "admin" });
    const dean = google(t, "Sample dean", "dean@example.edu");
    await dean.mutation(api.staff.setRole, { email: NEW_EMAIL, role: "scanner" });
    expect((await boss.query(api.staff.changes, {}))[0].text).toBe(`dean@example.edu changed ${NEW_EMAIL} from professor to scanner.`);
    // ...and can be removed, which ends their access at once.
    await boss.mutation(api.staff.remove, { email: "dean@example.edu" });
    await expect(dean.query(api.staff.people, {})).rejects.toThrow("Only admins can do that.");
    expect((await boss.query(api.staff.changes, {})).map((c) => c.action)).toEqual(["remove", "role", "add", "add"]);
  });
});

describe("ROLES pairing: expiry, single use, unpair revokes, only staff approve, token stored hashed", () => {
  it("ROLES pairing: the iPad gets a 6-digit code, a professor approves it with a name, the iPad's status flips to paired and it scans", async () => {
    const t = setup();
    expect(await t.query(api.staff.deviceStatus, { token: DEVICE_TOKEN })).toEqual({ status: "none" });
    const asked = await t.mutation(api.staff.requestPairing, { token: DEVICE_TOKEN });
    expect(asked).toEqual({ status: "waiting", code: expect.stringMatching(/^\d{6}$/), expiresAt: T0 + 10 * MIN });
    if (asked.status !== "waiting") throw new Error("expected a code");
    expect(await t.query(api.staff.deviceStatus, { token: DEVICE_TOKEN })).toEqual(asked);
    // Asking again (the page reloaded) gives the same code until it expires.
    vi.setSystemTime(T0 + MIN);
    expect(await t.mutation(api.staff.requestPairing, { token: DEVICE_TOKEN })).toEqual(asked);
    expect(await t.query(api.checkin.pass.canScan, { device: DEVICE_TOKEN })).toBe(false);

    const professorAs = await professor(t);
    const typedWithSpace = `${asked.code.slice(0, 3)} ${asked.code.slice(3)}`;
    const device = await professorAs.mutation(api.staff.approvePairing, { code: typedWithSpace, label: "  A-210   door " });
    expect(await t.query(api.staff.deviceStatus, { token: DEVICE_TOKEN })).toEqual({ status: "paired", label: "A-210 door" });
    expect(await t.mutation(api.staff.requestPairing, { token: DEVICE_TOKEN })).toEqual({ status: "paired", label: "A-210 door" });
    expect(await professorAs.query(api.staff.devices, {})).toEqual([{ _id: device, label: "A-210 door", pairedBy: PROF_EMAIL, pairedAt: T0 + MIN, lastUsedAt: null }]);

    // Signed out, the iPad scans a pass with its token. It shows `short`, the first name and last
    // initial (T1); `name` stays whole for door iPads opened before `short` existed.
    vi.setSystemTime(T0 + 2 * MIN);
    expect(await t.query(api.checkin.pass.canScan, { device: DEVICE_TOKEN })).toBe(true);
    const code = await passCode(student(t, 1));
    expect(await t.mutation(api.checkin.pass.scan, { device: DEVICE_TOKEN, channel: CH, code })).toEqual({ name: "Sample student 1", short: "Sample 1.", email: "", already: false });
    expect((await professorAs.query(api.staff.devices, {}))[0].lastUsedAt).toBe(T0 + 2 * MIN);
    expect((await admin(t).query(api.staff.changes, {}))[0]).toMatchObject({
      by: PROF_EMAIL,
      action: "pair",
      email: null,
      label: "A-210 door",
      text: `${PROF_EMAIL} paired the door iPad "A-210 door".`,
    });
  });

  it("ROLES pairing: a code expires after 10 minutes; the iPad's status goes back to none and it gets a new code", async () => {
    const t = setup();
    const professorAs = await professor(t);
    const mine = await codeFor(t, DEVICE_TOKEN);
    const other = await codeFor(t, OTHER_TOKEN);
    // One millisecond before the 10 minutes are up a code still pairs.
    vi.advanceTimersByTime(10 * MIN - 1);
    await professorAs.mutation(api.staff.approvePairing, { code: other, label: "B-110 door" });
    // At 10 minutes it doesn't, and the job that drops the request has run.
    vi.advanceTimersByTime(1);
    await t.finishInProgressScheduledFunctions();
    await expect(professorAs.mutation(api.staff.approvePairing, { code: mine, label: "A-210 door" })).rejects.toThrow(
      "That code is wrong or expired. Check the code on the iPad.",
    );
    expect(await t.query(api.staff.deviceStatus, { token: DEVICE_TOKEN })).toEqual({ status: "none" });
    expect((await rows(t)).pairings).toEqual([]);
    // The iPad asks again and gets a code good for another 10 minutes.
    const again = await t.mutation(api.staff.requestPairing, { token: DEVICE_TOKEN });
    expect(again).toMatchObject({ status: "waiting", expiresAt: T0 + 20 * MIN });

    // A request past its time counts as expired even before the job drops it. The code passes the
    // check digit, so approvePairing gets as far as reading the request (sweep1-tests-1).
    const stale = "123459";
    expect(pairingCodeOk(stale)).toBe(true);
    await t.run(async (ctx) => {
      await ctx.db.insert("pairings", { code: stale, tokenHash: await sha256(tokenN(7)), expiresAt: Date.now() - 1 });
    });
    await expect(professorAs.mutation(api.staff.approvePairing, { code: stale, label: "C-300 door" })).rejects.toThrow("That code is wrong or expired.");
    expect(await t.query(api.staff.deviceStatus, { token: tokenN(7) })).toEqual({ status: "none" });
    expect(await t.mutation(api.staff.requestPairing, { token: tokenN(7) })).toMatchObject({ status: "waiting", expiresAt: Date.now() + 10 * MIN });
  });

  it("ROLES pairing: dropPairing removes a request only once its code has expired", async () => {
    const t = setup();
    await codeFor(t, DEVICE_TOKEN);
    const [request] = (await rows(t)).pairings;
    await t.mutation(internal.staff.dropPairing, { pairing: request._id });
    expect((await rows(t)).pairings).toHaveLength(1);
    vi.advanceTimersByTime(10 * MIN);
    await t.finishInProgressScheduledFunctions();
    expect((await rows(t)).pairings).toEqual([]);
    await t.mutation(internal.staff.dropPairing, { pairing: request._id }); // gone already: nothing happens
  });

  it("ROLES pairing: a used code can't pair twice", async () => {
    const t = setup();
    const professorAs = await professor(t);
    const code = await codeFor(t, DEVICE_TOKEN);
    const first = await professorAs.mutation(api.staff.approvePairing, { code, label: "A-210 door" });
    await expect(professorAs.mutation(api.staff.approvePairing, { code, label: "Another door" })).rejects.toThrow("That code is wrong or expired.");
    await expect(admin(t).mutation(api.staff.approvePairing, { code, label: "Another door" })).rejects.toThrow("That code is wrong or expired.");
    const { devices, pairings, staffEvents } = await rows(t);
    expect(devices.map((d) => [d._id, d.label])).toEqual([[first, "A-210 door"]]);
    expect(pairings).toEqual([]);
    expect(staffEvents.filter((e) => e.action === "pair")).toHaveLength(1);
  });

  it("ROLES pairing: unpair revokes scanning at once, the iPad's status goes back to none, and pairing again takes a new approved code", async () => {
    const t = setup();
    const professorAs = await professor(t);
    const device = await pairDevice(t);
    expect((await t.mutation(api.checkin.pass.scan, { device: DEVICE_TOKEN, channel: CH, code: await passCode(student(t, 1)) })).already).toBe(false);

    await professorAs.mutation(api.staff.unpair, { device });
    await professorAs.mutation(api.staff.unpair, { device }); // a second press: nothing more happens
    expect(await t.query(api.staff.deviceStatus, { token: DEVICE_TOKEN })).toEqual({ status: "none" });
    expect(await t.query(api.checkin.pass.canScan, { device: DEVICE_TOKEN })).toBe(false);
    await expect(t.mutation(api.checkin.pass.scan, { device: DEVICE_TOKEN, channel: CH, code: await passCode(student(t, 2)) })).rejects.toThrow(
      "This iPad isn't paired.",
    );
    expect(await professorAs.query(api.staff.devices, {})).toEqual([]);
    expect((await admin(t).query(api.staff.changes, {})).map((c) => c.text)).toEqual([`${PROF_EMAIL} unpaired the door iPad "Sample door".`]);

    const code = await codeFor(t, DEVICE_TOKEN);
    expect(await t.query(api.checkin.pass.canScan, { device: DEVICE_TOKEN })).toBe(false);
    await professorAs.mutation(api.staff.approvePairing, { code, label: "A-210 door" });
    expect(await t.query(api.checkin.pass.canScan, { device: DEVICE_TOKEN })).toBe(true);
  });

  it("ROLES pairing: only staff approve: signed out, a student, a scanner and a typed sign-in with the admin's email on prod can't, and a professor's typos are refused", async () => {
    const t = setup();
    await grant(t, SCANNER_EMAIL, "scanner");
    const code = await codeFor(t, DEVICE_TOKEN);
    await expect(t.mutation(api.staff.approvePairing, { code, label: "A-210 door" })).rejects.toThrow("Sign in first.");
    await expect(student(t, 1).mutation(api.staff.approvePairing, { code, label: "A-210 door" })).rejects.toThrow("Only professors can do that.");
    await expect(google(t, "Sample scanner", SCANNER_EMAIL).mutation(api.staff.approvePairing, { code, label: "A-210 door" })).rejects.toThrow(
      "Only professors can do that.",
    );
    await expect(typed(t, "Sample admin", ADMIN_EMAIL).mutation(api.staff.approvePairing, { code, label: "A-210 door" })).rejects.toThrow(
      "Only professors can do that.",
    );
    expect(await t.query(api.staff.deviceStatus, { token: DEVICE_TOKEN })).toMatchObject({ status: "waiting", code });
    // Unpairing and the device list are for professors and admins too.
    const device = await pairDevice(t, OTHER_TOKEN, "Spare door");
    await expect(google(t, "Sample scanner", SCANNER_EMAIL).mutation(api.staff.unpair, { device })).rejects.toThrow("Only professors can do that.");
    await expect(student(t, 1).query(api.staff.devices, {})).rejects.toThrow("Only professors can do that.");

    const professorAs = await professor(t);
    for (const typo of ["", "12345", "1234567", "abcdef", "12 34 5"])
      await expect(professorAs.mutation(api.staff.approvePairing, { code: typo, label: "A-210 door" })).rejects.toThrow("Type every digit of the code on the iPad.");
    await expect(professorAs.mutation(api.staff.approvePairing, { code, label: "   " })).rejects.toThrow("Name the iPad, for example A-210 door.");
    await expect(professorAs.mutation(api.staff.approvePairing, { code, label: "x".repeat(41) })).rejects.toThrow("Keep the name to 40 characters.");
    await professorAs.mutation(api.staff.approvePairing, { code: `${code.slice(0, 3)}-${code.slice(3)}`, label: "x".repeat(40) });
    expect(await t.query(api.staff.deviceStatus, { token: DEVICE_TOKEN })).toEqual({ status: "paired", label: "x".repeat(40) });
  });

  it("ROLES pairing: the token is stored hashed: no row holds it, the stored hash doesn't scan, and a malformed token is refused", async () => {
    const t = setup();
    const professorAs = await professor(t);
    const hash = await sha256(DEVICE_TOKEN);
    const code = await codeFor(t, DEVICE_TOKEN);
    expect(JSON.stringify(await rows(t))).not.toContain(DEVICE_TOKEN);
    expect((await rows(t)).pairings.map((p) => p.tokenHash)).toEqual([hash]);
    await professorAs.mutation(api.staff.approvePairing, { code, label: "A-210 door" });
    expect(JSON.stringify(await rows(t))).not.toContain(DEVICE_TOKEN);
    expect((await rows(t)).devices.map((d) => d.tokenHash)).toEqual([hash]);
    // The pages never get the hash back.
    expect(JSON.stringify(await professorAs.query(api.staff.devices, {}))).not.toContain(hash);
    expect(JSON.stringify(await t.query(api.staff.deviceStatus, { token: DEVICE_TOKEN }))).not.toContain(hash);
    // Someone who reads the stored hash can't scan with it: the server hashes what it gets.
    const pass = await passCode(student(t, 1));
    expect(await t.query(api.checkin.pass.canScan, { device: hash })).toBe(false);
    await expect(t.mutation(api.checkin.pass.scan, { device: hash, channel: CH, code: pass })).rejects.toThrow("This iPad isn't paired.");
    // A token that isn't 64 lower-case hex characters is refused and reads as none.
    for (const token of ["", "short", DEVICE_TOKEN.toUpperCase(), DEVICE_TOKEN + "0", DEVICE_TOKEN.slice(1)]) {
      await expect(t.mutation(api.staff.requestPairing, { token })).rejects.toThrow(
        "This iPad's saved ID is broken. Clear this site's data in the iPad's settings, then open the page again.",
      );
      expect(await t.query(api.staff.deviceStatus, { token })).toEqual({ status: "none" });
    }
  });

  // A flood that holds every 6-digit code is the sweep2-access-1 test below.
  it("ROLES pairing: codes are unique among open requests, and 230 throwaway requests from a signed-out caller don't keep a door iPad from getting a code", async () => {
    const t = setup();
    const first = await codeFor(t, tokenN(0));
    expect(pairingCodeOk(first)).toBe(true);
    // Make the next code's 5 random digits come out the same as the first one's: the request picks
    // others. The 6th digit is the check digit of the 5.
    const nextFive = first.startsWith("42424") ? "13131" : "42424";
    const real = crypto.getRandomValues.bind(crypto);
    let fives = 0;
    const spy = vi.spyOn(crypto, "getRandomValues").mockImplementation(((array: ArrayBufferView) => {
      if (!ArrayBuffer.isView(array) || array.byteLength !== 5) return real(array as Uint8Array);
      const digits = fives++ === 0 ? first : nextFive;
      const bytes = new Uint8Array(array.buffer, array.byteOffset, 5);
      for (let i = 0; i < 5; i++) bytes[i] = Number(digits[i]);
      return array;
    }) as typeof crypto.getRandomValues);
    let next: string;
    try {
      next = await codeFor(t, tokenN(1));
      expect(next.slice(0, 5)).toBe(nextFive);
      expect(pairingCodeOk(next)).toBe(true);
      expect(fives).toBe(2);
    } finally {
      spy.mockRestore();
    }

    // Someone signed out sends 200 throwaway requests. The codes stay unique and none is ended.
    const codes = [first, next];
    for (let n = 2; n < 200; n++) codes.push(await codeFor(t, tokenN(n)));
    expect(new Set(codes).size).toBe(200);
    // The door iPad still gets a code, and the throwaway requests are all still open.
    const door = await codeFor(t, DEVICE_TOKEN);
    expect(pairingCodeOk(door)).toBe(true);
    expect(await pairingCount(t)).toBe(201);
    expect(await t.query(api.staff.deviceStatus, { token: tokenN(0) })).toMatchObject({ status: "waiting", code: first });
    // A professor types the door iPad's code and it pairs.
    await (await professor(t)).mutation(api.staff.approvePairing, { code: door, label: "A-210 door" });
    expect(await t.query(api.staff.deviceStatus, { token: DEVICE_TOKEN })).toEqual({ status: "paired", label: "A-210 door" });
    // An iPad already waiting gets its own code back.
    expect(await codeFor(t, tokenN(5))).toBe(codes[5]);
    expect(await t.query(api.staff.deviceStatus, { token: tokenN(1) })).toMatchObject({ status: "waiting", code: next });
    // A second round of throwaway tokens doesn't stop the next iPad either.
    for (let n = 200; n < 230; n++) await codeFor(t, tokenN(n));
    expect(pairingCodeOk(await codeFor(t, OTHER_TOKEN))).toBe(true);
    expect(await pairingCount(t)).toBe(231);
  });

  it("sweep2-access-1 with every 6-digit code open (about 100,000 signed-out requests), the door iPad gets an 8-digit code and a professor pairs it", async () => {
    const t = setup();
    // One open request, and every 6-digit draw lands on its code: what the door iPad sees when a
    // flood holds all 100,000 6-digit codes, without writing 100,000 rows.
    const held = await codeFor(t, tokenN(0));
    const real = crypto.getRandomValues.bind(crypto);
    let fives = 0;
    const spy = vi.spyOn(crypto, "getRandomValues").mockImplementation(((array: ArrayBufferView) => {
      if (!ArrayBuffer.isView(array) || array.byteLength !== 5) return real(array as Uint8Array);
      fives++;
      const bytes = new Uint8Array(array.buffer, array.byteOffset, 5);
      for (let i = 0; i < 5; i++) bytes[i] = Number(held[i]);
      return array;
    }) as typeof crypto.getRandomValues);
    let door: string;
    try {
      door = await codeFor(t, DEVICE_TOKEN);
    } finally {
      spy.mockRestore();
    }
    expect(fives).toBe(20);
    expect(door).toMatch(/^\d{8}$/);
    expect(pairingCodeOk(door)).toBe(true);
    // The 8th digit checks the first 7: a one-digit typo or swapped neighbors is refused.
    const typo = door.slice(0, 7) + String((Number(door[7]) + 1) % 10);
    expect(pairingCodeOk(typo)).toBe(false);
    for (let i = 0; i < 7; i++) {
      if (door[i] === door[i + 1]) continue;
      expect(pairingCodeOk(door.slice(0, i) + door[i + 1] + door[i] + door.slice(i + 2))).toBe(false);
    }
    const professorAs = await professor(t);
    await expect(professorAs.mutation(api.staff.approvePairing, { code: door.slice(0, 7), label: "A-210 door" })).rejects.toThrow(
      "Type every digit of the code on the iPad.",
    );
    await expect(professorAs.mutation(api.staff.approvePairing, { code: typo, label: "A-210 door" })).rejects.toThrow(
      "That code is wrong or expired. Check the code on the iPad.",
    );
    // Typed with the space the kiosk shows ("1234 5678"), it pairs the door iPad, not the held one.
    await professorAs.mutation(api.staff.approvePairing, { code: `${door.slice(0, 4)} ${door.slice(4)}`, label: "A-210 door" });
    expect(await t.query(api.staff.deviceStatus, { token: DEVICE_TOKEN })).toEqual({ status: "paired", label: "A-210 door" });
    expect(await t.query(api.staff.deviceStatus, { token: tokenN(0) })).toMatchObject({ status: "waiting", code: held });
  });
});

describe("ROLES devGrant and importHostEmails (CLI only)", () => {
  it("ROLES devGrant gives a typed test email a role on a dev backend, never twice, and refuses on prod", async () => {
    const t = setup();
    for (const url of [PROD_URL, undefined]) {
      vi.stubEnv("CONVEX_CLOUD_URL", url);
      await expect(t.mutation(internal.staff.devGrant, { email: "prof1@test.local", role: "professor" })).rejects.toThrow(
        "staff:devGrant runs only on the dev backends in DEV_HOSTS in convex/checkin/prof.ts, and ",
      );
    }
    expect((await rows(t)).staff).toEqual([]);

    vi.stubEnv("CONVEX_CLOUD_URL", DEV_URL);
    const tester = typed(t, "Sample professor 1", "prof1@test.local");
    expect(await tester.query(api.checkin.pass.amHost, {})).toBe(false);
    expect(await t.mutation(internal.staff.devGrant, { email: " Prof1@Test.local ", role: "professor" })).toBe("prof1@test.local is professor now, for 2 hours.");
    expect(await tester.query(api.checkin.pass.amHost, {})).toBe(true);
    expect(await t.mutation(internal.staff.devGrant, { email: "prof1@test.local", role: "professor" })).toBe(
      "prof1@test.local is professor already. The 2 hours start again now.",
    );
    expect(await t.mutation(internal.staff.devGrant, { email: "prof1@test.local", role: "admin" })).toBe("prof1@test.local is admin now, for 2 hours.");
    // A test sign-in sees only test emails (sweep1-access-2): the ADMIN_EMAILS admin is left out.
    expect(await tester.query(api.staff.people, {})).toEqual([
      { email: "prof1@test.local", role: "admin", addedBy: TEST_SETUP, at: T0, locked: false },
    ]);
    expect((await tester.query(api.staff.changes, {})).map((c) => c.text)).toEqual([
      `${TEST_SETUP} changed prof1@test.local from professor to admin.`,
      `${TEST_SETUP} added prof1@test.local as professor.`,
    ]);
    expect((await tester.query(api.staff.changes, {})).map((c) => c.by)).toEqual([TEST_SETUP, TEST_SETUP]);
    // The same typed sign-in holds nothing on prod.
    vi.stubEnv("CONVEX_CLOUD_URL", PROD_URL);
    expect(await tester.query(api.checkin.pass.amHost, {})).toBe(false);
  });

  it("ROLES importHostEmails adds each HOST_EMAILS address as a professor once, keeps the roles people have, and a second run adds nobody", async () => {
    vi.stubEnv("HOST_EMAILS", ` Host@Example.edu , door@example.edu,,not-an-email, host@example.edu, ${ADMIN_EMAIL.toUpperCase()} `);
    const t = setup();
    await grant(t, SCANNER_EMAIL, "scanner");
    const host = google(t, "Sample host", "host@example.edu");
    expect(await host.query(api.checkin.pass.amHost, {})).toBe(false);
    expect(await t.mutation(internal.staff.importHostEmails, {})).toBe(
      "HOST_EMAILS: 4 addresses. Added as professors: 1. Had a role already: 2. Not email addresses: 1.",
    );
    expect(await t.mutation(internal.staff.importHostEmails, {})).toBe(
      "HOST_EMAILS: 4 addresses. Added as professors: 0. Had a role already: 3. Not email addresses: 1.",
    );
    const { staff } = await rows(t);
    expect(staff.map((s) => [s.email, s.role, s.addedBy])).toEqual([
      [SCANNER_EMAIL, "scanner", ADMIN_EMAIL],
      ["host@example.edu", "professor", "HOST_EMAILS import"], // stored as is; People and Changes show OLD_LIST
    ]);
    expect((await admin(t).query(api.staff.changes, {})).map((c) => c.text)).toEqual([`${OLD_LIST} added host@example.edu as professor.`]);
    // The ADMIN_EMAILS admin on HOST_EMAILS got no hidden professor row: People shows them once, locked.
    expect(await admin(t).query(api.staff.people, {})).toEqual([
      { email: ADMIN_EMAIL, role: "admin", addedBy: SETTINGS, at: null, locked: true },
      { email: SCANNER_EMAIL, role: "scanner", addedBy: ADMIN_EMAIL, at: T0, locked: false },
      { email: "host@example.edu", role: "professor", addedBy: OLD_LIST, at: T0, locked: false },
    ]);
    // If their address later leaves ADMIN_EMAILS, no leftover row keeps them on staff.
    vi.stubEnv("ADMIN_EMAILS", "someone-else@example.edu");
    expect(await admin(t).query(api.staff.me, {})).toMatchObject({ role: null });
    vi.stubEnv("ADMIN_EMAILS", ADMIN_EMAIL);
    expect(await host.query(api.checkin.pass.amHost, {})).toBe(true);

    vi.stubEnv("HOST_EMAILS", undefined);
    expect(await t.mutation(internal.staff.importHostEmails, {})).toBe(
      "HOST_EMAILS: 0 addresses. Added as professors: 0. Had a role already: 0. Not email addresses: 0.",
    );
  });
});

// The typed sign-in's signing key is public (src/blocks/devLogin.ts), so on a dev backend anyone
// can sign in as any email that way. A typed sign-in there holds only a role staff:devGrant gave a
// test email (@test.local), and only for 2 hours: never an ADMIN_EMAILS admin's, a real
// professor's or an imported one.
describe("ROLES-API-risk-1 a typed sign-in on dev holds only a fresh devGrant role on a test email", () => {
  const TEST_PROF = "prof1@test.local";
  const HOUR = 60 * MIN;

  it("ROLES-API-risk-1 a typed sign-in with an ADMIN_EMAILS address is no admin on dev: it can't read attendance or add staff", async () => {
    vi.stubEnv("CONVEX_CLOUD_URL", DEV_URL);
    const t = setup();
    const outsider = typed(t, "Sample admin", ADMIN_EMAIL);
    expect(await outsider.query(api.staff.me, {})).toMatchObject({ email: ADMIN_EMAIL, role: null });
    expect(await outsider.query(api.checkin.pass.amHost, {})).toBe(false);
    await expect(outsider.query(api.checkin.attendance.sheet, { channel: CH })).rejects.toThrow("Only professors can do that.");
    await expect(outsider.mutation(api.staff.add, { email: NEW_EMAIL, role: "admin" })).rejects.toThrow("Only admins can do that.");
    expect((await rows(t)).staff).toEqual([]);
    // Signed in with Google, the same address is the admin.
    expect(await admin(t).query(api.checkin.pass.amHost, {})).toBe(true);
  });

  it("ROLES-API-risk-1 a typed sign-in with a professor's email holds nothing on dev, whether an admin added them or HOST_EMAILS did", async () => {
    vi.stubEnv("CONVEX_CLOUD_URL", DEV_URL);
    vi.stubEnv("HOST_EMAILS", "host@example.edu");
    const t = setup();
    await admin(t).mutation(api.staff.add, { email: PROF_EMAIL, role: "professor" });
    await t.mutation(internal.staff.importHostEmails, {});
    for (const email of [PROF_EMAIL, "host@example.edu"]) {
      expect(await typed(t, "Sample professor", email).query(api.checkin.pass.amHost, {})).toBe(false);
      expect(await google(t, "Sample professor", email).query(api.checkin.pass.amHost, {})).toBe(true);
    }
    // A test email an admin adds by hand works for the typed sign-in (ROLES-API-fixcheck-4).
    await admin(t).mutation(api.staff.add, { email: TEST_PROF, role: "professor" });
    expect(await typed(t, "Sample professor 1", TEST_PROF).query(api.checkin.pass.amHost, {})).toBe(true);
  });

  it("ROLES-API-risk-1 devGrant takes only @test.local emails and never changes a real person's row", async () => {
    vi.stubEnv("CONVEX_CLOUD_URL", DEV_URL);
    const t = setup();
    await admin(t).mutation(api.staff.add, { email: PROF_EMAIL, role: "scanner" });
    for (const email of [PROF_EMAIL, ADMIN_EMAIL, "student1@example.edu", "prof1@test.local.example.edu"]) {
      await expect(t.mutation(internal.staff.devGrant, { email, role: "admin" })).rejects.toThrow("staff:devGrant takes only test emails");
    }
    expect((await rows(t)).staff.map((s) => [s.email, s.role])).toEqual([[PROF_EMAIL, "scanner"]]);
  });

  it("ROLES-API-risk-1 a devGrant role lasts 2 hours, a second devGrant starts the 2 hours again, and then the row is gone", async () => {
    vi.stubEnv("CONVEX_CLOUD_URL", DEV_URL);
    const t = setup();
    const tester = typed(t, "Sample professor 1", TEST_PROF);
    expect(await t.mutation(internal.staff.devGrant, { email: TEST_PROF, role: "professor" })).toBe(`${TEST_PROF} is professor now, for 2 hours.`);
    vi.advanceTimersByTime(HOUR);
    expect(await t.mutation(internal.staff.devGrant, { email: TEST_PROF, role: "professor" })).toBe(
      `${TEST_PROF} is professor already. The 2 hours start again now.`,
    );
    vi.advanceTimersByTime(2 * HOUR - 1);
    await t.finishInProgressScheduledFunctions();
    // The first job ran at 2 hours; the second devGrant restarted the clock, so the row stays.
    await t.mutation(internal.staff.dropDevGrant, { email: TEST_PROF });
    expect(await tester.query(api.checkin.pass.amHost, {})).toBe(true);
    vi.advanceTimersByTime(1);
    // Past the 2 hours the role counts for nothing even before the job removes the row.
    expect(await tester.query(api.checkin.pass.amHost, {})).toBe(false);
    await t.finishInProgressScheduledFunctions();
    expect((await rows(t)).staff).toEqual([]);
    expect((await admin(t).query(api.staff.changes, {})).map((c) => c.text)[0]).toBe(`${TEST_SETUP} removed ${TEST_PROF} (professor).`);
  });

  it("ROLES-API-risk-1 devRevoke removes every devGrant role at once and leaves everyone else", async () => {
    vi.stubEnv("CONVEX_CLOUD_URL", DEV_URL);
    const t = setup();
    await grant(t, PROF_EMAIL, "professor");
    await t.mutation(internal.staff.devGrant, { email: TEST_PROF, role: "admin" });
    await t.mutation(internal.staff.devGrant, { email: "door1@test.local", role: "scanner" });
    expect(await t.mutation(internal.staff.devRevoke, {})).toBe("Removed test roles: 2. Unpaired iPads a test sign-in paired: 0.");
    expect((await rows(t)).staff.map((s) => s.email)).toEqual([PROF_EMAIL]);
    expect(await typed(t, "Sample professor 1", TEST_PROF).query(api.checkin.pass.amHost, {})).toBe(false);
    expect(await t.mutation(internal.staff.devRevoke, {})).toBe("Removed test roles: 0. Unpaired iPads a test sign-in paired: 0.");
  });
});

// Fixes from the ROLES-API fix check: floods of pairing requests, durable access a typed test
// sign-in could leave behind, the devGrant message on a dev backend the code doesn't list, and a
// test email an admin adds by hand.
describe("ROLES-API-fixcheck pairing floods, test sign-ins leave nothing behind, devGrant on any test row", () => {
  const TEST_PROF = "prof1@test.local";
  const HOUR = 60 * MIN;

  it("ROLES-API-fixcheck-1 throwaway requests after the door iPad's code shows never end that code: the professor still pairs it", async () => {
    const t = setup();
    const door = await codeFor(t, DEVICE_TOKEN);
    // Someone signed out sends 250 throwaway requests while the professor walks to the laptop.
    for (let n = 0; n < 250; n++) await codeFor(t, tokenN(n));
    expect(await t.query(api.staff.deviceStatus, { token: DEVICE_TOKEN })).toMatchObject({ status: "waiting", code: door });
    await (await professor(t)).mutation(api.staff.approvePairing, { code: door, label: "A-210 door" });
    expect(await t.query(api.staff.deviceStatus, { token: DEVICE_TOKEN })).toEqual({ status: "paired", label: "A-210 door" });
    // The throwaway requests are all still open; none of them paired.
    expect(await pairingCount(t)).toBe(250);
  });

  it("ROLES-API-fixcheck-1 a professor's one-digit typo or swapped neighbors never match an open code: the last digit checks the other five", async () => {
    const t = setup();
    const codes: string[] = [];
    for (let n = 0; n < 250; n++) codes.push(await codeFor(t, tokenN(n)));
    const open = new Set(codes);
    const professorAs = await professor(t);
    for (const code of codes) {
      expect(pairingCodeOk(code)).toBe(true);
      const typos: string[] = [];
      for (let i = 0; i < 6; i++) {
        for (const d of "0123456789") if (d !== code[i]) typos.push(code.slice(0, i) + d + code.slice(i + 1));
        if (i < 5 && code[i] !== code[i + 1]) typos.push(code.slice(0, i) + code[i + 1] + code[i] + code.slice(i + 2));
      }
      for (const typo of typos) {
        expect([code, typo, pairingCodeOk(typo)]).toEqual([code, typo, false]);
        expect(open.has(typo)).toBe(false);
      }
    }
    await expect(professorAs.mutation(api.staff.approvePairing, { code: codes[0].slice(0, 5) + String((Number(codes[0][5]) + 1) % 10), label: "A-210 door" })).rejects.toThrow(
      "That code is wrong or expired. Check the code on the iPad.",
    );
    expect((await rows(t)).devices).toEqual([]);
  });

  it("ROLES-API-fixcheck-2 a typed test admin can't give a real email a role or change a real person's", async () => {
    vi.stubEnv("CONVEX_CLOUD_URL", DEV_URL);
    const t = setup();
    await admin(t).mutation(api.staff.add, { email: PROF_EMAIL, role: "professor" });
    await t.mutation(internal.staff.devGrant, { email: TEST_PROF, role: "admin" });
    const tester = typed(t, "Sample professor 1", TEST_PROF);
    const refused = "A test sign-in can add, change and remove only test emails (@test.local).";
    await expect(tester.mutation(api.staff.add, { email: "stranger@gmail.com", role: "admin" })).rejects.toThrow(refused);
    await expect(tester.mutation(api.staff.setRole, { email: PROF_EMAIL, role: "admin" })).rejects.toThrow(refused);
    await expect(tester.mutation(api.staff.remove, { email: PROF_EMAIL })).rejects.toThrow(refused);
    expect(await google(t, "Stranger", "stranger@gmail.com").query(api.staff.me, {})).toMatchObject({ role: null });
    expect((await rows(t)).staff.map((s) => [s.email, s.role])).toEqual([
      [PROF_EMAIL, "professor"],
      [TEST_PROF, "admin"],
    ]);
    // Test emails work, so #/admin can be checked in a browser: add, change, remove.
    await tester.mutation(api.staff.add, { email: "prof2@test.local", role: "scanner" });
    await tester.mutation(api.staff.setRole, { email: "prof2@test.local", role: "professor" });
    expect(await typed(t, "Sample professor 2", "prof2@test.local").query(api.checkin.pass.amHost, {})).toBe(true);
    await tester.mutation(api.staff.remove, { email: "prof2@test.local" });
    expect(await typed(t, "Sample professor 2", "prof2@test.local").query(api.checkin.pass.amHost, {})).toBe(false);
  });

  // sweep1-access-2: the typed signing key is public, so anyone can be a test admin on dev while a
  // devGrant lasts. A test sign-in sees only test emails and the iPads test sign-ins paired, and
  // can't unpair a real professor's iPad.
  it("sweep1-access-2 a test sign-in sees no real staff email and can't unpair a real professor's iPad", async () => {
    vi.stubEnv("CONVEX_CLOUD_URL", DEV_URL);
    const t = setup();
    await admin(t).mutation(api.staff.add, { email: PROF_EMAIL, role: "professor" });
    const prof = google(t, "Sample professor", PROF_EMAIL);
    const door = await prof.mutation(api.staff.approvePairing, { code: await codeFor(t, DEVICE_TOKEN), label: "A-210 door" });
    await t.mutation(internal.staff.devGrant, { email: TEST_PROF, role: "admin" });
    const tester = typed(t, "Sample professor 1", TEST_PROF);
    const mine = await tester.mutation(api.staff.approvePairing, { code: await codeFor(t, OTHER_TOKEN), label: "Test door" });
    await tester.mutation(api.staff.add, { email: "prof2@test.local", role: "scanner" });

    expect((await tester.query(api.staff.people, {})).map((p) => p.email)).toEqual([TEST_PROF, "prof2@test.local"]);
    expect((await tester.query(api.staff.devices, {})).map((d) => [d.label, d.pairedBy])).toEqual([["Test door", TEST_PROF]]);
    expect((await tester.query(api.staff.changes, {})).map((c) => c.text)).toEqual([
      `${TEST_PROF} added prof2@test.local as scanner.`,
      `${TEST_PROF} paired the door iPad "Test door".`,
      `${TEST_SETUP} added ${TEST_PROF} as admin.`,
    ]);
    await expect(tester.mutation(api.staff.unpair, { device: door })).rejects.toThrow("A test sign-in can unpair only the iPads a test sign-in paired.");
    expect(await t.query(api.checkin.pass.canScan, { device: DEVICE_TOKEN })).toBe(true);
    // A test professor sees the same door iPads.
    await t.mutation(internal.staff.devGrant, { email: "prof3@test.local", role: "professor" });
    expect((await typed(t, "Sample professor 3", "prof3@test.local").query(api.staff.devices, {})).map((d) => d.label)).toEqual(["Test door"]);
    // Its own iPad unpairs.
    await tester.mutation(api.staff.unpair, { device: mine });
    expect(await t.query(api.checkin.pass.canScan, { device: OTHER_TOKEN })).toBe(false);

    // A real admin still sees and manages everything.
    const real = admin(t);
    expect((await real.query(api.staff.people, {})).map((p) => p.email)).toEqual([ADMIN_EMAIL, TEST_PROF, "prof2@test.local", "prof3@test.local", PROF_EMAIL]);
    expect((await real.query(api.staff.devices, {})).map((d) => d.label)).toEqual(["A-210 door"]);
    expect(await real.query(api.staff.changes, {})).toHaveLength(7);
    await real.mutation(api.staff.unpair, { device: door });
    expect(await t.query(api.checkin.pass.canScan, { device: DEVICE_TOKEN })).toBe(false);
  });

  // sweep1-server-fixcheck-3: a test email a real admin added shows the test admin "A staff
  // member" as who added it, never the real admin's email. Test emails and the devGrant and
  // import markers still show as they are.
  it("sweep1-server-fixcheck-3 a test sign-in never sees the real admin who added a test email", async () => {
    vi.stubEnv("CONVEX_CLOUD_URL", DEV_URL);
    const t = setup();
    await admin(t).mutation(api.staff.add, { email: "prof2@test.local", role: "professor" });
    await t.mutation(internal.staff.devGrant, { email: TEST_PROF, role: "admin" });
    const tester = typed(t, "Sample professor 1", TEST_PROF);
    await tester.mutation(api.staff.add, { email: "prof3@test.local", role: "scanner" });
    const seen = (await tester.query(api.staff.people, {})).map((p) => [p.email, p.addedBy]);
    expect(seen).toEqual([
      [TEST_PROF, TEST_SETUP],
      ["prof2@test.local", "A staff member"],
      ["prof3@test.local", TEST_PROF],
    ]);
    expect(JSON.stringify(await tester.query(api.staff.people, {}))).not.toContain(ADMIN_EMAIL);
    // A real admin still sees who added it.
    expect((await admin(t).query(api.staff.people, {})).find((p) => p.email === "prof2@test.local")?.addedBy).toBe(ADMIN_EMAIL);
  });

  it("ROLES-API-fixcheck-2 devRevoke ends every role and door iPad a test sign-in gave, and nothing a test sign-in gave outlasts its own 2 hours", async () => {
    vi.stubEnv("CONVEX_CLOUD_URL", DEV_URL);
    const t = setup();
    await t.mutation(internal.staff.devGrant, { email: TEST_PROF, role: "admin" });
    const tester = typed(t, "Sample professor 1", TEST_PROF);
    // An hour in, the test admin adds a second test admin and pairs an iPad of its own.
    vi.advanceTimersByTime(HOUR);
    await tester.mutation(api.staff.add, { email: "prof2@test.local", role: "admin" });
    await tester.mutation(api.staff.approvePairing, { code: await codeFor(t, OTHER_TOKEN), label: "mine" });
    expect(await t.query(api.checkin.pass.canScan, { device: OTHER_TOKEN })).toBe(true);
    const second = typed(t, "Sample professor 2", "prof2@test.local");
    expect(await second.query(api.checkin.pass.amHost, {})).toBe(true);
    // The second admin's role ends when the first one's does, 2 hours after devGrant, and so does the iPad.
    vi.advanceTimersByTime(HOUR - 1);
    expect(await second.query(api.checkin.pass.amHost, {})).toBe(true);
    vi.advanceTimersByTime(1);
    expect(await second.query(api.checkin.pass.amHost, {})).toBe(false);
    expect(await t.query(api.checkin.pass.canScan, { device: OTHER_TOKEN })).toBe(false);
    expect(await t.query(api.staff.deviceStatus, { token: OTHER_TOKEN })).toEqual({ status: "none" });
    await t.finishInProgressScheduledFunctions();
    expect((await rows(t)).staff).toEqual([]);

    // devRevoke ends them at once, and a professor grant alone pairs nothing that outlasts it.
    await t.mutation(internal.staff.devGrant, { email: TEST_PROF, role: "professor" });
    await tester.mutation(api.staff.approvePairing, { code: await codeFor(t, DEVICE_TOKEN), label: "mine too" });
    expect(await t.query(api.checkin.pass.canScan, { device: DEVICE_TOKEN })).toBe(true);
    expect(await t.mutation(internal.staff.devRevoke, {})).toBe("Removed test roles: 1. Unpaired iPads a test sign-in paired: 2.");
    expect(await t.query(api.checkin.pass.canScan, { device: DEVICE_TOKEN })).toBe(false);
    expect(await t.query(api.staff.deviceStatus, { token: DEVICE_TOKEN })).toEqual({ status: "none" });
    expect(await tester.query(api.checkin.pass.amHost, {})).toBe(false);
    expect((await rows(t)).devices).toEqual([]);
    // A door iPad a Google professor paired stays.
    await pairDevice(t);
    expect(await t.mutation(internal.staff.devRevoke, {})).toBe("Removed test roles: 0. Unpaired iPads a test sign-in paired: 0.");
    expect(await t.query(api.checkin.pass.canScan, { device: DEVICE_TOKEN })).toBe(true);
  });

  it("ROLES-API-fixcheck-3 sweep2-docs-fixcheck-1 devGrant on a dev backend the code doesn't list says to ask Sam to add its host to both DEV_HOSTS lists", async () => {
    const t = setup();
    vi.stubEnv("CONVEX_CLOUD_URL", "https://happy-lion-42.convex.cloud");
    await expect(t.mutation(internal.staff.devGrant, { email: TEST_PROF, role: "professor" })).rejects.toThrow(
      "staff:devGrant runs only on the dev backends in DEV_HOSTS in convex/checkin/prof.ts, and happy-lion-42.convex.cloud isn't one of them. " +
        "If it's your own dev backend (never prod), ask Sam to add its host to DEV_HOSTS in convex/checkin/prof.ts and convex/auth.config.ts (README step 4).",
    );
    vi.stubEnv("CONVEX_CLOUD_URL", undefined);
    await expect(t.mutation(internal.staff.devGrant, { email: TEST_PROF, role: "professor" })).rejects.toThrow(
      "staff:devGrant runs only on the dev backends in DEV_HOSTS in convex/checkin/prof.ts, and this backend isn't one of them.",
    );
  });

  it("ROLES-API-fixcheck-4 a test email an admin adds on #/admin works for the typed sign-in on dev for 2 hours, and devGrant can change it", async () => {
    vi.stubEnv("CONVEX_CLOUD_URL", DEV_URL);
    const t = setup();
    const tester = typed(t, "Sample professor 2", "prof2@test.local");
    expect(await tester.query(api.staff.me, {})).toEqual({ email: "prof2@test.local", role: null, canHoldRole: true });
    await admin(t).mutation(api.staff.add, { email: "prof2@test.local", role: "professor" });
    expect(await tester.query(api.staff.me, {})).toEqual({ email: "prof2@test.local", role: "professor", canHoldRole: true });
    expect(await t.mutation(internal.staff.devGrant, { email: "prof2@test.local", role: "admin" })).toBe("prof2@test.local is admin now, for 2 hours.");
    expect(await tester.query(api.staff.me, {})).toMatchObject({ role: "admin" });
    vi.advanceTimersByTime(2 * HOUR);
    expect(await tester.query(api.staff.me, {})).toMatchObject({ role: null });
    await t.finishInProgressScheduledFunctions();
    expect((await rows(t)).staff).toEqual([]);
    // On prod the same row would hold nothing for a typed sign-in.
    await admin(t).mutation(api.staff.add, { email: "prof2@test.local", role: "professor" });
    vi.stubEnv("CONVEX_CLOUD_URL", PROD_URL);
    expect(await tester.query(api.staff.me, {})).toMatchObject({ role: null, canHoldRole: false });
  });
});
