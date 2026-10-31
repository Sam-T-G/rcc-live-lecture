// Shared helpers for the Convex tests. convex-test runs every function against an in-memory
// backend, so nothing here touches the dev or prod deployment. Read-only after F0, except that
// ROLES moved authMatrix and the staff helpers to roles: a package that needs another helper
// writes it inside its own test file. People are samples only ("Sample student N",
// @example.edu).
import { convexTest } from "convex-test";
import { vi } from "vitest";
import { api, internal } from "./_generated/api";
import { type Role, tokenHash } from "./checkin/prof";
import schema from "./schema";
import { modules } from "./test.setup";

// A fresh, empty backend. Call it once per test.
export const setup = () => convexTest(schema, modules);
export type T = ReturnType<typeof setup>;
// Who makes a call: `t` itself (signed out) or `t.withIdentity(...)` (signed in).
export type Caller = Pick<T, "query" | "mutation" | "action">;

export const TYPED_ISSUER = "https://test-login.rcc-live-lecture.local";
export const GOOGLE_ISSUER = "https://accounts.google.com";

// CONVEX_CLOUD_URL on prod and on a dev backend. A typed sign-in holds a role only on a dev
// backend (checkin/prof.ts isDevBackend). A test that doesn't stub CONVEX_CLOUD_URL runs like
// prod there: typed sign-ins hold no role.
export const PROD_URL = "https://utmost-ibis-818.convex.cloud";
export const DEV_URL = "https://sample-dev-123.convex.cloud";

// The sample staff.
export const ADMIN_EMAIL = "admin@example.edu"; // an admin after profEnv() (ADMIN_EMAILS)
export const PROF_EMAIL = "prof@example.edu"; // a professor once professor(t) or grant() adds the row
export const SCANNER_EMAIL = "door@example.edu"; // a scanner once grant() adds the row
// The test email a typed sign-in uses on a dev backend. It holds a role only once devGrant (or
// testGrant) gives it one, and only for 2 hours.
export const TEST_PROF_EMAIL = "prof1@test.local";

// A door iPad's device token (64 hex characters), and one that no iPad paired with.
export const DEVICE_TOKEN = "0123456789abcdef".repeat(4);
export const OTHER_TOKEN = "fedcba9876543210".repeat(4);

// A typed sign-in, built the way src/blocks/devLogin.ts builds one: the subject is the email in
// lower case and the email counts as verified. Anyone can type any email, so it holds a role
// only on a dev backend.
export const typed = (t: T, name: string, email: string) =>
  t.withIdentity({ issuer: TYPED_ISSUER, subject: email.toLowerCase(), name, email, emailVerified: true });

// A Google sign-in with a verified email. With an email on the staff list it holds that role.
export const google = (t: T, name: string, email: string) =>
  t.withIdentity({ issuer: GOOGLE_ISSUER, subject: "google-" + email.toLowerCase(), name, email, emailVerified: true });

// A Google sign-in whose email Google hasn't verified. It never holds a role.
export const unverified = (t: T, name: string, email: string) =>
  t.withIdentity({ issuer: GOOGLE_ISSUER, subject: "google-" + email.toLowerCase(), name, email, emailVerified: false });

// The admin: a Google sign-in on ADMIN_EMAILS. Needs profEnv().
export const admin = (t: T) => google(t, "Sample admin", ADMIN_EMAIL);

// Gives an email a role by writing its staff row straight to the table (no admin check, no
// staffEvents row), the way a test sets up who is who. Replaces the role a row already has.
export async function grant(t: T, email: string, role: Role) {
  await t.run(async (ctx) => {
    const row = await ctx.db
      .query("staff")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();
    if (row) await ctx.db.patch("staff", row._id, { role });
    else await ctx.db.insert("staff", { email, role, addedBy: ADMIN_EMAIL, at: Date.now() });
  });
}

// Gives a test email a role the way staff:devGrant does (a row added by "devGrant", now), without
// devGrant's staffEvents row or its job that removes the row after 2 hours.
export async function testGrant(t: T, email: string, role: Role) {
  await t.run(async (ctx) => {
    await ctx.db.insert("staff", { email, role, addedBy: "devGrant", at: Date.now() });
  });
}

