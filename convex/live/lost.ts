// Live slides: "I'm lost" on a slide. One row per person per slide; a second tap takes it back.
import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { requireUser } from "../lib";

export const toggle = mutation({
  args: { channel: v.string(), index: v.number() },
  returns: v.boolean(), // true if they're now marked lost on this slide
  handler: async (ctx, { channel, index }) => {
    const me = await requireUser(ctx);
    const row = await ctx.db
      .query("lost")
      .withIndex("by_channel_and_index_and_user", (q) => q.eq("channel", channel).eq("index", index).eq("user", me.tokenIdentifier))
      .unique();
    if (row) {
      await ctx.db.delete(row._id);
      return false;
    }
    await ctx.db.insert("lost", { channel, index, user: me.tokenIdentifier, at: Date.now() });
    return true;
  },
});
