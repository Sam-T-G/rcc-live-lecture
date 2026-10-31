// staff: who is signed in (me), the staff list on #/admin (people, add, setRole, remove,
// changes), the door iPads (requestPairing, deviceStatus, approvePairing, devices, unpair,
// dropPairing) and the two CLI functions (devGrant, importHostEmails). The checks themselves are
// tested in convex/checkin/prof.test.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
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
// The 6-digit code an iPad with this token gets.
async function codeFor(t: T, token: string) {
  const r = await t.mutation(api.staff.requestPairing, { token });
  if (r.status !== "waiting") throw new Error("codeFor: that iPad is paired already");
  return r.code;
}
// A device token made of one byte, repeated: "00" x 32, "01" x 32, ...
const tokenN = (n: number) => n.toString(16).padStart(2, "0").repeat(32);

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
      const device = await pairDevice(t, OTHER_TOKEN, "Spare door");
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
      { email: ADMIN_EMAIL, role: "admin", addedBy: "ADMIN_EMAILS", at: null, locked: true },
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
    expect(await boss.query(api.staff.people, {})).toEqual([{ email: ADMIN_EMAIL, role: "admin", addedBy: "ADMIN_EMAILS", at: null, locked: true }]);

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
      await expect(boss.mutation(api.staff.add, { email, role: "professor" })).rejects.toThrow("is an admin in ADMIN_EMAILS already.");
      await expect(boss.mutation(api.staff.setRole, { email, role: "scanner" })).rejects.toThrow("is an admin in ADMIN_EMAILS, so this page can't change their role.");
      await expect(boss.mutation(api.staff.remove, { email })).rejects.toThrow("is an admin in ADMIN_EMAILS, so this page can't remove them.");
    }
    // The second ADMIN_EMAILS admin can't remove the first either.
    await expect(google(t, "Sample admin 2", "second@example.edu").mutation(api.staff.remove, { email: ADMIN_EMAIL })).rejects.toThrow(
      "so this page can't remove them.",
    );
    // A staff row with another role doesn't demote an ADMIN_EMAILS admin, and People still shows them locked.
    await grant(t, "second@example.edu", "scanner");
    await grant(t, PROF_EMAIL, "professor");
    expect(await google(t, "Sample admin 2", "second@example.edu").query(api.staff.me, {})).toMatchObject({ role: "admin" });
    expect(await boss.query(api.staff.people, {})).toEqual([
      { email: ADMIN_EMAIL, role: "admin", addedBy: "ADMIN_EMAILS", at: null, locked: true },
      { email: "second@example.edu", role: "admin", addedBy: "ADMIN_EMAILS", at: null, locked: true },
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

    // Signed out, the iPad scans a pass with its token.
    vi.setSystemTime(T0 + 2 * MIN);
    expect(await t.query(api.checkin.pass.canScan, { device: DEVICE_TOKEN })).toBe(true);
    const code = await passCode(student(t, 1));
    expect(await t.mutation(api.checkin.pass.scan, { device: DEVICE_TOKEN, channel: CH, code })).toMatchObject({ name: "Sample student 1", already: false });
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

    // A request past its time counts as expired even before the job drops it.
    await t.run(async (ctx) => {
      await ctx.db.insert("pairings", { code: "123456", tokenHash: await sha256(tokenN(7)), expiresAt: Date.now() - 1 });
    });
    await expect(professorAs.mutation(api.staff.approvePairing, { code: "123456", label: "C-300 door" })).rejects.toThrow("That code is wrong or expired.");
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
      await expect(professorAs.mutation(api.staff.approvePairing, { code: typo, label: "A-210 door" })).rejects.toThrow("Type the 6-digit code from the iPad.");
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
      await expect(t.mutation(api.staff.requestPairing, { token })).rejects.toThrow("This iPad sent a bad device token. Reload the page.");
      expect(await t.query(api.staff.deviceStatus, { token })).toEqual({ status: "none" });
    }
  });

  it("ROLES pairing: codes are unique among open requests, and at most 20 iPads wait for a code at once", async () => {
    const t = setup();
    const first = await codeFor(t, tokenN(0));
    // Make the next code come out the same as the first one: the request picks another.
    const next = first === "424242" ? "131313" : "424242";
    const real = crypto.getRandomValues.bind(crypto);
    let sixes = 0;
    const spy = vi.spyOn(crypto, "getRandomValues").mockImplementation(((array: ArrayBufferView) => {
      if (!ArrayBuffer.isView(array) || array.byteLength !== 6) return real(array as Uint8Array);
      const digits = sixes++ === 0 ? first : next;
      const bytes = new Uint8Array(array.buffer, array.byteOffset, 6);
      for (let i = 0; i < 6; i++) bytes[i] = Number(digits[i]);
      return array;
    }) as typeof crypto.getRandomValues);
    try {
      expect(await codeFor(t, tokenN(1))).toBe(next);
      expect(sixes).toBe(2);
    } finally {
      spy.mockRestore();
    }

    const codes = [first, next];
    for (let n = 2; n < 20; n++) codes.push(await codeFor(t, tokenN(n)));
    expect(new Set(codes).size).toBe(20);
    await expect(t.mutation(api.staff.requestPairing, { token: tokenN(20) })).rejects.toThrow("Too many iPads are waiting for a code. Try again in 10 minutes.");
    // An iPad already waiting still gets its own code back.
    expect(await codeFor(t, tokenN(5))).toBe(codes[5]);
    // Once those codes expire, the next iPad gets one.
    vi.advanceTimersByTime(10 * MIN);
    await t.finishInProgressScheduledFunctions();
    expect(await codeFor(t, tokenN(20))).toMatch(/^\d{6}$/);
  });
});

