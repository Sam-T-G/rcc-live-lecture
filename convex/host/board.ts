// Scores for the professor: the three teams, every student, and who is missing the point.
// A student's points are their answers plus any manual changes (pointEvents).
import { v } from "convex/values";
import { query } from "../_generated/server";
import type { QueryCtx } from "../_generated/server";
import { requireProf } from "../checkin/prof";
import { TEAMS, dayStartFor, saltFor, teamOf, teamValidator } from "./teams";
import type { Team } from "./teams";

export type RosterRow = { user: string; name: string; team: Team; today: number; total: number; right: number; answered: number };

// Everyone who checked in or answered, with points. Names stay on the server side of a host check.
export async function buildRoster(ctx: QueryCtx, channel: string): Promise<RosterRow[]> {
  const salt = await saltFor(ctx, channel);
  const dayStart = await dayStartFor(ctx, channel);
  const rows = new Map<string, RosterRow>();
  const row = (user: string, name: string) => {
    let r = rows.get(user);
    if (!r) rows.set(user, (r = { user, name, team: teamOf(user, salt), today: 0, total: 0, right: 0, answered: 0 }));
    return r;
  };
  for (const c of await ctx.db.query("checkins").withIndex("by_channel", (q) => q.eq("channel", channel)).collect()) row(c.user, c.name);
  const questions = await ctx.db.query("quizQuestions").withIndex("by_channel", (q) => q.eq("channel", channel)).collect();
  for (const question of questions) {
    for (const a of await ctx.db.query("answers").withIndex("by_question", (q) => q.eq("questionId", question._id)).collect()) {
      const r = row(a.user, a.name);
      r.total += a.points;
      if (a.at >= dayStart) r.today += a.points;
      r.answered++;
      if (a.correct) r.right++;
    }
  }
  for (const e of await ctx.db.query("pointEvents").withIndex("by_channel", (q) => q.eq("channel", channel)).collect()) {
    const r = row(e.user, e.name);
    r.total += e.delta;
    if (e.at >= dayStart) r.today += e.delta;
  }
  return [...rows.values()];
}

const rosterShape = v.object({
  user: v.string(),
  name: v.string(),
  team: teamValidator,
  today: v.number(),
  total: v.number(),
  right: v.number(),
  answered: v.number(),
});

export const teams = query({
  args: { key: v.optional(v.string()), channel: v.string() },
  returns: v.array(v.object({ team: teamValidator, students: v.number(), today: v.number(), total: v.number() })),
  handler: async (ctx, { key, channel }) => {
    await requireProf(ctx, key);
    const roster = await buildRoster(ctx, channel);
    return TEAMS.map((team) => {
      const mine = roster.filter((r) => r.team === team);
      return { team, students: mine.length, today: mine.reduce((n, r) => n + r.today, 0), total: mine.reduce((n, r) => n + r.total, 0) };
    }).sort((a, b) => b.today - a.today || b.total - a.total);
  },
});

// Every student, best first. The professor's roster and the leaderboard both read this.
export const students = query({
  args: { key: v.optional(v.string()), channel: v.string(), limit: v.optional(v.number()) },
  returns: v.array(rosterShape),
  handler: async (ctx, { key, channel, limit = 200 }) => {
    await requireProf(ctx, key);
    const roster = await buildRoster(ctx, channel);
    return roster.sort((a, b) => b.total - a.total || b.right - a.right || a.name.localeCompare(b.name)).slice(0, Math.max(1, Math.min(limit, 500)));
  },
});

// Students who got the newest question wrong, and what they picked.
export const missing = query({
  args: { key: v.optional(v.string()), channel: v.string() },
  returns: v.array(v.object({ name: v.string(), team: teamValidator, choice: v.string() })),
  handler: async (ctx, { key, channel }) => {
    await requireProf(ctx, key);
    const question = await ctx.db.query("quizQuestions").withIndex("by_channel", (q) => q.eq("channel", channel)).order("desc").first();
    if (!question) return [];
    const salt = await saltFor(ctx, channel);
    const rows = await ctx.db.query("answers").withIndex("by_question", (q) => q.eq("questionId", question._id)).collect();
    return rows.filter((a) => !a.correct).map((a) => ({ name: a.name, team: teamOf(a.user, salt), choice: question.choices[a.choice] ?? "" }));
  },
});
