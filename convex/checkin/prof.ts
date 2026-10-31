// Who may use the professor pages and the door scanner: people on the staff list, by email.
//
// Roles, one per email in the `staff` table (convex/staff.ts manages it from #/admin):
//   admin      manages the staff list and the door iPads, and can do everything a professor can
//   professor  every professor page and function: quiz, attendance, the teacher scanner, #/host,
//              team size, the late list, the AI tools
//   scanner    scans passes at the door, nothing else
// The ADMIN_EMAILS env var (comma-separated) lists admins who always exist. #/admin can't remove
// them or change their role, so the person who runs the app can't be locked out.
//
// A role counts only for a sign-in that proves its email: Google, with a verified email. Typed
// sign-in (src/blocks/devLogin.ts) lets anyone claim any email, so it holds a role only on a dev
// backend (isDevBackend), where browser checks sign in that way, and there only a test email's
// role (@test.local, from staff:devGrant or #/admin) for 2 hours. It never holds an ADMIN_EMAILS
// admin's role or a real email's role. On prod it holds none. A test sign-in can't leave access
// behind: on #/admin it can add, change and remove only test emails, a test email it adds lasts
// only as long as its own role, and a door iPad it pairs scans only while its role lasts.
// staff:devRevoke ends all of that at once.
//
// A door iPad doesn't sign in. It pairs once: its screen shows a 6-digit code, and a professor
// or admin types that code on #/admin (convex/staff.ts). After that it sends its device token
// with every scan. The server keeps only the token's SHA-256.
//
// Every host-only function calls requireProf(ctx) first (requireAdmin(ctx) for the staff list),
// in queries, mutations and actions alike. Keys open nothing: PROFESSOR_KEY, KIOSK_KEY and
// HOST_EMAILS are never read here. Until the professor pages stop sending it, a host-only
// function still accepts `key: v.optional(v.string())` and ignores it.
import { ConvexError, type Infer } from "convex/values";
import { api } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import type { ActionCtx, MutationCtx, QueryCtx } from "../_generated/server";
import { roleValidator } from "../schema";

export { roleValidator };
export type Role = Infer<typeof roleValidator>;

type DbCtx = QueryCtx | MutationCtx;
type AnyCtx = QueryCtx | MutationCtx | ActionCtx;

const GOOGLE_ISSUER = "https://accounts.google.com";
const TYPED_ISSUER = "https://test-login.rcc-live-lecture.local";
// The dev backends, by the host in their CONVEX_CLOUD_URL (Convex sets it in every function):
// this laptop's dev deployment, and the sample one the tests stub (convex/test.helpers.ts
// DEV_URL), which Convex never hands out. Typed test sign-ins hold roles only on these. A lead's
// own dev deployment (README step 3) isn't here: add its host to use test roles there. Never
// add prod's (utmost-ibis-818).
const DEV_HOSTS = ["quaint-swan-637.convex.cloud", "sample-dev-123.convex.cloud"];

// The host in CONVEX_CLOUD_URL, lower case, or null when it is missing or not a URL.
export function cloudHost(): string | null {
  try {
    return new URL((process.env.CONVEX_CLOUD_URL ?? "").trim()).host.toLowerCase() || null;
  } catch {
    return null;
  }
}

// True only on a dev backend: CONVEX_CLOUD_URL is https and its host is one of DEV_HOSTS. Fails
// closed: prod's URL, a custom domain, a new deployment, a missing or unreadable URL all count as
// prod, so a typed sign-in there never holds a role.
export function isDevBackend() {
  let url: URL;
  try {
    url = new URL((process.env.CONVEX_CLOUD_URL ?? "").trim());
  } catch {
    return false;
  }
  return url.protocol === "https:" && DEV_HOSTS.includes(url.host.toLowerCase());
}

// An email the way the staff list keeps it: trimmed and lower case. "" when there is none.
export function normEmail(email: string | null | undefined) {
  return (email ?? "").trim().toLowerCase();
}

