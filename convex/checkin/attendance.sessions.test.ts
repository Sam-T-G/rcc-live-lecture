// checkin/attendance: review fixes for package CKA.
// - CKA-risk-1: a start saved after students walked in marks them late on the sheet, but the late
//   banner never announces them: they weren't late when they were scanned.
// - CKA-access-1: a name that is the student's own email (cut to the part before the "@" when it
//   was stored) shows as "Someone" in the public late feed.
// - CKA-convex-1 / CKA-risk-3: a start for a later class can't land on the class still open with
//   check-ins, so it never rewrites that class's late minutes or merges the two classes.
// - CKA-convex-2: once this class's teams lock, saving the start queues no lock job, in the second
//   class too.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../_generated/api";
import { endLecture, ensureLecture } from "../lib";
import { admin, at, checkIn, google, profEnv, setup, type T, typed } from "../test.helpers";

const CH = "gdg";
const MIN = 60_000;
const HOUR = 60 * MIN;
const T0 = at(2026, 11, 5, 21, 30); // class starts

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0 - 10 * MIN);
  profEnv();
});
afterEach(() => {
  vi.useRealTimers();
});

const setStart = (t: T, startsAt: number, graceMin = 5) => admin(t).mutation(api.checkin.attendance.setClassStart, { channel: CH, startsAt, graceMin });
const sheet = (t: T) => admin(t).query(api.checkin.attendance.sheet, { channel: CH });
const lectures = (t: T) => admin(t).query(api.checkin.attendance.lectures, { channel: CH });
const feed = (t: T) => t.query(api.checkin.attendance.lateFeed, { channel: CH });
const student = (t: T, name: string) => typed(t, `${name} Sample`, `${name.toLowerCase()}@example.edu`);

describe("CKA-risk-1 the late banner announces only students who were late when scanned", () => {
  it("a start saved after three students walked in marks them late on the sheet, and the feed stays empty until the next late arrival", async () => {
    const t = setup();
    // A deck press opens the class at T0 - 5 minutes with no start saved.
    vi.setSystemTime(T0 - 5 * MIN);
    await t.run((ctx) => ensureLecture(ctx, CH));
    for (const [i, name] of ["Ana", "Bo", "Cy"].entries()) {
      vi.setSystemTime(T0 + (6 + i) * MIN);
      await checkIn(t, student(t, name));
    }
    expect(await feed(t)).toEqual([]);
    // At T0 + 14 the professor saves "class starts at T0, late after 5 minutes".
    vi.setSystemTime(T0 + 14 * MIN);
    await setStart(t, T0);
    expect((await sheet(t)).map((r) => [r.name, r.lateMin])).toEqual([
      ["Ana Sample", 6],
      ["Bo Sample", 7],
      ["Cy Sample", 8],
    ]);
    expect(await feed(t)).toEqual([]);
    // Dee walks in after the save: the banner shows her, and only her.
    vi.setSystemTime(T0 + 16 * MIN);
    await checkIn(t, student(t, "Dee"));
    expect((await feed(t)).map((f) => [f.first, f.lateMin])).toEqual([["Dee", 16]]);
    // A grace change later doesn't bring back the arrivals from before it.
    vi.setSystemTime(T0 + 17 * MIN);
    await setStart(t, T0, 3);
    expect(await feed(t)).toEqual([]);
    vi.setSystemTime(T0 + 18 * MIN);
    await checkIn(t, student(t, "Eve"));
    expect((await feed(t)).map((f) => f.first)).toEqual(["Eve"]);
  });
});

