// Questions students ask the professor. The student side writes with `ask`; the professor
// organizes, answers, and decides what the room sees. Nothing is shown to students unless
// the professor shared it.
import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, query } from "../_generated/server";
import { requireUser } from "../lib";
import { requireProf } from "../checkin/prof";

const statusValidator = v.union(v.literal("new"), v.literal("keep"), v.literal("dismissed"));
const visibilityValidator = v.union(v.literal("public"), v.literal("private"));

const forHostShape = v.object({
  _id: v.id("studentQuestions"),
  index: v.number(),
  name: v.string(),
  text: v.string(),
  visibility: visibilityValidator,
  topic: v.union(v.string(), v.null()),
  cluster: v.union(v.string(), v.null()),
  status: statusValidator,
  answer: v.union(v.string(), v.null()),
  shared: v.boolean(),
  at: v.number(),
});

// A student asks a question, public or private.
export const ask = mutation({
  args: { channel: v.string(), index: v.number(), text: v.string(), visibility: visibilityValidator },
  returns: v.null(),
  handler: async (ctx, { channel, index, text, visibility }) => {
    const me = await requireUser(ctx);
    const clean = text.trim();
    if (!clean) throw new ConvexError("Write your question first.");
    if (clean.length > 300) throw new ConvexError("Keep it under 300 characters.");
    await ctx.db.insert("studentQuestions", { channel, index, user: me.tokenIdentifier, name: me.name ?? "Student", text: clean, visibility, status: "new", shared: false, at: Date.now() });
    return null;
  },
});

// Everything asked, newest first. Hosts only: private questions and names are in here.
export const list = query({
  args: { key: v.optional(v.string()), channel: v.string() },
  returns: v.array(forHostShape),
  handler: async (ctx, { key, channel }) => {
    await requireProf(ctx, key);
    const rows = await ctx.db.query("studentQuestions").withIndex("by_channel", (q) => q.eq("channel", channel)).order("desc").collect();
    return rows.map((r) => ({
      _id: r._id,
      index: r.index,
      name: r.name,
      text: r.text,
      visibility: r.visibility,
      topic: r.topic ?? null,
      cluster: r.cluster ?? null,
      status: r.status,
      answer: r.answer ?? null,
      shared: r.shared,
      at: r.at,
    }));
  },
});

// What students may see: public questions the professor shared, with the answer if there is one.
export const shared = query({
  args: { channel: v.string() },
  returns: v.array(v.object({ text: v.string(), topic: v.union(v.string(), v.null()), answer: v.union(v.string(), v.null()) })),
  handler: async (ctx, { channel }) => {
    const rows = await ctx.db.query("studentQuestions").withIndex("by_channel", (q) => q.eq("channel", channel)).order("desc").collect();
    return rows.filter((r) => r.shared && r.visibility === "public").map((r) => ({ text: r.text, topic: r.topic ?? null, answer: r.answer ?? null }));
  },
});

export const setStatus = mutation({
  args: { key: v.optional(v.string()), id: v.id("studentQuestions"), status: statusValidator },
  returns: v.null(),
  handler: async (ctx, { key, id, status }) => {
    await requireProf(ctx, key);
    await ctx.db.patch(id, status === "dismissed" ? { status, shared: false } : { status });
    return null;
  },
});

// Type an answer. An empty answer removes it.
export const answer = mutation({
  args: { key: v.optional(v.string()), id: v.id("studentQuestions"), text: v.string() },
  returns: v.null(),
  handler: async (ctx, { key, id, text }) => {
    await requireProf(ctx, key);
    const clean = text.trim();
    await ctx.db.patch(id, { answer: clean || undefined, ...(clean ? { status: "keep" as const } : {}) });
    return null;
  },
});

// The professor approves (or takes back) showing a public question to the room.
export const share = mutation({
  args: { key: v.optional(v.string()), id: v.id("studentQuestions"), shared: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { key, id, shared }) => {
    await requireProf(ctx, key);
    const row = await ctx.db.get(id);
    if (!row) throw new ConvexError("That question is gone.");
    if (shared && row.visibility === "private") throw new ConvexError("That question is private.");
    await ctx.db.patch(id, { shared });
    return null;
  },
});

// The AI's topics and groups, written onto the questions. Run by the organize action.
export const applyTopics = internalMutation({
  args: { items: v.array(v.object({ id: v.id("studentQuestions"), topic: v.string(), cluster: v.string() })) },
  returns: v.null(),
  handler: async (ctx, { items }) => {
    for (const it of items) await ctx.db.patch(it.id, { topic: it.topic.slice(0, 60), cluster: it.cluster.slice(0, 80) });
    return null;
  },
});
