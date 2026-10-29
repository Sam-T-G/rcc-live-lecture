// Live quiz and vote: the professor asks a question, checked-in students answer on their phones,
// and when the professor ends it everyone sees the results. Writes `polls` and `pollAnswers`.
import { mutation, query, type QueryCtx } from "../_generated/server";
import { ConvexError, v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { requireHost, requireUser } from "../lib";

async function latest(ctx: QueryCtx, channel: string) {
  return await ctx.db.query("polls").withIndex("by_channel", (q) => q.eq("channel", channel)).order("desc").first();
}

async function tally(ctx: QueryCtx, poll: Id<"polls">, choices: number) {
  const rows = await ctx.db.query("pollAnswers").withIndex("by_poll", (q) => q.eq("poll", poll)).collect();
  const counts = Array.from({ length: choices }, () => 0);
  for (const r of rows) if (r.choice < choices) counts[r.choice]++;
  return { rows, counts };
}

const kind = v.union(v.literal("quiz"), v.literal("vote"));
const results = v.object({ counts: v.array(v.number()), correct: v.union(v.null(), v.number()) });

// The question on screen now (or the last one, closed). Counts and the right answer only
// come back once it's closed, so nobody copies the room while it's open.
export const current = query({
  args: { channel: v.string() },
  returns: v.union(
    v.null(),
    v.object({ id: v.id("polls"), kind, question: v.string(), choices: v.array(v.string()), open: v.boolean(), answered: v.number(), results: v.union(v.null(), results) }),
  ),
  handler: async (ctx, { channel }) => {
    const p = await latest(ctx, channel);
    if (!p) return null;
    const { rows, counts } = await tally(ctx, p._id, p.choices.length);
    return {
      id: p._id,
      kind: p.kind ?? "quiz",
      question: p.question,
      choices: p.choices,
      open: p.open,
      answered: rows.length,
      results: p.open ? null : { counts, correct: p.correct ?? null },
    };
  },
});

// The signed-in student's answer to this poll, or null.
export const mine = query({
  args: { poll: v.id("polls") },
  returns: v.union(v.null(), v.number()),
  handler: async (ctx, { poll }) => {
    const me = await ctx.auth.getUserIdentity();
    if (!me) return null;
    const a = await ctx.db.query("pollAnswers").withIndex("by_poll_and_user", (q) => q.eq("poll", poll).eq("user", me.tokenIdentifier)).unique();
    return a?.choice ?? null;
  },
});

// A host asks a new question (a quiz, or a vote with no right answer). Any question still open on the channel closes first.
export const ask = mutation({
  args: { channel: v.string(), kind, question: v.string(), choices: v.array(v.string()), correct: v.optional(v.number()) },
  returns: v.id("polls"),
  handler: async (ctx, { channel, kind, question, choices, correct }) => {
    await requireHost(ctx);
    const q = question.trim();
    const cs = choices.map((c) => c.trim()).filter(Boolean);
    if (!q) throw new ConvexError("Type a question.");
    if (cs.length < 2 || cs.length > 4) throw new ConvexError("Give 2 to 4 choices.");
    if (kind === "vote") correct = undefined;
    if (correct !== undefined && (correct < 0 || correct >= cs.length)) throw new ConvexError("Pick a right answer from the choices.");
    const now = Date.now();
    const prev = await latest(ctx, channel);
    if (prev?.open) await ctx.db.patch(prev._id, { open: false, closedAt: now });
    return await ctx.db.insert("polls", { channel, question: q, choices: cs, correct, kind, open: true, at: now });
  },
});

// A host ends the question. Answers stop and results show on every phone.
export const end = mutation({
  args: { poll: v.id("polls") },
  returns: v.null(),
  handler: async (ctx, { poll }) => {
    await requireHost(ctx);
    const p = await ctx.db.get(poll);
    if (p?.open) await ctx.db.patch(poll, { open: false, closedAt: Date.now() });
    return null;
  },
});

// A checked-in student answers. On a quiz the answer locks; on a vote it can change until
// the professor ends it.
export const answer = mutation({
  args: { poll: v.id("polls"), choice: v.number() },
  returns: v.null(),
  handler: async (ctx, { poll, choice }) => {
    const me = await requireUser(ctx);
    const p = await ctx.db.get(poll);
    if (!p) throw new ConvexError("That question is gone.");
    if (!p.open) throw new ConvexError("Time’s up. The professor ended this question.");
    if (!Number.isInteger(choice) || choice < 0 || choice >= p.choices.length) throw new ConvexError("Pick one of the choices.");
    const here = await ctx.db.query("checkins").withIndex("by_channel_and_user", (q) => q.eq("channel", p.channel).eq("user", me.tokenIdentifier)).unique();
    if (!here) throw new ConvexError("Check in first.");
    const had = await ctx.db.query("pollAnswers").withIndex("by_poll_and_user", (q) => q.eq("poll", poll).eq("user", me.tokenIdentifier)).unique();
    if (had && (p.kind ?? "quiz") === "quiz") throw new ConvexError("You already answered.");
    if (had) {
      await ctx.db.patch(had._id, { choice, at: Date.now() });
      return null;
    }
    await ctx.db.insert("pollAnswers", { poll, user: me.tokenIdentifier, choice, at: Date.now() });
    return null;
  },
});

// The professor's numbers for one poll, live while it's open. Hosts only.
export const stats = query({
  args: { poll: v.id("polls") },
  returns: v.union(
    v.null(),
    v.object({
      counts: v.array(v.number()),
      answered: v.number(),
      checkedIn: v.number(),
      correct: v.union(v.null(), v.number()),
      rightPct: v.union(v.null(), v.number()),
      medianSec: v.union(v.null(), v.number()),
    }),
  ),
  handler: async (ctx, { poll }) => {
    await requireHost(ctx);
    const p = await ctx.db.get(poll);
    if (!p) return null;
    const { rows, counts } = await tally(ctx, poll, p.choices.length);
    const checkedIn = (await ctx.db.query("checkins").withIndex("by_channel", (q) => q.eq("channel", p.channel)).collect()).length;
    const secs = rows.map((r) => (r.at - p.at) / 1000).sort((a, b) => a - b);
    const correct = p.correct ?? null;
    return {
      counts,
      answered: rows.length,
      checkedIn,
      correct,
      rightPct: correct === null || rows.length === 0 ? null : Math.round((counts[correct] / rows.length) * 100),
      medianSec: secs.length ? Math.round(secs[Math.floor(secs.length / 2)]) : null,
    };
  },
});

// Every question asked on the channel, newest first, with how many got it right. Hosts only.
export const history = query({
  args: { channel: v.string() },
  returns: v.array(v.object({ id: v.id("polls"), kind, question: v.string(), answered: v.number(), rightPct: v.union(v.null(), v.number()) })),
  handler: async (ctx, { channel }) => {
    await requireHost(ctx);
    const polls = await ctx.db.query("polls").withIndex("by_channel", (q) => q.eq("channel", channel)).order("desc").take(50);
    const out = [];
    for (const p of polls) {
      const { rows, counts } = await tally(ctx, p._id, p.choices.length);
      const rightPct = p.correct === undefined || rows.length === 0 ? null : Math.round((counts[p.correct] / rows.length) * 100);
      out.push({ id: p._id, kind: p.kind ?? "quiz", question: p.question, answered: rows.length, rightPct });
    }
    return out;
  },
});
