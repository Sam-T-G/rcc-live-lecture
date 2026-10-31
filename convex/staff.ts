// Access: the staff list (who is an admin, a professor or a door scanner, by email) and the door
// iPads. The checks are in convex/checkin/prof.ts (staffRole, requireProf, requireAdmin,
// requireScanner); this file has what #/admin and the door iPad's pairing screen call, and two
// functions for the CLI. Every refused call throws a ConvexError whose message can show as is.
//
// Functions the screens call. "admin" = admins only; "professor" = professors and admins.
//
//   api.staff.me              {} -> null | { email, role, canHoldRole }                  anyone
//       null signed out. role: "admin" | "professor" | "scanner" | null. canHoldRole is false
//       for a sign-in that can't hold a role (a typed sign-in on prod, a typed sign-in on dev
//       without an @test.local email, a Google account with an unverified email), so the page offers Google sign-in instead of "not on the staff list".
//   api.checkin.pass.amHost   {} -> boolean: a professor or admin                        anyone
//
//   #/admin, People and Changes:
//   api.staff.people          {} -> [{ email, role, addedBy, at, locked }]                admin
//       ADMIN_EMAILS admins come first, with locked: true, addedBy "Server settings" and at null:
//       show them without a role picker or Remove. Then everyone else, by email. addedBy is an
//       admin's email, or "Import from the old professor list" (importHostEmails) or "Test setup
//       on the dev server" (devGrant); Changes names those two the same way, in by and text.
//   api.staff.add             { email, role } -> null                                     admin
//   api.staff.setRole         { email, role } -> null                                     admin
//   api.staff.remove          { email } -> null                                           admin
//       Emails are trimmed and lower-cased. Adding someone already on the list with that role,
//       or removing someone who isn't on it, changes nothing. ADMIN_EMAILS admins can't be
//       added, changed or removed here.
//   api.staff.changes         {} -> the last 50 changes, newest first                     admin
//       [{ _id, at, by, action, email, role, oldRole, label, text }]: action is "add", "role",
//       "remove", "pair" or "unpair"; fields that don't apply are null; text is the change as
//       one sentence ("admin@example.edu added prof@example.edu as professor.").
//
//   #/admin, Door iPads and Pair a door iPad:
//   api.staff.devices         {} -> [{ _id, label, pairedBy, pairedAt, lastUsedAt }]       professor
//       Newest first. lastUsedAt is the iPad's last scan, or null.
//   api.staff.approvePairing  { code, label } -> Id<"devices">                            professor
//       code: the 6 digits on the iPad (spaces and dashes are ignored). label: a name like
//       "A-210 door", 1 to 40 characters.
//   api.staff.unpair          { device: Id<"devices"> } -> null                           professor
//       The iPad's token stops working at once and its screen goes back to pairing.
//
//   The door iPad, signed out. Its device token is 32 bytes from crypto.getRandomValues as 64
//   lower-case hex characters, kept in localStorage.
//   api.staff.requestPairing  { token } -> { status: "waiting", code, expiresAt }
//                                       | { status: "paired", label }                    anyone
//       Gets a 6-digit code that works for 10 minutes. Asking again with the same token gives
//       the same code until it expires. At most 200 codes are open at once: a new request past
//       that ends the oldest one (that iPad's status goes to "none", so it asks again), so
//       requests from signed-out callers can't keep a door iPad from getting a code.
//   api.staff.deviceStatus    { token } -> { status: "none" } | { status: "waiting", code,
//                                          expiresAt } | { status: "paired", label }       anyone
//       Live: "paired" once a professor approves the code; "none" once the code expires (call
//       requestPairing again) or the iPad is unpaired (show the pairing screen). Also treat a
//       "waiting" code past expiresAt as expired.
//   api.checkin.pass.canScan  { device } -> boolean                                       anyone
//   api.checkin.pass.scan     { device, channel, code } -> { name, email, already }       paired iPad or any role
//
// For the CLI (internal: npx convex run, never from a page):
//   staff:devGrant '{"email":"prof1@test.local","role":"professor"}'   a role for a test email; dev backends only
//       Only @test.local emails, never one an admin or the import added. A typed sign-in with
//       that email holds the role for 2 hours (run devGrant again to start the 2 hours again);
//       then dropDevGrant removes the row. The typed signing key is public, so anyone can sign
//       in as a test email on dev while its role lasts: keep real student data off dev.
//   staff:devRevoke                                                     removes every devGrant role now; run it after a browser check
//   staff:importHostEmails                                             every HOST_EMAILS address without a role (and not in ADMIN_EMAILS) becomes a professor; safe to run again
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import {
  DEV_GRANT,
  DEV_GRANT_MS,
  deviceByHash,
  envAdmins,
  isDevBackend,
  isDeviceToken,
  isTestEmail,
  TEST_DOMAIN,
  type Me,
  normEmail,
  readMe,
  requireAdmin,
  requireProf,
  roleValidator,
  tokenHash,
} from "./checkin/prof";
import { randomCode } from "./lib";
import { staffActionValidator } from "./schema";

