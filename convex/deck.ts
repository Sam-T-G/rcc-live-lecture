// Block: deck bridge, the server side. Which slide the professor's deck is on, live, and every
// slide it has shown in this class, so a phone can page back through them.
//
// Writes come only from `set`, which POST /deck (convex/http.ts) calls for each press that
// public/deck-bridge.js sends: the slide (index, 0-based), how many of its presses are shown
// (beat), the deck's slide count, the heading, and up to 12 lines of the slide's text (the
// bridge's header comment lists which parts of a slide those come from).
// - A press opens a class when none is open (lib.ensureLecture), so presenting starts the class.
//   A press more than 45 minutes before the open class's saved start (lib.notOpenYet: End class
//   Monday night, then Tuesday 9:00 saved, opens Tuesday's class at once) is dropped, so Tuesday's
//   phones don't show Monday night's slide as Tuesday's. POST /deck still answers "ok", and the
//   bridge sends again on the next press.
// - Each press from the current bridge carries `run`, an id the deck's browser tab stores for it,
//   and `seq`, a number that goes up with every send from that tab. Two quick arrow presses can
//   reach the server in either order, so when a press arrives after a newer one from the same
//   tab, `set` doesn't change the live slide (page-back still gets the slide it showed).
// - Slide numbers are whole numbers: index and beat 0 to 999, count 1 to 999 (slideNumbers). The
//   iOS app turns each one into a Swift Int, which crashes the app on a number too big for one.
//
// `current` and `slides` return only this class's rows (lib.lectureWindow). After End day, and
// in a new class before the deck sends, `current` is null and `slides` is empty, so #/live,
// #/portal and the iOS app wait for the slides instead of showing the last class's. Before the
// first class ever (prod right after the deploy, when lectureWindow's start is 0) only rows from
// the last 12 hours (LECTURE_MS) count, so the 10-29 deck's slides don't show as Live in the next
// class. A query doesn't rerun as time passes, so a row that turns 12 hours old drops out at the
// next change on the channel; the deck's first press opens a class anyway.
// The iOS app decodes both answers field by field, so don't add, rename or remove a field.
import { ConvexError, v } from "convex/values";
import { internalMutation, query, type QueryCtx } from "./_generated/server";
import { ensureLecture, LECTURE_MS, lectureStart, lectureWindow, notOpenYet } from "./lib";

// The biggest slide number and press count a press may carry. deckSlides has one row per slide
// number on a channel, so a channel never has more than SLIDE_MAX + 1 of them.
const SLIDE_MAX = 999;

// A press's slide numbers when every screen can show them: index and beat whole numbers from 0
// to 999, count from 1 to 999. Null otherwise: POST /deck answers 400 "bad slide", and `set`
// refuses the press.
export function slideNumbers(press: { index?: unknown; beat?: unknown; count?: unknown }) {
  const { index, beat, count } = press;
  const whole = (n: unknown, min: number): n is number => typeof n === "number" && Number.isInteger(n) && n >= min && n <= SLIDE_MAX;
  return whole(index, 0) && whole(beat, 0) && whole(count, 1) ? { index, beat, count } : null;
}

// The earliest `at` a deck row can have and still count: the class window's start, or 12 hours
// ago before the first class ever (no class, start 0).
async function deckStart(ctx: QueryCtx, channel: string) {
  const { lecture, start } = await lectureWindow(ctx, channel);
  return lecture === null && start === 0 ? Date.now() - LECTURE_MS : start;
}

const slideShape = v.object({
  index: v.number(),
  beat: v.number(),
  count: v.number(),
  title: v.string(),
  lines: v.array(v.string()),
  at: v.number(),
});

// The slide the deck is on, or null when the deck hasn't sent one in this class. Anyone can read
// a channel; decide in your own query who should see it.
export const current = query({
  args: { channel: v.string() },
  returns: v.union(slideShape, v.null()),
  handler: async (ctx, { channel }) => {
    const row = await ctx.db
      .query("deckChannels")
      .withIndex("by_channel", (q) => q.eq("channel", channel))
      .unique();
    if (!row) return null;
    // Each press replaces the row, and a replaced row keeps the _creationTime of the first press
    // ever on the channel, so this compares `at` (when this slide came in) with the class's start.
    const start = await deckStart(ctx, channel);
    if (row.at < start) return null;
    return { index: row.index, beat: row.beat, count: row.count, title: row.title, lines: row.lines, at: row.at };
  },
});

const shownShape = v.object({
  index: v.number(),
  beat: v.number(),
  title: v.string(),
  lines: v.array(v.string()),
  at: v.number(),
});

