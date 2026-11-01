// Questions and comments students post beside a slide on #/live, with upvotes, and the professor's
// side of them on #/host Questions (Sam's decision 1, 2026-10-30: the professor view reads these
// tables, and the old host.qa functions and studentQuestions table stop being used).
//
// Each class sees only its own questions: a row belongs to the class whose window holds its
// _creationTime (lib.lectureWindow), so every read here starts at the window's start. Between
// classes every list is empty.
//
// Who sees what:
//   list (anyone, signed out too)  this class's questions. Another student's private question is
//       left out; the author sees their own with private: true. name is null when anonymous.
//       answer is the professor's typed answer once it's shared, else null (the author's too). A
//       private question's answer is always null: it can't be shared (Sam's decision D12 e).
//   forHost (professors and admins)  every question in this class, private ones too, with the
//       professor's sorting, the AI's topics and the answer; name is null when anonymous.
// `user` (the poster's tokenIdentifier, which holds a typed sign-in's email) is stored for "mine",
// "you can't upvote your own" and delete; no function returns it.
//
// Functions the pages call (src/teams/live/Questions.tsx and src/teams/host/QA.tsx):
//   api.live.questions.list      { channel, index? } -> [{ _id, index, text, name, votes, at,
//       mine, voted, private, answer }]                                                      anyone
//       index: one slide's questions ("This slide"); left out, every slide's ("All slides"), the
//       newest 200. Sorted by upvotes, then newest.
//   api.live.questions.ask       { channel, index, text, anonymous, private? } -> null       checked in
//       The student needs a check-in in this class ("Check in first."). index is the slide on
//       their screen: the deck's current slide, a slide before it, or a slide the deck showed
//       earlier in this class ("That slide hasn't been shown yet."). text: 1 to 280 characters
//       after lib.cleanText (invisible characters dropped, no two blank lines in a row, at most
//       10 lines), with at least one letter, digit, punctuation mark or symbol ("Write something
//       first.", "280 characters at most."). One post per
//       person every 5 seconds ("Wait 5 seconds before posting again."). By name, the name is
//       lib.cleanName(the name on the student's check-in in this class, the one the professor saw
//       at the scan), so signing in again under another name doesn't change it; the sign-in's name
//       only when that row has none. Never an email. private: only the author and the professor
//       see it on screen, nobody can upvote it, and its answer can't be shared. Its text still
//       goes to Gemini, with no name, when the professor groups questions by topic (organize).
//   api.live.questions.vote      { question } -> null                                       checked in
//       Upvote; a second tap takes it back. "You can't upvote your own.", "You can't upvote a
//       private question.", "Check in first."
//   api.live.questions.remove    { question } -> null                   the author, a professor or admin
//       Takes the question and its upvotes off every phone. Anyone else: "Only the author or a
//       professor can delete this." A question that's already gone is a no-op.
//   api.live.questions.forHost   { channel } -> [{ _id, index, text, name, private, votes, at,
//       topic, cluster, status, answer, shared }], newest first, at most 500         professor
//   api.live.questions.setStatus { question, status: "new" | "keep" | "dismissed" } -> null  professor
//       The professor's own sorting (Sam's decision D12 g): the room still sees a dismissed
//       question, and its answer too once shared (Delete is how a question leaves the room;
//       Stop sharing, after Bring back, takes the answer off the phones).
//   api.live.questions.answer    { question, text } -> null                                 professor
//       Trimmed, 1000 characters at most. Saving keeps the question and never shares the
//       answer; an empty answer removes it and stops sharing it.
//   api.live.questions.share     { question, shared } -> null                               professor
//       shared: true shows the answer under the question on every phone ("Type an answer
//       first."; a private question: "That question is private.", Sam's decision D12 e). false
//       stops showing it.
//   api.live.questions.organize  { channel } -> how many questions got a topic              professor
//       "Group by topic with AI": sends Gemini this class's questions that aren't dismissed,
//       private ones too (Sam's decision D12 f), as numbered texts only (never names), and
//       saves each one's topic and same-question group.
// A missing question in setStatus, answer or share: "That question is gone."
// Internal: applyTopics, which organize runs to save the AI's topics.
import { ConvexError, v, type Infer } from "convex/values";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { action, internalMutation, mutation, query, type MutationCtx } from "../_generated/server";
import { gemini } from "../ai";
import { checkedIn, cleanName, cleanText, deckFrom, lectureWindow, requireUser } from "../lib";
import { isProf, requireProf, staffRole } from "../checkin/prof";

