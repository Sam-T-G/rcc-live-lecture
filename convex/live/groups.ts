// Live slides: small teams of students, their points, the leaderboard, and End day.
//
// Dealing. A student joins a team when their pass is scanned (checkin.pass.scan calls
// ensureGroup). Teams open three at a time, each with its own color: the 1st student is Red, the
// 2nd Blue, the 3rd Yellow, then around again until each has the professor's team size (3 or 4);
// then Green, Orange and Purple open, and so on down COLORS (past the last color the list repeats
// with a number: "Red 2").
//
// The lock. Teams lock 5 minutes after class starts or 5 minutes after the class's first
// check-in, whichever is later, so a class whose scanning starts late still gets 5 minutes to
// form. The lock re-deals everyone in check-in order so every team has 3 or 4 (as near the
// professor's choice as the class size allows; under 6 students, one team). After the lock a late
// arrival joins the smallest team: up to 4, then up to 5 once every team has 4, and only when
// every team has 5 does a new team open, with a number no team in this class has had, so it never
// starts with an old team's points.
//
// Points. A team's points are its members' right answers on quizzes the professor ended in this
// class (an open quiz counts for nothing, so the board can't give the answer away, and a vote
// never counts) plus the points the professor added or took off (groupPoints). A change for a
// team stays with that team; a change for a student counts for that student's current team, the
// way their right answers do. When the lock or a new size re-deals a team's students, that team's
// changes become changes for the students who were on it, spread as evenly as whole points allow
// (first checked in first; see splitChanges), so the points follow them to their new teams. Teams rank
// by points per student (points / members, Sam's decision D6), so a team of 3 and a team of 4 that
// answer equally well tie. They rank on that number to one decimal, the way every screen shows it,
// so two teams that both show "1.3 per student" tie. Extra credit: 1st place 5, 2nd 3, 3rd 1, the
// rest 0. Teams with the same points per student share the places they fill (two tied for 1st get
// 4 each). A team with no students, or with 0 points or fewer, gets none, and nobody gets any
// until a quiz ends or the professor changes points in this class.
//
// Classes. Every read here is for the current class (lib.lectureWindow): the groups rows, the
// class's groupSettings row, check-ins, quizzes and point changes made since the class started.
// A student is on a team only while they have a check-in in this class, so a check-in the
// professor removes earns nothing. End day saves each team member's extra credit (groupResults)
// and ends the class, so the next class deals fresh teams and starts from 0 points. A class that
// closes by itself (lectures.close after 12 hours, or lib.ensureLecture finding it open past its
// close time) saves the same rows first (saveExtraCredit). The team size
// carries over to the next class. A lock job carries the class it was queued for and does nothing
// once that class is over.
//
// Functions. channel is the deck channel ("gdg"). No function returns a student's `user` (their
// sign-in id, which holds the email); the professor's lists name a student by their checkins row.
//
//   Anyone (the phone card, #/live/leaderboard, #/host):
//   api.live.groups.status       { channel } -> { size, locked, locksAt }
//       size 3 or 4. locksAt: when the teams lock (ms), or null once locked, or while nobody is
//       checked in and either no start time is saved or its lock time has passed (the teams
//       then lock 5 minutes after the first check-in).
//   api.live.groups.leaderboard  { channel } -> { questions, teams }
//       questions: quizzes ended in this class. teams, best first: [{ team, color, label,
//       members, correct, changes, points, perStudent, rank, ec }]. correct: right answers;
//       changes: the professor's changes; points = correct + changes; perStudent = points /
//       members; rank 1 is first, shared by teams whose perStudent is the same to one
//       decimal; ec is the extra credit that place earns (it can be a fraction, like 4 / 3 for
//       three teams tied for 2nd). Teams with no students come last with ec 0.
//   api.live.groups.mine         { channel } -> null | { team, color, label }   the signed-in student's team
//   api.live.groups.join         { channel } -> null | { team, color, label }   checked-in students
//       Deals every check-in in this class that has no team yet, in check-in order.
//
//   Professors and admins (requireProf), for #/host Points and the teacher page:
//   api.live.groups.setSize      { channel, size } -> null
//       3 or 4 ("Pick teams of 3 or 4."). The size already set changes nothing; after the lock a
//       new size re-deals everyone.
//   api.live.groups.roster       { channel } -> [{ checkin, name, email, team, right, answered,
//                                  changes, points, ec }]
//       Every student checked in to this class, by points, then right answers, then name.
//       right, answered, changes and points are this class's; ec is all the extra credit End day
//       saved for that student on this channel. team is null for a student with no team.
//   api.live.groups.adjust       { channel, team? | checkin?, delta, reason? } -> Id<"groupPoints">
//       Exactly one of team (its number) or checkin (a checkins row id from roster). delta: a
//       whole number from 1 to 5 points, or -1 to -5. reason: up to 80 characters; "Bonus" or
//       "Deduction" when left out.
//   api.live.groups.removePoints { id } -> null
//       Undo: deletes a change from this class. A missing id does nothing; a change from a class
//       that has ended is refused ("That class has ended.").
//   api.live.groups.pointLog     { channel } -> [{ id, at, delta, reason, team, name }]
//       This class's changes, newest first, at most 200. team: the team's, or the student's
//       current team; name: the student's name (null for a team change).
//   api.live.groups.endDay       { channel } -> the line to show
//       Refused while a quiz or vote is open ("End the open question first."). Saves extra credit
//       and ends the class; "No class is running." when no class is open.
//   api.live.groups.results      { channel, lecture?, paginationOpts } -> { page: [{ lecture,
//                                  endedAt, name, email, team, rank, points, ec }], isDone,
//                                  continueCursor }
//       The extra credit saved when classes ended: one row per student per class (one class with
//       `lecture`), at most 200 rows a page, for the CSV, which reads every page.
//
//   Internal: internal.live.groups.lock { channel, force?, lecture? }, queued by ensureGroup and
//   by checkin.attendance.setClassStart.
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { ConvexError, v, type Infer } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { endLecture, lectureWindow, requireUser, type LectureWindow } from "../lib";
import { requireProf } from "../checkin/prof";

