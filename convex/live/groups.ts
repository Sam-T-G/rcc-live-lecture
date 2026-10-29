// Live slides: small teams of 3 or 4 students and their leaderboard. A student joins a team when
// the teacher scans their pass. Teams open three at a time, each with its own color: the 1st student
// is Red, the 2nd Blue, the 3rd Yellow, then around again until each has the professor's team size;
// then Green, Orange, Purple open, and so on down COLORS (past the last color the list repeats, with a number). A team's score is how many right answers its members gave on
// quizzes the professor has ended (an open quiz counts for nothing, so the board can't leak the
// answer). Teams lock 5 minutes after class starts: everyone is then re-dealt so every team has 3 or
// 4 students (as near the professor's choice as the class size allows). Every team is ranked; extra credit: 1st place 5, 2nd 3, 3rd 1, the rest 0.
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { ConvexError, v } from "convex/values";
import { requireUser } from "../lib";
import { requireProf } from "../checkin/prof";

// Every team gets its own color, in the order teams open. Each needs a `.group--<name>` style in live.css.
const COLORS = ["red", "blue", "yellow", "green", "orange", "purple", "pink", "teal", "brown", "gray", "navy", "lime"];
const EC = [5, 3, 1];

const color = v.string();
const teamInfo = v.object({ team: v.number(), color, label: v.string() });

function describe(team: number) {
  const c = COLORS[team % COLORS.length];
  const round = Math.floor(team / COLORS.length) + 1;
  return { team, color: c, label: c[0].toUpperCase() + c.slice(1) + (round > 1 ? " " + round : "") };
}

const WINDOW_MS = 5 * 60_000; // teams form for this long, then lock

async function settings(ctx: QueryCtx, channel: string) {
  return await ctx.db.query("groupSettings").withIndex("by_channel", (q) => q.eq("channel", channel)).unique();
}