const MAX_LENGTH = 280; // a question or comment, in characters
const MAX_LINES = 10; // a question or comment, in lines
const MIN_GAP_MS = 5000; // one post per person every 5 seconds
const ANSWER_MAX = 1000; // the professor's typed answer, in characters
const LIST_MAX = 200; // the most questions list returns
const HOST_MAX = 500; // the most questions forHost returns; no class has come close
const TOPIC_MAX = 60; // an AI topic, in characters
const CLUSTER_MAX = 80; // an AI same-question label, in characters

const questionShape = v.object({
  _id: v.id("questions"),
  index: v.number(),
  text: v.string(),
  name: v.union(v.string(), v.null()), // null means anonymous
  votes: v.number(),
  at: v.number(),
  mine: v.boolean(),
  voted: v.boolean(),
  private: v.boolean(), // only ever true on the reader's own question
  answer: v.union(v.string(), v.null()), // the professor's answer, once shared
});

const statusValidator = v.union(v.literal("new"), v.literal("keep"), v.literal("dismissed"));

const hostShape = v.object({
  _id: v.id("questions"),
  index: v.number(),
  text: v.string(),
  name: v.union(v.string(), v.null()), // null means anonymous
  private: v.boolean(),
  votes: v.number(),
  at: v.number(),
  topic: v.union(v.string(), v.null()),
  cluster: v.union(v.string(), v.null()),
  status: statusValidator,
  answer: v.union(v.string(), v.null()),
  shared: v.boolean(),
});
type HostRow = Infer<typeof hostShape>;

// A stored name as it may show. Rows from before cleanName (10-29) can hold an email.
const shownName = (name: string | undefined) => (name === undefined ? null : cleanName(name));

// At most `max` characters (whole characters, so an emoji is never cut in half), trimmed.
const cut = (text: string, max: number) => Array.from(text.trim()).slice(0, max).join("").trim();

// Questions for one slide, or for every slide when `index` is left out, in this class. Most
// upvotes first, then newest. Signed-out viewers can read; `mine` and `voted` are false for them.
export const list = query({
  args: { channel: v.string(), index: v.optional(v.number()) },
  returns: v.array(questionShape),
  handler: async (ctx, { channel, index }) => {
    const me = (await ctx.auth.getUserIdentity())?.tokenIdentifier ?? null;
    const { start } = await lectureWindow(ctx, channel);
    // Both reads start at the class's start. by_channel_and_index is ordered by slide, so it
    // can't serve "All slides": its first 200 rows would be old classes' questions on low slides.
    const rows =
      index === undefined
        ? await ctx.db
            .query("questions")
            .withIndex("by_channel", (q) => q.eq("channel", channel).gte("_creationTime", start))
            .order("desc")
            .take(LIST_MAX)
        : await ctx.db
            .query("questions")
            .withIndex("by_channel_and_index", (q) => q.eq("channel", channel).eq("index", index).gte("_creationTime", start))
            .order("desc")
            .take(LIST_MAX);
    const voted = new Set<string>();
    if (me) {
      // An upvote comes after its question, so this class's upvotes start at the class's start too.
      const mine = await ctx.db
        .query("questionVotes")
        .withIndex("by_channel_and_user", (q) => q.eq("channel", channel).eq("user", me).gte("_creationTime", start))
        .take(1000);
      for (const m of mine) voted.add(m.question);
    }
    return rows
      .filter((r) => !r.private || r.user === me)
      .map((r) => ({
        _id: r._id,
        index: r.index,
        text: r.text,
        name: shownName(r.name),
        votes: r.votes,
        at: r._creationTime,
        mine: r.user === me,
        voted: voted.has(r._id),
        private: r.private === true,
        // A private question's answer is never shared (share refuses it); this also covers a row
        // an older build marked shared.
        answer: r.shared === true && !r.private && r.answer ? r.answer : null,
      }))
      .sort((a, b) => b.votes - a.votes || b.at - a.at);
  },
});

