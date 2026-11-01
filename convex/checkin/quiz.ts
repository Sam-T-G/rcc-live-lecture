// Live quiz and vote: the professor asks a question (from #/checkin/quiz or the #/host Now tab),
// checked-in students answer on their phones, and when the professor ends it everyone sees the
// results. Writes `polls` and `pollAnswers`.
//
// Every read is for the current class (lib.lectureWindow): a poll belongs to the class whose
// window holds its _creationTime. Asking a question opens a class when none is open
// (lib.ensureLecture), the way a deck press or a pass scan does, and is refused more than 45
// minutes before the open class's saved start (lib.notOpenYet), so a question asked the evening
// before isn't the next morning's. Between classes `current` is null, and a poll from an earlier
// class can't be answered ("That quiz or vote is gone.").
//
//   current({ channel })        anyone     the newest poll in this class, or null. Its counts and
//                                          right answer come back only once it has ended.
//   mine({ poll })              anyone     the signed-in student's pick, or null
//   answer({ poll, choice })    students   needs a check-in in this class. A quiz answer locks; a
//                                          vote pick changes until the professor ends it.
//   ask({ channel, kind, question, choices, correct?, index?, aiDraft? })   professors
//       Opens the question and ends the one that was open. Blank choices drop out and the right
//       answer follows its own box. `index` is the slide it goes with: left out, it's the slide the
//       deck is on in this class (never last class's), or none. The same question asked again
//       within 5 s is a double tap: it returns the open poll.
//   end({ poll })               professors  also saves the final counts on the poll (live.past
//                                          reads them)
//   stats({ poll })             professors  counts, answered of checked in (this class), % right,
//                                          median seconds, the slide and whether the AI drafted it
//   history({ channel })        professors  this class's questions, newest first
//   missing({ channel })        professors  "Who got it wrong" on #/host: see `missing` below
//   draftQuestion({ channel })  professors  action: a question drafted by Gemini from the slide
//   feedback({ channel })       professors  action: 2 or 3 sentences on what the room got wrong
//
// Only slide text, the question, its choices, counts and team labels go to Gemini, never a name.
import { action, mutation, query, type MutationCtx, type QueryCtx } from "../_generated/server";
import { ConvexError, v, type Infer } from "convex/values";
import { api } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { gemini } from "../ai";
import { checkedIn, cleanName, ensureLecture, lectureStart, lectureWindow, notOpenYet, requireUser, slidesFrom } from "../lib";
import { describe, teamInfo } from "../live/groups";
import { requireProf } from "./prof";

type Ctx = QueryCtx | MutationCtx;

const LETTERS = ["A", "B", "C", "D"];
// The same question asked again this soon after it opened is a double tap: ask returns the open poll.
const SAME_ASK_MS = 5_000;
// How many of the class's newest polls `missing` looks through for a quiz with a right answer.
const MISSING_SCAN = 20;

const kind = v.union(v.literal("quiz"), v.literal("vote"));
const results = v.object({ counts: v.array(v.number()), correct: v.union(v.null(), v.number()) });

// A poll's right answer as an index into its choices, or null: a vote, a quiz asked with no right
// answer, or a value that isn't one of the choices (ask refuses those now; older rows may have one).
export function rightOf(p: Doc<"polls">): number | null {
  if ((p.kind ?? "quiz") === "vote" || p.correct === undefined) return null;
  return Number.isInteger(p.correct) && p.correct >= 0 && p.correct < p.choices.length ? p.correct : null;
}

// The newest poll on the channel, in any class. Only it can be open: ask ends the open poll
// before it adds the next one.
async function newest(ctx: Ctx, channel: string) {
  return await ctx.db
    .query("polls")
    .withIndex("by_channel", (q) => q.eq("channel", channel))
    .order("desc")
    .first();
}

// The polls asked in a class, newest first: from `start`, the class window's start.
function classPolls(ctx: Ctx, channel: string, start: number) {
  return ctx.db
    .query("polls")
    .withIndex("by_channel", (q) => q.eq("channel", channel).gte("_creationTime", start))
    .order("desc");
}