const PAIR_MS = 10 * 60_000; // a pairing code works this long
// Open pairing codes at once. A professor's typo matches someone else's open code at most
// 200 times in 10^6. Past the cap, a new request ends the oldest one instead of being refused,
// so blocking a door iPad takes 200 requests between its code showing and the professor typing it.
const MAX_WAITING = 200;
const LABEL_MAX = 40;
const STAFF_MAX = 500; // rows People reads
const CHANGES = 50;
// Who added a row when it wasn't a person. The stored values stay as they are (rows on dev and
// prod have them); People and Changes show these words instead.
const IMPORT = "HOST_EMAILS import";
const SHOWN_AS: Record<string, string> = {
  [IMPORT]: "Import from the old professor list",
  [DEV_GRANT]: "Test setup on the dev server",
};
const ENV_ADMIN_BY = "Server settings";
const shownAs = (by: string) => SHOWN_AS[by] ?? by;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const none = v.object({ status: v.literal("none") });
const waiting = v.object({ status: v.literal("waiting"), code: v.string(), expiresAt: v.number() });
const paired = v.object({ status: v.literal("paired"), label: v.string() });

// An email to add: trimmed, lower case, and shaped like an address.
function cleanEmail(raw: string) {
  const email = normEmail(raw);
  if (!EMAIL.test(email) || email.length > 254) throw new ConvexError("Type a whole email address, like name@example.edu.");
  return email;
}

async function findStaff(ctx: QueryCtx | MutationCtx, email: string) {
  return await ctx.db
    .query("staff")
    .withIndex("by_email", (q) => q.eq("email", email))
    .first();
}

async function log(ctx: MutationCtx, change: Omit<Doc<"staffEvents">, "_id" | "_creationTime" | "at">) {
  await ctx.db.insert("staffEvents", { ...change, at: Date.now() });
}

// One change as a sentence for #/admin's Changes list.
function sentence(e: Doc<"staffEvents">): string {
  const by = shownAs(e.by);
  switch (e.action) {
    case "add":
      return `${by} added ${e.email} as ${e.role}.`;
    case "role":
      return `${by} changed ${e.email} from ${e.oldRole} to ${e.role}.`;
    case "remove":
      return `${by} removed ${e.email} (${e.oldRole}).`;
    case "pair":
      return `${by} paired the door iPad "${e.label}".`;
    case "unpair":
      return `${by} unpaired the door iPad "${e.label}".`;
  }
}

// ---------- Who is signed in ----------

export const me = query({
  args: {},
  returns: v.union(v.null(), v.object({ email: v.string(), role: v.union(roleValidator, v.null()), canHoldRole: v.boolean() })),
  handler: async (ctx): Promise<Me | null> => await readMe(ctx),
});

// ---------- The staff list (admins) ----------

export const people = query({
  args: {},
  returns: v.array(
    v.object({ email: v.string(), role: roleValidator, addedBy: v.string(), at: v.union(v.number(), v.null()), locked: v.boolean() }),
  ),
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const locked = envAdmins();
    const rows = await ctx.db.query("staff").withIndex("by_email").take(STAFF_MAX);
    return [
      ...locked.map((email) => ({ email, role: "admin" as const, addedBy: ENV_ADMIN_BY, at: null, locked: true })),
      ...rows
        .filter((r) => !locked.includes(r.email))
        .map((r) => ({ email: r.email, role: r.role, addedBy: shownAs(r.addedBy), at: r.at, locked: false })),
    ];
  },
});

