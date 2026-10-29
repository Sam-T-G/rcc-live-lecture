// Live slides: small teams of 3 or 4 students and their leaderboard. A student joins a team when
// the teacher scans their pass. Teams open three at a time, each with its own color: the 1st student
// is Red, the 2nd Blue, the 3rd Yellow, then around again until each has the professor's team size;
// then Green, Orange, Purple open, and so on down COLORS (past the last color the list repeats, with a number). A team's score is how many right answers its members gave on
// quizzes the professor has ended (an open quiz counts for nothing, so the board can't leak the
// answer). Every team is ranked; extra credit: 1st place 5, 2nd 3, 3rd 1, the rest 0.
import { mutation, query, type MutationCtx, type QueryCtx } from "../_generated/server";
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

async function teamSize(ctx: QueryCtx, channel: string) {
  const row = await ctx.db.query("groupSettings").withIndex("by_channel", (q) => q.eq("channel", channel)).unique();
  return row?.size === 3 ? 3 : 4;
}

// Give a student a team if they don't have one. The newest three teams are filled evenly, lowest
// number first on a tie, so it deals red, blue, yellow, red...; when all three hold a full team's
// worth, the next three open.
export async function ensureGroup(ctx: MutationCtx, channel: string, user: string): Promise<number> {
  const rows = await ctx.db.query("groups").withIndex("by_channel", (q) => q.eq("channel", channel)).collect();
  const had = rows.find((r) => r.user === user);
  if (had) return had.team;
  const size = await teamSize(ctx, channel);
  const count = new Map<number, number>();
  for (const r of rows) count.set(r.team, (count.get(r.team) ?? 0) + 1);
  const newest = rows.reduce((m, r) => Math.max(m, r.team), 0);
  let first = Math.floor(newest / 3) * 3;
  const batch = [first, first + 1, first + 2];
  if (batch.every((t) => (count.get(t) ?? 0) >= size)) first += 3;
  const open = [first, first + 1, first + 2];
  const pick = open.reduce((best, t) => ((count.get(t) ?? 0) < (count.get(best) ?? 0) ? t : best), open[0]);
  await ctx.db.insert("groups", { channel, user, team: pick });
  return pick;
}

// How many students per team the professor chose: 3 or 4.
export const size = query({
  args: { channel: v.string() },
  returns: v.number(),
  handler: async (ctx, { channel }) => await teamSize(ctx, channel),
});

// A host (or the professor key) picks 3 or 4 students per team. Students already on a team keep it, so set it before class.
export const setSize = mutation({
  args: { key: v.optional(v.string()), channel: v.string(), size: v.number() },
  returns: v.null(),
  handler: async (ctx, { key, channel, size }) => {
    await requireProf(ctx, key); // a Google host, or the professor key
    if (size !== 3 && size !== 4) throw new ConvexError("Pick teams of 3 or 4.");
    const row = await ctx.db.query("groupSettings").withIndex("by_channel", (q) => q.eq("channel", channel)).unique();
    if (row) await ctx.db.patch(row._id, { size });
    else await ctx.db.insert("groupSettings", { channel, size });
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