// When teams lock: 5 minutes after the host's class start, else 5 minutes after the first check-in.
// Null while nobody has checked in and no start is set.
async function lockTime(ctx: QueryCtx, channel: string) {
  const start = await ctx.db.query("classStarts").withIndex("by_channel", (q) => q.eq("channel", channel)).unique();
  if (start) return start.startsAt + WINDOW_MS;
  const first = await ctx.db.query("checkins").withIndex("by_channel", (q) => q.eq("channel", channel)).order("asc").first();
  return first ? first._creationTime + WINDOW_MS : null;
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

// Re-deal everyone who has checked in, in check-in order, across the right number of teams:
// 1st Red, 2nd Blue, 3rd Yellow, 4th Green... around until every team is 3 or 4.
async function rebalance(ctx: MutationCtx, channel: string, size: number) {
  const checkins = await ctx.db.query("checkins").withIndex("by_channel", (q) => q.eq("channel", channel)).collect();
  checkins.sort((a, b) => a.at - b.at);
  const rows = await ctx.db.query("groups").withIndex("by_channel", (q) => q.eq("channel", channel)).collect();
  const byUser = new Map(rows.map((r) => [r.user, r]));
  const t = teamsFor(checkins.length, size);
  for (const [i, c] of checkins.entries()) {
    const had = byUser.get(c.user);
    if (had) {
      if (had.team !== i % t) await ctx.db.patch(had._id, { team: i % t });
    } else await ctx.db.insert("groups", { channel, user: c.user, team: i % t });
  }
}

// Give a student a team if they don't have one. Before the lock, the newest three teams are filled
// evenly, lowest number first on a tie, so it deals red, blue, yellow, red...; when all three hold a
// full team's worth, the next three open. After the lock, a late arrival joins the smallest team that
// has room (under 4); if every team is full they start a new one.
export async function ensureGroup(ctx: MutationCtx, channel: string, user: string): Promise<number> {
  const rows = await ctx.db.query("groups").withIndex("by_channel", (q) => q.eq("channel", channel)).collect();
  const had = rows.find((r) => r.user === user);
  if (had) return had.team;
  const set = await settings(ctx, channel);
  const size = set?.size === 3 ? 3 : 4;
  const count = new Map<number, number>();
  for (const r of rows) count.set(r.team, (count.get(r.team) ?? 0) + 1);
  const newest = rows.reduce((m, r) => Math.max(m, r.team), -1);

  let pick: number;
  if (set?.lockedAt) {
    const open = [...count].filter(([, n]) => n < 4).sort((a, b) => a[1] - b[1] || a[0] - b[0]);
    pick = open.length ? open[0][0] : newest + 1;
  } else {
    let first = Math.floor(Math.max(newest, 0) / 3) * 3;
    if ([first, first + 1, first + 2].every((t) => (count.get(t) ?? 0) >= size)) first += 3;
    const batch = [first, first + 1, first + 2];
    pick = batch.reduce((best, t) => ((count.get(t) ?? 0) < (count.get(best) ?? 0) ? t : best), batch[0]);
  }
  await ctx.db.insert("groups", { channel, user, team: pick });

  // The first student in starts the clock: queue the lock for 5 minutes after class starts.
  if (!set?.lockedAt && !set?.scheduled) {
    const at = (await lockTime(ctx, channel)) ?? Date.now() + WINDOW_MS;
    await ctx.scheduler.runAfter(Math.max(0, at - Date.now()), internal.live.groups.lock, { channel });
    if (set) await ctx.db.patch(set._id, { scheduled: true });
    else await ctx.db.insert("groupSettings", { channel, size, scheduled: true });
  }
  return pick;
}

// Lock the teams once the 5 minutes are up: re-deal everyone so every team has 3 or 4. If the class
// start moved later, wait again. `force` locks now (for testing from the CLI).
export const lock = internalMutation({
  args: { channel: v.string(), force: v.optional(v.boolean()) },
  returns: v.null(),
  handler: async (ctx, { channel, force }) => {
    const set = await settings(ctx, channel);
    if (set?.lockedAt) return null;
    const at = await lockTime(ctx, channel);
    if (!force) {
      if (at === null) return null;
      if (Date.now() < at) {
        await ctx.scheduler.runAfter(at - Date.now(), internal.live.groups.lock, { channel });
        return null;
      }
    }
    const size = set?.size === 3 ? 3 : 4;
    await rebalance(ctx, channel, size);
    if (set) await ctx.db.patch(set._id, { lockedAt: Date.now() });
    else await ctx.db.insert("groupSettings", { channel, size, lockedAt: Date.now() });
    return null;
  },
});

// What the screens need: the professor's team size, whether teams are locked, and when they lock.
export const status = query({
  args: { channel: v.string() },
  returns: v.object({ size: v.number(), locked: v.boolean(), locksAt: v.union(v.null(), v.number()) }),
  handler: async (ctx, { channel }) => {
    const set = await settings(ctx, channel);
    return { size: set?.size === 3 ? 3 : 4, locked: !!set?.lockedAt, locksAt: set?.lockedAt ? null : await lockTime(ctx, channel) };
  },
});

// A host (or the professor key) picks 3 or 4 students per team. Before the lock, students already on
// a team keep it; after the lock, everyone is re-dealt to match the new size.
export const setSize = mutation({
  args: { key: v.optional(v.string()), channel: v.string(), size: v.number() },
  returns: v.null(),
  handler: async (ctx, { key, channel, size }) => {
    await requireProf(ctx, key); // a Google host, or the professor key
    if (size !== 3 && size !== 4) throw new ConvexError("Pick teams of 3 or 4.");
    const set = await settings(ctx, channel);
    if (set) await ctx.db.patch(set._id, { size });
    else await ctx.db.insert("groupSettings", { channel, size });
    if (set?.lockedAt) await rebalance(ctx, channel, size);
    return null;
  },
});

// The signed-in student's team, or null (signed out, or not checked in yet).
export const mine = query({
  args: { channel: v.string() },
  returns: v.union(v.null(), teamInfo),
  handler: async (ctx, { channel }) => {
    const me = await ctx.auth.getUserIdentity();
    if (!me) return null;
    const row = await ctx.db
      .query("groups")
      .withIndex("by_channel_and_user", (q) => q.eq("channel", channel).eq("user", me.tokenIdentifier))
      .unique();
    return row ? describe(row.team) : null;
  },
});

// For a student who checked in before teams existed: deals every team-less check-in a team in check-in order. Checked-in only.
export const join = mutation({
  args: { channel: v.string() },
  returns: v.union(v.null(), teamInfo),
  handler: async (ctx, { channel }) => {
    const me = await requireUser(ctx);
    const here = await ctx.db
      .query("checkins")
      .withIndex("by_channel_and_user", (q) => q.eq("channel", channel).eq("user", me.tokenIdentifier))
      .unique();
    if (!here) return null;
    // Anyone checked in without a team gets one in the order they checked in, not the order
    // they happened to open their phone, so teams still follow attendance.
    const all = await ctx.db.query("checkins").withIndex("by_channel", (q) => q.eq("channel", channel)).collect();
    for (const c of all.sort((a, b) => a.at - b.at)) await ensureGroup(ctx, channel, c.user);
    return describe(await ensureGroup(ctx, channel, me.tokenIdentifier));
  },
});

// Every team, best first: members, right answers, rank, and the extra credit that rank earns.
// Teams level on right answers share the points of the places they fill (two tied for 1st: 4 each).
export const leaderboard = query({
  args: { channel: v.string() },
  returns: v.object({
    questions: v.number(), // ended quizzes counted so far
    teams: v.array(v.object({ team: v.number(), color, label: v.string(), members: v.number(), correct: v.number(), rank: v.number(), ec: v.number() })),
  }),
  handler: async (ctx, { channel }) => {
    const rows = await ctx.db.query("groups").withIndex("by_channel", (q) => q.eq("channel", channel)).collect();
    const teamOf = new Map<string, number>(rows.map((r) => [r.user, r.team]));
    const highest = rows.reduce((m, r) => Math.max(m, r.team), 2); // Red, Blue, Yellow always show
    const members = new Map<number, number>();
    const correct = new Map<number, number>();
    for (const r of rows) members.set(r.team, (members.get(r.team) ?? 0) + 1);

    const polls = await ctx.db.query("polls").withIndex("by_channel", (q) => q.eq("channel", channel)).collect();
    const quizzes = polls.filter((p) => !p.open && p.correct !== undefined && (p.kind ?? "quiz") === "quiz");
    for (const p of quizzes) {
      const answers = await ctx.db.query("pollAnswers").withIndex("by_poll", (q) => q.eq("poll", p._id)).collect();
      for (const a of answers) {
        const t = teamOf.get(a.user);
        if (t !== undefined && a.choice === p.correct) correct.set(t, (correct.get(t) ?? 0) + 1);
      }
    }

    const sorted = Array.from({ length: highest + 1 }, (_, t) => ({
      ...describe(t),
      members: members.get(t) ?? 0,
      correct: correct.get(t) ?? 0,
    })).sort((a, b) => b.correct - a.correct || a.team - b.team);
    const out = sorted.map((g) => {
      const level = sorted.flatMap((x, j) => (x.correct === g.correct ? [j] : []));
      const pts = level.reduce((sum, j) => sum + (EC[j] ?? 0), 0) / level.length;
      return { ...g, rank: level[0] + 1, ec: quizzes.length ? pts : 0 };
    });
    return { questions: quizzes.length, teams: out };
  },
});