// The admins in the ADMIN_EMAILS env var. They are admins whatever the staff table says.
export function envAdmins(): string[] {
  return [...new Set((process.env.ADMIN_EMAILS ?? "").split(",").map(normEmail).filter(Boolean))];
}

// Test emails: the only ones a typed sign-in can hold a role for (on a dev backend, through
// staff:devGrant or #/admin). No real person has one, and no Google account can.
export const TEST_DOMAIN = "@test.local";
export const isTestEmail = (email: string) => email.endsWith(TEST_DOMAIN);
// The addedBy and by of the rows staff:devGrant writes, and how long a test email's role lasts.
export const DEV_GRANT = "devGrant";
export const DEV_GRANT_MS = 2 * 60 * 60_000;

// The email a sign-in proves, or null: a Google sign-in with a verified email anywhere, and a
// typed sign-in with a test email (@test.local) only on a dev backend.
//
// Google: the identity must say the email is verified, as `emailVerified` (Convex's name for the
// JWT claim) or as the raw `email_verified` claim, and only the boolean true counts. A Google
// identity with neither claim holds no role.
//
// Typed: its verification claim is not checked. Convex's customJwt provider hands claims to the
// function under their own JWT names, so a real typed token's identity has `email_verified` and
// no `emailVerified` (on dev, staff.me said canHoldRole false for every typed sign-in when this
// checked `emailVerified`). The claim proves nothing anyway: the signing key is public, so anyone
// can mint a typed token with any claims. That's why a typed sign-in counts only on a dev backend.
export function provenEmail(
  me: { issuer: string; email?: string; emailVerified?: boolean; [claim: string]: unknown } | null,
): string | null {
  if (!me) return null;
  const email = normEmail(me.email);
  if (!email) return null;
  if (me.issuer === GOOGLE_ISSUER) return me.emailVerified === true || me.email_verified === true ? email : null;
  if (me.issuer === TYPED_ISSUER && isDevBackend() && isTestEmail(email)) return email;
  return null;
}

// The role a test email (@test.local) holds, from staff:devGrant or #/admin, while its row's 2
// hours (from `at`) last; staff:dropDevGrant removes the row after that. A typed sign-in on a
// dev backend holds only this. Null for any other email, ADMIN_EMAILS included.
export async function testRoleOf(ctx: DbCtx, email: string): Promise<Role | null> {
  if (!isTestEmail(email)) return null;
  const row = await ctx.db
    .query("staff")
    .withIndex("by_email", (q) => q.eq("email", email))
    .first();
  return row && row.at + DEV_GRANT_MS > Date.now() ? row.role : null;
}

// The role an email holds: admin when ADMIN_EMAILS lists it, else its staff row's role, else null.
export async function roleOf(ctx: DbCtx, email: string): Promise<Role | null> {
  if (!email) return null;
  if (envAdmins().includes(email)) return "admin";
  const row = await ctx.db
    .query("staff")
    .withIndex("by_email", (q) => q.eq("email", email))
    .first();
  return row?.role ?? null;
}

// The signed-in person as the staff checks see them: the email their sign-in carries (lower
// case), their role (null without one), and whether this sign-in can hold a role at all (false
// for a typed sign-in on prod and for a Google account with an unverified email).
export type Me = { email: string; role: Role | null; canHoldRole: boolean };

// The signed-in person, or null when signed out. staff.me returns this to the pages.
export async function readMe(ctx: DbCtx): Promise<Me | null> {
  const me = await ctx.auth.getUserIdentity();
  if (!me) return null;
  const proven = provenEmail(me);
  const role = !proven ? null : me.issuer === TYPED_ISSUER ? await testRoleOf(ctx, proven) : await roleOf(ctx, proven);
  return { email: normEmail(me.email), role, canHoldRole: proven !== null };
}