describe("CKA-access-1 a name that is the student's email never reaches the public feed", () => {
  it("a student who typed their email as their name shows as 'Someone'; a real first name still shows", async () => {
    const t = setup();
    await setStart(t, T0, 0);
    vi.setSystemTime(T0 + 11 * MIN);
    await checkIn(t, typed(t, "jane.doe@example.edu", "jane.doe@example.edu"));
    vi.setSystemTime(T0 + 12 * MIN);
    await checkIn(t, google(t, "JDoe1234@Example.edu", "jdoe1234@example.edu"));
    vi.setSystemTime(T0 + 13 * MIN);
    await checkIn(t, typed(t, "Mia Sample", "mia@example.edu"));
    const out = await feed(t);
    expect(out.map((f) => [f.first, f.lateMin])).toEqual([
      ["Mia", 13],
      ["Someone", 12],
      ["Someone", 11],
    ]);
    expect(JSON.stringify(out)).not.toMatch(/jane|doe|1234|@/i);
  });
});

describe("CKA-convex-1 / CKA-risk-3 a start for a later class never lands on the class still open", () => {
  // Monday's class starts at 6 PM (UTC here). Bo walks in 20 minutes late.
  const MON_6PM = at(2026, 11, 9, 18, 0);
  const TUE_9AM = at(2026, 11, 10, 9, 0);

  async function monday(t: T) {
    vi.setSystemTime(MON_6PM - 10 * MIN);
    await setStart(t, MON_6PM);
    vi.setSystemTime(MON_6PM + 20 * MIN);
    const bo = student(t, "Bo");
    await checkIn(t, bo);
    return bo;
  }

  it("saving Tuesday 9 AM at 9:30 PM Monday is refused while Monday's class is open, and Monday keeps its late minutes", async () => {
    const t = setup();
    const bo = await monday(t);
    expect((await sheet(t)).map((r) => [r.name, r.lateMin])).toEqual([["Bo Sample", 20]]);
    vi.setSystemTime(MON_6PM + 3.5 * HOUR);
    await expect(setStart(t, TUE_9AM)).rejects.toThrow("This class is still open. Press End class, then save the next start.");
    expect((await sheet(t)).map((r) => [r.name, r.lateMin])).toEqual([["Bo Sample", 20]]);
    const [mon] = await lectures(t);
    expect(mon).toMatchObject({ open: true, startsAt: MON_6PM, count: 1 });

    // Tuesday: Monday's class closed by itself, Ana's scan opens a new class, and Bo isn't checked in.
    vi.setSystemTime(TUE_9AM + 5 * MIN);
    expect((await checkIn(t, student(t, "Ana"))).already).toBe(false);
    expect(await bo.query(api.checkin.read.me, { channel: CH })).toBe(false);
    expect(await t.query(api.checkin.read.count, { channel: CH })).toBe(1);
  });

  it("once Monday's class ends, the same save opens Tuesday's class; an open class with no check-ins takes the next morning's start", async () => {
    const t = setup();
    await monday(t);
    vi.setSystemTime(MON_6PM + 3.5 * HOUR);
    await t.run((ctx) => endLecture(ctx, CH));
    await setStart(t, TUE_9AM);
    const [tue, mon] = await lectures(t);
    expect(tue).toMatchObject({ open: true, startsAt: TUE_9AM, count: 0 });
    expect(mon).toMatchObject({ open: false, startsAt: MON_6PM, count: 1 });

    // A deck rehearsal at 10 PM opens a class nobody checks in to: a start for the morning joins it.
    const t2 = setup();
    vi.setSystemTime(MON_6PM + 4 * HOUR);
    await t2.run((ctx) => ensureLecture(ctx, CH));
    await setStart(t2, TUE_9AM);
    expect(await lectures(t2)).toEqual([expect.objectContaining({ open: true, startsAt: TUE_9AM })]);
  });

  it("the finding's timeline: a class opened at 8:50 with a 9:00 start refuses Tuesday's 8:00 start saved at 20:00", async () => {
    const t = setup();
    const MON_9AM = at(2026, 11, 9, 9, 0);
    vi.setSystemTime(MON_9AM - 10 * MIN);
    await setStart(t, MON_9AM);
    vi.setSystemTime(MON_9AM + 7 * MIN);
    await checkIn(t, student(t, "Bo"));
    vi.setSystemTime(MON_9AM + 11 * HOUR);
    await expect(setStart(t, at(2026, 11, 10, 8, 0))).rejects.toThrow(/still open/);
    expect((await sheet(t)).map((r) => r.lateMin)).toEqual([7]);
  });

  it("a start corrected within the class still applies: a start up to 45 minutes after the first check-in, or moved earlier", async () => {
    const t = setup();
    await t.run((ctx) => ensureLecture(ctx, CH));
    vi.setSystemTime(T0 - 5 * MIN);
    await checkIn(t, student(t, "Ana"));
    vi.setSystemTime(T0 + 20 * MIN);
    await checkIn(t, student(t, "Bo"));
    // A start 40 minutes after Ana's check-in is still this class; one 50 minutes after it, a
    // later section's start (CKA-fixcheck), is refused.
    await setStart(t, T0 + 35 * MIN);
    await expect(setStart(t, T0 + 45 * MIN)).rejects.toThrow(/still open/);
    vi.setSystemTime(T0 + 25 * MIN);
    await setStart(t, T0);
    expect((await sheet(t)).map((r) => r.lateMin)).toEqual([null, 20]);
    expect(await lectures(t)).toHaveLength(1);
  });
});

