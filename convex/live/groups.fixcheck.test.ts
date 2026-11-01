// live/groups fix-check: a scan moves a student off a team with nobody else checked in only when
// that scan checked them in again, and their old team's point changes go with them
// (sweep1-live-fixcheck-2).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../_generated/api";
import { ensureLecture } from "../lib";
import { admin, at, checkIn, profEnv, setup, typed, type Caller, type T } from "../test.helpers";

const CH = "gdg";
const T0 = at(2026, 11, 5, 21, 30);
const student = (t: T, n: number) => typed(t, `Sample student ${n}`, `student${n}@example.edu`);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  profEnv();
});
afterEach(() => {
  vi.useRealTimers();
});

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

// 8 students lock into Red 1 3 5 7 and Blue 2 4 6 8, then Blue gets +3.
async function lockedEight(t: T) {
  await t.run((ctx) => ensureLecture(ctx, CH));
  const ss = await arrive(t, 1, 8);
  await t.mutation(internal.live.groups.lock, { channel: CH, force: true });
  expect(await ss[1].query(api.live.groups.mine, { channel: CH })).toMatchObject({ label: "Blue" });
  await admin(t).mutation(api.live.groups.adjust, { channel: CH, team: 1, delta: 3, reason: "Bonus" });
  return ss;
}

async function remove(t: T, ns: number[]) {
  const roster = await admin(t).query(api.live.groups.roster, { channel: CH });
  for (const n of ns) {
    const row = roster.find((r) => r.name === `Sample student ${n}`)!;
    await admin(t).mutation(api.checkin.attendance.removeCheckin, { checkin: row.checkin });
  }
}

const board = async (t: T) =>
  (await t.query(api.live.groups.leaderboard, { channel: CH })).teams.map((g) => [g.label, g.members, g.points]);
const pointsOf = async (t: T, n: number) =>
  (await admin(t).query(api.live.groups.roster, { channel: CH })).find((r) => r.name === `Sample student ${n}`)!.points;

describe("sweep1-live-fixcheck-2 a scan never strands a team's point changes", () => {
  it("a second scan of a student who never left keeps them on their team, with its +3", async () => {
    const t = setup();
    const ss = await lockedEight(t);
    await remove(t, [4, 6, 8]);
    const again = await checkIn(t, ss[1]);
    expect(again.already).toBe(true);
    expect(await ss[1].query(api.live.groups.mine, { channel: CH })).toMatchObject({ label: "Blue" });
    expect(await board(t)).toContainEqual(["Blue", 1, 3]); // Blue's +3 still counts, for student 2
  });

  it("a student removed and scanned again leaves an empty team for the smallest one and takes its +3 along", async () => {
    const t = setup();
    const ss = await lockedEight(t);
    await remove(t, [2, 4, 6, 8]);
    const again = await checkIn(t, ss[1]);
    expect(again.already).toBe(false);
    expect(await ss[1].query(api.live.groups.mine, { channel: CH })).toMatchObject({ label: "Red" });
    expect(await pointsOf(t, 2)).toBe(3);
    const teams = await board(t);
    expect(teams).toContainEqual(["Red", 5, 3]);
    expect(teams.filter(([, members, points]) => members === 0 && points !== 0)).toEqual([]);
  });
});
