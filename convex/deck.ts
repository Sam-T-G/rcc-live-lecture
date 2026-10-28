// Block: deck bridge. Which slide a deck is on, live, for any page that asks.
import { v } from "convex/values";
import { query, internalMutation } from "./_generated/server";

const slideShape = v.object({
  index: v.number(),
  beat: v.number(),
  count: v.number(),
  title: v.string(),
  lines: v.array(v.string()),
  at: v.number(),
});

// Anyone can read a channel; decide in your own query who should see it.
export const current = query({
  args: { channel: v.string() },
  returns: v.union(slideShape, v.null()),
  handler: async (ctx, { channel }) => {
    const row = await ctx.db
      .query("deckChannels")
      .withIndex("by_channel", (q) => q.eq("channel", channel))
      .unique();
    if (!row) return null;
    return { index: row.index, beat: row.beat, count: row.count, title: row.title, lines: row.lines, at: row.at };
  },
});

export const set = internalMutation({
  args: {
    channel: v.string(),
    index: v.number(),
    beat: v.number(),
    count: v.number(),
    title: v.string(),
    lines: v.array(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, a) => {
    const row = await ctx.db
      .query("deckChannels")
      .withIndex("by_channel", (q) => q.eq("channel", a.channel))
      .unique();
    const doc = { ...a, at: Date.now() };
    if (row) await ctx.db.replace(row._id, doc);
    else await ctx.db.insert("deckChannels", doc);
    return null;
  },
});
