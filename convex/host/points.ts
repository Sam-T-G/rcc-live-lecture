// Points the professor changes by hand, and the end of the day.
import { ConvexError, v } from "convex/values";
import { mutation } from "../_generated/server";
import { requireProf } from "../checkin/prof";
import { buildRoster } from "./board";
import { TEAMS, reshuffleRoom } from "./teams";

const EXTRA_CREDIT = 1; // each student on the winning team

// Take points off (or give some back). The reason is kept so a change can be undone.
export const adjust = mutation({
  args: { key: v.optional(v.string()), channel: v.string(), user: v.string(), name: v.string(), delta: v.number(), reason: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, { key, channel, user, name, delta, reason }) => {
    await requireProf(ctx, key);
    if (!Number.isInteger(delta) || delta === 0 || Math.abs(delta) > 10) throw new ConvexError("Change points by 1 to 10.");
    await ctx.db.insert("pointEvents", { channel, user, name, delta, reason: reason?.trim() || (delta < 0 ? "Deduction" : "Bonus"), at: Date.now() });
    return null;
  },
});

// The team with the most points today wins; every student on it gets extra credit. Then the
// day resets and everyone is mixed into new teams. A tie awards nothing and changes nothing.
export const endDay = mutation({
  args: { key: v.optional(v.string()), channel: v.string() },
  returns: v.string(),
  handler: async (ctx, { key, channel }) => {
    await requireProf(ctx, key);
    const roster = await buildRoster(ctx, channel);
    const today = TEAMS.map((team) => ({ team, points: roster.filter((r) => r.team === team).reduce((n, r) => n + r.today, 0) })).sort((a, b) => b.points - a.points);
    if (today[0].points === 0) return "No points today. Nothing to award.";
    if (today[0].points === today[1].points) return `${today[0].team} and ${today[1].team} are tied at ${today[0].points}. Break the tie, then end the day.`;
    const winners = roster.filter((r) => r.team === today[0].team);
    const now = Date.now();
    for (const w of winners) await ctx.db.insert("pointEvents", { channel, user: w.user, name: w.name, delta: EXTRA_CREDIT, reason: `Extra credit: ${today[0].team} team won the day`, at: now });
    await reshuffleRoom(ctx, channel, true);
    return `${today[0].team} won with ${today[0].points}. ${winners.length} students got +${EXTRA_CREDIT} extra credit. Teams are mixed for the next day.`;
  },
});