// Every answer to a poll and how many picked each choice.
export async function tally(ctx: Ctx, poll: Id<"polls">, choices: number) {
  const rows = await ctx.db.query("pollAnswers").withIndex("by_poll", (q) => q.eq("poll", poll)).collect();
  const counts = Array.from({ length: choices }, () => 0);
  for (const r of rows) if (r.choice < choices) counts[r.choice]++;
  return { rows, counts };
}

// Ends an open poll and saves its final counts on the row. Answers stop once it's closed (answer
// refuses a closed poll), so the saved counts stay right; live.past reads them instead of every
// answer.
async function close(ctx: MutationCtx, p: Doc<"polls">, now: number) {
  const { counts } = await tally(ctx, p._id, p.choices.length);
  await ctx.db.patch("polls", p._id, { open: false, closedAt: now, counts });
}

// Percent who picked the right answer, or null with no right answer or no answers.
function rightPct(counts: number[], correct: number | null, answered: number) {
  return correct === null || answered === 0 ? null : Math.round((counts[correct] / answered) * 100);
}

// The middle answer time in whole seconds; with an even count, the mean of the two middle times.
export function medianSec(secs: number[]): number | null {
  if (secs.length === 0) return null;
  const s = [...secs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return Math.round(s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2);
}

// The slide the deck is on in this class, or undefined. The deck's row counts only when it was
// sent at or after `start` (lib.slidesFrom, deck.current's cutoff), so a question asked before
// the deck sends anything in a new class never gets last class's slide.
async function deckSlide(ctx: Ctx, channel: string, start: number) {
  const row = await ctx.db
    .query("deckChannels")
    .withIndex("by_channel", (q) => q.eq("channel", channel))
    .first();
  return row && row.at >= start ? row.index : undefined;
}

// The newest question in this class, open or ended, the one every phone and the stage show. Its
// counts and right answer come back only once it has ended, so nobody copies the room while it's
// open.
export const current = query({
  args: { channel: v.string() },
  returns: v.union(
    v.null(),
    v.object({ id: v.id("polls"), kind, question: v.string(), choices: v.array(v.string()), open: v.boolean(), answered: v.number(), results: v.union(v.null(), results) }),
  ),
  handler: async (ctx, { channel }) => {
    const { start } = await lectureWindow(ctx, channel);
    const p = await classPolls(ctx, channel, start).first();
    if (!p) return null;
    const { rows, counts } = await tally(ctx, p._id, p.choices.length);
    return {
      id: p._id,
      kind: p.kind ?? "quiz",
      question: p.question,
      choices: p.choices,
      open: p.open,
      answered: rows.length,
      results: p.open ? null : { counts, correct: rightOf(p) },
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

// A professor asks a new question: a quiz (optionally with a right answer) or a vote (never one).
// See the top of this file for index, aiDraft and the double tap.
export const ask = mutation({
  args: {
    channel: v.string(),
    kind,
    question: v.string(),
    choices: v.array(v.string()),
    correct: v.optional(v.number()),
    index: v.optional(v.number()),
    aiDraft: v.optional(v.boolean()),
  },
  returns: v.id("polls"),
  handler: async (ctx, { channel, kind, question, choices, correct, index, aiDraft }) => {
    await requireProf(ctx);
    const q = question.trim();
    if (!q) throw new ConvexError(`Type the ${kind} text.`);
    // Blank boxes drop out, and the right answer follows its own box: with B blank and C marked
    // right, the stored choices are A, C, D and C is still the right one.
    const kept = choices.map((text, box) => ({ text: text.trim(), box })).filter((c) => c.text);
    if (kept.length < 2 || kept.length > 4) throw new ConvexError("Give 2 to 4 choices.");
    let right: number | undefined;
    if (kind === "quiz" && correct !== undefined) {
      if (!Number.isInteger(correct) || correct < 0 || correct >= choices.length) throw new ConvexError("Pick a right answer from the choices.");
      right = kept.findIndex((c) => c.box === correct);
      if (right < 0) throw new ConvexError("Type the right answer's choice.");
    }
    const cs = kept.map((c) => c.text);

    const lecture = await ensureLecture(ctx, channel);
    const now = Date.now();
    if (notOpenYet(lecture, now)) throw new ConvexError("Quizzes and votes open 45 minutes before class starts.");
    const start = lectureStart(lecture);
    const prev = await newest(ctx, channel);
    if (prev?.open) {
      const same =
        (prev.kind ?? "quiz") === kind &&
        prev.question === q &&
        prev.correct === right &&
        prev.choices.length === cs.length &&
        prev.choices.every((c, i) => c === cs[i]);
      if (same && prev._creationTime >= start && now - prev.at < SAME_ASK_MS) return prev._id;
      await close(ctx, prev, now);
    }
    const slide = index !== undefined && Number.isSafeInteger(index) && index >= 0 ? index : await deckSlide(ctx, channel, slidesFrom(lecture));
    return await ctx.db.insert("polls", {
      channel,
      question: q,
      choices: cs,
      kind,
      open: true,
      at: now,
      ...(right !== undefined ? { correct: right } : {}),
      ...(slide !== undefined ? { index: slide } : {}),
      ...(aiDraft === true ? { aiDraft: true } : {}),
    });
  },
});

// A professor ends the question. Answers stop and results show on every phone.
export const end = mutation({
  args: { poll: v.id("polls") },
  returns: v.null(),
  handler: async (ctx, { poll }) => {
    await requireProf(ctx);
    const p = await ctx.db.get(poll);
    if (p?.open) await close(ctx, p, Date.now());
    return null;
  },
});

// A student checked in to this class answers. On a quiz the answer locks; on a vote it can change
// until the professor ends it.
export const answer = mutation({
  args: { poll: v.id("polls"), choice: v.number() },
  returns: v.null(),
  handler: async (ctx, { poll, choice }) => {
    const me = await requireUser(ctx);
    const p = await ctx.db.get(poll);
    if (!p) throw new ConvexError("That quiz or vote is gone.");
    // A question from an earlier class, even one nobody ended, can't be answered.
    const { start } = await lectureWindow(ctx, p.channel);
    if (p._creationTime < start) throw new ConvexError("That quiz or vote is gone.");
    if (!p.open) throw new ConvexError(`The professor ended this ${(p.kind ?? "quiz") === "vote" ? "vote" : "quiz"}.`);
    if (!Number.isInteger(choice) || choice < 0 || choice >= p.choices.length) throw new ConvexError("Pick one of the choices.");
    if (!(await checkedIn(ctx, p.channel, me.tokenIdentifier))) throw new ConvexError("Check in first.");
    const had = await ctx.db.query("pollAnswers").withIndex("by_poll_and_user", (q) => q.eq("poll", poll).eq("user", me.tokenIdentifier)).first();
    if (had && (p.kind ?? "quiz") === "quiz") throw new ConvexError("You already answered.");
    if (had) {
      await ctx.db.patch(had._id, { choice, at: Date.now() });
      return null;
    }
    await ctx.db.insert("pollAnswers", { poll, user: me.tokenIdentifier, choice, at: Date.now() });
    return null;
  },
});

// The professor's numbers for one poll, live while it's open. checkedIn counts this class's
// check-ins; medianSec is how long the middle answer took, from when the question opened.
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
      index: v.union(v.null(), v.number()), // the slide it goes with, 0-based; null for none
      aiDraft: v.boolean(), // the professor started from the AI's draft
    }),
  ),
  handler: async (ctx, { poll }) => {
    await requireProf(ctx);
    const p = await ctx.db.get(poll);
    if (!p) return null;
    const { rows, counts } = await tally(ctx, poll, p.choices.length);
    const { start } = await lectureWindow(ctx, p.channel);
    // One check-in per student per class, so this is how many students are here.
    const here = await ctx.db
      .query("checkins")
      .withIndex("by_channel", (q) => q.eq("channel", p.channel).gte("_creationTime", start))
      .collect();
    const correct = rightOf(p);
    return {
      counts,
      answered: rows.length,
      checkedIn: here.length,
      correct,
      rightPct: rightPct(counts, correct, rows.length),
      medianSec: medianSec(rows.map((r) => (r.at - p.at) / 1000)),
      index: p.index ?? null,
      aiDraft: p.aiDraft === true,
    };
  },
});

