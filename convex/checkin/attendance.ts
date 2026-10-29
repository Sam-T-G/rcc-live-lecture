// Attendance for the professor, and who walked in late. Writes `classStarts` and the
// student's `hideLate`; reads `checkins`. The late banner shows first names only.
import { mutation, query } from "../_generated/server";
import { ConvexError, v } from "convex/values";
import { requireUser } from "../lib";
import { requireProf } from "./prof";

const start = v.object({ startsAt: v.number(), graceMin: v.number() });

// When class starts on this channel, or null if no host has set it (then nobody is late).
export const classStart = query({
  args: { channel: v.string() },
  returns: v.union(v.null(), start),
  handler: async (ctx, { channel }) => {
    const row = await ctx.db.query("classStarts").withIndex("by_channel", (q) => q.eq("channel", channel)).unique();
    return row && { startsAt: row.startsAt, graceMin: row.graceMin };
  },
});

// A host sets the start time (ms) and how many minutes of grace before "late".
export const setClassStart = mutation({
  args: { key: v.optional(v.string()), channel: v.string(), startsAt: v.number(), graceMin: v.number() },
  returns: v.null(),
  handler: async (ctx, { key, channel, startsAt, graceMin }) => {
    await requireProf(ctx, key);
    if (graceMin < 0 || graceMin > 60) throw new ConvexError("Grace has to be 0 to 60 minutes.");
    const row = await ctx.db.query("classStarts").withIndex("by_channel", (q) => q.eq("channel", channel)).unique();
    if (row) await ctx.db.patch(row._id, { startsAt, graceMin });
    else await ctx.db.insert("classStarts", { channel, startsAt, graceMin });
    return null;
  },
});

// Every check-in on this channel, first in first, with email and minutes late. Hosts only.
export const sheet = query({
  args: { key: v.optional(v.string()), channel: v.string() },
  returns: v.array(v.object({ name: v.string(), email: v.string(), at: v.number(), lateMin: v.union(v.null(), v.number()) })),
  handler: async (ctx, { key, channel }) => {
    await requireProf(ctx, key);
    const rows = await ctx.db.query("checkins").withIndex("by_channel", (q) => q.eq("channel", channel)).collect();
    return rows.map((r) => ({ name: r.name, email: r.email ?? "", at: r.at, lateMin: r.lateMin ?? null }));
  },
});

// The last few late arrivals, newest first, for the banner on the slides. Anyone can read
// it, so it carries a first name only, and skips students who turned the banner off.
export const lateFeed = query({
  args: { channel: v.string() },
  returns: v.array(v.object({ id: v.string(), first: v.string(), lateMin: v.number(), at: v.number() })),
  handler: async (ctx, { channel }) => {
    const rows = await ctx.db.query("checkins").withIndex("by_channel", (q) => q.eq("channel", channel)).order("desc").take(100);
    const out = [];
    for (const r of rows) {
      if (r.lateMin === undefined) continue;
      const p = await ctx.db.query("passes").withIndex("by_user", (q) => q.eq("user", r.user)).unique();
      if (p?.hideLate) continue;
      out.push({ id: r._id, first: r.name.split(" ")[0] || "Someone", lateMin: r.lateMin, at: r.at });
      if (out.length === 5) break;
    }
    return out;
  },
});

// The student's own switch for the late banner.
export const myHideLate = query({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => {
    const me = await ctx.auth.getUserIdentity();
    if (!me) return false;
    const p = await ctx.db.query("passes").withIndex("by_user", (q) => q.eq("user", me.tokenIdentifier)).unique();
    return !!p?.hideLate;
  },
});

export const setHideLate = mutation({
  args: { hide: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { hide }) => {
    const me = await requireUser(ctx);
    const p = await ctx.db.query("passes").withIndex("by_user", (q) => q.eq("user", me.tokenIdentifier)).unique();
    if (!p) throw new ConvexError("Open your pass first.");
    await ctx.db.patch(p._id, { hideLate: hide });
    return null;
  },
});
