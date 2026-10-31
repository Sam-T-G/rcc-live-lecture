// Helpers every server function can use. BLOCKS.md says when to reach for each.
import { ConvexError } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx, MutationCtx } from "./_generated/server";

type Ctx = QueryCtx | MutationCtx;

// The signed-in person, or an error. They signed in by typing a name and email
// (src/blocks/devLogin.ts) or with Google. Use identity.tokenIdentifier as the user key.
export async function requireUser(ctx: Ctx) {
  const me = await ctx.auth.getUserIdentity();
  if (!me) throw new ConvexError("Sign in first.");
  return me;
}

// Hosts (professors, officers) are the Google accounts in the HOST_EMAILS env var,
// comma-separated: `npx convex env set HOST_EMAILS "a@x.com,b@y.com"`. Never in the repo.
export function isHostEmail(email: string | undefined) {
  if (!email) return false;
  const list = (process.env.HOST_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(email.toLowerCase());
}

// A host is a Google account on HOST_EMAILS. Typed sign-in (src/blocks/devLogin.ts) lets
// anyone claim any email, so it never counts as a host; hosts without Google use the
// professor key (convex/checkin/prof.ts).
export function isHostIdentity(me: { issuer: string; email?: string; emailVerified?: boolean } | null) {
  return !!me && me.issuer === "https://accounts.google.com" && me.emailVerified !== false && isHostEmail(me.email);
}

export async function requireHost(ctx: Ctx) {
  const me = await requireUser(ctx);
  if (!isHostIdentity(me))
    throw new ConvexError("Only hosts can do that.");
  return me;
}

// Random string from an alphabet. Works in queries, mutations, and actions.
// For codes people read aloud, leave out look-alikes: "ABCDEFGHJKLMNPQRSTUVWXYZ".
export function randomCode(len: number, alphabet = "abcdefghijklmnopqrstuvwxyz0123456789") {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

// Distance in meters between two points (haversine). Indoor phone GPS is often off by
// 20 to 100 m, so compare against a radius plus the phone's reported accuracy.
export function metersBetween(aLat: number, aLng: number, bLat: number, bLng: number) {
  const r = 6371000;
  const rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad;
  const dLng = (bLng - aLng) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}

// ---------- Classes (the `lectures` table) ----------
// A class runs from the moment ensureLecture opens it until End day (endLecture) or 12 hours
// after it opened or after its saved start time, whichever is later (lectureClosesAt,
// convex/lectures.ts). No other table stores its class: a row belongs to the class whose
// window holds its _creationTime, so a read for this class adds .gte("_creationTime", start) after
// the index's equality fields, for example
//   .withIndex("by_channel_and_user", (q) => q.eq("channel", ch).eq("user", u).gte("_creationTime", start))
// Between classes the window starts where the last class ended, so every per-class read is empty.
// A student has one checkins, groups or lost row per class, so read those with .first(), never
// .unique(): from the second class on there are two, and .unique() throws.

// A class nobody ended closes this long after it opened (or after its saved start time).
export const LECTURE_MS = 12 * 60 * 60_000;

// When a class nobody ends closes itself: 12 hours after it opened, or 12 hours after its saved
// start time when that is later. A class opened the evening before by saving the next morning's
// start then stays open through the morning's class instead of closing in the middle of it.
// Open question for Sam (U0-API-fixcheck-1): a class opened the evening before with no saved start
// (a deck rehearsal, a test scan or quiz) still closes 12 hours after it opened, in the middle of
// the next morning's class, and a start saved the next morning joins that evening class.
export function lectureClosesAt(lecture: Doc<"lectures">) {
  return Math.max(lecture.startedAt, lecture.startsAt ?? lecture.startedAt) + LECTURE_MS;
}

export type LectureWindow = {
  lecture: Id<"lectures"> | null; // the open class; null between classes and before the first one
  start: number; // rows with _creationTime at or after this are in the window
  startsAt: number | null; // when class starts, for late minutes; null = nobody is late
  graceMin: number; // minutes after startsAt before a check-in counts as late
};

// The newest class on the channel, open or ended, or null before the first one.
async function newestLecture(ctx: Ctx, channel: string) {
  return await ctx.db
    .query("lectures")
    .withIndex("by_channel", (q) => q.eq("channel", channel))
    .order("desc")
    .first();
}

// Where a class's rows start: startedAt, or the lectures row's own _creationTime when that is
// earlier. Convex doesn't promise that Date.now() in a mutation is at or before the _creationTime
// of a row the same mutation inserts, and the scan that opens a class also inserts its first
// check-in, which has to count for that class. A past class's rows run from here up to its
// endedAt (for example, for that class's attendance CSV).
export function lectureStart(lecture: Doc<"lectures">) {
  return Math.min(lecture.startedAt, lecture._creationTime);
}

// The current class window on a channel. Open class: from its start, with its own startsAt and
// graceMin. Ended: from its end, with lecture null, so between classes nothing counts. No class
// yet (prod until the first class opens): everything counts (start 0), and the legacy
// classStarts row decides who is late, the way it worked before classes existed.
export async function lectureWindow(ctx: Ctx, channel: string): Promise<LectureWindow> {
  const last = await newestLecture(ctx, channel);
  if (last === null) {
    const legacy = await ctx.db
      .query("classStarts")
      .withIndex("by_channel", (q) => q.eq("channel", channel))
      .order("desc")
      .first();
    return { lecture: null, start: 0, startsAt: legacy?.startsAt ?? null, graceMin: legacy?.graceMin ?? 0 };
  }
  if (last.endedAt !== undefined) return { lecture: null, start: last.endedAt, startsAt: null, graceMin: 0 };
  return { lecture: last._id, start: lectureStart(last), startsAt: last.startsAt ?? null, graceMin: last.graceMin ?? 0 };
}

// The open class on a channel, opening one when none is open. Mutations only. Call it from the
// professor's actions that start class activity (a deck press, a pass scan, a saved start time,
// a quiz), never from a student's: students can't start a class. A new class gets a job that
// closes it 12 hours later (the job waits longer when a saved start time moves lectureClosesAt).
// A class still open past lectureClosesAt (its close job never ran) ends there, and a new one
// opens.
export async function ensureLecture(ctx: MutationCtx, channel: string): Promise<Doc<"lectures">> {
  const now = Date.now();
  const last = await newestLecture(ctx, channel);
  if (last && last.endedAt === undefined) {
    const closesAt = lectureClosesAt(last);
    if (now < closesAt) return last;
    await ctx.db.patch("lectures", last._id, { endedAt: closesAt });
  }
  const id = await ctx.db.insert("lectures", { channel, startedAt: now });
  await ctx.scheduler.runAt(now + LECTURE_MS, internal.lectures.close, { lecture: id, scheduled: true });
  const lecture = await ctx.db.get("lectures", id);
  if (!lecture) throw new Error("ensureLecture: the class it just opened is missing.");
  return lecture;
}

// Ends the open class now (End day) and returns it with its endedAt, or null when no class is
// open. The next class starts from nothing: new check-ins, new teams, an empty board.
export async function endLecture(ctx: MutationCtx, channel: string): Promise<Doc<"lectures"> | null> {
  const last = await newestLecture(ctx, channel);
  if (!last || last.endedAt !== undefined) return null;
  const endedAt = Date.now();
  await ctx.db.patch("lectures", last._id, { endedAt });
  return { ...last, endedAt };
}

// Whether a student has a check-in in the current class window (before the first class ever
// opened: any check-in on the channel). Answers, posts, votes and I'm lost taps need one.
export async function checkedIn(ctx: Ctx, channel: string, user: string): Promise<boolean> {
  const { start } = await lectureWindow(ctx, channel);
  const row = await ctx.db
    .query("checkins")
    .withIndex("by_channel_and_user", (q) => q.eq("channel", channel).eq("user", user).gte("_creationTime", start))
    .first();
  return row !== null;
}

// Names show on shared screens (the late banner on the projector, the professor's lists), so
// they're cut to this many characters.
const NAME_MAX = 60;
// Dropped from names: control characters (C0, DEL, C1) and the invisible characters that could
// hide a name or flip the text after it: the soft hyphen, zero-width space, direction marks, bidi
// embeddings, overrides and isolates, the word joiner and the byte-order mark. Also the
// characters Unicode counts as letters or symbols that draw nothing (the Hangul fillers U+115F,
// U+1160, U+3164 and U+FFA0, the blank Braille pattern U+2800, the usual tricks for a blank name,
// and the musical null notehead U+1D159) and the combining grapheme joiner. The zero-width joiner (U+200D) stays, because emoji
// made of several emoji (a family, a person at a laptop) are joined with it, and so do tag
// characters, which spell out flags such as Scotland's. U+034F, U+115F and U+1160 sit outside the
// brackets because they join the character before them, which lint flags inside a class.
const HIDDEN = /\u034F|\u115F|\u1160|[\p{Cc}\u00AD\u061C\u180E\u200B\u200E\u200F\u202A-\u202E\u2060-\u206F\u2800\u3164\uFEFF\uFFA0\u{1D159}]/gu;
// What's left has to hold at least one letter, digit, punctuation mark or symbol, so a name never
// shows as a blank on the projector.
const VISIBLE = /[\p{L}\p{N}\p{P}\p{S}]/u;

// A name that's safe to store and show: spaces collapsed, control characters dropped, at most 60
// characters, and never an email address. A name that is one email-looking word becomes the part
// before the "@" ("jane.doe@example.edu" -> "jane.doe"); in a longer name, words with an "@" are
// dropped. `fallback` when nothing visible is left.
export function cleanName(raw: string | null | undefined, fallback = "Student") {
  const words = (raw ?? "")
    .split(/\s+/)
    .map((w) => w.replace(HIDDEN, ""))
    .filter(Boolean);
  const kept = words.length === 1 ? [words[0].split("@")[0]] : words.filter((w) => !w.includes("@"));
  const name = Array.from(kept.join(" ")).slice(0, NAME_MAX).join("").trim();
  return VISIBLE.test(name) ? name : fallback;
}