// Every question asked in this class, newest first (up to 50), with how many got it right.
export const history = query({
  args: { channel: v.string() },
  returns: v.array(
    v.object({
      id: v.id("polls"),
      kind,
      question: v.string(),
      answered: v.number(),
      rightPct: v.union(v.null(), v.number()),
      index: v.union(v.null(), v.number()),
      aiDraft: v.boolean(),
    }),
  ),
  handler: async (ctx, { channel }) => {
    await requireProf(ctx);
    const { start } = await lectureWindow(ctx, channel);
    const polls = await classPolls(ctx, channel, start).take(50);
    const out = [];
    for (const p of polls) {
      const { rows, counts } = await tally(ctx, p._id, p.choices.length);
      out.push({
        id: p._id,
        kind: p.kind ?? "quiz",
        question: p.question,
        answered: rows.length,
        rightPct: rightPct(counts, rightOf(p), rows.length),
        index: p.index ?? null,
        aiDraft: p.aiDraft === true,
      });
    }
    return out;
  },
});

const missingShape = v.union(
  v.null(),
  // The class's newest question is a vote and no quiz in it has a right answer.
  v.object({ kind: v.literal("vote"), poll: v.id("polls"), question: v.string() }),
  v.object({
    kind: v.literal("quiz"),
    poll: v.id("polls"),
    question: v.string(),
    choices: v.array(v.string()),
    correct: v.number(),
    open: v.boolean(),
    answered: v.number(),
    counts: v.array(v.number()),
    // Each team with at least one answer, by team number.
    byTeam: v.array(v.object({ team: v.number(), color: v.string(), label: v.string(), answered: v.number(), right: v.number() })),
    // Each wrong answer, in the order they came in: the name the student checked in with in this
    // class, their team in this class (null without one), and the choice they picked.
    wrong: v.array(v.object({ name: v.string(), team: v.union(v.null(), teamInfo), picked: v.string() })),
  }),
);
export type Missing = Infer<typeof missingShape>;