type Ctx = QueryCtx | MutationCtx;

// Every team gets its own color, in the order teams open. Each needs a `.group--<name>` style in live.css.
const COLORS = ["red", "blue", "yellow", "green", "orange", "purple", "pink", "teal", "brown", "gray", "navy", "lime"];
const EC = [5, 3, 1];

const WINDOW_MS = 5 * 60_000; // teams form for this long, then lock
const MOST = 5; // after the lock, a new team opens only when every team has this many
const MAX_DELTA = 5; // a point change is 1 to 5 points either way
const REASON_MAX = 80;
// A row's _creationTime can come a little before the Date.now() of the mutation that wrote it
// (lib.lectureStart), so status treats a lock time up to this long after an empty lock's row as
// the one that lock found empty.
const MARK_SLACK_MS = 1_000;

const color = v.string();
// A team as the screens show it: its number, its color (a `.group--<color>` style) and its label.
export const teamInfo = v.object({ team: v.number(), color, label: v.string() });

// Team number -> { team, color, label }: 0 is Red, 1 Blue, 2 Yellow; past the last color, "Red 2".
export function describe(team: number) {
  const c = COLORS[team % COLORS.length];
  const round = Math.floor(team / COLORS.length) + 1;
  return { team, color: c, label: c[0].toUpperCase() + c.slice(1) + (round > 1 ? " " + round : "") };
}

// How many teams to split `n` students into so every team has 3 or 4, as near `size` as possible.
// Under 6 students that can't be done, so they stay together on one team.
export function teamsFor(n: number, size: number) {
  const lo = Math.ceil(n / 4);
  const hi = Math.floor(n / 3);
  if (lo > hi) return Math.max(1, hi);
  let best = lo;
  for (let t = lo; t <= hi; t++) if (Math.abs(n / t - size) < Math.abs(n / best - size)) best = t;
  return best;
}

// ---------- This class's rows ----------

// This class's check-ins, first in first, one per student (their first, if a student has more).
async function classCheckins(ctx: Ctx, channel: string, start: number): Promise<Doc<"checkins">[]> {
  const rows = await ctx.db
    .query("checkins")
    .withIndex("by_channel", (q) => q.eq("channel", channel).gte("_creationTime", start))
    .collect();
  rows.sort((a, b) => a.at - b.at || a._creationTime - b._creationTime);
  const seen = new Set<string>();
  const out: Doc<"checkins">[] = [];
  for (const r of rows) {
    if (seen.has(r.user)) continue;
    seen.add(r.user);
    out.push(r);
  }
  return out;
}

// The class's first check-in, or null before anyone checks in.
async function firstCheckin(ctx: Ctx, channel: string, start: number) {
  return await ctx.db
    .query("checkins")
    .withIndex("by_channel", (q) => q.eq("channel", channel).gte("_creationTime", start))
    .first();
}

// This class's groups rows by student (their first, if a student has more).
async function classGroups(ctx: Ctx, channel: string, start: number): Promise<Map<string, Doc<"groups">>> {
  const rows = await ctx.db
    .query("groups")
    .withIndex("by_channel", (q) => q.eq("channel", channel).gte("_creationTime", start))
    .collect();
  const byUser = new Map<string, Doc<"groups">>();
  for (const r of rows) if (!byUser.has(r.user)) byUser.set(r.user, r);
  return byUser;
}

type Settings = { row: Doc<"groupSettings"> | null; size: 3 | 4 };

// This class's groupSettings row (null until the class needs one) and the team size: the newest
// row's, so the professor's choice carries over from the class before, else 4.
async function classSettings(ctx: Ctx, channel: string, start: number): Promise<Settings> {
  const newest = await ctx.db
    .query("groupSettings")
    .withIndex("by_channel", (q) => q.eq("channel", channel))
    .order("desc")
    .first();
  return { row: newest && newest._creationTime >= start ? newest : null, size: newest?.size === 3 ? 3 : 4 };
}

// When this class's teams lock: 5 minutes after class starts or after the first check-in,
// whichever is later. Null with no start time and nobody checked in.
function lockTime(win: LectureWindow, first: Doc<"checkins"> | null) {
  const times = [win.startsAt, first?.at].filter((t): t is number => typeof t === "number");
  return times.length ? Math.max(...times) + WINDOW_MS : null;
}