export const add = mutation({
  args: { email: v.string(), role: roleValidator },
  returns: v.null(),
  handler: async (ctx, { email: raw, role }) => {
    const me = await requireAdmin(ctx);
    const email = cleanEmail(raw);
    if (envAdmins().includes(email)) throw new ConvexError(`${email} is a permanent admin already (set in the server settings).`);
    const row = await findStaff(ctx, email);
    if (row?.role === role) return null;
    if (row) throw new ConvexError(`${email} is on the staff list already (${row.role}). Change the role in the list.`);
    await ctx.db.insert("staff", { email, role, addedBy: me.email, at: Date.now() });
    await log(ctx, { by: me.email, action: "add", email, role });
    return null;
  },
});

export const setRole = mutation({
  args: { email: v.string(), role: roleValidator },
  returns: v.null(),
  handler: async (ctx, { email: raw, role }) => {
    const me = await requireAdmin(ctx);
    const email = normEmail(raw);
    if (envAdmins().includes(email)) throw new ConvexError(`${email} is a permanent admin (set in the server settings), so their role can't change here.`);
    const row = await findStaff(ctx, email);
    if (!row) throw new ConvexError(`${email} isn't on the staff list.`);
    if (row.role === role) return null;
    await ctx.db.patch("staff", row._id, { role });
    await log(ctx, { by: me.email, action: "role", email, role, oldRole: row.role });
    return null;
  },
});

export const remove = mutation({
  args: { email: v.string() },
  returns: v.null(),
  handler: async (ctx, { email: raw }) => {
    const me = await requireAdmin(ctx);
    const email = normEmail(raw);
    if (envAdmins().includes(email)) throw new ConvexError(`${email} is a permanent admin (set in the server settings), so they can't be removed here.`);
    const rows = await ctx.db
      .query("staff")
      .withIndex("by_email", (q) => q.eq("email", email))
      .take(10);
    for (const row of rows) {
      await ctx.db.delete("staff", row._id);
      await log(ctx, { by: me.email, action: "remove", email, oldRole: row.role });
    }
    return null;
  },
});

export const changes = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("staffEvents"),
      at: v.number(),
      by: v.string(),
      action: staffActionValidator,
      email: v.union(v.string(), v.null()),
      role: v.union(roleValidator, v.null()),
      oldRole: v.union(roleValidator, v.null()),
      label: v.union(v.string(), v.null()),
      text: v.string(),
    }),
  ),
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const rows = await ctx.db.query("staffEvents").order("desc").take(CHANGES);
    return rows.map((e) => ({
      _id: e._id,
      at: e.at,
      by: shownAs(e.by),
      action: e.action,
      email: e.email ?? null,
      role: e.role ?? null,
      oldRole: e.oldRole ?? null,
      label: e.label ?? null,
      text: sentence(e),
    }));
  },
});

// ---------- Door iPads (professors and admins) ----------

export const devices = query({
  args: {},
  returns: v.array(
    v.object({ _id: v.id("devices"), label: v.string(), pairedBy: v.string(), pairedAt: v.number(), lastUsedAt: v.union(v.number(), v.null()) }),
  ),
  handler: async (ctx) => {
    await requireProf(ctx);
    const rows = await ctx.db.query("devices").order("desc").take(100);
    return rows.map((d) => ({ _id: d._id, label: d.label, pairedBy: d.pairedBy, pairedAt: d.pairedAt, lastUsedAt: d.lastUsedAt ?? null }));
  },
});

export const approvePairing = mutation({
  args: { code: v.string(), label: v.string() },
  returns: v.id("devices"),
  handler: async (ctx, { code: rawCode, label: rawLabel }): Promise<Id<"devices">> => {
    const me = await requireProf(ctx);
    const code = rawCode.replace(/[\s-]/g, "");
    if (!/^\d{6}$/.test(code)) throw new ConvexError("Type the 6-digit code from the iPad.");
    const label = rawLabel.trim().replace(/\s+/g, " ");
    if (!label) throw new ConvexError("Name the iPad, for example A-210 door.");
    if (label.length > LABEL_MAX) throw new ConvexError(`Keep the name to ${LABEL_MAX} characters.`);
    const now = Date.now();
    const sameCode = await ctx.db
      .query("pairings")
      .withIndex("by_code", (q) => q.eq("code", code))
      .take(10);
    const pairing = sameCode.find((p) => p.expiresAt > now);
    if (!pairing) throw new ConvexError("That code is wrong or expired. Check the code on the iPad.");
    // A code pairs once: the request is gone after this.
    await ctx.db.delete("pairings", pairing._id);
    const had = await deviceByHash(ctx, pairing.tokenHash);
    if (had) return had._id;
    const device = await ctx.db.insert("devices", { tokenHash: pairing.tokenHash, label, pairedBy: me.email, pairedAt: now });
    await log(ctx, { by: me.email, action: "pair", device, label });
    return device;
  },
});