// Actions have no database, so they ask the staff.me query, which runs as the same caller.
async function caller(ctx: AnyCtx): Promise<Me | null> {
  return "db" in ctx ? await readMe(ctx) : await ctx.runQuery(api.staff.me, {});
}

// The signed-in person's role, or null (signed out, no role, or a sign-in that can't hold one).
export async function staffRole(ctx: AnyCtx): Promise<Role | null> {
  return (await caller(ctx))?.role ?? null;
}

// Professors and admins: everyone who may use the professor pages.
export function isProf(role: Role | null): role is "professor" | "admin" {
  return role === "professor" || role === "admin";
}

export type Staff = { email: string; role: Role };

// A professor or admin, or an error: "Sign in first." signed out, "Only professors can do that."
// for anyone else (a student, a scanner, a typed sign-in on prod). Returns their email and role.
export async function requireProf(ctx: AnyCtx): Promise<Staff> {
  const me = await caller(ctx);
  if (!me) throw new ConvexError("Sign in first.");
  if (!isProf(me.role)) throw new ConvexError("Only professors can do that.");
  return { email: me.email, role: me.role };
}

// An admin, or an error: "Sign in first." signed out, "Only admins can do that." for anyone else.
export async function requireAdmin(ctx: AnyCtx): Promise<Staff> {
  const me = await caller(ctx);
  if (!me) throw new ConvexError("Sign in first.");
  if (me.role !== "admin") throw new ConvexError("Only admins can do that.");
  return { email: me.email, role: me.role };
}

// A door iPad's device token: 32 random bytes as 64 lower-case hex characters.
const TOKEN = /^[0-9a-f]{64}$/;
export function isDeviceToken(token: string) {
  return TOKEN.test(token);
}

// SHA-256 of a device token, as 64 hex characters. The only form of a token the server stores.
export async function tokenHash(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

// Whether a paired door iPad still works. One a test sign-in paired (pairedBy a test email)
// works only on a dev backend and only while that test email is still a professor or admin, so
// it ends with the test role (2 hours, or staff:devRevoke). Every other one works until unpaired.
export async function deviceWorks(ctx: DbCtx, device: Doc<"devices">): Promise<boolean> {
  if (!isTestEmail(device.pairedBy)) return true;
  return isDevBackend() && isProf(await testRoleOf(ctx, device.pairedBy));
}

// The working paired door iPad with this hash, or null.
export async function deviceByHash(ctx: DbCtx, hash: string): Promise<Doc<"devices"> | null> {
  const rows = await ctx.db
    .query("devices")
    .withIndex("by_tokenHash", (q) => q.eq("tokenHash", hash))
    .take(10);
  for (const row of rows) if (await deviceWorks(ctx, row)) return row;
  return null;
}

// The paired door iPad a device token belongs to, or null: no token, a malformed one, one that
// never paired, one whose iPad was unpaired, or one a test sign-in paired whose role has ended.
export async function pairedDevice(ctx: DbCtx, token: string | undefined): Promise<Doc<"devices"> | null> {
  if (!token || !isDeviceToken(token)) return null;
  return await deviceByHash(ctx, await tokenHash(token));
}

// The pass scanner: a paired door iPad's device token, or anyone with a role (scanner,
// professor, admin). Returns the iPad when its token let the call in, else null. Errors: "This
// iPad isn't paired." for a token that doesn't work, "Sign in first." signed out, "Only staff
// can scan passes." for anyone else.
export async function requireScanner(ctx: DbCtx, device?: string): Promise<Doc<"devices"> | null> {
  const iPad = await pairedDevice(ctx, device);
  if (iPad) return iPad;
  const me = await readMe(ctx);
  if (me?.role) return null;
  if (device) throw new ConvexError("This iPad isn't paired.");
  if (!me) throw new ConvexError("Sign in first.");
  throw new ConvexError("Only staff can scan passes.");
}
