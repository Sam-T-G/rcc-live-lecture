// Sample answers so the Professor view has something to show on a dev backend.
//   npx convex run host/seed:fill '{"channel":"gdg"}'    adds one question and 12 sample answers
//   npx convex run host/seed:clear '{"channel":"gdg"}'   removes only the sample rows
// Internal: the CLI and the dashboard can run these, the browser can't.
import { v } from "convex/values";
import { internalMutation } from "../_generated/server";

const SAMPLE = "sample:";

export const fill = internalMutation({
  args: { channel: v.string() },
  returns: v.string(),
  handler: async (ctx, { channel }) => {
    const deck = await ctx.db.query("deckChannels").withIndex("by_channel", (q) => q.eq("channel", channel)).unique();
    const now = Date.now();
    const questionId = await ctx.db.insert("quizQuestions", {
      channel,
      index: deck?.index ?? 0,
      text: "Sample: which one is a database?",
      choices: ["Convex", "Vite", "React", "Gemini"],
      correct: 0,
      status: "open",
      points: 10,
      openedAt: now - 45000,
    });
    for (let k = 1; k <= 12; k++) {
      // Every third student picks 1, every fourth picks 2, the rest are right.
      const choice = k % 3 === 0 ? 1 : k % 4 === 0 ? 2 : 0;
      const correct = choice === 0;
      await ctx.db.insert("answers", {
        questionId,
        user: SAMPLE + k,
        name: "Sample student " + k,
        choice,
        correct,
        points: correct ? 10 + Math.max(0, 5 - k) : 0,
        at: now - 45000 + k * 3000,
      });
    }
    const asks: [string, "public" | "private"][] = [
      ["Why use a hash for routes?", "public"],
      ["What is a hash route?", "public"],
      ["Can you explain hash routes again?", "private"],
      ["Where is the data stored?", "public"],
      ["Is the database live or does it refresh?", "public"],
      ["Will this be on the test?", "private"],
    ];
    for (const [k, [text, visibility]] of asks.entries())
      await ctx.db.insert("studentQuestions", { channel, index: deck?.index ?? 0, user: SAMPLE + (k + 1), name: "Sample student " + (k + 1), text, visibility, status: "new", shared: false, at: now - k * 40000 });
    await ctx.db.insert("pointEvents", { channel, user: SAMPLE + 4, name: "Sample student 4", delta: -1, reason: "Deduction", at: now - 10000 });
    return `Added 1 sample question, 12 sample answers, and 6 sample student questions on "${channel}".`;
  },
});

export const clear = internalMutation({
  args: { channel: v.string() },
  returns: v.string(),
  handler: async (ctx, { channel }) => {
    let n = 0;
    const questions = await ctx.db.query("quizQuestions").withIndex("by_channel", (q) => q.eq("channel", channel)).collect();
    for (const question of questions) {
      const rows = await ctx.db.query("answers").withIndex("by_question", (q) => q.eq("questionId", question._id)).collect();
      const mine = rows.filter((a) => a.user.startsWith(SAMPLE));
      for (const a of mine) { await ctx.db.delete(a._id); n++; }
      if (mine.length > 0 && mine.length === rows.length) { await ctx.db.delete(question._id); n++; }
    }
    const asked = await ctx.db.query("studentQuestions").withIndex("by_channel", (q) => q.eq("channel", channel)).collect();
    const events = await ctx.db.query("pointEvents").withIndex("by_channel", (q) => q.eq("channel", channel)).collect();
    for (const r of [...asked, ...events]) if (r.user.startsWith(SAMPLE)) { await ctx.db.delete(r._id); n++; }
    return `Removed ${n} sample rows from "${channel}".`;
  },
});
