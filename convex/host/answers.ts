// A student's answer. The Live team's phone page calls `submit`; nothing else writes answers.
import { ConvexError, v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { requireUser } from "../lib";

const SPEED_BONUS = 5; // extra points for answering right away
const SPEED_WINDOW_MS = 60_000; // the bonus shrinks to zero over this long

// Records the signed-in student's answer. One per question; the server decides if it's right.
export const submit = mutation({
  args: { questionId: v.id("quizQuestions"), choice: v.number() },
  returns: v.null(),
  handler: async (ctx, { questionId, choice }) => {
    const me = await requireUser(ctx);
    const question = await ctx.db.get(questionId);
    if (!question || question.status !== "open") throw new ConvexError("This question is closed.");
    if (!Number.isInteger(choice) || choice < 0 || choice >= question.choices.length) throw new ConvexError("Pick one of the choices.");
    const had = await ctx.db
      .query("answers")
      .withIndex("by_question_and_user", (q) => q.eq("questionId", questionId).eq("user", me.tokenIdentifier))
      .unique();
    if (had) throw new ConvexError("You already answered.");
    const now = Date.now();
    const correct = choice === question.correct;
    const fast = Math.max(0, 1 - (now - question.openedAt) / SPEED_WINDOW_MS);
    const points = correct ? question.points + Math.round(SPEED_BONUS * fast) : 0;
    await ctx.db.insert("answers", { questionId, user: me.tokenIdentifier, name: me.name ?? "Student", choice, correct, points, at: now });
    return null;
  },
});

// The signed-in student's own answer and points on a question. The right answer is only
// revealed once the question is closed.
export const mine = query({
  args: { questionId: v.id("quizQuestions") },
  returns: v.union(v.object({ choice: v.number(), correct: v.union(v.boolean(), v.null()), points: v.number() }), v.null()),
  handler: async (ctx, { questionId }) => {
    const id = await ctx.auth.getUserIdentity();
    if (!id) return null;
    const row = await ctx.db
      .query("answers")
      .withIndex("by_question_and_user", (q) => q.eq("questionId", questionId).eq("user", id.tokenIdentifier))
      .unique();
    if (!row) return null;
    const question = await ctx.db.get(questionId);
    const closed = question?.status === "closed";
    return { choice: row.choice, correct: closed ? row.correct : null, points: closed ? row.points : 0 };
  },
});