describe("sweep1-ledger-2 an early student never forces End class on their own class", () => {
  // Class is at 5 PM. With no start saved, Ana types her pass code on the door iPad at 4:10 PM,
  // which opens the class. At 4:45 PM the professor saves 5:00 PM.
  const FIVE = at(2026, 11, 5, 17, 0);

  it("the refusal stands without sameClass; with sameClass the start saves on the open class and Ana stays checked in", async () => {
    const t = setup();
    vi.setSystemTime(FIVE - 50 * MIN);
    const ana = student(t, "Ana");
    await checkIn(t, ana);
    vi.setSystemTime(FIVE - 15 * MIN);
    await expect(setStart(t, FIVE)).rejects.toThrow("This class is still open. Press End class, then save the next start.");
    await admin(t).mutation(api.checkin.attendance.setClassStart, { channel: CH, startsAt: FIVE, graceMin: 5, sameClass: true });
    const list = await lectures(t);
    expect(list).toEqual([expect.objectContaining({ open: true, startsAt: FIVE, count: 1 })]);
    expect(await ana.query(api.checkin.read.me, { channel: CH })).toBe(true);
    expect((await sheet(t)).map((r) => [r.name, r.lateMin])).toEqual([["Ana Sample", null]]);
  });

  it("sameClass is professors' only, like every setClassStart", async () => {
    const t = setup();
    await expect(student(t, "Ana").mutation(api.checkin.attendance.setClassStart, { channel: CH, startsAt: T0, graceMin: 5, sameClass: true })).rejects.toThrow(
      "Only professors can do that.",
    );
  });
});

describe("CKA-convex-2 saving the start queues no lock once this class's teams lock", () => {
  const lockJobs = (t: T) =>
    t.run(async (ctx) => (await ctx.db.system.query("_scheduled_functions").take(100)).filter((j) => j.name.includes("live/groups") && j.state.kind === "pending").length);

  it("in the second class too", async () => {
    const t = setup();
    for (const [week, names] of [
      [0, ["Ana", "Bo"]],
      [1, ["Cy", "Dee"]],
    ] as const) {
      const start = T0 + week * 7 * 24 * HOUR;
      vi.setSystemTime(start - 10 * MIN);
      await setStart(t, start);
      for (const n of names) await checkIn(t, student(t, n));
      vi.advanceTimersByTime(start + 6 * MIN - Date.now());
      await t.finishInProgressScheduledFunctions();
      expect(await t.query(api.live.groups.status, { channel: CH })).toMatchObject({ locked: true });
      expect(await lockJobs(t)).toBe(0);
      await setStart(t, start, 10);
      expect(await lockJobs(t)).toBe(0);
      vi.setSystemTime(start + 2 * HOUR);
      await t.run((ctx) => endLecture(ctx, CH));
    }
  });
});

