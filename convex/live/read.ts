// Contract: what the other teams read from Live slides (docs/contracts.md). Written before the
// meeting so Professor view can build against it from minute one. The Live slides team owns
// this file and the `lost` table; keep these working if you change them.
import { query } from "../_generated/server";
import { v } from "convex/values";

// How many people are lost on one slide.
export const lostCount = query({
  args: { channel: v.string(), index: v.number() },
  returns: v.number(),
  handler: async (ctx, { channel, index }) => {
    const rows = await ctx.db
      .query("lost")
      .withIndex("by_channel_and_index", (q) => q.eq("channel", channel).eq("index", index))
      .collect();
    return rows.length;
  },
});

// Lost counts for every slide that has any, in slide order. For a "where did we lose them" list.
export const lostBySlide = query({
  args: { channel: v.string() },
  returns: v.array(v.object({ index: v.number(), count: v.number() })),
  handler: async (ctx, { channel }) => {
    const rows = await ctx.db.query("lost").withIndex("by_channel_and_index", (q) => q.eq("channel", channel)).collect();
    const by = new Map<number, number>();
    for (const r of rows) by.set(r.index, (by.get(r.index) ?? 0) + 1);
    return [...by].map(([index, count]) => ({ index, count })).sort((a, b) => a.index - b.index);
  },
});

// Whether the signed-in person said they're lost on this slide, so the button can show it.
export const mine = query({
  args: { channel: v.string(), index: v.number() },
  returns: v.boolean(),
  handler: async (ctx, { channel, index }) => {
    const id = await ctx.auth.getUserIdentity();
    if (!id) return false;
    const row = await ctx.db
      .query("lost")
      .withIndex("by_channel_and_index_and_user", (q) => q.eq("channel", channel).eq("index", index).eq("user", id.tokenIdentifier))
      .unique();
    return row !== null;
  },
});