// A Google sign-in with the professor role (adds PROF_EMAIL's staff row first).
export async function professor(t: T) {
  await grant(t, PROF_EMAIL, "professor");
  return google(t, "Sample professor", PROF_EMAIL);
}

// A paired door iPad, written straight to the devices table the way staff.approvePairing writes
// it (only the token's hash). Returns its id.
export async function pairDevice(t: T, token = DEVICE_TOKEN, label = "Sample door") {
  const hash = await tokenHash(token);
  return await t.run(async (ctx) => await ctx.db.insert("devices", { tokenHash: hash, label, pairedBy: ADMIN_EMAIL, pairedAt: Date.now() }));
}

// ADMIN_EMAILS as most tests need it: ADMIN_EMAIL is an admin. vitest.config.ts puts env vars
// back after every test.
export function profEnv() {
  vi.stubEnv("ADMIN_EMAILS", ADMIN_EMAIL);
}

// The student's current pass code, made the way the pass page makes it: refresh, then mine.
export async function passCode(student: Caller) {
  await student.mutation(api.checkin.pass.refresh, {});
  const pass = await student.query(api.checkin.pass.mine, {});
  if (!pass) throw new Error("passCode: no pass after refresh");
  return pass.code;
}

// Checks a student in the real way: the admin scans their pass code at the teacher scanner.
// Needs profEnv().
export async function checkIn(t: T, student: Caller, channel = "gdg") {
  return await admin(t).mutation(api.checkin.pass.scan, { channel, code: await passCode(student) });
}

// The deck moves to a slide, the way POST /deck does it.
export async function slide(
  t: T,
  channel: string,
  index: number,
  o: { beat?: number; count?: number; title?: string; lines?: string[] } = {},
) {
  await t.mutation(internal.deck.set, {
    channel,
    index,
    beat: o.beat ?? 0,
    count: o.count ?? 10,
    title: o.title ?? `Slide ${index + 1}`,
    lines: o.lines ?? [],
  });
}

// A time for vi.setSystemTime, in UTC so a test means the same moment on every laptop and in CI.
// The month is 1 to 12: at(2026, 11, 5, 21, 30) is 5 Nov 2026 at 21:30 UTC.
export const at = (y: number, mo: number, d: number, h = 0, mi = 0) => Date.UTC(y, mo - 1, d, h, mi);

// The ten callers authMatrix tries, in this order. Each row runs on its own fresh backend where
// ADMIN_EMAIL is on ADMIN_EMAILS, PROF_EMAIL is a professor, SCANNER_EMAIL is a scanner and an
// iPad with DEVICE_TOKEN is paired, with CONVEX_CLOUD_URL set to prod's URL (a dev backend's
// for typedDevProf, whose backend also has TEST_PROF_EMAIL as a devGrant professor).
//   signedOut        signed out, no device token
//   googleStudent    a Google sign-in with no role
//   unverifiedAdmin  a Google sign-in with ADMIN_EMAIL that Google hasn't verified
//   typedProdAdmin   a typed sign-in with ADMIN_EMAIL, on prod
//   unknownDevice    signed out, a device token no iPad is paired with (OTHER_TOKEN)
//   scanner          a Google sign-in with the scanner role
//   pairedDevice     signed out, the paired iPad's device token (DEVICE_TOKEN)
//   typedDevProf     a typed sign-in with TEST_PROF_EMAIL, a devGrant professor, on a dev backend
//   googleProf       a Google sign-in with the professor role
//   googleAdmin      a Google sign-in on ADMIN_EMAILS
export const ROWS = [
  "signedOut",
  "googleStudent",
  "unverifiedAdmin",
  "typedProdAdmin",
  "unknownDevice",
  "scanner",
  "pairedDevice",
  "typedDevProf",
  "googleProf",
  "googleAdmin",
] as const;
export type Row = (typeof ROWS)[number];
export type Matrix = Record<Row, boolean>;

// A host-only function (requireProf): professors and admins get through.
export const HOST_ONLY = Object.freeze({
  signedOut: false,
  googleStudent: false,
  unverifiedAdmin: false,
  typedProdAdmin: false,
  unknownDevice: false,
  scanner: false,
  pairedDevice: false,
  typedDevProf: true,
  googleProf: true,
  googleAdmin: true,
} as const satisfies Matrix);
// An admin-only function (requireAdmin): only admins get through.
export const ADMIN_ONLY = Object.freeze({ ...HOST_ONLY, typedDevProf: false, googleProf: false } as const satisfies Matrix);
// The door scanner (requireScanner: checkin.pass.scan, and canScan): a scanner and a paired iPad
// get through too.
export const SCANNER = Object.freeze({ ...HOST_ONLY, scanner: true, pairedDevice: true } as const satisfies Matrix);