// Fix check after CKA's review fixes:
// - the guard in setClassStart: the next section's start, saved within 2 hours of the open class's
//   last check-in, still landed on the open class. Now a start is refused while the open class has
//   a check-in more than 45 minutes before it.
// - privacy: a name typed as any email address, not only the student's own, shows as "Someone" in
//   the public late feed.
describe("CKA-fixcheck the next section's start never lands on the class still open, even within 2 hours", () => {
  const NINE = at(2026, 11, 9, 9, 0);

  it("P1: 11:00 saved at 10:50 for the next section is refused; the 9:00 class keeps Bo's 20 minutes late", async () => {
    const t = setup();
    vi.setSystemTime(NINE - 10 * MIN);
    await setStart(t, NINE);
    vi.setSystemTime(NINE + 2 * MIN);
    await checkIn(t, student(t, "Ana"));
    vi.setSystemTime(NINE + 20 * MIN);
    const bo = student(t, "Bo");
    await checkIn(t, bo);
    vi.setSystemTime(NINE + 110 * MIN);
    await expect(setStart(t, NINE + 2 * HOUR)).rejects.toThrow("This class is still open. Press End class, then save the next start.");
    expect((await sheet(t)).map((r) => [r.name, r.lateMin])).toEqual([
      ["Ana Sample", null],
      ["Bo Sample", 20],
    ]);
    // After End day the same save opens the 11:00 class, and Bo can check in to it.
    await t.run((ctx) => endLecture(ctx, CH));
    await setStart(t, NINE + 2 * HOUR);
    vi.setSystemTime(NINE + 130 * MIN);
    expect((await checkIn(t, bo)).already).toBe(false);
    expect((await lectures(t)).map((l) => [l.open, l.count])).toEqual([
      [true, 1],
      [false, 2],
    ]);
  });

  it("back-to-back: 10:30 saved at 10:20 with only Bo's 9:20 check-in is refused", async () => {
    const t = setup();
    vi.setSystemTime(NINE - 10 * MIN);
    await setStart(t, NINE);
    vi.setSystemTime(NINE + 20 * MIN);
    await checkIn(t, student(t, "Bo"));
    vi.setSystemTime(NINE + 80 * MIN);
    await expect(setStart(t, NINE + 90 * MIN)).rejects.toThrow(/still open/);
    expect((await sheet(t)).map((r) => r.lateMin)).toEqual([20]);
  });

  it("a start corrected to when the students came still applies: 9:00 saved by mistake, check-ins from 9:50, start moved to 10:00", async () => {
    const t = setup();
    vi.setSystemTime(NINE - 10 * MIN);
    await setStart(t, NINE);
    vi.setSystemTime(NINE + 50 * MIN);
    await checkIn(t, student(t, "Ana"));
    vi.setSystemTime(NINE + 70 * MIN);
    await checkIn(t, student(t, "Bo"));
    await setStart(t, NINE + HOUR);
    expect((await sheet(t)).map((r) => r.lateMin)).toEqual([null, 10]);
    expect(await lectures(t)).toHaveLength(1);
  });
});

