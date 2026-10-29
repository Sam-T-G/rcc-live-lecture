// Contract: what the other teams read from Check-in (docs/contracts.md). Written before the
// meeting so Live slides and Professor view can build against it from minute one. The
// Check-in team owns this file and the tables; keep these three working if you change them.
import { query } from "../_generated/server";
import { v } from "convex/values";
import { requireProf } from "./prof";

// How many people checked in on this channel. Anyone can read the number.
export const count = query({
  args: { channel: v.string() },
  returns: v.number(),
  handler: async (ctx, { channel }) => {
    const rows = await ctx.db.query("checkins").withIndex("by_channel", (q) => q.eq("channel", channel)).collect();
    return rows.length;
  },
});

// Whether the signed-in person has checked in. Live slides uses this to let people in.
export const me = query({
  args: { channel: v.string() },
  returns: v.boolean(),
  handler: async (ctx, { channel }) => {
    const id = await ctx.auth.getUserIdentity();
    if (!id) return false;
    const row = await ctx.db
      .query("checkins")
      .withIndex("by_channel_and_user", (q) => q.eq("channel", channel).eq("user", id.tokenIdentifier))
      .unique();
    return row !== null;
  },
});

// Who checked in, newest first. Names are private, so hosts only.
export const names = query({
  args: { key: v.optional(v.string()), channel: v.string() },
  returns: v.array(v.object({ name: v.string(), at: v.number() })),
  handler: async (ctx, { key, channel }) => {
    await requireProf(ctx, key);
    const rows = await ctx.db.query("checkins").withIndex("by_channel", (q) => q.eq("channel", channel)).order("desc").collect();
    return rows.map((r) => ({ name: r.name, at: r.at }));
  },
});
