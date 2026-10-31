// Contract: what the other teams read from Live slides (docs/contracts.md). The Live slides team
// owns this file and the `lost` table; keep these working if you change them. Students write the
// table through live/lost.ts toggle ("I'm lost" on #/live); #/host reads lostCount for the slide on
// screen and lostBySlide for the "Lost by slide" line.
//
// Every read counts the current class only: rows from the class window's start
// (lib.lectureWindow), so a new class starts with nobody lost, and between classes (after End day,
// or once a class closed itself) every count is 0. A student has one row per slide in each class,
// so a student lost on slide 3 in two classes has two rows: `mine` reads with .first(), never
// .unique(). Anyone can read the counts, signed out too; no read returns who tapped.
import { query } from "../_generated/server";
import { v } from "convex/values";
import { lectureWindow } from "../lib";

// How many people are lost on one slide in this class.
export const lostCount = query({
  args: { channel: v.string(), index: v.number() },
  returns: v.number(),
  handler: async (ctx, { channel, index }) => {
    const { start } = await lectureWindow(ctx, channel);
    // At most one row per checked-in student for this slide in this class.
    const rows = await ctx.db
      .query("lost")
      .withIndex("by_channel_and_index", (q) => q.eq("channel", channel).eq("index", index).gte("_creationTime", start))
      .collect();
    return rows.length;
  },
});

// Lost counts for every slide that has any in this class, in slide order. For #/host's "Lost by
// slide" line.
export const lostBySlide = query({
  args: { channel: v.string() },
  returns: v.array(v.object({ index: v.number(), count: v.number() })),
  handler: async (ctx, { channel }) => {
    const { start } = await lectureWindow(ctx, channel);
    // This class's taps only: at most one row per checked-in student per slide.
    const rows = await ctx.db
      .query("lost")
      .withIndex("by_channel", (q) => q.eq("channel", channel).gte("_creationTime", start))
      .collect();
    const by = new Map<number, number>();
    for (const r of rows) by.set(r.index, (by.get(r.index) ?? 0) + 1);
    return [...by].map(([index, count]) => ({ index, count })).sort((a, b) => a.index - b.index);
  },
});

// Whether the signed-in person said they're lost on this slide in this class, so the button can
// show it. False when signed out.
export const mine = query({
  args: { channel: v.string(), index: v.number() },
  returns: v.boolean(),
  handler: async (ctx, { channel, index }) => {
    const id = await ctx.auth.getUserIdentity();
    if (!id) return false;
    const { start } = await lectureWindow(ctx, channel);
    const row = await ctx.db
      .query("lost")
      .withIndex("by_channel_and_index_and_user", (q) =>
        q.eq("channel", channel).eq("index", index).eq("user", id.tokenIdentifier).gte("_creationTime", start),
      )
      .first();
    return row !== null;
  },
});