const lockArgs = (channel: string, lecture: Id<"lectures"> | null | undefined) => (lecture ? { channel, lecture } : { channel });

// ---------- Dealing ----------

// Students per team, counting only students checked in to this class.
function memberCounts(teamOf: Map<string, number>, here: Set<string>) {
  const count = new Map<number, number>();
  for (const [user, team] of teamOf) if (here.has(user)) count.set(team, (count.get(team) ?? 0) + 1);
  return count;
}

// The team for the next student. Before the lock the newest three teams fill evenly, lowest
// number first on a tie, so it deals Red, Blue, Yellow, Red...; when all three hold `size`, the
// next three open. After the lock the smallest team takes them, lowest number first on a tie, so
// teams fill to 4 first, then to 5; when every team has MOST, team `next` opens (see nextTeam).
function pickTeam(count: Map<number, number>, locked: boolean, size: number, next: number): number {
  const teams = [...count.entries()];
  if (locked) {
    if (teams.length === 0) return next;
    const [smallest, n] = teams.sort((a, b) => a[1] - b[1] || a[0] - b[0])[0];
    return n < MOST ? smallest : next;
  }
  const newest = teams.reduce((m, [t]) => Math.max(m, t), -1);
  let first = Math.floor(Math.max(newest, 0) / 3) * 3;
  if ([first, first + 1, first + 2].every((t) => (count.get(t) ?? 0) >= size)) first += 3;
  const batch = [first, first + 1, first + 2];
  return batch.reduce((best, t) => ((count.get(t) ?? 0) < (count.get(best) ?? 0) ? t : best), batch[0]);
}

// This class's point changes, oldest first.
async function classChanges(ctx: Ctx, channel: string, start: number): Promise<Doc<"groupPoints">[]> {
  return await ctx.db
    .query("groupPoints")
    .withIndex("by_channel", (q) => q.eq("channel", channel).gte("_creationTime", start))
    .collect();
}

// The number a new team gets after the lock: one past every team dealt in this class (students
// who left included) or given a change, so a new team never starts with an emptied team's points.
async function nextTeam(ctx: Ctx, channel: string, start: number, groups: Map<string, Doc<"groups">>) {
  const used = [...[...groups.values()].map((g) => g.team), ...(await classChanges(ctx, channel, start)).map((c) => c.team ?? -1)];
  return used.reduce((m, t) => Math.max(m, t), -1) + 1;
}

// The first student dealt in a class queues the lock and marks the class's settings row
// `scheduled`, so it's queued once per class.
async function queueLock(ctx: MutationCtx, channel: string, win: LectureWindow, set: Settings) {
  if (set.row?.lockedAt || set.row?.scheduled) return;
  const at = lockTime(win, await firstCheckin(ctx, channel, win.start)) ?? Date.now() + WINDOW_MS;
  await ctx.scheduler.runAfter(Math.max(0, at - Date.now()), internal.live.groups.lock, lockArgs(channel, win.lecture));
  if (set.row) await ctx.db.patch("groupSettings", set.row._id, { scheduled: true });
  else await ctx.db.insert("groupSettings", { channel, size: set.size, scheduled: true });
}

// Re-deal everyone checked in to this class, in check-in order, across the right number of
// teams: 1st Red, 2nd Blue, 3rd Yellow, 4th Green... around until every team has 3 or 4.
async function rebalance(ctx: MutationCtx, channel: string, start: number, size: number) {
  const checkins = await classCheckins(ctx, channel, start);
  const groups = await classGroups(ctx, channel, start);
  const t = teamsFor(checkins.length, size);
  await splitChanges(ctx, channel, start, checkins, groups, t);
  for (const [i, c] of checkins.entries()) {
    const had = groups.get(c.user);
    if (!had) await ctx.db.insert("groups", { channel, user: c.user, team: i % t });
    else if (had.team !== i % t) await ctx.db.patch("groups", had._id, { team: i % t });
  }
}

// Before a re-deal into `t` teams (the i-th check-in to team i % t): every change for a team whose
// students the re-deal changes becomes changes for the students on that team now (checked in to
// this class), with the same reason and time, so the points stay with the students who earned
// them, the way their right answers do. A team's changes are spread one point at a time, oldest
// change first: a point added goes to the student who has the fewest of that team's points so far,
// a point taken off to the one who has the most, first checked in first on a tie. So three +1s on
// a team of 3 give each student 1, and +2 then -1 leaves 1 with one student. A team the re-deal
// leaves with the same students keeps its changes as they are. A team with no students left keeps
// its changes too; they count for nobody while nobody is on it.
async function splitChanges(
  ctx: MutationCtx,
  channel: string,
  start: number,
  checkins: Doc<"checkins">[],
  groups: Map<string, Doc<"groups">>,
  t: number,
) {
  const before = new Map<number, string[]>(); // each team's students now, first checked in first
  const after = new Map<number, string[]>(); // the same after the re-deal
  for (const [i, k] of checkins.entries()) {
    const team = groups.get(k.user)?.team;
    if (team !== undefined) before.set(team, [...(before.get(team) ?? []), k.user]);
    after.set(i % t, [...(after.get(i % t) ?? []), k.user]);
  }
  const given = new Map<number, number[]>(); // each split team's points so far, per student
  for (const c of await classChanges(ctx, channel, start)) {
    if (c.team === undefined) continue;
    const members = before.get(c.team) ?? [];
    if (members.length === 0) continue;
    const stays = after.get(c.team) ?? [];
    if (stays.length === members.length && members.every((u, j) => stays[j] === u)) continue;
    const got = given.get(c.team) ?? members.map(() => 0);
    given.set(c.team, got);
    const share = members.map(() => 0);
    const step = Math.sign(c.delta);
    for (let n = 0; n < Math.abs(c.delta); n++) {
      let pick = 0;
      for (let j = 1; j < members.length; j++) if (step > 0 ? got[j] < got[pick] : got[j] > got[pick]) pick = j;
      got[pick] += step;
      share[pick] += step;
    }
    for (const [j, user] of members.entries())
      if (share[j] !== 0) await ctx.db.insert("groupPoints", { channel, user, delta: share[j], reason: c.reason, at: c.at });
    await ctx.db.delete("groupPoints", c._id);
  }
}