export const unpair = mutation({
  args: { device: v.id("devices") },
  returns: v.null(),
  handler: async (ctx, { device }) => {
    const me = await requireProf(ctx);
    const row = await ctx.db.get("devices", device);
    if (!row) return null;
    await ctx.db.delete("devices", device);
    await log(ctx, { by: me.email, action: "unpair", device, label: row.label });
    return null;
  },
});

// ---------- The door iPad's side (no sign-in) ----------

// The open pairing request for this token's hash, or null.
async function openPairing(ctx: QueryCtx | MutationCtx, hash: string, now: number) {
  const rows = await ctx.db
    .query("pairings")
    .withIndex("by_tokenHash", (q) => q.eq("tokenHash", hash))
    .take(10);
  return rows.find((p) => p.expiresAt > now) ?? null;
}

// A 6-digit code no open request is using.
async function freeCode(ctx: MutationCtx, now: number) {
  for (let i = 0; i < 20; i++) {
    const code = randomCode(6, "0123456789");
    const same = await ctx.db
      .query("pairings")
      .withIndex("by_code", (q) => q.eq("code", code))
      .take(10);
    if (!same.some((p) => p.expiresAt > now)) return code;
  }
  throw new ConvexError("Couldn't find an unused code. Try again.");
}

export const requestPairing = mutation({
  args: { token: v.string() },
  returns: v.union(waiting, paired),
  handler: async (ctx, { token }) => {
    if (!isDeviceToken(token)) throw new ConvexError("This iPad's saved ID is broken. Clear this site's data in the iPad's settings, then open the page again.");
    const hash = await tokenHash(token);
    const device = await deviceByHash(ctx, hash);
    if (device) return { status: "paired" as const, label: device.label };
    const now = Date.now();
    const open = await openPairing(ctx, hash, now);
    if (open) return { status: "waiting" as const, code: open.code, expiresAt: open.expiresAt };
    const waitingNow = await ctx.db
      .query("pairings")
      .withIndex("by_expiresAt", (q) => q.gt("expiresAt", now))
      .take(MAX_WAITING);
    // Full: end the oldest open request (by_expiresAt is oldest first) so this iPad gets a code.
    if (waitingNow.length >= MAX_WAITING) await ctx.db.delete("pairings", waitingNow[0]._id);
    const code = await freeCode(ctx, now);
    const expiresAt = now + PAIR_MS;
    const pairing = await ctx.db.insert("pairings", { code, tokenHash: hash, expiresAt });
    await ctx.scheduler.runAt(expiresAt, internal.staff.dropPairing, { pairing });
    return { status: "waiting" as const, code, expiresAt };
  },
});

export const deviceStatus = query({
  args: { token: v.string() },
  returns: v.union(none, waiting, paired),
  handler: async (ctx, { token }) => {
    if (!isDeviceToken(token)) return { status: "none" as const };
    const hash = await tokenHash(token);
    const device = await deviceByHash(ctx, hash);
    if (device) return { status: "paired" as const, label: device.label };
    const open = await openPairing(ctx, hash, Date.now());
    return open ? { status: "waiting" as const, code: open.code, expiresAt: open.expiresAt } : { status: "none" as const };
  },
});

// Deletes a pairing request once its code has expired. requestPairing schedules it for each
// request; a request approved before then is already gone.
export const dropPairing = internalMutation({
  args: { pairing: v.id("pairings") },
  returns: v.null(),
  handler: async (ctx, { pairing }) => {
    const row = await ctx.db.get("pairings", pairing);
    if (row && row.expiresAt <= Date.now()) await ctx.db.delete("pairings", pairing);
    return null;
  },
});

// ---------- The CLI ----------