describe("ROLES devGrant and importHostEmails (CLI only)", () => {
  it("ROLES devGrant gives a typed test email a role on a dev backend, never twice, and refuses on prod", async () => {
    const t = setup();
    for (const url of [PROD_URL, undefined]) {
      vi.stubEnv("CONVEX_CLOUD_URL", url);
      await expect(t.mutation(internal.staff.devGrant, { email: "prof1@test.local", role: "professor" })).rejects.toThrow(
        "staff:devGrant runs only on a dev backend.",
      );
    }
    expect((await rows(t)).staff).toEqual([]);

    vi.stubEnv("CONVEX_CLOUD_URL", DEV_URL);
    const tester = typed(t, "Sample professor 1", "prof1@test.local");
    expect(await tester.query(api.checkin.pass.amHost, {})).toBe(false);
    expect(await t.mutation(internal.staff.devGrant, { email: " Prof1@Test.local ", role: "professor" })).toBe("prof1@test.local is professor now.");
    expect(await tester.query(api.checkin.pass.amHost, {})).toBe(true);
    expect(await t.mutation(internal.staff.devGrant, { email: "prof1@test.local", role: "professor" })).toBe("prof1@test.local is professor already.");
    expect(await t.mutation(internal.staff.devGrant, { email: "prof1@test.local", role: "admin" })).toBe("prof1@test.local is admin now.");
    expect(await tester.query(api.staff.people, {})).toEqual([
      { email: ADMIN_EMAIL, role: "admin", addedBy: "ADMIN_EMAILS", at: null, locked: true },
      { email: "prof1@test.local", role: "admin", addedBy: "devGrant", at: T0, locked: false },
    ]);
    expect((await tester.query(api.staff.changes, {})).map((c) => c.text)).toEqual([
      "devGrant changed prof1@test.local from professor to admin.",
      "devGrant added prof1@test.local as professor.",
    ]);
    // The same typed sign-in holds nothing on prod.
    vi.stubEnv("CONVEX_CLOUD_URL", PROD_URL);
    expect(await tester.query(api.checkin.pass.amHost, {})).toBe(false);
  });

  it("ROLES importHostEmails adds each HOST_EMAILS address as a professor once, keeps the roles people have, and a second run adds nobody", async () => {
    vi.stubEnv("HOST_EMAILS", ` Host@Example.edu , door@example.edu,,not-an-email, host@example.edu `);
    const t = setup();
    await grant(t, SCANNER_EMAIL, "scanner");
    const host = google(t, "Sample host", "host@example.edu");
    expect(await host.query(api.checkin.pass.amHost, {})).toBe(false);
    expect(await t.mutation(internal.staff.importHostEmails, {})).toBe(
      "HOST_EMAILS: 3 addresses. Added as professors: 1. Had a role already: 1. Not email addresses: 1.",
    );
    expect(await t.mutation(internal.staff.importHostEmails, {})).toBe(
      "HOST_EMAILS: 3 addresses. Added as professors: 0. Had a role already: 2. Not email addresses: 1.",
    );
    const { staff } = await rows(t);
    expect(staff.map((s) => [s.email, s.role, s.addedBy])).toEqual([
      [SCANNER_EMAIL, "scanner", ADMIN_EMAIL],
      ["host@example.edu", "professor", "HOST_EMAILS import"],
    ]);
    expect((await admin(t).query(api.staff.changes, {})).map((c) => c.text)).toEqual(["HOST_EMAILS import added host@example.edu as professor."]);
    expect(await host.query(api.checkin.pass.amHost, {})).toBe(true);

    vi.stubEnv("HOST_EMAILS", undefined);
    expect(await t.mutation(internal.staff.importHostEmails, {})).toBe(
      "HOST_EMAILS: 0 addresses. Added as professors: 0. Had a role already: 0. Not email addresses: 0.",
    );
  });
});
