// Attendance for the professor, the class start time, and who walked in late. Everything here is
// per class (the `lectures` table, lib.lectureWindow): a check-in belongs to the class whose window
// holds its _creationTime, so last week's arrivals never show in this week's sheet or late banner,
// and every past class keeps its own attendance CSV.
//
// Late minutes are worked out when read, from each check-in's time (`at`) and its class's start
// time (startsAt) plus grace minutes (graceMin): a check-in after start + grace is late by the
// minutes since the start (at least 1); anything else is on time (null), and so is every check-in
// in a class with no start time. So a start time saved or corrected after students arrived still
// marks them on the sheet, and a start saved for last week's class never touches this week's.
// Check-ins from before the first class ("earlier": prod's rows from before classes existed) keep
// the lateMin pass.scan stored for them then. The late banner (lateFeed) announces only check-ins
// made after the start was last saved, so students who become late when the professor saves or
// corrects the start after they walked in never show up as if they just arrived.
//
// A start belongs to the class still open only while that class's check-ins are near it: when
// the open class has a check-in more than 45 minutes before the new start (the next section's or
// the next day's start, saved before End day), setClassStart refuses it, so it never rewrites that
// class's late minutes or merges the next class's check-ins into it. A start moved to when the
// students actually came (9:00 saved by mistake, check-ins from 9:50, start moved to 10:00) still
// applies.
//
// Who calls what:
//   classStart({ channel })               anyone: this class's start time and grace, or null
//   setClassStart({ channel, startsAt, graceMin, sameClass? })   professors and admins: opens the
//                                         class when none is open, saves its start, and queues the
//                                         team lock; refuses the next class's start while this one
//                                         is open, unless sameClass says it is this class's
//   sheet({ channel, lecture? })          professors and admins: one class's check-ins with email
//                                         and minutes late; this class by default, "earlier" for
//                                         the check-ins from before the first class
//   lectures({ channel })                 professors and admins: the classes with check-ins and the
//                                         one running now, newest first, then "earlier"
//   removeCheckin({ checkin })            professors and admins: removes a wrong check-in from
//                                         this class and that student's quiz and vote answers
//                                         in it, so the student can be scanned again
//   lateFeed({ channel })                 anyone: the late banner's newest 5 late arrivals in this
//                                         class, first names only
//   myHideLate() / setHideLate({ hide })  the signed-in student's own switch for the late banner
//   clock()                               anyone: the server's time in ms, so a late banner can
//                                         tell how far its screen's clock is off (LateBanner.tsx)
import { mutation, query, type QueryCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { ConvexError, v, type Infer } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import { EARLY_MS, cleanName, ensureLecture, lectureStart, lectureWindow, requireUser } from "../lib";
import { requireProf } from "./prof";
import { tally } from "./quiz";

const MIN = 60_000;
// A start time has to be within this long of now, so a time picked for the wrong day is refused.
const START_RANGE_MS = 12 * 60 * MIN;
// Teams lock this long after class starts (convex/live/groups.ts).
const TEAM_LOCK_MS = 5 * MIN;
// A start more than EARLY_MS (lib.ts, 45 minutes) after the open class's first check-in is the next
// class's start. pass.scan uses the same 45 minutes the other way round.
// lectures: how many classes it lists at most, how many `lectures` rows it looks through to find
// them (rows for classes nobody checked in to are skipped), and how many check-ins it reads to
// count them. A function may read about 16,000 documents; a class of 40 students over a semester
// of 45 classes reads 1,800. A list cut short leaves out its oldest classes, "earlier" included.
const MAX_CLASSES = 50;
const MAX_LECTURE_ROWS = 200;
const COUNT_BUDGET = 8_000;
// setClassStart's refusal of the next class's start. src/teams/checkin/util.ts keeps a copy, to
// offer Save anyway when it comes back (util.test.ts checks they match).
export const STILL_OPEN = "This class is still open. Press End class, then save the next start.";
// removeCheckin: how many of this class's polls it looks through for the student's answers.
const MAX_CLASS_POLLS = 200;
// lateFeed: how many of the newest late check-ins it looks through for 5 that show.
const FEED_ROWS = 100;

const start = v.object({ startsAt: v.number(), graceMin: v.number() });

// Where a set of check-ins lies on the channel's timeline: _creationTime from `start` up to `end`
// (null: no end yet), with the start time and grace that decide who was late. `legacy` check-ins
// (from before the first class) keep their stored lateMin instead.
type Span = { start: number; end: number | null; startsAt: number | null; graceMin: number; legacy: boolean };

// One class, from its start (lib.lectureStart) to its end (open while it runs).
function classSpan(lecture: Doc<"lectures">): Span {
  return { start: lectureStart(lecture), end: lecture.endedAt ?? null, startsAt: lecture.startsAt ?? null, graceMin: lecture.graceMin ?? 0, legacy: false };
}

// The check-ins from before the first class on the channel, or every check-in when no class has
// opened yet.
async function earlierSpan(ctx: QueryCtx, channel: string): Promise<Span> {
  const first = await ctx.db
    .query("lectures")
    .withIndex("by_channel", (q) => q.eq("channel", channel))
    .order("asc")
    .first();
  return { start: 0, end: first ? lectureStart(first) : null, startsAt: null, graceMin: 0, legacy: true };
}

// This class: the one running now; between classes, from when the last one ended; before the first
// class ever, every check-in (lib.lectureWindow).
async function currentSpan(ctx: QueryCtx, channel: string): Promise<Span> {
  const win = await lectureWindow(ctx, channel);
  if (win.lecture !== null) return { start: win.start, end: null, startsAt: win.startsAt, graceMin: win.graceMin, legacy: false };
  const earlier = await earlierSpan(ctx, channel);
  if (earlier.end === null) return earlier;
  return { start: win.start, end: null, startsAt: null, graceMin: 0, legacy: false };
}

// The check-ins in a span, oldest first (add .order("desc") for newest first).
function checkinsIn(ctx: QueryCtx, channel: string, span: Span) {
  return ctx.db.query("checkins").withIndex("by_channel", (q) => {
    const from = q.eq("channel", channel).gte("_creationTime", span.start);
    return span.end === null ? from : from.lt("_creationTime", span.end);
  });
}

// Minutes late for a check-in at `at`: the minutes since the start (at least 1) once past
// start + grace, else null. No start time: nobody is late.
function lateMinutes(at: number, startsAt: number | null, graceMin: number): number | null {
  if (startsAt === null || at <= startsAt + graceMin * MIN) return null;
  return Math.max(1, Math.round((at - startsAt) / MIN));
}

const lateOf = (row: Doc<"checkins">, span: Span) => (span.legacy ? (row.lateMin ?? null) : lateMinutes(row.at, span.startsAt, span.graceMin));

// The first word of a name, for the late banner on shared screens: "Someone" when it holds an "@"
// or nothing that shows, when the student's pass says the name was typed as an email address
// (`fromEmail`, passes.nameFromEmail: lib.cleanName stores "jdoe1234@gmail.com" as "jdoe1234"),
// and when the whole name is the part of the student's own email before the "@" (any case), for a
// pass that predates that flag. Emails are for professors only. A student whose email is their
// first name ("Ana", ana@example.edu) shows as "Someone" too. lib.cleanName drops hidden characters.
function firstName(name: string, email: string | undefined, fromEmail: boolean) {
  if (fromEmail) return "Someone";
  const whole = name.trim();
  const local = (email ?? "").split("@")[0].trim();
  if (local !== "" && whole.toLowerCase() === local.toLowerCase()) return "Someone";
  const first = whole.split(/\s+/)[0] ?? "";
  return first.includes("@") ? "Someone" : cleanName(first, "Someone");
}

// When the start was last saved on the channel: setClassStart replaces the channel's classStarts
// row on every save, so the row's _creationTime is that moment. Null when none was ever saved.
async function startSavedAt(ctx: QueryCtx, channel: string): Promise<number | null> {
  const row = await ctx.db
    .query("classStarts")
    .withIndex("by_channel", (q) => q.eq("channel", channel))
    .order("desc")
    .first();
  return row?._creationTime ?? null;
}

// This class's start time and grace, or null when it has none (between classes too). Before the
// first class ever, the start the professor saved the old way (lib.lectureWindow).
export const classStart = query({
  args: { channel: v.string() },
  returns: v.union(v.null(), start),
  handler: async (ctx, { channel }) => {
    const { startsAt, graceMin } = await lectureWindow(ctx, channel);
    return startsAt === null ? null : { startsAt, graceMin };
  },
});

// A professor or admin sets when class starts (ms) and how many whole minutes of grace (0 to 60)
// come before "late". The time has to be within 12 hours of now. Opens the class when none is open
// (lib.ensureLecture), so the start belongs to this class only. While the open class has a
// check-in more than 45 minutes before the new start, the start is the next class's, so it's
// refused until End day (End class on #/checkin/teacher, or the Points tab on #/host) ends this
// class (a class with no check-ins yet, like one a deck rehearsal opened the evening before,
// takes it). Unless this class's teams are
// locked already, it queues the team lock for 5 minutes after the start: a start moved earlier
// locks the teams earlier (live.groups.lock checks the time itself, so a lock queued for the old
// start does nothing extra).
// `sameClass: true` saves it anyway: the professor's "Save anyway" on #/checkin/teacher, for a
// student who came more than 45 minutes early to this class (a scan opens a class with no start,
// and scans have no early limit until a start is saved), so ending the class isn't the only way
// through.
export const setClassStart = mutation({
  args: { channel: v.string(), startsAt: v.number(), graceMin: v.number(), sameClass: v.optional(v.boolean()) },
  returns: v.null(),
  handler: async (ctx, { channel, startsAt, graceMin, sameClass }) => {
    await requireProf(ctx);
    if (!Number.isFinite(startsAt) || Math.abs(startsAt - Date.now()) > START_RANGE_MS) throw new ConvexError("Pick a time within 12 hours of now.");
    if (!Number.isInteger(graceMin)) throw new ConvexError("Grace has to be a whole number of minutes.");
    if (graceMin < 0 || graceMin > 60) throw new ConvexError("Grace has to be 0 to 60 minutes.");
    const lecture = await ensureLecture(ctx, channel);
    const first = await checkinsIn(ctx, channel, classSpan(lecture)).first();
    if (first && startsAt > first.at + EARLY_MS && sameClass !== true) throw new ConvexError(STILL_OPEN);
    // The first start saved for this class also records when, so deck slides pressed after it
    // keep counting when the start moves later (lib.slidesFrom).
    const firstSave = lecture.startsAt === undefined ? { startSavedAt: Date.now() } : {};
    await ctx.db.patch("lectures", lecture._id, { startsAt, graceMin, ...firstSave });
    // The channel's legacy classStarts row too, replaced so its _creationTime says when the start
    // was saved. Two things read it: startSavedAt (for lateFeed), and lib.lectureWindow only while
    // no class exists (a class exists from here on).
    const legacy = await ctx.db
      .query("classStarts")
      .withIndex("by_channel", (q) => q.eq("channel", channel))
      .take(10);
    for (const row of legacy) await ctx.db.delete("classStarts", row._id);
    await ctx.db.insert("classStarts", { channel, startsAt, graceMin });
    // This class's teams: the newest groupSettings row made since the class opened.
    const teams = await ctx.db
      .query("groupSettings")
      .withIndex("by_channel", (q) => q.eq("channel", channel).gte("_creationTime", lectureStart(lecture)))
      .order("desc")
      .first();
    if (teams?.lockedAt === undefined) {
      await ctx.scheduler.runAt(startsAt + TEAM_LOCK_MS, internal.live.groups.lock, { channel, lecture: lecture._id });
    }
    return null;
  },
});

const sheetRow = v.object({ name: v.string(), email: v.string(), at: v.number(), lateMin: v.union(v.null(), v.number()) });

// One class's check-ins, first in first, with email and minutes late. This class when `lecture` is
// left out, a past class by its id (from `lectures`), or "earlier" for the check-ins from before
// the first class. Professors and admins only.
export const sheet = query({
  args: { channel: v.string(), lecture: v.optional(v.union(v.id("lectures"), v.literal("earlier"))) },
  returns: v.array(sheetRow),
  handler: async (ctx, { channel, lecture }) => {
    await requireProf(ctx);
    let span: Span;
    if (lecture === undefined) span = await currentSpan(ctx, channel);
    else if (lecture === "earlier") span = await earlierSpan(ctx, channel);
    else {
      const row = await ctx.db.get("lectures", lecture);
      if (!row || row.channel !== channel) throw new ConvexError("That class isn't on this channel.");
      span = classSpan(row);
    }
    const rows = await checkinsIn(ctx, channel, span).collect();
    return rows.map((r) => ({ name: r.name, email: r.email ?? "", at: r.at, lateMin: lateOf(r, span) }));
  },
});

// A class in the list: `lecture` is its id for sheet({ lecture }); `open` is the class running now;
// startedAt is when it opened, startsAt and graceMin its saved start, endedAt when it ended (null
// while it runs), count its check-ins. The "earlier" entry's startedAt and endedAt are its first
// and last check-in's times.
const classRow = v.object({
  lecture: v.union(v.id("lectures"), v.literal("earlier")),
  open: v.boolean(),
  startedAt: v.number(),
  startsAt: v.union(v.null(), v.number()),
  graceMin: v.number(),
  endedAt: v.union(v.null(), v.number()),
  count: v.number(),
});

// Every class with at least one check-in, plus the class running now even before its first
// check-in, newest first; then "earlier" when check-ins exist from before the first class.
// Professors and admins only. At most 50 classes, and only as many as 8,000 check-ins (see
// MAX_CLASSES above).
export const lectures = query({
  args: { channel: v.string() },
  returns: v.array(classRow),
  handler: async (ctx, { channel }) => {
    await requireProf(ctx);
    const { lecture: open } = await lectureWindow(ctx, channel);
    const recent = await ctx.db
      .query("lectures")
      .withIndex("by_channel", (q) => q.eq("channel", channel))
      .order("desc")
      .take(MAX_LECTURE_ROWS);
    const out: Infer<typeof classRow>[] = [];
    let budget = COUNT_BUDGET;
    // Whether the list reaches back to the first class, so "earlier" comes next.
    let everyClass = recent.length < MAX_LECTURE_ROWS;
    for (const l of recent) {
      const rows = out.length < MAX_CLASSES ? await checkinsIn(ctx, channel, classSpan(l)).take(budget + 1) : null;
      if (rows === null || rows.length > budget) {
        everyClass = false;
        break;
      }
      budget -= rows.length;
      if (rows.length === 0 && l._id !== open) continue;
      out.push({
        lecture: l._id,
        open: l._id === open,
        startedAt: l.startedAt,
        startsAt: l.startsAt ?? null,
        graceMin: l.graceMin ?? 0,
        endedAt: l.endedAt ?? null,
        count: rows.length,
      });
    }
    if (everyClass) {
      const rows = await checkinsIn(ctx, channel, await earlierSpan(ctx, channel)).take(budget + 1);
      if (rows.length > 0 && rows.length <= budget) {
        const times = rows.map((r) => r.at);
        out.push({
          lecture: "earlier",
          open: false,
          startedAt: Math.min(...times),
          startsAt: null,
          graceMin: 0,
          endedAt: Math.max(...times),
          count: rows.length,
        });
      }
    }
    return out;
  },
});

// A professor or admin removes a wrong check-in from this class (a student scanned twice under two
// names, or someone who isn't in the room). The student's phone shows the pass again and they can
// be scanned again. Their quiz and vote answers in this class go too (only checked-in students can
// answer), so "answered" never counts more students than "checked in", and an ended poll's saved
// counts are worked out again without them. A check-in from an earlier class stays: it is that
// class's record. Pressing Remove twice is fine: a check-in that is gone already changes nothing.
export const removeCheckin = mutation({
  args: { checkin: v.id("checkins") },
  returns: v.null(),
  handler: async (ctx, { checkin }) => {
    await requireProf(ctx);
    const row = await ctx.db.get("checkins", checkin);
    if (!row) return null;
    const span = await currentSpan(ctx, row.channel);
    if (row._creationTime < span.start || (span.end !== null && row._creationTime >= span.end))
      throw new ConvexError("That check-in is from an earlier class.");
    await ctx.db.delete("checkins", checkin);
    const polls = await ctx.db
      .query("polls")
      .withIndex("by_channel", (q) => q.eq("channel", row.channel).gte("_creationTime", span.start))
      .take(MAX_CLASS_POLLS);
    for (const p of polls) {
      const answer = await ctx.db
        .query("pollAnswers")
        .withIndex("by_poll_and_user", (q) => q.eq("poll", p._id).eq("user", row.user))
        .first();
      if (!answer) continue;
      await ctx.db.delete("pollAnswers", answer._id);
      if (p.counts !== undefined) await ctx.db.patch("polls", p._id, { counts: (await tally(ctx, p._id, p.choices.length)).counts });
    }
    return null;
  },
});

// The newest 5 late arrivals in this class, newest first, for the banner on the slides. Anyone can
// read it, so it carries a first name only (never one with an "@" or the student's email), and
// skips students who turned the banner off. Only check-ins made after the start was last saved:
// the ones before it weren't late when they were scanned, so the banner never announces them.
export const lateFeed = query({
  args: { channel: v.string() },
  returns: v.array(v.object({ id: v.string(), first: v.string(), lateMin: v.number(), at: v.number() })),
  handler: async (ctx, { channel }) => {
    const span = await currentSpan(ctx, channel);
    let from = span.start;
    // Check-ins made at or before this moment never show (-Infinity: all may show).
    let saved = -Infinity;
    if (!span.legacy) {
      if (span.startsAt === null) return [];
      // Only check-ins after start + grace can be late. Read from a minute before that: a
      // check-in's `at` and its _creationTime can differ a little. And only those made after the
      // start was last saved.
      saved = (await startSavedAt(ctx, channel)) ?? -Infinity;
      from = Math.max(span.start, span.startsAt + span.graceMin * MIN - MIN, saved);
    }
    const rows = await checkinsIn(ctx, channel, { ...span, start: from })
      .order("desc")
      .take(FEED_ROWS);
    const out = [];
    for (const r of rows) {
      const lateMin = lateOf(r, span);
      if (lateMin === null || r._creationTime <= saved) continue;
      const pass = await ctx.db
        .query("passes")
        .withIndex("by_user", (q) => q.eq("user", r.user))
        .first();
      if (pass?.hideLate) continue;
      // A pass from before names were cleaned can still hold the email itself.
      const fromEmail = !!pass && (pass.nameFromEmail === true || pass.name.includes("@"));
      out.push({ id: r._id, first: firstName(r.name, r.email, fromEmail), lateMin, at: r.at });
      if (out.length === 5) break;
    }
    return out;
  },
});

// The student's own switch for the late banner.
export const myHideLate = query({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => {
    const me = await ctx.auth.getUserIdentity();
    if (!me) return false;
    const p = await ctx.db.query("passes").withIndex("by_user", (q) => q.eq("user", me.tokenIdentifier)).unique();
    return !!p?.hideLate;
  },
});

export const setHideLate = mutation({
  args: { hide: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { hide }) => {
    const me = await requireUser(ctx);
    const p = await ctx.db.query("passes").withIndex("by_user", (q) => q.eq("user", me.tokenIdentifier)).unique();
    if (!p) throw new ConvexError("Open your pass first.");
    await ctx.db.patch(p._id, { hideLate: hide });
    return null;
  },
});

// The server's time in ms. The late banner asks once when it opens and compares it with its own
// clock, so a screen whose clock runs fast or slow still judges a lateFeed row's `at` (the
// server's time) right. A mutation, so each call gets the time it runs; it writes nothing.
export const clock = mutation({
  args: {},
  returns: v.number(),
  handler: async () => Date.now(),
});
