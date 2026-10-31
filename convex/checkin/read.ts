// Contract: what the other teams read from Check-in (docs/contracts.md). Every read is for this
// class (lib.lectureWindow): from the second class on, a student who checked in last week counts
// only once they're scanned again, and last week's names drop off the lists. Before the first
// class ever opens (prod right after the deploy that added classes), every check-in counts, the
// way it did before classes existed. The Check-in team owns this file and the tables; keep these
// three working if you change them.
import { query } from "../_generated/server";
import { v } from "convex/values";
import { checkedIn, lectureWindow } from "../lib";
import { requireProf } from "./prof";

// How many people checked in to this class. Anyone can read the number: no names, no emails.
export const count = query({
  args: { channel: v.string() },
  returns: v.number(),
  handler: async (ctx, { channel }) => {
    const { start } = await lectureWindow(ctx, channel);
    const rows = await ctx.db
      .query("checkins")
      .withIndex("by_channel", (q) => q.eq("channel", channel).gte("_creationTime", start))
      .collect();
    return rows.length;
  },
});

// Whether the signed-in person has checked in to this class (false signed out). The pass page
// (#/checkin/student) reads it to show "You're checked in." in place of the QR. Inside a server
// function, lib.checkedIn makes the same check.
export const me = query({
  args: { channel: v.string() },
  returns: v.boolean(),
  handler: async (ctx, { channel }) => {
    const id = await ctx.auth.getUserIdentity();
    if (!id) return false;
    return await checkedIn(ctx, channel, id.tokenIdentifier);
  },
});

// Who checked in to this class, newest first, with the time, and the check-in's id for
// attendance.removeCheckin. Names are private, so professors and admins only.
export const names = query({
  args: { channel: v.string() },
  returns: v.array(v.object({ id: v.id("checkins"), name: v.string(), at: v.number() })),
  handler: async (ctx, { channel }) => {
    await requireProf(ctx);
    const { start } = await lectureWindow(ctx, channel);
    const rows = await ctx.db
      .query("checkins")
      .withIndex("by_channel", (q) => q.eq("channel", channel).gte("_creationTime", start))
      .order("desc")
      .collect();
    return rows.map((r) => ({ id: r._id, name: r.name, at: r.at }));
  },
});