// Runs one call as each of the ten callers above, each on its own fresh backend, and fails the
// test unless exactly the rows `expected` allows finish: HOST_ONLY for a host-only function,
// ADMIN_ONLY for the staff list, SCANNER for the door scanner. `call` gets the row's caller,
// that row's backend (for setup: write as admin(t) or with t.run) and the row's device token
// (undefined except for the two device rows; pass it as `device` to a function that takes one).
// Write the call so it finishes for an allowed caller, and await authMatrix:
//   await authMatrix(HOST_ONLY, (as) => as.query(api.checkin.read.names, { channel: "gdg" }));
// A function that answers true or false instead of throwing (amHost, canScan) throws inside
// `call` when it answers false. Sets ADMIN_EMAILS. Returns the rows, with `errors` holding what
// each refused row threw.
export async function authMatrix(
  expected: typeof HOST_ONLY | typeof ADMIN_ONLY | typeof SCANNER,
  call: (as: Caller, t: T, device: string | undefined) => Promise<unknown>,
): Promise<Matrix & { readonly errors: Partial<Record<Row, string>> }> {
  // Only these three objects: a matrix written in a test file could let a refused caller through.
  const name = expected === HOST_ONLY ? "HOST_ONLY" : expected === ADMIN_ONLY ? "ADMIN_ONLY" : expected === SCANNER ? "SCANNER" : null;
  if (!name) throw new Error("authMatrix takes HOST_ONLY, ADMIN_ONLY or SCANNER from test.helpers.ts first.");
  profEnv();
  const who: Record<Row, [(t: T) => Caller, string | undefined]> = {
    signedOut: [(t) => t, undefined],
    googleStudent: [(t) => google(t, "Sample student 1", "student1@example.edu"), undefined],
    unverifiedAdmin: [(t) => unverified(t, "Sample admin", ADMIN_EMAIL), undefined],
    typedProdAdmin: [(t) => typed(t, "Sample admin", ADMIN_EMAIL), undefined],
    unknownDevice: [(t) => t, OTHER_TOKEN],
    scanner: [(t) => google(t, "Sample scanner", SCANNER_EMAIL), undefined],
    pairedDevice: [(t) => t, DEVICE_TOKEN],
    typedDevProf: [(t) => typed(t, "Sample professor 1", TEST_PROF_EMAIL), undefined],
    googleProf: [(t) => google(t, "Sample professor", PROF_EMAIL), undefined],
    googleAdmin: [(t) => admin(t), undefined],
  };
  const urlBefore = process.env.CONVEX_CLOUD_URL;
  const out = {} as Matrix;
  const errors: Partial<Record<Row, string>> = {};
  try {
    for (const row of ROWS) {
      vi.stubEnv("CONVEX_CLOUD_URL", row === "typedDevProf" ? DEV_URL : PROD_URL);
      const t = setup();
      await grant(t, PROF_EMAIL, "professor");
      await grant(t, SCANNER_EMAIL, "scanner");
      await pairDevice(t);
      if (row === "typedDevProf") await testGrant(t, TEST_PROF_EMAIL, "professor");
      const [as, device] = who[row];
      try {
        await call(as(t), t, device);
        out[row] = true;
      } catch (e) {
        out[row] = false;
        errors[row] = e instanceof Error ? e.message : String(e);
      }
    }
  } finally {
    vi.stubEnv("CONVEX_CLOUD_URL", urlBefore);
  }
  const wrong = ROWS.filter((row) => out[row] !== expected[row]).map((row) =>
    out[row] ? `${row} got through` : `${row} was refused (${errors[row]})`,
  );
  if (wrong.length) throw new Error(`authMatrix: rows that differ from ${name}: ${wrong.join("; ")}`);
  return Object.defineProperty(out, "errors", { value: errors, enumerable: false }) as Matrix & { readonly errors: Partial<Record<Row, string>> };
}
