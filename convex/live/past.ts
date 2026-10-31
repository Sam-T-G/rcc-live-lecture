// Live slides: the quiz and vote questions the professor has ended in this class, for students to
// look back on from their own phones (Past questions on #/live). Reads `polls` and `pollAnswers`;
// writes nothing. Open questions are left out, so this never shows an answer early. Only this
// class's polls count (lib.lectureWindow), so between classes the list is empty.
import { query } from "../_generated/server";
import { v } from "convex/values";
import { rightOf } from "../checkin/quiz";
import { lectureWindow } from "../lib";

// Ended polls returned, newest first.
const MAX = 50;
// Polls read at most. Only the newest poll can be open (ask ends the open one before it adds the
// next), so 51 reads find 50 ended ones; this cap only stops a runaway read.
const READ_CAP = 200;

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
    const { start } = await lectureWindow(ctx, channel);
    const out = [];
    let read = 0;
    // Newest first, reading on past an open poll, so it never takes one of the 50 places.
    for await (const p of ctx.db
      .query("polls")
      .withIndex("by_channel", (q) => q.eq("channel", channel).gte("_creationTime", start))
      .order("desc")) {
      if (++read > READ_CAP) break;
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
        correct: rightOf(p),
        counts,
        mine,
        at: p.at,
      });
      if (out.length === MAX) break;
    }
    return out;
  },
});
