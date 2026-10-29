// Questions the professor asks the room on a slide.
import { ConvexError, v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { requireProf } from "../checkin/prof";
import { TEAMS, saltFor, teamOf, teamValidator } from "./teams";

// Opens a question on a slide and closes any that was open. Hosts only.
export const open = mutation({
  args: { key: v.optional(v.string()), channel: v.string(), index: v.number(), text: v.string(), choices: v.array(v.string()), correct: v.number(), points: v.optional(v.number()) },
  returns: v.id("quizQuestions"),
  handler: async (ctx, { key, channel, index, text, choices, correct, points = 10 }) => {
    await requireProf(ctx, key);
    const clean = choices.map((c) => c.trim()).filter(Boolean);
    if (!text.trim()) throw new ConvexError("Write the question first.");
    if (clean.length < 2 || clean.length > 4) throw new ConvexError("Give 2 to 4 choices.");
    if (!Number.isInteger(correct) || correct < 0 || correct >= clean.length) throw new ConvexError("Pick which choice is right.");
    const rows = await ctx.db.query("quizQuestions").withIndex("by_channel", (q) => q.eq("channel", channel)).collect();
    for (const r of rows) if (r.status === "open") await ctx.db.patch(r._id, { status: "closed" });
    return await ctx.db.insert("quizQuestions", { channel, index, text: text.trim(), choices: clean, correct, status: "open", points: Math.max(0, Math.min(100, points)), openedAt: Date.now() });
  },
});

export const close = mutation({
  args: { key: v.optional(v.string()), questionId: v.id("quizQuestions") },
  returns: v.null(),
  handler: async (ctx, { key, questionId }) => {
    await requireProf(ctx, key);
    await ctx.db.patch(questionId, { status: "closed" });
    return null;
  },
});

// The open question, for students. Leaves out the right answer.
export const current = query({
  args: { channel: v.string() },
  returns: v.union(v.object({ _id: v.id("quizQuestions"), index: v.number(), text: v.string(), choices: v.array(v.string()), openedAt: v.number() }), v.null()),
  handler: async (ctx, { channel }) => {
    const rows = await ctx.db.query("quizQuestions").withIndex("by_channel", (q) => q.eq("channel", channel)).order("desc").take(5);
    const row = rows.find((r) => r.status === "open");
    return row ? { _id: row._id, index: row.index, text: row.text, choices: row.choices, openedAt: row.openedAt } : null;
  },
});

// The professor's view of the newest question: who picked what, and how each team did.
export const forHost = query({
  args: { key: v.optional(v.string()), channel: v.string() },
  returns: v.union(
    v.object({
      _id: v.id("quizQuestions"),
      index: v.number(),
      text: v.string(),
      choices: v.array(v.string()),
      correct: v.number(),
      status: v.union(v.literal("open"), v.literal("closed")),
      points: v.number(),
      answered: v.number(),
      rightCount: v.number(),
      picks: v.array(v.number()), // how many picked each choice
      byTeam: v.array(v.object({ team: teamValidator, answered: v.number(), right: v.number() })),
    }),
    v.null(),
  ),
  handler: async (ctx, { key, channel }) => {
    await requireProf(ctx, key);
    const row = await ctx.db.query("quizQuestions").withIndex("by_channel", (q) => q.eq("channel", channel)).order("desc").first();
    if (!row) return null;
    const answers = await ctx.db.query("answers").withIndex("by_question", (q) => q.eq("questionId", row._id)).collect();
    const salt = await saltFor(ctx, channel);
    const picks = row.choices.map(() => 0);
    const byTeam = TEAMS.map((team) => ({ team, answered: 0, right: 0 }));
    for (const a of answers) {
      picks[a.choice]++;
      const t = byTeam.find((b) => b.team === teamOf(a.user, salt))!;
      t.answered++;
      if (a.correct) t.right++;
    }
    return {
      _id: row._id,
      index: row.index,
      text: row.text,
      choices: row.choices,
      correct: row.correct,
      status: row.status,
      points: row.points,
      answered: answers.length,
      rightCount: answers.filter((a) => a.correct).length,
      picks,
      byTeam,
    };
  },
});