// Gives a test email (@test.local) a role on a dev backend for 2 hours, for browser checks with
// the typed sign-in. Refuses on prod (convex/checkin/prof.ts isDevBackend), where a typed sign-in
// never holds a role, and refuses any email that isn't a test email or whose row someone else
// added. Running it again starts the 2 hours again.
export const devGrant = internalMutation({
  args: { email: v.string(), role: roleValidator },
  returns: v.string(),
  handler: async (ctx, { email: raw, role }) => {
    if (!isDevBackend()) throw new ConvexError("staff:devGrant runs only on a dev backend.");
    const email = cleanEmail(raw);
    if (!isTestEmail(email) || envAdmins().includes(email)) {
      throw new ConvexError(`staff:devGrant takes only test emails ending in ${TEST_DOMAIN}, like prof1${TEST_DOMAIN}.`);
    }
    const row = await findStaff(ctx, email);
    if (row && row.addedBy !== DEV_GRANT) {
      throw new ConvexError(`${email} is on the staff list already, added by ${shownAs(row.addedBy)}. staff:devGrant changes only rows it added.`);
    }
    const now = Date.now();
    let said: string;
    if (row?.role === role) {
      await ctx.db.patch("staff", row._id, { at: now });
      said = `${email} is ${role} already. The 2 hours start again now.`;
    } else if (row) {
      await ctx.db.patch("staff", row._id, { role, at: now });
      await log(ctx, { by: DEV_GRANT, action: "role", email, role, oldRole: row.role });
      said = `${email} is ${role} now, for 2 hours.`;
    } else {
      await ctx.db.insert("staff", { email, role, addedBy: DEV_GRANT, at: now });
      await log(ctx, { by: DEV_GRANT, action: "add", email, role });
      said = `${email} is ${role} now, for 2 hours.`;
    }
    await ctx.scheduler.runAt(now + DEV_GRANT_MS, internal.staff.dropDevGrant, { email });
    return said;
  },
});

// Removes a devGrant row once its 2 hours are up. devGrant schedules it each time it runs; a row
// devGrant ran for again since then is kept until its own job.
export const dropDevGrant = internalMutation({
  args: { email: v.string() },
  returns: v.null(),
  handler: async (ctx, { email }) => {
    const row = await findStaff(ctx, email);
    if (row && row.addedBy === DEV_GRANT && row.at + DEV_GRANT_MS <= Date.now()) {
      await ctx.db.delete("staff", row._id);
      await log(ctx, { by: DEV_GRANT, action: "remove", email, oldRole: row.role });
    }
    return null;
  },
});

// Removes every devGrant row now, so no test email holds a role on dev until devGrant runs again.
// Runs anywhere (prod has no devGrant rows).
export const devRevoke = internalMutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("staff")
      .withIndex("by_addedBy", (q) => q.eq("addedBy", DEV_GRANT))
      .take(STAFF_MAX);
    for (const row of rows) {
      await ctx.db.delete("staff", row._id);
      await log(ctx, { by: DEV_GRANT, action: "remove", email: row.email, oldRole: row.role });
    }
    return `Removed ${rows.length} test roles.`;
  },
});

// Adds every address in the old HOST_EMAILS env var as a professor, once: an address that
// already has a role keeps it, so running it again adds nobody. An ADMIN_EMAILS admin counts as
// having a role: a professor row for them would be hidden on People, and #/admin couldn't remove it. Run on dev now and on prod after
// the deploy; after that nothing reads HOST_EMAILS.
export const importHostEmails = internalMutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    const emails = [...new Set((process.env.HOST_EMAILS ?? "").split(",").map(normEmail).filter(Boolean))];
    const admins = envAdmins();
    let added = 0;
    let notEmails = 0;
    for (const email of emails) {
      if (!EMAIL.test(email)) {
        notEmails++;
        continue;
      }
      if (admins.includes(email) || (await findStaff(ctx, email))) continue;
      await ctx.db.insert("staff", { email, role: "professor", addedBy: IMPORT, at: Date.now() });
      await log(ctx, { by: IMPORT, action: "add", email, role: "professor" });
      added++;
    }
    const had = emails.length - added - notEmails;
    return `HOST_EMAILS: ${emails.length} addresses. Added as professors: ${added}. Had a role already: ${had}. Not email addresses: ${notEmails}.`;
  },
});