// Whether the deck has shown slide `index` in this class: a whole number from 0 up to the slide
// the deck is on now, or a slide it showed earlier in this class and then went back from. "This
// class" uses lib.deckFrom, the cutoff deck.current and deck.slides use, so a slide pressed Monday
// night before Tuesday's start was saved isn't Tuesday's. Between classes the deck's slide is last
// class's, so nothing counts.
async function shownThisClass(ctx: MutationCtx, channel: string, index: number) {
  if (!Number.isInteger(index) || index < 0) return false;
  const start = await deckFrom(ctx, channel);
  const now = await ctx.db
    .query("deckChannels")
    .withIndex("by_channel", (q) => q.eq("channel", channel))
    .first();
  if (now && now.at >= start && index <= now.index) return true;
  const shown = await ctx.db
    .query("deckSlides")
    .withIndex("by_channel_and_index", (q) => q.eq("channel", channel).eq("index", index))
    .first();
  return shown !== null && shown.at >= start;
}

// Post a question or comment on a slide. `anonymous` hides the name from everyone, professors
// too. `private` shows it only to its author and the professor.
export const ask = mutation({
  args: { channel: v.string(), index: v.number(), text: v.string(), anonymous: v.boolean(), private: v.optional(v.boolean()) },
  returns: v.null(),
  handler: async (ctx, { channel, index, text, anonymous, private: onlyProfessor }) => {
    const me = await requireUser(ctx);
    const { start } = await lectureWindow(ctx, channel);
    // The same read as lib.checkedIn, kept here for the name the professor saw at the scan.
    const checkin = await ctx.db
      .query("checkins")
      .withIndex("by_channel_and_user", (q) => q.eq("channel", channel).eq("user", me.tokenIdentifier).gte("_creationTime", start))
      .first();
    if (!checkin) throw new ConvexError("Check in first.");
    if (!(await shownThisClass(ctx, channel, index))) throw new ConvexError("That slide hasn't been shown yet.");
    const clean = cleanText(text, MAX_LINES);
    if (!clean) throw new ConvexError("Write something first.");
    if (clean.length > MAX_LENGTH) throw new ConvexError(`${MAX_LENGTH} characters at most.`);
    const last = await ctx.db
      .query("questions")
      .withIndex("by_channel_and_user", (q) => q.eq("channel", channel).eq("user", me.tokenIdentifier))
      .order("desc")
      .first();
    if (last && Date.now() - last._creationTime < MIN_GAP_MS)
      throw new ConvexError(`Wait ${MIN_GAP_MS / 1000} seconds before posting again.`);
    await ctx.db.insert("questions", {
      channel,
      index,
      user: me.tokenIdentifier,
      // The check-in's name, not the sign-in's: the same email signed in again can carry any name.
      name: anonymous ? undefined : cleanName(checkin.name.trim() ? checkin.name : me.name),
      text: clean,
      votes: 0,
      at: Date.now(),
      ...(onlyProfessor ? { private: true } : {}),
    });
    return null;
  },
});

