// The AI for the Professor view: a question drafted from the slide, and a short note on what the
// room is getting wrong. Only the numbers and the slide text go to Gemini, never student names.
import { ConvexError, v } from "convex/values";
import { api, internal } from "../_generated/api";
import { action } from "../_generated/server";
import { gemini } from "../ai";

type Draft = { text: string; choices: string[]; correct: number };
const draftShape = v.object({ text: v.string(), choices: v.array(v.string()), correct: v.number() });

// Drafts one multiple-choice question about the slide the deck is on. The professor edits it
// before opening it.
export const draftQuestion = action({
  args: { key: v.optional(v.string()), channel: v.string() },
  returns: draftShape,
  handler: async (ctx, { key, channel }): Promise<Draft> => {
    await ctx.runQuery(api.host.questions.forHost, { key, channel }); // throws unless the caller is a host
    const slide = await ctx.runQuery(api.deck.current, { channel });
    if (!slide) throw new ConvexError("The deck hasn't sent a slide yet.");
    const reply = await gemini({
      model: "fast",
      json: true,
      system:
        "You write quick check questions for a university lecture. One question, 4 short choices, exactly one right. " +
        "Plain words, no tricks. Only use what the slide says. Reply as JSON: {\"text\": string, \"choices\": string[4], \"correct\": number (0 to 3)}.",
      parts: [{ text: `Slide title: ${slide.title}\nSlide text:\n${slide.lines.join("\n")}` }],
    });
    let draft: { text?: unknown; choices?: unknown; correct?: unknown };
    try {
      draft = JSON.parse(reply);
    } catch {
      throw new ConvexError("The AI answer wasn't readable. Try again.");
    }
    const choices = Array.isArray(draft.choices) ? draft.choices.map((c) => String(c)).slice(0, 4) : [];
    const correct = Number(draft.correct);
    if (typeof draft.text !== "string" || choices.length < 2 || !Number.isInteger(correct) || correct < 0 || correct >= choices.length)
      throw new ConvexError("The AI question was incomplete. Try again.");
    return { text: draft.text, choices, correct };
  },
});

// Two or three plain sentences on how the room did on the newest question.
export const feedback = action({
  args: { key: v.optional(v.string()), channel: v.string() },
  returns: v.string(),
  handler: async (ctx, { key, channel }): Promise<string> => {
    const q = await ctx.runQuery(api.host.questions.forHost, { key, channel }); // host only
    if (!q) throw new ConvexError("Ask the room a question first.");
    if (q.answered === 0) throw new ConvexError("No answers yet.");
    const lines = q.choices.map((c, i) => `${String.fromCharCode(65 + i)}. ${c}${i === q.correct ? " (right)" : ""}: ${q.picks[i]} picked`);
    const teams = q.byTeam.map((t) => `${t.team}: ${t.right} of ${t.answered} right`);
    return await gemini({
      model: "fast",
      system:
        "You help a professor in the middle of a lecture. In 2 or 3 short, plain sentences say what the room is mixing up " +
        "and what to re-explain. Name the wrong choice most people picked. No lists, no jargon.",
      parts: [{ text: `Question: ${q.text}\n${lines.join("\n")}\nBy team: ${teams.join("; ")}` }],
    });
  },
});

// Groups the open questions by topic, and inside a topic groups the ones asking the same thing.
// Only the question text goes to Gemini, with a number in place of each student. The professor
// sees the result and decides what to keep; nothing reaches students from here.
export const organize = action({
  args: { key: v.optional(v.string()), channel: v.string() },
  returns: v.number(),
  handler: async (ctx, { key, channel }): Promise<number> => {
    const all = await ctx.runQuery(api.host.qa.list, { key, channel }); // host only
    const rows = all.filter((r) => r.status !== "dismissed");
    if (rows.length === 0) throw new ConvexError("No questions to organize yet.");
    const reply = await gemini({
      model: "fast",
      json: true,
      system:
        "You sort student questions from a lecture. Group them by topic, and inside a topic group the ones that ask the same thing. " +
        "Topics are 1 to 4 plain words. Group labels say the shared question in under 10 words. Every question number appears exactly once. " +
        'Reply as JSON: {"items": [{"n": number, "topic": string, "cluster": string}]}.',
      parts: [{ text: rows.map((r, i) => `${i}. ${r.text}`).join("\n") }],
    });
    let parsed: { items?: { n?: unknown; topic?: unknown; cluster?: unknown }[] };
    try {
      parsed = JSON.parse(reply);
    } catch {
      throw new ConvexError("The AI answer wasn't readable. Try again.");
    }
    const items = (parsed.items ?? [])
      .filter((it) => Number.isInteger(it.n) && Number(it.n) >= 0 && Number(it.n) < rows.length && typeof it.topic === "string" && typeof it.cluster === "string")
      .map((it) => ({ id: rows[Number(it.n)]._id, topic: String(it.topic), cluster: String(it.cluster) }));
    if (items.length === 0) throw new ConvexError("The AI didn't sort anything. Try again.");
    await ctx.runMutation(internal.host.qa.applyTopics, { items });
    return items.length;
  },
});
