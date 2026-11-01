// Check-in by QR pass: each student's phone shows a QR with their pass code, and the teacher's
// laptop or the paired door iPad scans it. Writes `passes` and `checkins`.
//
// How long a code scans (pass.test.ts F10.5, F11.2 and F11.3 check each number):
// - refresh makes a new code once the current one is 20 s old. The pass page asks every 5 s, when
//   the phone wakes and as the code turns 20 s old, so with the page open a new code shows every
//   20 to 25 s.
// - scan takes the current code until it's 60 s old, and the code before it until the next new
//   code replaces it or until 40 s after it was replaced, whichever comes first. With the page
//   open that's 20 to 25 s after it was replaced (the 10-29 timing table said 40 s, which holds
//   only once the page stops asking).
// - A code that was already over 60 s old when a new one replaced it (the phone slept) never
//   scans again.
// So while its owner's page stays open, a code (or a screenshot of it) scans for 40 to 50 s after
// it was made. Once the page stops asking, the current code scans until it's 60 s old and a
// replaced one until 40 s after it was replaced, so no code scans 100 s after it was made (the
// longest: replaced just as it turned 60 s old, then the phone slept).
//
// The name on the pass follows the sign-in (cleaned by lib.cleanName, so it's never an email)
// while the student isn't checked in to the current class: a typo is fixed by signing out and in
// before the scan. Once they're checked in, another sign-in with the same email can't rename
// them (whatever channel that page sends: checkedInNow), a second scan shows the name on their
// check-in, and each checkins row keeps the name it was scanned with, so past attendance never
// changes.
//
// Every code is on one pass: refresh draws again when another pass has the code it drew, as its
// code or as the code before it (freshCode). Rows made before it checked can still share a code,
// so scan picks the one pass the code still scans for (passFor).
import { mutation, query, type MutationCtx } from "../_generated/server";
import { ConvexError, v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import { checkedIn, cleanName, ensureLecture, LECTURE_MS, lectureStart, randomCode, requireUser } from "../lib";
import { isProf, pairedDevice, requireScanner, staffRole } from "./prof";
import { ensureGroup } from "../live/groups";

const EVERY = 20_000; // a new code once the current one is this old
const CURRENT_MS = 60_000; // the current code scans until it's this old
const PREVIOUS_MS = 40_000; // the code before it scans until this long after it was replaced
const LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no look-alikes, so a teacher can type one
const DRAWS = 5; // codes freshCode tries before giving up (32^6 codes, so a second try is already rare)
const MATCHES = 10; // passes scan reads for one code; with unique codes there is at most one
const RECENT_CLASSES = 20; // classes checkedInNow looks at for the channels students check in on

export const NOT_A_PASS = "That code isn't a pass. Ask them to open their pass again.";
export const OLD = "That code is old. Ask them to open their pass again.";

// Whether the signed-in person can open the professor pages: a professor or admin on the staff
// list (checkin/prof.ts).
export const amHost = query({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => isProf(await staffRole(ctx)),
});

// Whether this device can scan passes at the door: a paired door iPad (its device token), or
// anyone signed in with a role (scanner, professor, admin).
export const canScan = query({
  args: { device: v.optional(v.string()) },
  returns: v.boolean(),
  handler: async (ctx, { device }) => {
    if (await pairedDevice(ctx, device)) return true;
    return (await staffRole(ctx)) !== null;
  },
});

// The signed-in student's pass, or null before the first refresh. `at` is when the code was
// made, by the server's clock.
export const mine = query({
  args: {},
  returns: v.union(v.null(), v.object({ code: v.string(), name: v.string(), email: v.string(), at: v.number() })),
  handler: async (ctx) => {
    const me = await ctx.auth.getUserIdentity();
    if (!me) return null;
    const p = await ctx.db.query("passes").withIndex("by_user", (q) => q.eq("user", me.tokenIdentifier)).unique();
    return p && { code: p.code, name: p.name, email: p.email, at: p.at };
  },
});

// A pass code no pass has now, as its code or as the code before it.
async function freshCode(ctx: MutationCtx): Promise<string> {
  for (let i = 0; i < DRAWS; i++) {
    const code = randomCode(6, LETTERS);
    const taken =
      (await ctx.db.query("passes").withIndex("by_code", (q) => q.eq("code", code)).first()) ??
      (await ctx.db.query("passes").withIndex("by_prevCode", (q) => q.eq("prevCode", code)).first());
    if (!taken) return code;
  }
  throw new ConvexError("Couldn't make a new code. Try again.");
}

// Whether the student is checked in to the current class on `channel` or on any channel a recent
// class ran on, so a page that sends another channel can't rename a checked-in student.
async function checkedInNow(ctx: MutationCtx, channel: string, user: string): Promise<boolean> {
  const recent = await ctx.db.query("lectures").order("desc").take(RECENT_CLASSES);
  for (const ch of new Set([channel, ...recent.map((l) => l.channel)])) if (await checkedIn(ctx, ch, user)) return true;
  return false;
}

// Makes the pass if it's missing, and a new code once the current one is 20 s old. The pass page
// calls it with the channel it checks in on. The name follows the sign-in only while the student
// isn't checked in to a current class (checkedInNow); a call without a channel (a page opened
// before the channel was sent) leaves the name as it is.
export const refresh = mutation({
  args: { channel: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, { channel }) => {
    const me = await requireUser(ctx);
    const now = Date.now();
    const name = cleanName(me.name);
    const p = await ctx.db.query("passes").withIndex("by_user", (q) => q.eq("user", me.tokenIdentifier)).unique();
    if (!p) {
      await ctx.db.insert("passes", { user: me.tokenIdentifier, name, email: me.email ?? "", code: await freshCode(ctx), prevCode: "", at: now });
      return null;
    }
    const change: { name?: string; code?: string; prevCode?: string; at?: number } = {};
    if (name !== p.name && channel !== undefined && !(await checkedInNow(ctx, channel, me.tokenIdentifier))) change.name = name;
    if (now - p.at >= EVERY) {
      // The replaced code scans for a while longer as the code before this one, unless it had
      // already run out: then a screenshot of it stays refused.
      change.prevCode = now - p.at <= CURRENT_MS ? p.code : "";
      change.code = await freshCode(ctx);
      change.at = now;
    }
    if (Object.keys(change).length > 0) await ctx.db.patch("passes", p._id, change);
    return null;
  },
});

// The pass a scanned code belongs to, or the reason it doesn't scan: "That code is old." for a
// pass's code that ran out, "That code isn't a pass." for a code no pass has now (a typo, a code
// replaced twice, or a pass made on another backend, like a phone on the dev site at a door on
// the live site). Passes made before freshCode checked can share a code: the one pass it still
// scans for wins, and when two still scan it gets "That code isn't a pass.", so the student
// opens their pass again for a new code.
async function passFor(ctx: MutationCtx, code: string, now: number): Promise<Doc<"passes">> {
  const current = await ctx.db.query("passes").withIndex("by_code", (q) => q.eq("code", code)).take(MATCHES);
  const before = await ctx.db.query("passes").withIndex("by_prevCode", (q) => q.eq("prevCode", code)).take(MATCHES);
  // By id, since an old pass can hold the same code as its code and as the code before it.
  const scans = new Map<string, Doc<"passes">>();
  for (const p of current) if (now - p.at <= CURRENT_MS) scans.set(p._id, p);
  for (const p of before) if (now - p.at < PREVIOUS_MS) scans.set(p._id, p);
  if (scans.size === 1) return [...scans.values()][0];
  if (scans.size === 0 && current.length + before.length > 0) throw new ConvexError(OLD);
  throw new ConvexError(NOT_A_PASS);
}

// The teacher or the door iPad scans (or types) a pass code. A paired iPad passes its device
// token as `device`. A scan starts class activity, so it opens a class when none is open
// (lib.ensureLecture), and checks the student in once per class: a student checked in last class
// gets a new row in this one. The reply has the student's email only for a professor or admin
// (the teacher scanner shows it); a paired iPad and the scanner role get "" there, since
// students' emails are otherwise professor-only.
export const scan = mutation({
  args: { device: v.optional(v.string()), channel: v.string(), code: v.string() },
  returns: v.object({ name: v.string(), email: v.string(), already: v.boolean() }),
  handler: async (ctx, { device, channel, code }) => {
    const iPad = await requireScanner(ctx, device);
    // Last used on #/admin: the iPad's last scan (a scan that throws below rolls this back too).
    if (iPad) await ctx.db.patch("devices", iPad._id, { lastUsedAt: Date.now() });
    const c = code.trim().toUpperCase().replace(/^RCC-/, "");
    if (!c) throw new ConvexError("No code.");
    const now = Date.now();
    const p = await passFor(ctx, c, now);
    const lecture = await ensureLecture(ctx, channel);
    const row = await ctx.db
      .query("checkins")
      .withIndex("by_channel_and_user", (q) => q.eq("channel", channel).eq("user", p.user).gte("_creationTime", lectureStart(lecture)))
      .first();
    // The name on this class's check-in; a pass made before names were cleaned can still hold an email.
    const name = row ? row.name : cleanName(p.name);
    if (!row) {
      // Minutes late, stored on the row because attendance.sheet and lateFeed read it from here
      // until they work it out when read (package CKA); then this block goes. Late = after the
      // classStarts row's start plus grace, counted only when that start is within 12 hours of
      // the scan, so a start saved on an earlier day can't make everyone days late.
      const start = await ctx.db.query("classStarts").withIndex("by_channel", (q) => q.eq("channel", channel)).unique();
      const counts = start !== null && Math.abs(now - start.startsAt) < LECTURE_MS;
      const over = counts ? now - (start.startsAt + start.graceMin * 60_000) : -1;
      const lateMin = counts && over > 0 ? Math.max(1, Math.round((now - start.startsAt) / 60_000)) : undefined;
      await ctx.db.insert("checkins", { channel, user: p.user, name, email: p.email, at: now, lateMin });
    }
    await ensureGroup(ctx, channel, p.user); // Live slides: deals a team in arrival order (Red, Blue, Yellow, ...)
    const email = isProf(await staffRole(ctx)) ? p.email : "";
    return { name, email, already: row !== null };
  },
});
