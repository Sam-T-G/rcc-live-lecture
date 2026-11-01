// Sample data for a dev backend, so every #/host tab has something to show before real students
// use it, and so a team can build against the other teams' tables on its own laptop (every lead
// runs their own dev deployment).
//   npx convex run dev/seed:fill '{"channel":"gdg"}'    adds 8 sample students to the class
//   npx convex run dev/seed:clear '{"channel":"gdg"}'   removes every sample row on the channel
// fill opens a class when none is open (lib.ensureLecture), the way a deck press or a scan does,
// and adds `people` sample students to it (8 unless given, 1 to 40): check-ins with teams dealt
// the way a scan deals them, I'm lost taps, an ended quiz with their answers, and their questions
// with upvotes. The rows belong to that class, so they leave the screens when the class ends.
// fill adds nothing when the channel has sample students already, refuses while a question is
// open (the sample quiz would take its place on every phone), and runs only on the dev backends
// in DEV_HOSTS: ask Sam to add your own dev deployment's host to both lists (README step 4) first.
// Every sample student's user is "sample:<n>", so clear finds their rows in every table and never
// touches a real student's (a real user is "<issuer>|<subject>"). clear runs on any backend.
// Internal: the CLI and the dashboard can run these, the browser can't. Leads only.
import { ConvexError, v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import { internalMutation, type MutationCtx } from "../_generated/server";
import { cloudHost, isDevBackend } from "../checkin/prof";
import { ensureLecture, lectureStart, lectureWindow } from "../lib";
import { ensureGroup, lockTime } from "../live/groups";

const SAMPLE = "sample:";
// Every sample user sorts from SAMPLE up to this (";" comes right after ":"), so a range on an
// index's `user` field finds all of them and nothing else.
const AFTER_SAMPLE = "sample;";
// Prod's deployment (CONVEX_CLOUD_URL https://utmost-ibis-818.convex.cloud).
const PROD = "utmost-ibis-818";
const MAX_PEOPLE = 40;

// The sample quiz, ended, with Convex the right answer. clear knows it by its question.
const QUIZ = { question: "Sample quiz: which one is a database?", choices: ["Convex", "Vite", "React", "Gemini"], correct: 0 };

// The sample students' questions: who asks (sample:<k>), what, and which sample students upvote
// it. A question goes on the deck's slide, or the slide before it with `before`. A question whose
// student isn't in the class (k past `people`) is left out, and so is an upvote from one.
const QUESTIONS: { k: number; text: string; anonymous?: boolean; private?: boolean; before?: boolean; voters: number[] }[] = [
  { k: 1, text: "Can you go over the last example again?", voters: [3, 5, 6] },
  { k: 2, text: "Will this be on the test?", anonymous: true, voters: [4] },
  { k: 4, text: "I missed the start of class. Where can I find these slides?", private: true, voters: [] },
  { k: 5, text: "Why does the second example give a different answer?", before: true, voters: [] },
];

const sampleUser = (k: number) => SAMPLE + k;
const isSample = (user: string | undefined) => user !== undefined && user.startsWith(SAMPLE);
const plural = (n: number, one: string) => `${n} ${n === 1 ? one : one + "s"}`;

// fill makes up students, so it runs only on the dev backends in DEV_HOSTS (convex/checkin/prof.ts,
// the list typed test roles use), by the host in CONVEX_CLOUD_URL (Convex sets it in every
// function). Anything else counts as prod: prod's URL, a custom domain, a deployment that isn't on
// the list, a URL that can't be read. A lead who runs fill on their own dev deployment first asks
// Sam to add its host to DEV_HOSTS in both convex/checkin/prof.ts and convex/auth.config.ts (README step 4;
// a test fails when the two lists differ), which also lets typed test sign-ins and test roles
// work there.
function refuseOnProd() {
  const host = cloudHost();
  if (!host)
    throw new ConvexError("dev/seed:fill tells prod from a dev backend by CONVEX_CLOUD_URL, and this backend's can't be read, so it added nothing.");
  if (host.includes(PROD)) throw new ConvexError(`dev/seed:fill adds made-up students, so it never runs on prod (${PROD}).`);
  if (!isDevBackend())
    throw new ConvexError(
      `dev/seed:fill adds made-up students, so it runs only on the dev backends in DEV_HOSTS, and ${host} isn't one, so it added nothing. ` +
        `If it's your own dev backend (never prod), ask Sam to add its host to DEV_HOSTS in convex/checkin/prof.ts and convex/auth.config.ts (README step 4).`,
    );
}

// Whether the channel has a sample student's check-in, team or question, in any class.
async function hasSamples(ctx: MutationCtx, channel: string) {
  const checkin = await ctx.db
    .query("checkins")
    .withIndex("by_channel_and_user", (q) => q.eq("channel", channel).gte("user", SAMPLE).lt("user", AFTER_SAMPLE))
    .first();
  const group = await ctx.db
    .query("groups")
    .withIndex("by_channel_and_user", (q) => q.eq("channel", channel).gte("user", SAMPLE).lt("user", AFTER_SAMPLE))
    .first();
  const question = await ctx.db
    .query("questions")
    .withIndex("by_channel_and_user", (q) => q.eq("channel", channel).gte("user", SAMPLE).lt("user", AFTER_SAMPLE))
    .first();
  return checkin !== null || group !== null || question !== null;
}

export const fill = internalMutation({
  args: { channel: v.string(), people: v.optional(v.number()) },
  returns: v.string(),
  handler: async (ctx, { channel, people = 8 }) => {
    refuseOnProd();
    if (!Number.isInteger(people) || people < 1 || people > MAX_PEOPLE)
      throw new ConvexError(`people has to be a whole number from 1 to ${MAX_PEOPLE}.`);
    if (await hasSamples(ctx, channel))
      return `"${channel}" has sample students already, so nothing was added. Run dev/seed:clear first for a new set.`;

    const lecture = await ensureLecture(ctx, channel);
    const start = lectureStart(lecture);
    // Only the newest poll on a channel can be open (quiz.ask ends the one before). Open in this
    // class, it's on every phone, and the sample quiz would take its place there. One left open by
    // a class that ended (ensureLecture just ended it, or it closed by itself) is on no screen.
    const newest = await ctx.db
      .query("polls")
      .withIndex("by_channel", (q) => q.eq("channel", channel))
      .order("desc")
      .first();
    if (newest?.open && newest._creationTime >= start)
      throw new ConvexError(`A question is open on "${channel}", and the sample quiz would take its place on every phone. End it on #/host first.`);
    // The deck's slide when the deck has sent one in this class (quiz.ask's rule), else the first.
    const deck = await ctx.db
      .query("deckChannels")
      .withIndex("by_channel", (q) => q.eq("channel", channel))
      .first();
    const slide = deck && deck.at >= start ? deck.index : 0;
    const now = Date.now();

    // Check-ins 20 seconds apart, sample student 1 first, each dealt a team the way a scan deals
    // one (Red, Blue, Yellow, ...), which also queues the team lock.
    const teams = new Set<number>();
    for (let k = 1; k <= people; k++) {
      await ctx.db.insert("checkins", {
        channel,
        user: sampleUser(k),
        name: "Sample student " + k,
        email: `sample${k}@example.edu`,
        at: now - (people + 1 - k) * 20_000,
      });
      teams.add(await ensureGroup(ctx, channel, sampleUser(k)));
    }

    // Every third student is lost on the deck's slide, and students 1 and 2 on the slide before it.
    let taps = 0;
    for (let k = 1; k <= people; k++) {
      if (k % 3 === 0) {
        await ctx.db.insert("lost", { channel, index: slide, user: sampleUser(k), at: now - k * 5_000 });
        taps++;
      }
      if (k <= 2 && slide > 0) {
        await ctx.db.insert("lost", { channel, index: slide - 1, user: sampleUser(k), at: now - 60_000 });
        taps++;
      }
    }

    // The quiz, asked on the deck's slide and ended now: every third student picked Vite, every
    // fourth React, the rest Convex. One answer came in every 3 seconds after it was asked. The
    // saved counts are the ones quiz.end would save.
    const askedAt = now - (people + 1) * 3_000;
    const picks = Array.from({ length: people }, (_, i) => ((i + 1) % 3 === 0 ? 1 : (i + 1) % 4 === 0 ? 2 : QUIZ.correct));
    const poll = await ctx.db.insert("polls", {
      channel,
      question: QUIZ.question,
      choices: QUIZ.choices,
      correct: QUIZ.correct,
      kind: "quiz",
      index: slide,
      open: false,
      at: askedAt,
      closedAt: now,
      counts: QUIZ.choices.map((_, c) => picks.filter((p) => p === c).length),
    });
    for (const [i, choice] of picks.entries()) {
      await ctx.db.insert("pollAnswers", { poll, user: sampleUser(i + 1), choice, at: askedAt + (i + 1) * 3_000 });
    }

    // Their questions, 30 seconds apart, with upvotes. Nobody upvotes a private question.
    const asks = QUESTIONS.filter((q) => q.k <= people);
    for (const [i, q] of asks.entries()) {
      const voters = q.private ? [] : q.voters.filter((k) => k <= people && k !== q.k);
      const question = await ctx.db.insert("questions", {
        channel,
        index: q.before && slide > 0 ? slide - 1 : slide,
        user: sampleUser(q.k),
        ...(q.anonymous ? {} : { name: "Sample student " + q.k }),
        text: q.text,
        votes: voters.length,
        at: now - (asks.length - i) * 30_000,
        ...(q.private ? { private: true } : {}),
      });
      for (const k of voters) await ctx.db.insert("questionVotes", { channel, question, user: sampleUser(k) });
    }

    return (
      `Added ${plural(people, "sample student")} to the class on "${channel}": ${plural(people, "check-in")}, ` +
      `${plural(teams.size, "team")}, ${plural(taps, "I'm lost tap")}, ${plural(people, "answer")} to an ended quiz ` +
      `and ${plural(asks.length, "question")}. dev/seed:clear removes them.`
    );
  },
});

// The sample check-ins dealt teams, so the first of them queued the open class's team lock and
// marked its groupSettings row `scheduled` (live.groups.queueLock), and once the lock fires the
// row has `lockedAt`. When clear has just removed sample check-ins from the open class and nobody
// is left checked in to it, the row goes back to how a class with no check-in has it (its team
// size only), so the next real check-in is dealt Red, Blue, Yellow and queues a fresh lock. A
// lock job fill queued that hasn't fired yet finds nobody, or the real students' later lock time,
// and locks nothing early. A class with a real student still checked in keeps its lock. When the
// class's saved start says the lock time has passed, the row is written fresh with scheduled:
// false, as live.groups.lock does when its time comes with nobody here, so live.groups.status
// shows no lock time that has passed until the next check-in queues a new one.
async function reopenTeams(ctx: MutationCtx, channel: string, removed: Doc<"checkins">[]) {
  const win = await lectureWindow(ctx, channel);
  if (win.lecture === null || !removed.some((r) => r._creationTime >= win.start)) return;
  const left = await ctx.db
    .query("checkins")
    .withIndex("by_channel", (q) => q.eq("channel", channel).gte("_creationTime", win.start))
    .first();
  if (left) return;
  const set = await ctx.db
    .query("groupSettings")
    .withIndex("by_channel", (q) => q.eq("channel", channel).gte("_creationTime", win.start))
    .order("desc")
    .first();
  if (!set || (set.lockedAt === undefined && set.scheduled !== true)) return;
  const at = lockTime(win, null);
  if (at !== null && at <= Date.now()) {
    await ctx.db.delete("groupSettings", set._id);
    await ctx.db.insert("groupSettings", { channel, size: set.size, scheduled: false });
  } else await ctx.db.patch("groupSettings", set._id, { lockedAt: undefined, scheduled: undefined });
}

export const clear = internalMutation({
  args: { channel: v.string() },
  returns: v.string(),
  handler: async (ctx, { channel }) => {
    let n = 0;

    // Check-ins, teams and saved extra credit, through their by_channel_and_user indexes. The
    // rows fill wrote and the ones the app wrote for sample students since (a lock re-deal, End
    // day), in every class.
    const checkins = await ctx.db
      .query("checkins")
      .withIndex("by_channel_and_user", (q) => q.eq("channel", channel).gte("user", SAMPLE).lt("user", AFTER_SAMPLE))
      .collect();
    for (const r of checkins) await ctx.db.delete("checkins", r._id);
    await reopenTeams(ctx, channel, checkins);
    const groups = await ctx.db
      .query("groups")
      .withIndex("by_channel_and_user", (q) => q.eq("channel", channel).gte("user", SAMPLE).lt("user", AFTER_SAMPLE))
      .collect();
    for (const r of groups) await ctx.db.delete("groups", r._id);
    const results = await ctx.db
      .query("groupResults")
      .withIndex("by_channel_and_user", (q) => q.eq("channel", channel).gte("user", SAMPLE).lt("user", AFTER_SAMPLE))
      .collect();
    for (const r of results) await ctx.db.delete("groupResults", r._id);
    n += checkins.length + groups.length + results.length;

    // Sample questions with every upvote on them, real students' too (as live.questions.remove
    // does), then sample upvotes left on real questions, each taken off its question's count.
    const questions = await ctx.db
      .query("questions")
      .withIndex("by_channel_and_user", (q) => q.eq("channel", channel).gte("user", SAMPLE).lt("user", AFTER_SAMPLE))
      .collect();
    for (const r of questions) {
      const votes = await ctx.db
        .query("questionVotes")
        .withIndex("by_question_and_user", (q) => q.eq("question", r._id))
        .collect();
      for (const x of votes) await ctx.db.delete("questionVotes", x._id);
      await ctx.db.delete("questions", r._id);
      n += votes.length + 1;
    }
    const votes = await ctx.db
      .query("questionVotes")
      .withIndex("by_channel_and_user", (q) => q.eq("channel", channel).gte("user", SAMPLE).lt("user", AFTER_SAMPLE))
      .collect();
    for (const x of votes) {
      const question = await ctx.db.get("questions", x.question);
      if (question) await ctx.db.patch("questions", question._id, { votes: Math.max(0, question.votes - 1) });
      await ctx.db.delete("questionVotes", x._id);
      n++;
    }

    // I'm lost taps and point changes have no index on user, so this reads the channel's rows. A
    // sample student's point change comes from a lock re-deal splitting a team's change.
    const lost = await ctx.db
      .query("lost")
      .withIndex("by_channel", (q) => q.eq("channel", channel))
      .collect();
    for (const r of lost.filter((r) => isSample(r.user))) {
      await ctx.db.delete("lost", r._id);
      n++;
    }
    const changes = await ctx.db
      .query("groupPoints")
      .withIndex("by_channel", (q) => q.eq("channel", channel))
      .collect();
    for (const r of changes.filter((r) => isSample(r.user))) {
      await ctx.db.delete("groupPoints", r._id);
      n++;
    }

    // Quiz answers by poll: the sample students' answers on every poll on the channel, then the
    // sample quiz itself once no answer is left on it.
    const polls = await ctx.db
      .query("polls")
      .withIndex("by_channel", (q) => q.eq("channel", channel))
      .collect();
    for (const p of polls) {
      const answers = await ctx.db
        .query("pollAnswers")
        .withIndex("by_poll_and_user", (q) => q.eq("poll", p._id).gte("user", SAMPLE).lt("user", AFTER_SAMPLE))
        .collect();
      for (const a of answers) await ctx.db.delete("pollAnswers", a._id);
      n += answers.length;
      if (p.question !== QUIZ.question || p.open) continue;
      const left = await ctx.db
        .query("pollAnswers")
        .withIndex("by_poll", (q) => q.eq("poll", p._id))
        .first();
      if (left) continue;
      await ctx.db.delete("polls", p._id);
      n++;
    }

    // A pass belongs to a student, not a channel, so a sample student's pass goes whichever
    // channel is cleared.
    const passes = await ctx.db
      .query("passes")
      .withIndex("by_user", (q) => q.gte("user", SAMPLE).lt("user", AFTER_SAMPLE))
      .collect();
    for (const r of passes) await ctx.db.delete("passes", r._id);
    n += passes.length;

    return `Removed ${n} sample rows from "${channel}".`;
  },
});
