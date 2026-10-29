// Live slides: questions and comments beside a slide, anonymous or by name, with upvotes.
// `user` is stored for "mine", "no voting for yourself", and delete, but is never returned.
import { mutation, query } from "../_generated/server";
import { ConvexError, v } from "convex/values";
import { isHostEmail, requireUser } from "../lib";

const MAX_LENGTH = 280;
const MIN_GAP_MS = 5000; // one post per person every 5 seconds

const questionShape = v.object({
  _id: v.id("questions"),
  index: v.number(),
  text: v.string(),
  name: v.union(v.string(), v.null()), // null means anonymous
  votes: v.number(),
  at: v.number(),
  mine: v.boolean(),
  voted: v.boolean(),
});

// Questions for one slide, or for every slide when `index` is left out. Most upvotes first,
// then newest. Signed-out viewers can read; `mine` and `voted` are false for them.
export const list = query({
  args: { channel: v.string(), index: v.optional(v.number()) },
  returns: v.array(questionShape),
  handler: async (ctx, { channel, index }) => {
    const id = await ctx.auth.getUserIdentity();
    const me = id?.tokenIdentifier ?? null;
    const rows = await ctx.db
      .query("questions")
      .withIndex("by_channel_and_index", (q) =>
        index === undefined ? q.eq("channel", channel) : q.eq("channel", channel).eq("index", index),
      )
      .collect();
    const voted = new Set<string>();
    if (me) {
      const mine = await ctx.db
        .query("questionVotes")
        .withIndex("by_channel_and_user", (q) => q.eq("channel", channel).eq("user", me))
        .collect();
      for (const m of mine) voted.add(m.question);
    }
    return rows
      .map((r) => ({
        _id: r._id,
        index: r.index,
        text: r.text,
        name: r.name ?? null,
        votes: r.votes,
        at: r._creationTime,
        mine: r.user === me,
        voted: voted.has(r._id),
      }))
      .sort((a, b) => b.votes - a.votes || b.at - a.at);
  },
});

// Post a question or comment on a slide. `anonymous` hides the name from everyone, hosts too.
export const ask = mutation({
  args: { channel: v.string(), index: v.number(), text: v.string(), anonymous: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { channel, index, text, anonymous }) => {
    const me = await requireUser(ctx);
    const clean = text.trim();
    if (!clean) throw new ConvexError("Write something first.");
    if (clean.length > MAX_LENGTH) throw new ConvexError(`Keep it under ${MAX_LENGTH} characters.`);
    const last = await ctx.db
      .query("questions")
      .withIndex("by_channel_and_user", (q) => q.eq("channel", channel).eq("user", me.tokenIdentifier))
      .order("desc")
      .first();
    if (last && Date.now() - last._creationTime < MIN_GAP_MS) throw new ConvexError("Wait a few seconds before posting again.");
    await ctx.db.insert("questions", {
      channel,
      index,
      user: me.tokenIdentifier,
      name: anonymous ? undefined : (me.name ?? "Student"),
      text: clean,
      votes: 0,
      at: Date.now(),
    });
    return null;
  },
});

// Upvote a question; a second tap takes the upvote back. You can't upvote your own.
export const vote = mutation({
  args: { question: v.id("questions") },
  returns: v.null(),
  handler: async (ctx, { question }) => {
    const me = await requireUser(ctx);
    const row = await ctx.db.get(question);
    if (!row) throw new ConvexError("That question is gone.");
    if (row.user === me.tokenIdentifier) throw new ConvexError("You can't upvote your own.");
    const existing = await ctx.db
      .query("questionVotes")
      .withIndex("by_question_and_user", (q) => q.eq("question", question).eq("user", me.tokenIdentifier))
      .unique();
    if (existing) {
      await ctx.db.delete(existing._id);
      await ctx.db.patch(question, { votes: Math.max(0, row.votes - 1) });
    } else {
      await ctx.db.insert("questionVotes", { channel: row.channel, question, user: me.tokenIdentifier });
      await ctx.db.patch(question, { votes: row.votes + 1 });
    }
    return null;
  },
});

// Delete a question: its author can, and so can hosts.
export const remove = mutation({
  args: { question: v.id("questions") },
  returns: v.null(),
  handler: async (ctx, { question }) => {
    const me = await requireUser(ctx);
    const row = await ctx.db.get(question);
    if (!row) return null;
    if (row.user !== me.tokenIdentifier && !(isHostEmail(me.email) && me.emailVerified !== false))
      throw new ConvexError("Only the author or a host can delete this.");
    const votes = await ctx.db.query("questionVotes").withIndex("by_question_and_user", (q) => q.eq("question", question)).collect();
    for (const x of votes) await ctx.db.delete(x._id);
    await ctx.db.delete(question);
    return null;
  },
});
