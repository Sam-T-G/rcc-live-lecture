// Check-in by QR pass: each student's phone shows a QR with their pass code, and the
// teacher's laptop scans it. The code changes every 20 seconds (refresh), so a screenshot
// only works for about 40 seconds. Writes `passes` and `checkins`.
import { mutation, query } from "../_generated/server";
import { ConvexError, v } from "convex/values";
import { isHostIdentity, randomCode, requireUser } from "../lib";
import { keyOk, kioskKeyOk, requireScanner } from "./prof";
import { ensureGroup } from "../live/groups";

const EVERY = 20_000; // ms between codes
const LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no look-alikes, so a teacher can type one

// Whether the signed-in person can open the teacher page.
export const amHost = query({
  args: { key: v.optional(v.string()) },
  returns: v.boolean(),
  handler: async (ctx, { key }) => {
    if (keyOk(key)) return true;
    const me = await ctx.auth.getUserIdentity();
    return isHostIdentity(me);
  },
});

// Whether this device can scan passes at the door: the kiosk key, the professor key, or a Google host.
export const canScan = query({
  args: { key: v.optional(v.string()) },
  returns: v.boolean(),
  handler: async (ctx, { key }) => {
    if (kioskKeyOk(key) || keyOk(key)) return true;
    const me = await ctx.auth.getUserIdentity();
    return isHostIdentity(me);
  },
});

// The signed-in student's pass, or null before the first refresh.
export const mine = query({
  args: {},
  returns: v.union(v.null(), v.object({ code: v.string(), name: v.string(), email: v.string() })),
  handler: async (ctx) => {
    const me = await ctx.auth.getUserIdentity();
    if (!me) return null;
    const p = await ctx.db.query("passes").withIndex("by_user", (q) => q.eq("user", me.tokenIdentifier)).unique();
    return p && { code: p.code, name: p.name, email: p.email };
  },
});

// Makes the pass if it's missing, and a new code once the current one is 20 s old.
// The student page calls this every 5 s while it's open.
export const refresh = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const me = await requireUser(ctx);
    const now = Date.now();
    const p = await ctx.db.query("passes").withIndex("by_user", (q) => q.eq("user", me.tokenIdentifier)).unique();
    const name = me.name ?? me.email ?? "Student";
    if (!p) {
      await ctx.db.insert("passes", { user: me.tokenIdentifier, name, email: me.email ?? "", code: randomCode(6, LETTERS), prevCode: "", at: now });
    } else if (now - p.at >= EVERY) {
      await ctx.db.patch(p._id, { name, prevCode: p.code, code: randomCode(6, LETTERS), at: now });
    }
    return null;
  },
});

// The teacher or the door kiosk scans (or types) a pass code. Checks the student in on this channel once.
export const scan = mutation({
  args: { key: v.optional(v.string()), channel: v.string(), code: v.string() },
  returns: v.object({ name: v.string(), email: v.string(), already: v.boolean() }),
  handler: async (ctx, { key, channel, code }) => {
    await requireScanner(ctx, key);
    const c = code.trim().toUpperCase().replace(/^RCC-/, "");
    if (!c) throw new ConvexError("No code.");
    const now = Date.now();
    let p = await ctx.db.query("passes").withIndex("by_code", (q) => q.eq("code", c)).unique();
    // The code before the current one still works for one more round.
    if (!p) {
      const old = await ctx.db.query("passes").withIndex("by_prevCode", (q) => q.eq("prevCode", c)).first();
      if (old && now - old.at < EVERY * 2) p = old;
    }
    if (!p || now - p.at > EVERY * 3) throw new ConvexError("That code is old or wrong. Ask them to open their pass again.");
    const row = await ctx.db
      .query("checkins")
      .withIndex("by_channel_and_user", (q) => q.eq("channel", channel).eq("user", p.user))
      .unique();
    if (!row) {
      // Late = after the host's start time plus grace. No start time set means nobody is late.
      const start = await ctx.db.query("classStarts").withIndex("by_channel", (q) => q.eq("channel", channel)).unique();
      const over = start ? now - (start.startsAt + start.graceMin * 60_000) : -1;
      const lateMin = over > 0 ? Math.max(1, Math.round((now - start!.startsAt) / 60_000)) : undefined;
      await ctx.db.insert("checkins", { channel, user: p.user, name: p.name, email: p.email, at: now, lateMin });
    }
    await ensureGroup(ctx, channel, p.user); // Live slides: deals a team in arrival order (Red, Blue, Yellow, ...)
    return { name: p.name, email: p.email, already: !!row };
  },
});