describe("CKA-fixcheck a name typed as any email address shows as 'Someone' in the public late feed", () => {
  it("'jdoe1234@gmail.com' typed by jane@example.edu never shows 'jdoe1234'; the professor's sheet still has it", async () => {
    const t = setup();
    await setStart(t, T0, 0);
    vi.setSystemTime(T0 + 11 * MIN);
    await checkIn(t, typed(t, "jdoe1234@gmail.com", "jane@example.edu"));
    vi.setSystemTime(T0 + 12 * MIN);
    await checkIn(t, typed(t, "Mia Sample", "mia@example.edu"));
    const out = await feed(t);
    expect(out.map((f) => [f.first, f.lateMin])).toEqual([
      ["Mia", 12],
      ["Someone", 11],
    ]);
    expect(JSON.stringify(out)).not.toMatch(/jdoe|1234|@/i);
    expect((await sheet(t)).map((r) => r.name)).toEqual(["jdoe1234", "Mia Sample"]);
  });

  it("a pass named from an email before this fix gets marked on its next refresh", async () => {
    const t = setup();
    const jo = typed(t, "jdoe1234@gmail.com", "jane@example.edu");
    await jo.mutation(api.checkin.pass.refresh, {});
    // The pass row as it was stored before this fix.
    await t.run(async (ctx) => {
      const p = (await ctx.db.query("passes").take(1))[0];
      await ctx.db.replace("passes", p._id, { user: p.user, name: p.name, email: p.email, code: p.code, prevCode: p.prevCode, at: p.at });
    });
    await setStart(t, T0, 0);
    vi.setSystemTime(T0 + 11 * MIN);
    await checkIn(t, jo);
    expect((await feed(t)).map((f) => f.first)).toEqual(["Someone"]);
  });

  it("a student who signs in again with a real name before the scan shows that name", async () => {
    const t = setup();
    await typed(t, "jdoe1234@gmail.com", "jane@example.edu").mutation(api.checkin.pass.refresh, { channel: CH });
    await setStart(t, T0, 0);
    vi.setSystemTime(T0 + 11 * MIN);
    const jane = typed(t, "Jane Doe", "jane@example.edu");
    await jane.mutation(api.checkin.pass.refresh, { channel: CH });
    await checkIn(t, jane);
    expect((await feed(t)).map((f) => f.first)).toEqual(["Jane"]);
  });
});

// sweep2-checkin-1: the two "Someone" guards in lateFeed that no other test reaches. The check-in
// rows here never hold an "@", so only these guards keep the email's local part off the screen.
describe("sweep2-checkin-1 lateFeed shows 'Someone' for a name that is the email's local part or a legacy pass holding '@'", () => {
  it("a Google name equal to the student's email local part, in any case, shows as 'Someone'", async () => {
    const t = setup();
    await setStart(t, T0, 0);
    vi.setSystemTime(T0 + 10 * MIN);
    await checkIn(t, google(t, "jdoe1234", "jdoe1234@gmail.com"));
    vi.setSystemTime(T0 + 11 * MIN);
    await checkIn(t, google(t, "MLee77", "mlee77@example.edu"));
    vi.setSystemTime(T0 + 12 * MIN);
    await checkIn(t, google(t, "Mia Sample", "mia@example.edu"));
    const out = await feed(t);
    expect(out.map((f) => [f.first, f.lateMin])).toEqual([
      ["Mia", 12],
      ["Someone", 11],
      ["Someone", 10],
    ]);
    expect(JSON.stringify(out)).not.toMatch(/jdoe|1234|mlee|77/i);
  });

  it("a legacy pass (no nameFromEmail) whose name holds '@' shows as 'Someone', though the check-in row's name has none", async () => {
    const t = setup();
    await setStart(t, T0, 0);
    vi.setSystemTime(T0 + 11 * MIN);
    await checkIn(t, typed(t, "jdoe1234@gmail.com", "jane@example.edu"));
    // The pass row as a pass from before names were cleaned stored it: the email as the name, no flag.
    await t.run(async (ctx) => {
      const p = (await ctx.db.query("passes").take(1))[0];
      await ctx.db.replace("passes", p._id, { user: p.user, name: "jdoe1234@gmail.com", email: p.email, code: p.code, prevCode: p.prevCode, at: p.at });
    });
    expect((await sheet(t)).map((r) => r.name)).toEqual(["jdoe1234"]);
    const out = await feed(t);
    expect(out.map((f) => f.first)).toEqual(["Someone"]);
    expect(JSON.stringify(out)).not.toMatch(/jdoe|1234|@/i);
  });
});
