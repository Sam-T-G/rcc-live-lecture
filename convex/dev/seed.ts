// Sample data for a dev backend, so a team can build against the other teams' tables before
// they exist on its own laptop (every lead runs their own dev deployment).
//   npx convex run dev/seed:fill '{"channel":"gdg"}'    adds 8 sample check-ins and lost taps
//   npx convex run dev/seed:clear '{"channel":"gdg"}'   removes only the sample rows
// Internal: the CLI and the dashboard can run these, the browser can't. Leads only.
import { internalMutation } from "../_generated/server";
import { v } from "convex/values";

const SAMPLE = "sample:";

export const fill = internalMutation({
  args: { channel: v.string(), people: v.optional(v.number()) },
  returns: v.string(),
  handler: async (ctx, { channel, people = 8 }) => {
    const deck = await ctx.db.query("deckChannels").withIndex("by_channel", (q) => q.eq("channel", channel)).unique();
    const slide = deck?.index ?? 0;
    const now = Date.now();
    for (let k = 1; k <= people; k++) {
      const user = SAMPLE + k;
      await ctx.db.insert("checkins", { channel, user, name: "Sample student " + k, at: now - k * 20000, meters: 10 + k * 3 });
      // A third of them are lost on the current slide, and two on the slide before it.
      if (k % 3 === 0) await ctx.db.insert("lost", { channel, index: slide, user, at: now - k * 5000 });
      if (k <= 2 && slide > 0) await ctx.db.insert("lost", { channel, index: slide - 1, user, at: now - 60000 });
    }
    return `Added ${people} sample check-ins on "${channel}", with lost taps on slide ${slide + 1}.`;
  },
});

export const clear = internalMutation({
  args: { channel: v.string() },
  returns: v.string(),
  handler: async (ctx, { channel }) => {
    let n = 0;
    const checkins = await ctx.db.query("checkins").withIndex("by_channel", (q) => q.eq("channel", channel)).collect();
    const lost = await ctx.db.query("lost").withIndex("by_channel_and_index", (q) => q.eq("channel", channel)).collect();
    for (const r of [...checkins, ...lost]) if (r.user.startsWith(SAMPLE)) { await ctx.db.delete(r._id); n++; }
    return `Removed ${n} sample rows from "${channel}".`;
  },
});
