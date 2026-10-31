// Live slides: "I'm lost" on a slide (F20). A checked-in student taps it on #/live for the slide on
// their phone, the live one or one they paged back to, and a second tap takes it back. The
// professor's #/host reads the counts through live/read.ts (lostCount for the slide on screen,
// lostBySlide for every slide); no query returns who tapped.
//
// One row per student per slide per class. The `lost` table stores no class: a row belongs to the
// class whose window holds its _creationTime (lib.lectureWindow), so the toggle only looks at rows
// from this class's start. A student lost on slide 3 last week starts this week not lost, and last
// week's row stays where it was (nothing is deleted at the end of a class).
//
// Refusals, in order: "Sign in first." (lib.requireUser), "Check in first." (no check-in in this
// class, lib.checkedIn), "That slide hasn't been shown yet." (the index isn't a slide this class
// has shown: see shownThisClass).
import { ConvexError, v } from "convex/values";
import { mutation, type MutationCtx } from "../_generated/server";
import { checkedIn, lectureWindow, requireUser } from "../lib";

// Whether `index` is a slide this class has shown, so a student can tap only a slide their phone
// can show: a page-back row (deckSlides, what deck.slides lists) sent since the class started, or
// the slide the deck is on now (deckChannels, what deck.current returns) when the deck sent it
// since the class started. A whole number from 0 up; anything else was never a slide.
async function shownThisClass(ctx: MutationCtx, channel: string, index: number, start: number) {
  if (!Number.isInteger(index) || index < 0) return false;
  const shown = await ctx.db
    .query("deckSlides")
    .withIndex("by_channel_and_index", (q) => q.eq("channel", channel).eq("index", index))
    .first();
  if (shown && shown.at >= start) return true;
  const deck = await ctx.db
    .query("deckChannels")
    .withIndex("by_channel", (q) => q.eq("channel", channel))
    .first();
  return deck !== null && deck.index === index && deck.at >= start;
}

// Tap "I'm lost" on a slide, or tap again to take it back. Returns true when the student is now
// counted as lost on that slide, false when the tap took it back.
export const toggle = mutation({
  args: { channel: v.string(), index: v.number() },
  returns: v.boolean(),
  handler: async (ctx, { channel, index }) => {
    const me = await requireUser(ctx);
    if (!(await checkedIn(ctx, channel, me.tokenIdentifier))) throw new ConvexError("Check in first.");
    const { start } = await lectureWindow(ctx, channel);
    if (!(await shownThisClass(ctx, channel, index, start))) throw new ConvexError("That slide hasn't been shown yet.");
    const row = await ctx.db
      .query("lost")
      .withIndex("by_channel_and_index_and_user", (q) =>
        q.eq("channel", channel).eq("index", index).eq("user", me.tokenIdentifier).gte("_creationTime", start),
      )
      .first();
    if (row) {
      await ctx.db.delete("lost", row._id);
      return false;
    }
    await ctx.db.insert("lost", { channel, index, user: me.tokenIdentifier, at: Date.now() });
    return true;
  },
});