// "Who got it wrong" on #/host: the newest quiz with a right answer in this class, open or
// ended; votes and quizzes with no right answer are skipped. Null when the class has none,
// except that a class whose newest question is a vote gets { kind: "vote" }, so the card can say
// a vote has no right answer.
export const missing = query({
  args: { channel: v.string() },
  returns: missingShape,
  handler: async (ctx, { channel }): Promise<Missing> => {
    await requireProf(ctx);
    const { start } = await lectureWindow(ctx, channel);
    const recent = await classPolls(ctx, channel, start).take(MISSING_SCAN);
    let quiz: Doc<"polls"> | undefined;
    let correct: number | null = null;
    for (const p of recent) {
      correct = rightOf(p);
      if (correct !== null) {
        quiz = p;
        break;
      }
    }
    if (!quiz || correct === null) {
      const top = recent[0];
      return top && top.kind === "vote" ? { kind: "vote", poll: top._id, question: top.question } : null;
    }

    const { rows, counts } = await tally(ctx, quiz._id, quiz.choices.length);
    const teams = new Map<number, { team: number; color: string; label: string; answered: number; right: number }>();
    const wrong = [];
    for (const a of rows) {
      // This class's rows only: a student has one check-in and one team per class.
      const group = await ctx.db
        .query("groups")
        .withIndex("by_channel_and_user", (q) => q.eq("channel", channel).eq("user", a.user).gte("_creationTime", start))
        .first();
      const team = group ? describe(group.team) : null;
      if (team) {
        const t = teams.get(team.team) ?? { ...team, answered: 0, right: 0 };
        t.answered++;
        if (a.choice === correct) t.right++;
        teams.set(team.team, t);
      }
      if (a.choice === correct) continue;
      const here = await ctx.db
        .query("checkins")
        .withIndex("by_channel_and_user", (q) => q.eq("channel", channel).eq("user", a.user).gte("_creationTime", start))
        .first();
      wrong.push({ name: cleanName(here?.name), team, picked: quiz.choices[a.choice] ?? "" });
    }
    return {
      kind: "quiz",
      poll: quiz._id,
      question: quiz.question,
      choices: quiz.choices,
      correct,
      open: quiz.open,
      answered: rows.length,
      counts,
      byTeam: [...teams.values()].sort((a, b) => a.team - b.team),
      wrong,
    };
  },
});

