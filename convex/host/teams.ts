// The three teams students are randomly split into, and the room's salt that decides the split.
// A student's team is worked out from their user key and the salt, never stored, so a reshuffle
// regroups everyone at once.
import { ConvexError, v } from "convex/values";
import { mutation, query } from "../_generated/server";
import type { QueryCtx, MutationCtx } from "../_generated/server";
import { randomCode } from "../lib";
import { requireProf } from "../checkin/prof";

export const TEAMS = ["red", "yellow", "blue"] as const;
export type Team = (typeof TEAMS)[number];

export const teamValidator = v.union(v.literal("red"), v.literal("yellow"), v.literal("blue"));

// FNV-1a: small, steady, and spreads keys about evenly.
function hash(text: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

export function teamOf(user: string, salt: string): Team {
  return TEAMS[hash(salt + ":" + user) % TEAMS.length];
}

export async function saltFor(ctx: QueryCtx | MutationCtx, channel: string) {
  const row = await ctx.db.query("hostRooms").withIndex("by_channel", (q) => q.eq("channel", channel)).unique();
  return row?.salt ?? channel;
}

// When today's points started counting. 0 means the whole lecture so far.
export async function dayStartFor(ctx: QueryCtx | MutationCtx, channel: string) {
  const row = await ctx.db.query("hostRooms").withIndex("by_channel", (q) => q.eq("channel", channel)).unique();
  return row?.dayStart ?? 0;
}

// New random teams, and optionally a new day.
export async function reshuffleRoom(ctx: MutationCtx, channel: string, newDay: boolean) {
  const salt = randomCode(8);
  const row = await ctx.db.query("hostRooms").withIndex("by_channel", (q) => q.eq("channel", channel)).unique();
  const dayStart = newDay ? Date.now() : row?.dayStart;
  if (row) await ctx.db.patch(row._id, { salt, dayStart });
  else await ctx.db.insert("hostRooms", { channel, salt, dayStart });
}

// Mix everyone into new teams.
export const reshuffle = mutation({
  args: { key: v.optional(v.string()), channel: v.string() },
  returns: v.null(),
  handler: async (ctx, { key, channel }) => {
    await requireProf(ctx, key);
    if (!channel) throw new ConvexError("Pick a lecture first.");
    await reshuffleRoom(ctx, channel, false);
    return null;
  },
});

// Which team the signed-in person is on. Anyone signed in can ask; signed out gets null.
export const mine = query({
  args: { channel: v.string() },
  returns: v.union(teamValidator, v.null()),
  handler: async (ctx, { channel }) => {
    const id = await ctx.auth.getUserIdentity();
    if (!id) return null;
    return teamOf(id.tokenIdentifier, await saltFor(ctx, channel));
  },
});
