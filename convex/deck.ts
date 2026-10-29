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

const shownShape = v.object({
  index: v.number(),
  beat: v.number(),
  title: v.string(),
  lines: v.array(v.string()),
  at: v.number(),
});

// Every slide the deck has shown on a channel, in slide order. Slides not shown yet are left
// out, so a phone can page back but never ahead of the professor.
export const slides = query({
  args: { channel: v.string() },
  returns: v.array(shownShape),
  handler: async (ctx, { channel }) => {
    const rows = await ctx.db
      .query("deckSlides")
      .withIndex("by_channel_and_index", (q) => q.eq("channel", channel))
      .take(500);
    return rows.map(({ index, beat, title, lines, at }) => ({ index, beat, title, lines, at }));
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

    // Keep the fullest version of this slide: going back to a slide shows it from its first
    // press, which must not hide lines the room has already seen.
    const shown = await ctx.db
      .query("deckSlides")
      .withIndex("by_channel_and_index", (q) => q.eq("channel", a.channel).eq("index", a.index))
      .unique();
    const slide = { channel: a.channel, index: a.index, beat: a.beat, title: a.title, lines: a.lines, at: doc.at };
    if (!shown) await ctx.db.insert("deckSlides", slide);
    else if (a.beat >= shown.beat) await ctx.db.replace(shown._id, slide);
    return null;
  },
});