// Every slide the deck has shown in this class, in slide order. Slides not shown yet are left
// out, so a phone can page back but never ahead of the professor, and so are slides shown only
// in an earlier class, and slides only another deck tab pressed (below).
export const slides = query({
  args: { channel: v.string() },
  returns: v.array(shownShape),
  handler: async (ctx, { channel }) => {
    const start = await deckStart(ctx, channel);
    // The tab that sent the live slide. When another deck opens mid-class (deck B at its slide 4
    // after deck A's slides 1 to 6), only the slides B has pressed count, so page-back from B's
    // slide 4 never shows A's slide 3. A deck reopened in a new tab starts over the same way: it
    // shows the slides that tab presses, each at its fullest press (set). With no run on the live
    // slide (an older bridge), every slide from this class counts.
    const live = await ctx.db
      .query("deckChannels")
      .withIndex("by_channel", (q) => q.eq("channel", channel))
      .unique();
    const run = live && live.at >= start ? live.run : undefined;
    // One row per slide number, so this reads every row on the channel. A replaced row keeps its
    // first _creationTime, so this drops the rows whose `at` (when the row last changed) is before
    // the class started.
    const rows = await ctx.db
      .query("deckSlides")
      .withIndex("by_channel_and_index", (q) => q.eq("channel", channel))
      .take(SLIDE_MAX + 1);
    return rows
      .filter((r) => r.at >= start && (run === undefined || r.run === run))
      .map(({ index, beat, title, lines, at }) => ({ index, beat, title, lines, at }));
  },
});

export const set = internalMutation({
  args: {
    channel: v.string(),
    index: v.number(),
    beat: v.number(),
    count: v.number(),
    title: v.string(),
    lines: v.array(v.string()),
    // Which deck tab sent the press, and its place among that tab's sends (public/deck-bridge.js).
    // A deck that loads an older bridge sends neither. Kept only when both come.
    run: v.optional(v.string()),
    seq: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, a) => {
    if (!slideNumbers(a)) {
      throw new ConvexError(`Slide numbers must be whole numbers: index and beat 0 to ${SLIDE_MAX}, count 1 to ${SLIDE_MAX}.`);
    }
    // Presenting starts the class: a press after the last class ended opens a new one.
    const lecture = await ensureLecture(ctx, a.channel);
    const at = Date.now();
    if (notOpenYet(lecture, at)) return null;
    const start = lectureStart(lecture);

    const row = await ctx.db
      .query("deckChannels")
      .withIndex("by_channel", (q) => q.eq("channel", a.channel))
      .unique();
    // A press from this class that left the deck's tab before the one in the row, but got here
    // after it: the room already sees the newer slide, so the live slide doesn't change. When the
    // row is from an earlier class, the press always counts.
    const late =
      row !== null &&
      row.at >= start &&
      a.run !== undefined &&
      a.seq !== undefined &&
      row.run === a.run &&
      row.seq !== undefined &&
      a.seq < row.seq;
    if (!late) {
      const order = a.run !== undefined && a.seq !== undefined ? { run: a.run, seq: a.seq } : {};
      const doc = { channel: a.channel, index: a.index, beat: a.beat, count: a.count, title: a.title, lines: a.lines, at, ...order };
      if (row) await ctx.db.replace("deckChannels", row._id, doc);
      else await ctx.db.insert("deckChannels", doc);
    }

    // For page-back, store the fullest version of each slide shown in this class: going back to a
    // slide shows it from its first press, which must not hide lines the room has already seen.
    // The stored row stays only when this press is an earlier press of that same slide (fullerPress).
    // A row from an earlier class, or a different slide at this number (another deck shown in the
    // same class, or the slide edited since), is replaced whatever its presses. Each row keeps the
    // run of the tab that last pressed that slide, and `slides` shows only the live tab's rows, so
    // a slide number the live deck never pressed doesn't show another deck's slide either. A late
    // press counts here too.
    const shown = await ctx.db
      .query("deckSlides")
      .withIndex("by_channel_and_index", (q) => q.eq("channel", a.channel).eq("index", a.index))
      .unique();
    const run = a.run !== undefined && a.seq !== undefined ? { run: a.run } : {};
    const slide = { channel: a.channel, index: a.index, beat: a.beat, title: a.title, lines: a.lines, at, ...run };
    if (!shown) await ctx.db.insert("deckSlides", slide);
    else if (shown.at < start || !fullerPress(shown, a)) await ctx.db.replace("deckSlides", shown._id, slide);
    else if (run.run !== undefined && shown.run !== run.run) await ctx.db.patch("deckSlides", shown._id, run);
    return null;
  },
});

// A press sends at most 12 lines (POST /deck cuts the rest), so a slide with more shows only its first 12.
const MAX_LINES = 12;

// True when `stored` is a later press of the same slide as `press`: same heading, more presses,
// and every line of `press` is part of a line of `stored` (partOf), in the same order. A press
// reveals text and never takes it away, so an earlier press of a slide shows some of the lines of
// a later one, and a line with a beat inside it shows less of that line. When `stored` has 12
// lines, the lines it reveals can push others past the 12th, so `press` may end with lines
// `stored` cut off, after at least one that matched. Any other slide at that number (another
// deck, or the slide edited) fails this. A deck reopened in a new tab still counts as the same slide.
function fullerPress(stored: { beat: number; title: string; lines: string[] }, press: { beat: number; title: string; lines: string[] }) {
  if (press.beat >= stored.beat || press.title !== stored.title) return false;
  let i = 0;
  for (const line of stored.lines) if (i < press.lines.length && partOf(press.lines[i], line)) i++;
  return i === press.lines.length || (i > 0 && stored.lines.length >= MAX_LINES);
}

// True when `line` is `full` with some words left out: the same words in the same order. A beat
// inside a line (a detail that shows on a later press) adds words to that line.
function partOf(line: string, full: string) {
  if (line === full) return true;
  const want = line.split(" ");
  let i = 0;
  for (const word of full.split(" ")) if (i < want.length && want[i] === word) i++;
  return i === want.length;
}