const draftShape = v.object({ index: v.number(), question: v.string(), choices: v.array(v.string()), correct: v.number() });
type Draft = Infer<typeof draftShape>;

const UNREADABLE = "The AI answer wasn't readable. Try again.";

// Gemini's reply as a question with 2 to 4 choices and one right answer, or UNREADABLE: not
// JSON, null, no question, under 2 choices, or a right answer that isn't one of the choices.
// Blank choices drop out and the right answer follows its own choice, as in ask.
function readDraft(reply: string): Omit<Draft, "index"> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(reply);
  } catch {
    throw new ConvexError(UNREADABLE);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new ConvexError(UNREADABLE);
  const d = parsed as { question?: unknown; choices?: unknown; correct?: unknown };
  const question = typeof d.question === "string" ? d.question.trim() : "";
  const kept = (Array.isArray(d.choices) ? d.choices : [])
    .map((c: unknown, box: number) => ({ text: typeof c === "string" || typeof c === "number" ? String(c).trim() : "", box }))
    .filter((c) => c.text)
    .slice(0, 4);
  const marked = typeof d.correct === "number" ? d.correct : typeof d.correct === "string" ? Number(d.correct) : NaN;
  const correct = kept.findIndex((c) => c.box === marked);
  if (!question || kept.length < 2 || correct < 0) throw new ConvexError(UNREADABLE);
  return { question, choices: kept.map((c) => c.text), correct };
}

// A question drafted from the slide the deck is on, for the professor to edit before opening it.
// Returns the slide's index, so ask stores the slide the draft came from even when the deck
// moves on while the professor edits.
export const draftQuestion = action({
  args: { channel: v.string() },
  returns: draftShape,
  handler: async (ctx, { channel }): Promise<Draft> => {
    await requireProf(ctx); // before any call to Gemini
    const slide = await ctx.runQuery(api.deck.current, { channel });
    if (!slide) throw new ConvexError("The deck hasn't sent a slide yet.");
    const reply = await gemini({
      model: "fast",
      json: true,
      system:
        "You write quick check questions for a university lecture. One question, 4 short choices, exactly one right. " +
        'Plain words, no tricks. Only use what the slide says. Reply as JSON: {"question": string, "choices": string[4], "correct": number (0 to 3)}.',
      parts: [{ text: `Slide title: ${slide.title}\nSlide text:\n${slide.lines.join("\n")}` }],
    });
    return { index: slide.index, ...readDraft(reply) };
  },
});

// Two or three plain sentences on what the room got wrong on `missing`'s quiz: which wrong
// choice most people picked and what to explain again. Gemini gets the question, each choice
// with its count and the right one marked, and each team's tally.
export const feedback = action({
  args: { channel: v.string() },
  returns: v.string(),
  handler: async (ctx, { channel }): Promise<string> => {
    await requireProf(ctx); // before any call to Gemini (missing checks the same)
    const m: Missing = await ctx.runQuery(api.checkin.quiz.missing, { channel });
    if (!m || m.kind === "vote") throw new ConvexError("Ask the room a quiz question first.");
    if (m.answered === 0) throw new ConvexError("No answers yet.");
    const lines = m.choices.map((c, i) => `${LETTERS[i]}. ${c}${i === m.correct ? " (right)" : ""}: ${m.counts[i]} picked`);
    const teams = m.byTeam.map((t) => `${t.label}: ${t.right} of ${t.answered} right`);
    return await gemini({
      model: "fast",
      system:
        "You help a professor in the middle of a lecture. In 2 or 3 short, plain sentences say what the room is mixing up " +
        "and what to explain again. Name the wrong choice most people picked. No lists, no jargon.",
      parts: [{ text: [`Question: ${m.question}`, ...lines, ...(teams.length ? [`By team: ${teams.join("; ")}`] : [])].join("\n") }],
    });
  },
});