// Give a student a team in this class if they don't have one, and return it. The caller has just
// checked them in (checkin.pass.scan).
export async function ensureGroup(ctx: MutationCtx, channel: string, user: string): Promise<number> {
  const win = await lectureWindow(ctx, channel);
  const groups = await classGroups(ctx, channel, win.start);
  const had = groups.get(user);
  if (had) return had.team;
  const set = await classSettings(ctx, channel, win.start);
  const here = new Set((await classCheckins(ctx, channel, win.start)).map((c) => c.user));
  const teamOf = new Map([...groups].map(([u, g]) => [u, g.team]));
  const locked = !!set.row?.lockedAt;
  const next = locked ? await nextTeam(ctx, channel, win.start, groups) : 0;
  const team = pickTeam(memberCounts(teamOf, here), locked, set.size, next);
  await ctx.db.insert("groups", { channel, user, team });
  await queueLock(ctx, channel, win, set);
  return team;
}

// Lock the teams once their time comes: re-deal everyone checked in so every team has 3 or 4. If
// the class start moved later, wait again. A job queued for a class that has ended does nothing;
// one with no lecture (queued before classes existed) acts on the open class. Nobody checked in
// yet (a start time and no check-in, or the class's only check-ins removed): the teams stay open
// and the `scheduled` mark is cleared, so the next check-in queues the lock again. `force` locks
// now (for testing from the CLI).
export const lock = internalMutation({
  args: { channel: v.string(), force: v.optional(v.boolean()), lecture: v.optional(v.id("lectures")) },
  returns: v.null(),
  handler: async (ctx, { channel, force, lecture }) => {
    const win = await lectureWindow(ctx, channel);
    if (lecture && lecture !== win.lecture) return null;
    const set = await classSettings(ctx, channel, win.start);
    if (set.row?.lockedAt) return null;
    const first = await firstCheckin(ctx, channel, win.start);
    if (!force) {
      const at = lockTime(win, first);
      if (at !== null && Date.now() < at) {
        await ctx.scheduler.runAfter(at - Date.now(), internal.live.groups.lock, lockArgs(channel, lecture ?? win.lecture));
        return null;
      }
      if (!first) {
        // scheduled: false also tells status the lock time has passed with nobody here, so the
        // screens stop showing it. The row is written fresh, so its _creationTime says when this
        // lock found nobody: a start saved later whose lock comes after that shows again.
        if (set.row) await ctx.db.delete("groupSettings", set.row._id);
        await ctx.db.insert("groupSettings", { channel, size: set.size, scheduled: false });
        return null;
      }
    }
    await rebalance(ctx, channel, win.start, set.size);
    if (set.row) await ctx.db.patch("groupSettings", set.row._id, { lockedAt: Date.now() });
    else await ctx.db.insert("groupSettings", { channel, size: set.size, lockedAt: Date.now() });
    return null;
  },
});

// What the screens need: the team size, whether this class's teams are locked, and when they lock.
// A lock that came due with nobody checked in wrote a fresh settings row (scheduled: false); then,
// until the first check-in, locksAt is null for a lock time at or before that row was written, so
// no screen shows a lock time that has passed. A start saved after that, whose lock comes later,
// shows its lock time (checkin.attendance.setClassStart queued that lock).
export const status = query({
  args: { channel: v.string() },
  returns: v.object({ size: v.number(), locked: v.boolean(), locksAt: v.union(v.null(), v.number()) }),
  handler: async (ctx, { channel }) => {
    const win = await lectureWindow(ctx, channel);
    const set = await classSettings(ctx, channel, win.start);
    const locked = !!set.row?.lockedAt;
    if (locked) return { size: set.size, locked, locksAt: null };
    const first = await firstCheckin(ctx, channel, win.start);
    const at = lockTime(win, first);
    const passed = !first && set.row?.scheduled === false && (at === null || at <= set.row._creationTime + MARK_SLACK_MS);
    return { size: set.size, locked, locksAt: passed ? null : at };
  },
});