// Upvote a question; a second tap takes the upvote back. Not your own, and not a private one.
export const vote = mutation({
  args: { question: v.id("questions") },
  returns: v.null(),
  handler: async (ctx, { question }) => {
    const me = await requireUser(ctx);
    const row = await ctx.db.get("questions", question);
    if (!row) throw new ConvexError("That question is gone.");
    if (!(await checkedIn(ctx, row.channel, me.tokenIdentifier))) throw new ConvexError("Check in first.");
    if (row.private) throw new ConvexError("You can't upvote a private question.");
    if (row.user === me.tokenIdentifier) throw new ConvexError("You can't upvote your own.");
    const existing = await ctx.db
      .query("questionVotes")
      .withIndex("by_question_and_user", (q) => q.eq("question", question).eq("user", me.tokenIdentifier))
      .unique();
    if (existing) {
      await ctx.db.delete("questionVotes", existing._id);
      await ctx.db.patch("questions", question, { votes: Math.max(0, row.votes - 1) });
    } else {
      await ctx.db.insert("questionVotes", { channel: row.channel, question, user: me.tokenIdentifier });
      await ctx.db.patch("questions", question, { votes: row.votes + 1 });
    }
    return null;
  },
});

// Delete a question and its upvotes: its author can, and so can professors and admins.
export const remove = mutation({
  args: { question: v.id("questions") },
  returns: v.null(),
  handler: async (ctx, { question }) => {
    const me = await requireUser(ctx);
    const row = await ctx.db.get("questions", question);
    if (!row) return null;
    if (row.user !== me.tokenIdentifier && !isProf(await staffRole(ctx)))
      throw new ConvexError("Only the author or a professor can delete this.");
    // One row per student who upvoted it.
    const votes = await ctx.db
      .query("questionVotes")
      .withIndex("by_question_and_user", (q) => q.eq("question", question))
      .collect();
    for (const x of votes) await ctx.db.delete("questionVotes", x._id);
    await ctx.db.delete("questions", question);
    return null;
  },
});

// Every question in this class for #/host Questions, newest first: private ones too, with the
// professor's sorting, the answer and the AI's topics. Professors and admins only.
export const forHost = query({
  args: { channel: v.string() },
  returns: v.array(hostShape),
  handler: async (ctx, { channel }) => {
    await requireProf(ctx);
    const { start } = await lectureWindow(ctx, channel);
    const rows = await ctx.db
      .query("questions")
      .withIndex("by_channel", (q) => q.eq("channel", channel).gte("_creationTime", start))
      .order("desc")
      .take(HOST_MAX);
    return rows.map((r) => ({
      _id: r._id,
      index: r.index,
      text: r.text,
      name: shownName(r.name),
      private: r.private === true,
      votes: r.votes,
      at: r._creationTime,
      topic: r.topic ?? null,
      cluster: r.cluster ?? null,
      status: r.status ?? ("new" as const),
      answer: r.answer ?? null,
      shared: r.shared === true,
    }));
  },
});

// The question a professor acts on, or "That question is gone."
async function hostRow(ctx: MutationCtx, question: Id<"questions">) {
  await requireProf(ctx);
  const row = await ctx.db.get("questions", question);
  if (!row) throw new ConvexError("That question is gone.");
  return row;
}

// Keep, dismiss, or bring back a question on the professor's list. "new" removes the mark.
export const setStatus = mutation({
  args: { question: v.id("questions"), status: statusValidator },
  returns: v.null(),
  handler: async (ctx, { question, status }) => {
    await hostRow(ctx, question);
    // Only the professor's list changes (D12 g): a shared answer stays on the phones.
    if (status === "new") await ctx.db.patch("questions", question, { status: undefined });
    else await ctx.db.patch("questions", question, { status });
    return null;
  },
});

// The professor's typed answer. Saving it marks the question kept and never shares it; an empty
// answer removes it and stops sharing it.
export const answer = mutation({
  args: { question: v.id("questions"), text: v.string() },
  returns: v.null(),
  handler: async (ctx, { question, text }) => {
    await hostRow(ctx, question);
    const clean = text.trim();
    if (clean.length > ANSWER_MAX) throw new ConvexError(`${ANSWER_MAX} characters at most.`);
    if (clean) await ctx.db.patch("questions", question, { answer: clean, status: "keep" });
    else await ctx.db.patch("questions", question, { answer: undefined, shared: undefined });
    return null;
  },
});

