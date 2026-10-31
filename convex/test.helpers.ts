// Shared helpers for the Convex tests. convex-test runs every function against an in-memory
// backend, so nothing here touches the dev or prod deployment. Read-only after F0: a package that
// needs another helper writes it inside its own test file. People are samples only
// ("Sample student N", @example.edu).
import { convexTest } from "convex-test";
import { vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";

// A fresh, empty backend. Call it once per test.
export const setup = () => convexTest(schema, modules);
export type T = ReturnType<typeof setup>;
// Who makes a call: `t` itself (signed out) or `t.withIdentity(...)` (signed in).
export type Caller = Pick<T, "query" | "mutation" | "action">;

export const TYPED_ISSUER = "https://test-login.rcc-live-lecture.local";
export const GOOGLE_ISSUER = "https://accounts.google.com";
export const HOST_EMAIL = "prof@example.edu"; // on HOST_EMAILS after profEnv()

// A typed sign-in, built the way src/blocks/devLogin.ts builds one: the subject is the email in
// lower case. Anyone can type any email, so a typed sign-in is never a host.
export const typed = (t: T, name: string, email: string) =>
  t.withIdentity({ issuer: TYPED_ISSUER, subject: email.toLowerCase(), name, email, emailVerified: true });

// A Google sign-in. With an email on HOST_EMAILS it's a host.
export const google = (t: T, name: string, email: string) =>
  t.withIdentity({ issuer: GOOGLE_ISSUER, subject: "google-" + email.toLowerCase(), name, email, emailVerified: true });

export const googleHost = (t: T, email = HOST_EMAIL) => google(t, "Sample professor", email);

// Stand-ins for the env vars. KIOSK_KEY has to be at least 16 characters (checkin/prof.ts kioskKeyOk).
export const PROF_KEY = "test-prof-key";
export const KIOSK_KEY = "test-kiosk-key-0123";
export const WRONG_KEY = "not-the-right-key";

// PROFESSOR_KEY and HOST_EMAILS as most tests need them. vitest.config.ts puts env vars back
// after every test.
export function profEnv() {
  vi.stubEnv("PROFESSOR_KEY", PROF_KEY);
  vi.stubEnv("HOST_EMAILS", HOST_EMAIL);
}

// KIOSK_KEY, the key for the door kiosk. profEnv() leaves it unset, as on a backend where Sam
// hasn't set it.
export function kioskEnv() {
  vi.stubEnv("KIOSK_KEY", KIOSK_KEY);
}

// The student's current pass code, made the way the pass page makes it: refresh, then mine.
export async function passCode(student: Caller) {
  await student.mutation(api.checkin.pass.refresh, {});
  const pass = await student.query(api.checkin.pass.mine, {});
  if (!pass) throw new Error("passCode: no pass after refresh");
  return pass.code;
}

// Checks a student in the real way: the teacher scans their pass code with the professor key.
// Needs profEnv().
export async function checkIn(t: T, student: Caller, channel = "gdg") {
  return await t.mutation(api.checkin.pass.scan, { key: PROF_KEY, channel, code: await passCode(student) });
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

// The six callers authMatrix tries, in this order:
//   signedOut       signed out, no key
//   wrongKey        signed out, a wrong key
//   typedHostEmail  a typed sign-in whose email is on HOST_EMAILS, no key
//   kioskKey        signed out, the KIOSK_KEY value
//   googleHost      a Google sign-in on HOST_EMAILS, no key
//   profKey         signed out, the PROFESSOR_KEY value
export const ROWS = ["signedOut", "wrongKey", "typedHostEmail", "kioskKey", "googleHost", "profKey"] as const;
export type Row = (typeof ROWS)[number];
export type Matrix = Record<Row, boolean>;

// A host-only function: only a Google host and the professor key get through.
export const HOST_ONLY: Matrix = { signedOut: false, wrongKey: false, typedHostEmail: false, kioskKey: false, googleHost: true, profKey: true };
// The door scanner (checkin.pass.scan and canScan) also takes the kiosk key.
export const SCANNER: Matrix = { ...HOST_ONLY, kioskKey: true };

// Runs one call as each of the six callers above, each on its own fresh backend, and returns
// true for a row whose call finished and false for one that threw. `call` gets the caller, the
// key to pass (undefined means none) and that row's backend, so it can add what the call needs
// first (with t.run, or with PROF_KEY). Write the call so it finishes for an allowed caller, then:
//   expect(await authMatrix((as, key) => as.query(api.checkin.read.names, { key, channel: "gdg" }))).toEqual(HOST_ONLY);
// A function that answers true or false instead of throwing (amHost, canScan) throws inside
// `call` when it answers false. Sets PROFESSOR_KEY, HOST_EMAILS and KIOSK_KEY. When a row comes
// out wrong, `errors` (left out of toEqual) holds what each refused row threw.
export async function authMatrix(
  call: (as: Caller, key: string | undefined, t: T) => Promise<unknown>,
): Promise<Matrix & { readonly errors: Partial<Record<Row, string>> }> {
  profEnv();
  kioskEnv();
  const who: Record<Row, [(t: T) => Caller, string | undefined]> = {
    signedOut: [(t) => t, undefined],
    wrongKey: [(t) => t, WRONG_KEY],
    typedHostEmail: [(t) => typed(t, "Sample professor", HOST_EMAIL), undefined],
    kioskKey: [(t) => t, KIOSK_KEY],
    googleHost: [(t) => googleHost(t), undefined],
    profKey: [(t) => t, PROF_KEY],
  };
  const out = {} as Matrix;
  const errors: Partial<Record<Row, string>> = {};
  for (const row of ROWS) {
    const t = setup();
    const [as, key] = who[row];
    try {
      await call(as(t), key, t);
      out[row] = true;
    } catch (e) {
      out[row] = false;
      errors[row] = e instanceof Error ? e.message : String(e);
    }
  }
  return Object.defineProperty(out, "errors", { value: errors, enumerable: false }) as Matrix & { readonly errors: Partial<Record<Row, string>> };
}
