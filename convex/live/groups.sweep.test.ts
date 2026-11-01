// live/groups sweep fixes: a student whose check-in the professor removed and who is scanned again
// after the lock joins the smallest team instead of a team of 1 (sweep1-live-1), pointLog stays
// newest first by time after a re-deal splits a team's changes (sweep1-live-3), and End day names
// what it counts: quizzes with a right answer (sweep1-live-4).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../_generated/api";
import { ensureLecture } from "../lib";
import { admin, at, checkIn, profEnv, setup, typed, type Caller, type T } from "../test.helpers";

const CH = "gdg";
const T0 = at(2026, 11, 5, 21, 30);
const MIN = 60_000;
const student = (t: T, n: number) => typed(t, `Sample student ${n}`, `student${n}@example.edu`);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  profEnv();
});
afterEach(() => {
  vi.useRealTimers();
});

// Students `from` to `to` checked in by a real scan, a second apart.
async function arrive(t: T, from: number, to: number) {
  const out: Caller[] = [];
  for (let n = from; n <= to; n++) {
    const s = student(t, n);
    await checkIn(t, s);
    out.push(s);
    vi.advanceTimersByTime(1_000);
  }
  return out;
}

const sizes = async (t: T) =>
  (await t.query(api.live.groups.leaderboard, { channel: CH })).teams.filter((g) => g.members > 0).map((g) => [g.label, g.members]);

describe("sweep1-live-1 a check-in removed before the lock and scanned again after it never makes a team of 1", () => {
  it("13 students, the professor removes student 13, the lock deals 12 into 3 teams of 4, student 13 is scanned again and joins a team of 4", async () => {
    const t = setup();
    await t.run((ctx) => ensureLecture(ctx, CH));
    const ss = await arrive(t, 1, 13);
    expect(await ss[12].query(api.live.groups.mine, { channel: CH })).toMatchObject({ label: "Green" });
    const roster = await admin(t).query(api.live.groups.roster, { channel: CH });
    const thirteen = roster.find((r) => r.name === "Sample student 13")!;
    await admin(t).mutation(api.checkin.attendance.removeCheckin, { checkin: thirteen.checkin });
    await t.mutation(internal.live.groups.lock, { channel: CH, force: true });
    expect(await sizes(t)).toEqual([
      ["Red", 4],
      ["Blue", 4],
      ["Yellow", 4],
    ]);

    await checkIn(t, ss[12]);
    expect(await ss[12].query(api.live.groups.mine, { channel: CH })).toMatchObject({ label: "Red" });
    const after = await sizes(t);
    expect(after.map(([, n]) => n).sort()).toEqual([4, 4, 5]);
    expect(after.some(([, n]) => n === 1)).toBe(false);
  });

  it("a scan again of a student alone on a team only because every team had 5 keeps them where they are", async () => {
    const t = setup();
    await t.run((ctx) => ensureLecture(ctx, CH));
    await arrive(t, 1, 6);
    await t.mutation(internal.live.groups.lock, { channel: CH, force: true }); // teamsFor(6, 4) = 2: two teams of 3
    // Students 7 to 10 fill both teams to 5, then student 11 opens Yellow alone.
    const late = await arrive(t, 7, 11);
    const mine = await late[4].query(api.live.groups.mine, { channel: CH });
    expect(mine).toMatchObject({ label: "Yellow" });
    await checkIn(t, late[4]);
    expect(await late[4].query(api.live.groups.mine, { channel: CH })).toEqual(mine);
  });
});

describe("sweep1-live-3 pointLog stays newest first by time after a re-deal", () => {
  it("Red +2, a minute later one student -1, then the lock re-deals 7 students: the -1 is still on top", async () => {
    const t = setup();
    await t.run((ctx) => ensureLecture(ctx, CH));
    await arrive(t, 1, 7); // Red 1 4 7, Blue 2 5, Yellow 3 6
    await admin(t).mutation(api.live.groups.adjust, { channel: CH, team: 0, delta: 2, reason: "Early bonus" });
    vi.advanceTimersByTime(MIN);
    const roster = await admin(t).query(api.live.groups.roster, { channel: CH });
    const two = roster.find((r) => r.name === "Sample student 2")!;
    await admin(t).mutation(api.live.groups.adjust, { channel: CH, checkin: two.checkin, delta: -1, reason: "Later deduction" });
    vi.advanceTimersByTime(MIN);
    await t.mutation(internal.live.groups.lock, { channel: CH, force: true }); // teamsFor(7, 4) = 2: Red's +2 splits
    const log = await admin(t).query(api.live.groups.pointLog, { channel: CH });
    expect(log.map((c) => [c.reason, c.delta])).toEqual([
      ["Later deduction", -1],
      ["Early bonus", 1],
      ["Early bonus", 1],
    ]);
    expect(log.map((c) => c.at)).toEqual([...log.map((c) => c.at)].sort((a, b) => b - a));
  });
});

describe("sweep1-live-4 End day's line names quizzes with a right answer", () => {
  it("a quiz with no right answer ended: End day says no quiz with a right answer ended", async () => {
    const t = setup();
    await t.run((ctx) => ensureLecture(ctx, CH));
    const [s] = await arrive(t, 1, 1);
    const poll = await admin(t).mutation(api.checkin.quiz.ask, { channel: CH, kind: "quiz", question: "Which one?", choices: ["A", "B"] });
    await s.mutation(api.checkin.quiz.answer, { poll, choice: 0 });
    await admin(t).mutation(api.checkin.quiz.end, { poll });
    expect((await t.query(api.live.groups.leaderboard, { channel: CH })).questions).toBe(0);
    expect(await admin(t).mutation(api.live.groups.endDay, { channel: CH })).toBe(
      "Class ended. No quiz with a right answer has ended, so there is no extra credit to save.",
    );
  });
});