// Show (or stop showing) the professor's answer under the question on every phone. A private
// question's answer can't be shared (Sam's decision D12 e).
export const share = mutation({
  args: { question: v.id("questions"), shared: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { question, shared }) => {
    const row = await hostRow(ctx, question);
    if (!shared) {
      await ctx.db.patch("questions", question, { shared: undefined });
      return null;
    }
    if (row.private) throw new ConvexError("That question is private.");
    if (!row.answer) throw new ConvexError("Type an answer first.");
    await ctx.db.patch("questions", question, { shared: true });
    return null;
  },
});

// The AI's topics, written onto the questions. Run by organize. A question deleted since
// organize read it is skipped; an empty topic leaves the question as it was. Returns how many
// questions it wrote.
export const applyTopics = internalMutation({
  args: { items: v.array(v.object({ id: v.id("questions"), topic: v.string(), cluster: v.string() })) },
  returns: v.number(),
  handler: async (ctx, { items }) => {
    let wrote = 0;
    for (const it of items) {
      const topic = cut(it.topic, TOPIC_MAX);
      if (!topic || !(await ctx.db.get("questions", it.id))) continue;
      await ctx.db.patch("questions", it.id, { topic, cluster: cut(it.cluster, CLUSTER_MAX) || undefined });
      wrote++;
    }
    return wrote;
  },
});

const SORT_PROMPT =
  "You sort student questions from a lecture. Group them by topic, and inside a topic group the ones that ask the same thing. " +
  "Topics are 1 to 4 plain words. Group labels say the shared question in under 10 words. Every question number appears exactly once. " +
  'Reply as JSON: {"items": [{"n": number, "topic": string, "cluster": string}]}.';

// "Group by topic with AI": sorts this class's questions that aren't dismissed into topics, and
// inside a topic into groups that ask the same thing. Private questions go too (Sam's decision
// D12 f); the box on #/live says so. Gemini gets only the question texts, each with a number in
// place of the student, never a name. The professor sees the topics on #/host; nothing reaches
// students from here. Returns how many questions got a topic.
export const organize = action({
  args: { channel: v.string() },
  returns: v.number(),
  handler: async (ctx, { channel }): Promise<number> => {
    const all: HostRow[] = await ctx.runQuery(api.live.questions.forHost, { channel }); // professors and admins only
    const rows = all.filter((r) => r.status !== "dismissed");
    if (rows.length === 0) throw new ConvexError("No questions to group yet.");
    const reply = await gemini({
      model: "fast",
      json: true,
      system: SORT_PROMPT,
      // One line per question, so a question with line breaks can't look like two.
      parts: [{ text: rows.map((r, i) => `${i}. ${r.text.replace(/\s+/g, " ")}`).join("\n") }],
    });
    let parsed: { items?: unknown };
    try {
      parsed = JSON.parse(reply);
    } catch {
      throw new ConvexError("The AI answer wasn't readable. Try again.");
    }
    const items = (Array.isArray(parsed?.items) ? (parsed.items as { n?: unknown; topic?: unknown; cluster?: unknown }[]) : [])
      .filter((it) => Number.isInteger(it?.n) && Number(it.n) >= 0 && Number(it.n) < rows.length && typeof it.topic === "string" && typeof it.cluster === "string")
      .map((it) => ({ id: rows[Number(it.n)]._id, topic: String(it.topic), cluster: String(it.cluster) }));
    if (items.length === 0) throw new ConvexError("The AI didn't group any questions. Try again.");
    return await ctx.runMutation(internal.live.questions.applyTopics, { items });
  },
});