// A professor or admin picks 3 or 4 students per team. Before the lock, students already on a
// team keep it; after the lock, everyone is re-dealt to match the new size. The size already set
// changes nothing, so a second tap never reshuffles the class.
export const setSize = mutation({
  args: { channel: v.string(), size: v.number() },
  returns: v.null(),
  handler: async (ctx, { channel, size }) => {
    await requireProf(ctx);
    if (size !== 3 && size !== 4) throw new ConvexError("Pick teams of 3 or 4.");
    const win = await lectureWindow(ctx, channel);
    const set = await classSettings(ctx, channel, win.start);
    if (set.size === size) return null;
    if (set.row) await ctx.db.patch("groupSettings", set.row._id, { size });
    else await ctx.db.insert("groupSettings", { channel, size });
    if (set.row?.lockedAt) await rebalance(ctx, channel, win.start, size);
    return null;
  },
});

// The signed-in student's team in this class, or null (signed out, not checked in to this class,
// or no team yet).
export const mine = query({
  args: { channel: v.string() },
  returns: v.union(v.null(), teamInfo),
  handler: async (ctx, { channel }) => {
    const me = await ctx.auth.getUserIdentity();
    if (!me) return null;
    const { start } = await lectureWindow(ctx, channel);
    const here = await ctx.db
      .query("checkins")
      .withIndex("by_channel_and_user", (q) => q.eq("channel", channel).eq("user", me.tokenIdentifier).gte("_creationTime", start))
      .first();
    if (!here) return null;
    const row = await ctx.db
      .query("groups")
      .withIndex("by_channel_and_user", (q) => q.eq("channel", channel).eq("user", me.tokenIdentifier).gte("_creationTime", start))
      .first();
    return row ? describe(row.team) : null;
  },
});

// For a student checked in before their team was dealt: deals every check-in in this class that
// has no team yet, in check-in order (not the order phones happen to open), and returns the
// caller's team. Null when the caller isn't checked in to this class.
export const join = mutation({
  args: { channel: v.string() },
  returns: v.union(v.null(), teamInfo),
  handler: async (ctx, { channel }) => {
    const me = await requireUser(ctx);
    const win = await lectureWindow(ctx, channel);
    const checkins = await classCheckins(ctx, channel, win.start);
    if (!checkins.some((c) => c.user === me.tokenIdentifier)) return null;
    const groups = await classGroups(ctx, channel, win.start);
    const teamOf = new Map([...groups].map(([u, g]) => [u, g.team]));
    const set = await classSettings(ctx, channel, win.start);
    const locked = !!set.row?.lockedAt;
    const count = memberCounts(teamOf, new Set(checkins.map((c) => c.user)));
    let next = locked && checkins.some((c) => !teamOf.has(c.user)) ? await nextTeam(ctx, channel, win.start, groups) : 0;
    let dealt = false;
    for (const c of checkins) {
      if (teamOf.has(c.user)) continue;
      const team = pickTeam(count, locked, set.size, next);
      await ctx.db.insert("groups", { channel, user: c.user, team });
      teamOf.set(c.user, team);
      count.set(team, (count.get(team) ?? 0) + 1);
      next = Math.max(next, team + 1);
      dealt = true;
    }
    if (dealt) await queueLock(ctx, channel, win, set);
    return describe(teamOf.get(me.tokenIdentifier)!);
  },
});

// ---------- Scoring ----------

const teamScore = v.object({
  team: v.number(),
  color,
  label: v.string(),
  members: v.number(), // students on the team who are checked in to this class
  correct: v.number(), // their right answers on quizzes ended in this class
  changes: v.number(), // points the professor added (or took off, below 0) in this class
  points: v.number(), // correct + changes
  perStudent: v.number(), // points / members; 0 for a team with no students
  rank: v.number(), // 1 is first; teams with the same perStudent to one decimal share a rank; teams with no students come last
  ec: v.number(), // extra credit for that place
});
type TeamScore = Infer<typeof teamScore>;

type StudentScore = { right: number; answered: number; changes: number };

export type ClassScores = {
  win: LectureWindow;
  checkins: Doc<"checkins">[]; // this class's, first in first, one per student
  teamOf: Map<string, number>; // each checked-in student's team (students with no team left out)
  students: Map<string, StudentScore>; // by user, every checked-in student
  quizzes: number; // ended quizzes with a right answer
  changes: number; // groupPoints rows in this class
  openPoll: boolean; // a quiz or vote in this class is still open
  teams: TeamScore[]; // best first
};

// Points per student in tenths, the figure every screen shows (perStudent.toFixed(1), halves
// away from zero the way toFixed rounds them). Teams rank and tie on it, so a team never places
// above another that shows the same number. 0 for a team with no students.
export function tenths(points: number, members: number) {
  if (!members) return 0;
  const t = Math.round((Math.abs(points) * 10) / members);
  return points < 0 ? -t : t;
}
const shown = (g: TeamScore) => tenths(g.points, g.members);

