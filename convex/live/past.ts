// Live slides: the quiz and vote questions the professor has ended, for students to look back on
// from their own phones. Reads `polls` and `pollAnswers`; writes nothing. Open questions are left
// out, so this never shows an answer early.
import { query } from "../_generated/server";
import { v } from "convex/values";

export const past = query({
  args: { channel: v.string() },
  returns: v.array(
    v.object({
      id: v.id("polls"),
      kind: v.union(v.literal("quiz"), v.literal("vote")),
      question: v.string(),
      choices: v.array(v.string()),
      correct: v.union(v.null(), v.number()), // the right choice; always null on a vote
      counts: v.array(v.number()), // how many picked each choice
      mine: v.union(v.null(), v.number()), // this student's pick, or null if they didn't answer
      at: v.number(),
    }),
  ),
  handler: async (ctx, { channel }) => {
    const me = (await ctx.auth.getUserIdentity())?.tokenIdentifier ?? null;
    const polls = await ctx.db.query("polls").withIndex("by_channel", (q) => q.eq("channel", channel)).order("desc").take(50);
    const out = [];
    for (const p of polls) {
      if (p.open) continue;
      const answers = await ctx.db.query("pollAnswers").withIndex("by_poll", (q) => q.eq("poll", p._id)).collect();
      const counts = p.choices.map(() => 0);
      let mine: number | null = null;
      for (const a of answers) {
        if (a.choice < counts.length) counts[a.choice]++;
        if (a.user === me) mine = a.choice;
      }
      out.push({
        id: p._id,
        kind: p.kind ?? "quiz",
        question: p.question,
        choices: p.choices,
        correct: p.correct ?? null,
        counts,
        mine,
        at: p.at,
      });
    }
    return out;
  },
});