// The scores for this class: one helper for leaderboard, roster and endDay, so the board, the
// professor's list and the saved extra credit always agree.
export async function scoreDay(ctx: Ctx, channel: string): Promise<ClassScores> {
  const win = await lectureWindow(ctx, channel);
  const checkins = await classCheckins(ctx, channel, win.start);
  const groups = await classGroups(ctx, channel, win.start);
  const students = new Map<string, StudentScore>(checkins.map((c) => [c.user, { right: 0, answered: 0, changes: 0 }]));
  const teamOf = new Map<string, number>();
  for (const c of checkins) {
    const g = groups.get(c.user);
    if (g) teamOf.set(c.user, g.team);
  }
  const add = (m: Map<number, number>, team: number | undefined, by: number) => {
    if (team !== undefined) m.set(team, (m.get(team) ?? 0) + by);
  };
  const members = new Map<number, number>();
  const correct = new Map<number, number>();
  const changed = new Map<number, number>();
  for (const team of teamOf.values()) add(members, team, 1);

  const polls = await ctx.db
    .query("polls")
    .withIndex("by_channel", (q) => q.eq("channel", channel).gte("_creationTime", win.start))
    .collect();
  let quizzes = 0;
  let openPoll = false;
  for (const p of polls) {
    if (p.open) {
      openPoll = true;
      continue;
    }
    const quiz = (p.kind ?? "quiz") === "quiz" && p.correct !== undefined;
    if (quiz) quizzes++;
    const answers = await ctx.db
      .query("pollAnswers")
      .withIndex("by_poll", (q) => q.eq("poll", p._id))
      .collect();
    for (const a of answers) {
      const s = students.get(a.user);
      if (!s) continue; // not checked in to this class
      s.answered++;
      if (quiz && a.choice === p.correct) {
        s.right++;
        add(correct, teamOf.get(a.user), 1);
      }
    }
  }

  const changes = await classChanges(ctx, channel, win.start);
  for (const c of changes) {
    if (c.team !== undefined) add(changed, c.team, c.delta);
    else if (c.user !== undefined) {
      const s = students.get(c.user);
      if (s) s.changes += c.delta;
      add(changed, teamOf.get(c.user), c.delta);
    }
  }

  // Every team dealt in this class or given a change, Red, Blue and Yellow first, so no change
  // pointLog lists is left off the board. Teams with students are ranked; the rest come after them.
  const highest = [...[...groups.values()].map((g) => g.team), ...changed.keys()].reduce((m, t) => Math.max(m, t), -1);
  const all = Array.from({ length: highest + 1 }, (_, team) => {
    const n = members.get(team) ?? 0;
    const right = correct.get(team) ?? 0;
    const change = changed.get(team) ?? 0;
    return { ...describe(team), members: n, correct: right, changes: change, points: right + change, perStudent: n ? (right + change) / n : 0, rank: 0, ec: 0 };
  });
  const playing = all.filter((g) => g.members > 0).sort((a, b) => shown(b) - shown(a) || a.team - b.team);
  const anything = quizzes > 0 || changes.length > 0;
  const teams: TeamScore[] = [];
  for (let i = 0; i < playing.length; ) {
    let j = i;
    while (j + 1 < playing.length && shown(playing[i]) === shown(playing[j + 1])) j++;
    const share = EC.slice(i, j + 1).reduce((sum, x) => sum + x, 0) / (j - i + 1);
    for (let k = i; k <= j; k++) teams.push({ ...playing[k], rank: i + 1, ec: anything && playing[k].points > 0 ? share : 0 });
    i = j + 1;
  }
  for (const g of all) if (g.members === 0) teams.push({ ...g, rank: playing.length + 1 });
  return { win, checkins, teamOf, students, quizzes, changes: changes.length, openPoll, teams };
}

// Every team, best first: students, right answers, the professor's changes, points per student,
// rank, and the extra credit that rank earns.
export const leaderboard = query({
  args: { channel: v.string() },
  returns: v.object({
    questions: v.number(), // quizzes ended in this class
    teams: v.array(teamScore),
  }),
  handler: async (ctx, { channel }) => {
    const s = await scoreDay(ctx, channel);
    return { questions: s.quizzes, teams: s.teams };
  },
});

// ---------- The professor's Points tab ----------

// Every student checked in to this class with their team and points. Professors only.
export const roster = query({
  args: { channel: v.string() },
  returns: v.array(
    v.object({
      checkin: v.id("checkins"),
      name: v.string(),
      email: v.union(v.null(), v.string()),
      team: v.union(v.null(), teamInfo),
      right: v.number(), // right answers on quizzes ended in this class
      answered: v.number(), // quizzes and votes ended in this class that they answered
      changes: v.number(), // the professor's changes for this student in this class
      points: v.number(), // right + changes
      ec: v.number(), // extra credit End day saved for them on this channel, every class
    }),
  ),
  handler: async (ctx, { channel }) => {
    await requireProf(ctx);
    const s = await scoreDay(ctx, channel);
    // Only this class's students' rows, so the read stays the size of the class.
    const saved = new Map<string, number>();
    for (const c of s.checkins) saved.set(c.user, await savedTotal(ctx, channel, c.user));
    const rows = s.checkins.map((c) => {
      const me = s.students.get(c.user) ?? { right: 0, answered: 0, changes: 0 };
      const team = s.teamOf.get(c.user);
      return {
        checkin: c._id,
        name: c.name,
        email: c.email ?? null,
        team: team === undefined ? null : describe(team),
        right: me.right,
        answered: me.answered,
        changes: me.changes,
        points: me.right + me.changes,
        ec: saved.get(c.user) ?? 0,
      };
    });
    return rows.sort((a, b) => b.points - a.points || b.right - a.right || a.name.localeCompare(b.name));
  },
});

// Control characters and the invisible ones that can hide or flip text, dropped from reasons.
const HIDDEN = /[\p{Cc}\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/gu;

// A reason as it's stored: hidden characters dropped, spaces collapsed, at most 80 characters.
function cleanReason(raw: string | undefined) {
  const text = (raw ?? "").replace(HIDDEN, " ").replace(/\s+/g, " ").trim();
  return Array.from(text).slice(0, REASON_MAX).join("").trim();
}

// The professor adds points to (or takes them off) a team or one student in this class.
export const adjust = mutation({
  args: {
    channel: v.string(),
    team: v.optional(v.number()),
    checkin: v.optional(v.id("checkins")),
    delta: v.number(),
    reason: v.optional(v.string()),
  },
  returns: v.id("groupPoints"),
  handler: async (ctx, { channel, team, checkin, delta, reason }) => {
    await requireProf(ctx);
    if ((team === undefined) === (checkin === undefined)) throw new ConvexError("Pick a team or a student.");
    if (!Number.isInteger(delta) || delta === 0 || Math.abs(delta) > MAX_DELTA) throw new ConvexError("Change points by 1 to 5.");
    const win = await lectureWindow(ctx, channel);
    const row = { channel, delta, reason: cleanReason(reason) || (delta > 0 ? "Bonus" : "Deduction"), at: Date.now() };
    if (checkin !== undefined) {
      const c = await ctx.db.get("checkins", checkin);
      if (!c || c.channel !== channel || c._creationTime < win.start) throw new ConvexError("That student isn't checked in to this class.");
      return await ctx.db.insert("groupPoints", { ...row, user: c.user });
    }
    const here = new Set((await classCheckins(ctx, channel, win.start)).map((c) => c.user));
    const groups = await classGroups(ctx, channel, win.start);
    if (![...groups.values()].some((g) => g.team === team && here.has(g.user))) throw new ConvexError("No team with that number.");
    return await ctx.db.insert("groupPoints", { ...row, team });
  },
});

// Undo one point change from this class.
export const removePoints = mutation({
  args: { id: v.id("groupPoints") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    await requireProf(ctx);
    const row = await ctx.db.get("groupPoints", id);
    if (!row) return null;
    const { start } = await lectureWindow(ctx, row.channel);
    if (row._creationTime < start) throw new ConvexError("That class has ended.");
    await ctx.db.delete("groupPoints", id);
    return null;
  },
});

// This class's point changes, newest first, for the Point changes list with Undo.
export const pointLog = query({
  args: { channel: v.string() },
  returns: v.array(
    v.object({
      id: v.id("groupPoints"),
      at: v.number(),
      delta: v.number(),
      reason: v.string(),
      team: v.union(v.null(), teamInfo),
      name: v.union(v.null(), v.string()),
    }),
  ),
  handler: async (ctx, { channel }) => {
    await requireProf(ctx);
    const win = await lectureWindow(ctx, channel);
    const rows = await ctx.db
      .query("groupPoints")
      .withIndex("by_channel", (q) => q.eq("channel", channel).gte("_creationTime", win.start))
      .order("desc")
      .take(200);
    const checkins = new Map((await classCheckins(ctx, channel, win.start)).map((c) => [c.user, c]));
    const groups = await classGroups(ctx, channel, win.start);
    return rows.map((r) => {
      const who = r.user === undefined ? undefined : checkins.get(r.user);
      const team = r.team ?? (who ? groups.get(who.user)?.team : undefined);
      return { id: r._id, at: r.at, delta: r.delta, reason: r.reason, team: team === undefined ? null : describe(team), name: who?.name ?? null };
    });
  },
});

const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;
const points = (n: number) => plural(n, "point");
// "Red", "Red and Blue", "Red, Blue and Yellow".
const names = (labels: string[]) => (labels.length < 2 ? labels.join("") : `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`);

// The line End day shows the professor.
function endLine(s: ClassScores, credited: number) {
  if (s.quizzes === 0 && s.changes === 0) return "Class ended. No quiz ended, so there is no extra credit to save.";
  const playing = s.teams.filter((g) => g.members > 0);
  if (playing.length === 0) return "Class ended. No team has students, so there is no extra credit to save.";
  if (credited === 0) return "Class ended. No team scored a point, so nobody gets extra credit.";
  const top = playing.filter((g) => g.rank === 1);
  const per = top[0].perStudent.toFixed(1);
  const first =
    top.length === 1
      ? `${top[0].label} came 1st with ${points(top[0].points)}, ${per} per student.`
      : `${names(top.map((g) => g.label))} tied for 1st with ${per} points per student.`;
  return `${first} Saved extra credit for ${plural(credited, "student")}. The next class starts from 0 points.`;
}

// All the extra credit saved for a student on this channel: their newest row's running total. Rows
// saved before the total existed have none; then it adds up that student's rows.
async function savedTotal(ctx: Ctx, channel: string, user: string) {
  const byUser = () => ctx.db.query("groupResults").withIndex("by_channel_and_user", (q) => q.eq("channel", channel).eq("user", user));
  const newest = await byUser().order("desc").first();
  if (!newest) return 0;
  if (newest.total !== undefined) return newest.total;
  return (await byUser().collect()).reduce((sum, r) => sum + r.ec, 0);
}

// Saves each team member's extra credit for the open class (one groupResults row per student on
// a team, with the team's rank, points and extra credit, the same numbers the board shows, plus
// the student's name and email from their check-in and their running total) and returns how many
// students got some. Nothing is saved with no class open, or when no quiz ended and no points
// changed. Call it just before the class ends.
async function saveScores(ctx: MutationCtx, channel: string, s: ClassScores, endedAt: number) {
  const lecture = s.win.lecture;
  if (!lecture || (s.quizzes === 0 && s.changes === 0)) return 0;
  const byTeam = new Map(s.teams.map((g) => [g.team, g]));
  const checkins = new Map(s.checkins.map((c) => [c.user, c]));
  let credited = 0;
  for (const [user, team] of s.teamOf) {
    const g = byTeam.get(team);
    if (!g || g.members === 0) continue;
    const c = checkins.get(user);
    const total = (await savedTotal(ctx, channel, user)) + g.ec;
    await ctx.db.insert("groupResults", { channel, lecture, endedAt, user, name: c?.name, email: c?.email, team, rank: g.rank, points: g.points, ec: g.ec, total });
    if (g.ec > 0) credited++;
  }
  return credited;
}

// The same save for a class that ends without End day: the 12-hour close (lectures.close) and
// lib.ensureLecture's close of a class left open past its close time call it just before they
// set endedAt, with that endedAt and the class they close (nothing is saved when that isn't the
// open class). A quiz still open counts for nothing, the way the board shows it. Returns how many
// students got extra credit.
export async function saveExtraCredit(ctx: MutationCtx, channel: string, endedAt: number, lecture?: Id<"lectures">) {
  const s = await scoreDay(ctx, channel);
  if (lecture && s.win.lecture !== lecture) return 0;
  return await saveScores(ctx, channel, s, endedAt);
}

// End day: saves each team member's extra credit for this class (saveScores) and ends the class.
export const endDay = mutation({
  args: { channel: v.string() },
  returns: v.string(),
  handler: async (ctx, { channel }) => {
    await requireProf(ctx);
    const s = await scoreDay(ctx, channel);
    if (!s.win.lecture) return "No class is running.";
    if (s.openPoll) throw new ConvexError("End the open question first.");
    const credited = await saveScores(ctx, channel, s, Date.now());
    await endLecture(ctx, channel);
    return endLine(s, credited);
  },
});

// Rows results returns per call at most; the CSV reads every page.
const RESULTS_PAGE = 200;

const savedRow = v.object({
  lecture: v.id("lectures"),
  endedAt: v.number(),
  name: v.string(),
  email: v.union(v.null(), v.string()),
  team: teamInfo,
  rank: v.number(),
  points: v.number(), // the team's points in that class
  ec: v.number(),
});

// The extra credit saved when classes ended, one row per student per class, a page at a time
// (at most 200 rows, in the order they were saved), for the professor's CSV. `lecture` limits it
// to one class. Each page is sorted by class, then place, team and name. Professors only.
export const results = query({
  args: { channel: v.string(), lecture: v.optional(v.id("lectures")), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(savedRow),
  handler: async (ctx, { channel, lecture, paginationOpts }) => {
    await requireProf(ctx);
    const opts = { ...paginationOpts, numItems: Math.max(1, Math.min(RESULTS_PAGE, Math.floor(paginationOpts.numItems) || RESULTS_PAGE)) };
    const found = await (lecture
      ? ctx.db.query("groupResults").withIndex("by_channel_and_lecture", (q) => q.eq("channel", channel).eq("lecture", lecture))
      : ctx.db.query("groupResults").withIndex("by_channel", (q) => q.eq("channel", channel))
    ).paginate(opts);
    const page: Infer<typeof savedRow>[] = [];
    for (const r of found.page) {
      // Rows saved before name was kept: the student's newest check-in from before that class ended.
      const c =
        r.name === undefined
          ? await ctx.db
              .query("checkins")
              .withIndex("by_channel_and_user", (q) => q.eq("channel", channel).eq("user", r.user).lte("_creationTime", r.endedAt))
              .order("desc")
              .first()
          : null;
      const name = r.name ?? c?.name ?? "Student";
      const email = r.name !== undefined ? (r.email ?? null) : (c?.email ?? null);
      page.push({ lecture: r.lecture, endedAt: r.endedAt, name, email, team: describe(r.team), rank: r.rank, points: r.points, ec: r.ec });
    }
    page.sort(byClassAndPlace);
    return { ...found, page };
  },
});

// Oldest class first, then place, team number and name: the order the CSV lists saved rows in.
function byClassAndPlace(a: Infer<typeof savedRow>, b: Infer<typeof savedRow>) {
  return a.endedAt - b.endedAt || a.rank - b.rank || a.team.team - b.team.team || a.name.localeCompare(b.name);
}
