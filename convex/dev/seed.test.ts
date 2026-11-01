// dev/seed: a class of sample students for a dev backend (check-ins with teams, I'm lost taps, an
// ended quiz with their answers, their questions with upvotes), and removing them again.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../_generated/api";
import type { Id, TableNames } from "../_generated/dataModel";
import schema from "../schema";
import { DEV_URL, PROD_URL, at, checkIn, professor, profEnv, setup, slide, typed, type T } from "../test.helpers";

const CH = "gdg";
const T0 = at(2026, 11, 5, 21, 30);
const QUIZ = "Sample quiz: which one is a database?";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  profEnv();
  // fill runs only where CONVEX_CLOUD_URL names a backend that isn't prod.
  vi.stubEnv("CONVEX_CLOUD_URL", DEV_URL);
});
afterEach(() => {
  vi.useRealTimers();
});

const fill = (t: T, channel = CH, people?: number) => t.mutation(internal.dev.seed.fill, people === undefined ? { channel } : { channel, people });
const clear = (t: T, channel = CH) => t.mutation(internal.dev.seed.clear, { channel });
const count = (t: T, channel = CH) => t.query(api.checkin.read.count, { channel });
const lost = (t: T) => t.query(api.live.read.lostBySlide, { channel: CH });

// Every row in every table, by table.
async function everyRow(t: T) {
  return await t.run(async (ctx) => {
    const out: Record<string, Record<string, unknown>[]> = {};
    for (const table of Object.keys(schema.tables) as TableNames[]) out[table] = await ctx.db.query(table).collect();
    return out;
  });
}

// The tables that still hold a sample row: a row whose `user` starts with "sample:" (check-ins,
// teams, answers, taps, questions, upvotes, point changes, saved extra credit, passes), or the
// sample quiz.
function sampleRows(rows: Record<string, Record<string, unknown>[]>) {
  return Object.entries(rows).flatMap(([table, list]) =>
    list.filter((r) => (typeof r.user === "string" && r.user.startsWith("sample:")) || r.question === QUIZ).map(() => table),
  );
}

describe("dev seed", () => {
  it("fill adds a class of 8 sample students that every #/host tab shows, and clear removes them", async () => {
    const t = setup();
    expect(await fill(t)).toBe(
      `Added 8 sample students to the class on "gdg": 8 check-ins, 3 teams, 2 I'm lost taps, 8 answers to an ended quiz and 4 questions. dev/seed:clear removes them.`,
    );
    // The header: 8 checked in. With no deck in this class the taps go on the first slide:
    // samples 3 and 6 (every third).
    expect(await count(t)).toBe(8);
    expect(await lost(t)).toEqual([{ index: 0, count: 2 }]);

    const prof = await professor(t);
    // Now: the ended quiz and who got it wrong (every third picked Vite, every fourth React).
    const missing = await prof.query(api.checkin.quiz.missing, { channel: CH });
    expect(missing).toMatchObject({ kind: "quiz", question: QUIZ, choices: ["Convex", "Vite", "React", "Gemini"], correct: 0, open: false, answered: 8, counts: [4, 2, 2, 0] });
    if (missing?.kind !== "quiz") throw new Error("no quiz");
    expect(missing.wrong.map((w) => [w.name, w.picked])).toEqual([
      ["Sample student 3", "Vite"],
      ["Sample student 4", "React"],
      ["Sample student 6", "Vite"],
      ["Sample student 8", "React"],
    ]);
    expect(await t.query(api.checkin.quiz.current, { channel: CH })).toMatchObject({ question: QUIZ, open: false, answered: 8, results: { counts: [4, 2, 2, 0], correct: 0 } });

    // Points: dealt the way scans deal them, Red, Blue, Yellow and around again.
    const board = await t.query(api.live.groups.leaderboard, { channel: CH });
    expect(board.questions).toBe(1);
    expect(board.teams.map((g) => [g.label, g.members, g.correct])).toEqual([
      ["Red", 3, 2],
      ["Blue", 3, 2],
      ["Yellow", 2, 0],
    ]);
    const roster = await prof.query(api.live.groups.roster, { channel: CH });
    expect(roster).toHaveLength(8);
    expect(roster.every((r) => r.team !== null && r.answered === 1)).toBe(true);
    expect(await t.query(api.live.groups.status, { channel: CH })).toMatchObject({ locked: false });

    // Questions: one by name with 3 upvotes, one anonymous, one private, one on the slide before
    // (the first slide here, since there is none before it).
    const questions = await prof.query(api.live.questions.forHost, { channel: CH });
    expect(questions.map((q) => [q.text, q.name, q.private, q.votes]).sort()).toEqual(
      [
        ["Can you go over the last example again?", "Sample student 1", false, 3],
        ["Will this be on the test?", null, false, 1],
        ["I missed the start of class. Where can I find these slides?", "Sample student 4", true, 0],
        ["Why does the second example give a different answer?", "Sample student 5", false, 0],
      ].sort(),
    );
    // Students see the 3 that aren't private.
    expect(await t.query(api.live.questions.list, { channel: CH })).toHaveLength(3);

    expect(await clear(t)).toMatch(/^Removed \d+ sample rows from "gdg"\.$/);
    expect(await count(t)).toBe(0);
    expect(await lost(t)).toEqual([]);
    expect(await t.query(api.checkin.quiz.current, { channel: CH })).toBeNull();
    expect(await prof.query(api.live.questions.forHost, { channel: CH })).toEqual([]);
    expect((await t.query(api.live.groups.leaderboard, { channel: CH })).teams).toEqual([]);
    expect(sampleRows(await everyRow(t))).toEqual([]);
  });

  it("fill follows the deck's slide and its people count; clear leaves real students and other channels alone", async () => {
    const t = setup();
    await slide(t, CH, 2);
    await checkIn(t, typed(t, "Sample student 9", "student9@example.edu"));
    await fill(t);
    await fill(t, "another-channel", 3);
    expect(await count(t)).toBe(9);
    expect(await count(t, "another-channel")).toBe(3);
    // Samples 3 and 6 are lost on the deck's slide, and samples 1 and 2 on the slide before it.
    expect(await lost(t)).toEqual([
      { index: 1, count: 2 },
      { index: 2, count: 2 },
    ]);
    // The quiz goes with the deck's slide, and so does every question but the one asked on the
    // slide before it.
    const prof = await professor(t);
    expect(await prof.query(api.checkin.quiz.history, { channel: CH })).toEqual([
      { id: expect.any(String), kind: "quiz", question: QUIZ, answered: 8, rightPct: 50, index: 2, aiDraft: false },
    ]);
    const questions = await prof.query(api.live.questions.forHost, { channel: CH });
    expect(questions.map((q) => [q.text, q.index]).sort()).toEqual(
      [
        ["Can you go over the last example again?", 2],
        ["Will this be on the test?", 2],
        ["I missed the start of class. Where can I find these slides?", 2],
        ["Why does the second example give a different answer?", 1],
      ].sort(),
    );
    await clear(t);
    expect(await count(t)).toBe(1);
    expect(await lost(t)).toEqual([]);
    expect(await count(t, "another-channel")).toBe(3);
  });

  it("UZ-risk-1 clear removes only this channel's sample rows: a real student's lost tap, quiz answer and point changes, real polls, and every row on another channel stay as they were", async () => {
    const t = setup();
    await slide(t, CH, 2);
    const student = typed(t, "Student 9", "student9@example.edu");
    await checkIn(t, student);
    const prof = await professor(t);
    // A real quiz the student answered, and a real vote nobody answered, both ended.
    const quiz = await prof.mutation(api.checkin.quiz.ask, { channel: CH, kind: "quiz", question: "Real quiz?", choices: ["Yes", "No"], correct: 0 });
    await student.mutation(api.checkin.quiz.answer, { poll: quiz, choice: 0 });
    await prof.mutation(api.checkin.quiz.end, { poll: quiz });
    const vote = await prof.mutation(api.checkin.quiz.ask, { channel: CH, kind: "vote", question: "Real vote?", choices: ["A", "B"] });
    await prof.mutation(api.checkin.quiz.end, { poll: vote });
    await student.mutation(api.live.lost.toggle, { channel: CH, index: 2 });

    await fill(t);
    await fill(t, "another-channel", 3);
    // A point change for the real student and one for their team (Red, team 0).
    const mine = (await everyRow(t)).checkins.find((r) => r.name === "Student 9");
    if (!mine) throw new Error("no real check-in");
    await prof.mutation(api.live.groups.adjust, { channel: CH, checkin: mine._id as Id<"checkins">, delta: 2, reason: "Helped a classmate" });
    await prof.mutation(api.live.groups.adjust, { channel: CH, team: 0, delta: 1 });
    // A point change for a sample student on another-channel, which clear(gdg) must keep.
    const other = (await everyRow(t)).checkins.find((r) => r.channel === "another-channel" && r.user === "sample:1");
    if (!other) throw new Error("no sample check-in on another-channel");
    await prof.mutation(api.live.groups.adjust, { channel: "another-channel", checkin: other._id as Id<"checkins">, delta: 3, reason: "Helped a classmate" });

    const before = await everyRow(t);
    // The rows clear(gdg) may remove: sample students' rows on gdg, their answers on gdg's polls,
    // and gdg's sample quiz. another-channel has the same sample users, so their rows there count
    // as kept.
    const gdgPolls = new Set(before.polls.filter((p) => p.channel === CH).map((p) => p._id));
    const isGdgSample = (table: string, r: Record<string, unknown>) =>
      table === "polls"
        ? r.channel === CH && r.question === QUIZ
        : typeof r.user === "string" && r.user.startsWith("sample:") && (table === "pollAnswers" ? gdgPolls.has(r.poll as string) : r.channel === CH);
    const kept = Object.fromEntries(Object.entries(before).map(([table, rows]) => [table, rows.filter((r) => !isGdgSample(table, r))]));
    // The test means something only when each kind of row clear reads is there to keep.
    expect(kept.lost.map((r) => [r.channel, r.user === "sample:3"])).toEqual(
      expect.arrayContaining([
        [CH, false],
        ["another-channel", true],
      ]),
    );
    expect(kept.groupPoints.map((r) => [r.channel, r.user === undefined ? null : r.user === "sample:1", r.delta]).sort()).toEqual(
      [
        [CH, false, 2],
        [CH, null, 1],
        ["another-channel", true, 3],
      ].sort(),
    );
    expect(kept.polls.map((r) => [r.channel, r.question]).sort()).toEqual(
      [
        [CH, "Real quiz?"],
        [CH, "Real vote?"],
        ["another-channel", QUIZ],
      ].sort(),
    );
    expect(kept.pollAnswers).toHaveLength(1 + 3);

    await clear(t);
    expect(await everyRow(t)).toEqual(kept);
  });

  it("UZ-spec-1 clear after the sample check-ins' team lock fired leaves the class's teams open, so the next real students are dealt Red, Blue, Yellow and lock again 5 minutes after the first of them", async () => {
    const t = setup();
    await fill(t);
    // The lock comes 5 minutes after sample student 1's check-in, 2 minutes from now.
    vi.advanceTimersByTime(3 * 60_000);
    await t.finishInProgressScheduledFunctions();
    expect(await t.query(api.live.groups.status, { channel: CH })).toMatchObject({ locked: true });

    await clear(t);
    expect(await count(t)).toBe(0);
    expect(await t.query(api.live.groups.status, { channel: CH })).toEqual({ size: 4, locked: false, locksAt: null });

    const first = Date.now();
    for (const k of [1, 2, 3]) await checkIn(t, typed(t, "Student " + k, `student${k}@example.edu`));
    const board = await t.query(api.live.groups.leaderboard, { channel: CH });
    expect(board.teams.map((g) => [g.label, g.members])).toEqual([
      ["Red", 1],
      ["Blue", 1],
      ["Yellow", 1],
    ]);
    expect(await t.query(api.live.groups.status, { channel: CH })).toEqual({ size: 4, locked: false, locksAt: first + 5 * 60_000 });
    vi.advanceTimersByTime(5 * 60_000);
    await t.finishInProgressScheduledFunctions();
    expect(await t.query(api.live.groups.status, { channel: CH })).toMatchObject({ locked: true });
  });

  it("UZ-convex-2 clear before the sample check-ins' team lock fires: the old lock job finds nobody and the next real check-in queues a fresh lock", async () => {
    const t = setup();
    await fill(t);
    await clear(t);
    // The job fill queued fires with nobody checked in.
    vi.advanceTimersByTime(3 * 60_000);
    await t.finishInProgressScheduledFunctions();
    expect(await t.query(api.live.groups.status, { channel: CH })).toMatchObject({ locked: false, locksAt: null });
    const first = Date.now();
    for (const k of [1, 2, 3]) await checkIn(t, typed(t, "Student " + k, `student${k}@example.edu`));
    expect((await t.query(api.live.groups.leaderboard, { channel: CH })).teams.map((g) => g.label)).toEqual(["Red", "Blue", "Yellow"]);
    expect(await t.query(api.live.groups.status, { channel: CH })).toEqual({ size: 4, locked: false, locksAt: first + 5 * 60_000 });
  });

  it("UZ-spec-1 clear keeps the team lock when a real student is still checked in to the class", async () => {
    const t = setup();
    await checkIn(t, typed(t, "Student 9", "student9@example.edu"));
    await fill(t);
    vi.advanceTimersByTime(6 * 60_000);
    await t.finishInProgressScheduledFunctions();
    expect(await t.query(api.live.groups.status, { channel: CH })).toMatchObject({ locked: true });
    await clear(t);
    expect(await count(t)).toBe(1);
    expect(await t.query(api.live.groups.status, { channel: CH })).toMatchObject({ locked: true });
  });

  it("core-backend-12 fill twice adds nothing the second time", async () => {
    const t = setup();
    await fill(t);
    const before = await everyRow(t);
    expect(await fill(t)).toBe(`"gdg" has sample students already, so nothing was added. Run dev/seed:clear first for a new set.`);
    expect(await everyRow(t)).toEqual(before);
    expect(await count(t)).toBe(8);
  });

  it("core-backend-12 live-backend-19 clear leaves no sample row in any table, after the app has written more rows for the sample students", async () => {
    const t = setup();
    await slide(t, CH, 0);
    await fill(t);
    const prof = await professor(t);
    // A point change for Red, then the lock: 8 students make 2 teams, so the re-deal turns Red's
    // change into changes for the sample students who were on it.
    await prof.mutation(api.live.groups.adjust, { channel: CH, team: 0, delta: 3 });
    await t.mutation(internal.live.groups.lock, { channel: CH, force: true });
    const split = (await everyRow(t)).groupPoints.map((r) => r.user).sort();
    expect(split).toEqual(["sample:1", "sample:4", "sample:7"]);

    // A real student checks in after the lock, upvotes a sample question and asks their own, and
    // a sample student's upvote lands on it.
    const student = typed(t, "Sample student 9", "student9@example.edu");
    await checkIn(t, student);
    const first = (await t.query(api.live.questions.list, { channel: CH })).find((q) => q.text === "Can you go over the last example again?");
    if (!first) throw new Error("no sample question");
    await student.mutation(api.live.questions.vote, { question: first._id });
    await student.mutation(api.live.questions.ask, { channel: CH, index: 0, text: "Can we get the slides after class?", anonymous: false });
    const mine = (await t.query(api.live.questions.list, { channel: CH })).find((q) => q.text === "Can we get the slides after class?");
    if (!mine) throw new Error("no real question");
    await t.run(async (ctx) => {
      await ctx.db.insert("questionVotes", { channel: CH, question: mine._id, user: "sample:3" });
      await ctx.db.patch("questions", mine._id, { votes: 1 });
      // A sample student's pass, which only a hand-made row can give one.
      await ctx.db.insert("passes", { user: "sample:2", name: "Sample student 2", email: "sample2@example.edu", code: "ABC234", prevCode: "XYZ789", at: T0 });
    });
    // End day saves extra credit for every team member, the sample students too.
    await prof.mutation(api.live.groups.endDay, { channel: CH });
    expect(sampleRows(await everyRow(t)).length).toBeGreaterThan(30);

    await clear(t);
    const rows = await everyRow(t);
    expect(sampleRows(rows)).toEqual([]);
    // The real student's rows stay: their check-in, team, pass, saved extra credit and question.
    expect(rows.checkins.map((r) => r.name)).toEqual(["Sample student 9"]);
    expect(rows.groups).toHaveLength(1);
    expect(rows.passes).toHaveLength(1);
    expect(rows.groupResults.map((r) => r.name)).toEqual(["Sample student 9"]);
    expect(rows.questions.map((r) => [r.text, r.votes])).toEqual([["Can we get the slides after class?", 0]]);
    // Upvotes stay in step: none points at a deleted question, and each count matches its rows.
    const ids = new Set(rows.questions.map((r) => r._id));
    expect(rows.questionVotes.filter((x) => !ids.has(x.question as string))).toEqual([]);
    for (const q of rows.questions) expect(rows.questionVotes.filter((x) => x.question === q._id)).toHaveLength(q.votes as number);
  });

  it("core-backend-12 fill refuses on prod and where CONVEX_CLOUD_URL can't be read, and writes nothing; clear still runs there", async () => {
    const cases: [string | undefined, RegExp][] = [
      [PROD_URL, /never runs on prod \(utmost-ibis-818\)/],
      ["https://UTMOST-IBIS-818.convex.cloud/", /never runs on prod/],
      [undefined, /can't be read, so it added nothing/],
      ["not a url", /can't be read, so it added nothing/],
      // UZ-convex-1: a custom domain (prod's could be one) or a deployment that isn't in
      // DEV_HOSTS (prod could move to one) isn't known to be dev, so fill refuses there too.
      ["https://api.rcclive.app", /runs only on the dev backends in DEV_HOSTS/],
      ["https://brave-otter-456.convex.cloud", /runs only on the dev backends in DEV_HOSTS/],
      ["http://sample-dev-123.convex.cloud", /runs only on the dev backends in DEV_HOSTS/],
    ];
    for (const [url, error] of cases) {
      vi.stubEnv("CONVEX_CLOUD_URL", url);
      const t = setup();
      await expect(fill(t)).rejects.toThrow(error);
      expect(Object.values(await everyRow(t)).flat()).toEqual([]);
    }

    // clear removes only sample rows, so it runs on prod too, in case sample rows ever got there.
    vi.stubEnv("CONVEX_CLOUD_URL", DEV_URL);
    const t = setup();
    await checkIn(t, typed(t, "Sample student 9", "student9@example.edu"));
    await fill(t);
    vi.stubEnv("CONVEX_CLOUD_URL", PROD_URL);
    await clear(t);
    expect(await count(t)).toBe(1);
    expect(sampleRows(await everyRow(t))).toEqual([]);
  });

  it("UZ-fixcheck-1 sweep2-docs-fixcheck-1 fill on a lead's own dev backend says to ask Sam to add its host to both DEV_HOSTS lists (auth.config.ts is Sam's)", async () => {
    vi.stubEnv("CONVEX_CLOUD_URL", "https://brave-otter-456.convex.cloud");
    const t = setup();
    await expect(fill(t)).rejects.toThrow(
      "dev/seed:fill adds made-up students, so it runs only on the dev backends in DEV_HOSTS, and brave-otter-456.convex.cloud isn't one, so it added nothing. " +
        "If it's your own dev backend (never prod), ask Sam to add its host to DEV_HOSTS in convex/checkin/prof.ts and convex/auth.config.ts (README step 4).",
    );
  });

  it("UZ-fixcheck-2 clear after the sample students' team lock fired, in a class whose saved start time has passed, shows no lock time until the next real check-in", async () => {
    const t = setup();
    const prof = await professor(t);
    const startsAt = Date.now();
    await prof.mutation(api.checkin.attendance.setClassStart, { channel: CH, startsAt, graceMin: 5 });
    await fill(t);
    vi.advanceTimersByTime(10 * 60_000);
    await t.finishInProgressScheduledFunctions();
    expect(await t.query(api.live.groups.status, { channel: CH })).toMatchObject({ locked: true });

    await clear(t);
    // The saved start's lock time (startsAt + 5 min) is 5 minutes ago, so no screen shows it.
    expect(await t.query(api.live.groups.status, { channel: CH })).toEqual({ size: 4, locked: false, locksAt: null });

    const first = Date.now();
    for (const k of [1, 2, 3]) await checkIn(t, typed(t, "Student " + k, `student${k}@example.edu`));
    expect((await t.query(api.live.groups.leaderboard, { channel: CH })).teams.map((g) => g.label)).toEqual(["Red", "Blue", "Yellow"]);
    expect(await t.query(api.live.groups.status, { channel: CH })).toEqual({ size: 4, locked: false, locksAt: first + 5 * 60_000 });
    vi.advanceTimersByTime(5 * 60_000);
    await t.finishInProgressScheduledFunctions();
    expect(await t.query(api.live.groups.status, { channel: CH })).toMatchObject({ locked: true });
  });

  it("UZ-fixcheck-2 clear before the saved start's lock time keeps showing that lock time", async () => {
    const t = setup();
    const prof = await professor(t);
    const startsAt = Date.now() + 20 * 60_000;
    await prof.mutation(api.checkin.attendance.setClassStart, { channel: CH, startsAt, graceMin: 5 });
    await fill(t);
    await clear(t);
    expect(await t.query(api.live.groups.status, { channel: CH })).toEqual({ size: 4, locked: false, locksAt: startsAt + 5 * 60_000 });
  });

  it("fill takes 1 to 40 people, as whole numbers", async () => {
    for (const people of [0, 41, 2.5, -3]) {
      const t = setup();
      await expect(fill(t, CH, people)).rejects.toThrow("people has to be a whole number from 1 to 40.");
      expect(Object.values(await everyRow(t)).flat()).toEqual([]);
    }
    // One student: no taps (nobody is a third student), one answer, and only their own question.
    const t = setup();
    expect(await fill(t, CH, 1)).toBe(
      `Added 1 sample student to the class on "gdg": 1 check-in, 1 team, 0 I'm lost taps, 1 answer to an ended quiz and 1 question. dev/seed:clear removes them.`,
    );
    expect(await count(t)).toBe(1);
    const prof = await professor(t);
    expect((await prof.query(api.live.questions.forHost, { channel: CH })).map((q) => [q.text, q.votes])).toEqual([["Can you go over the last example again?", 0]]);
  });

  it("fill refuses while a question is open in this class, so the sample quiz never takes its place on the phones, and writes nothing", async () => {
    const t = setup();
    const prof = await professor(t);
    await prof.mutation(api.checkin.quiz.ask, { channel: CH, kind: "vote", question: "Pizza or tacos?", choices: ["Pizza", "Tacos"] });
    const before = await everyRow(t);
    await expect(fill(t)).rejects.toThrow(`A question is open on "gdg", and the sample quiz would take its place on every phone. End it on #/host first.`);
    expect(await everyRow(t)).toEqual(before);
    expect(await t.query(api.checkin.quiz.current, { channel: CH })).toMatchObject({ question: "Pizza or tacos?", open: true });

    // A question left open by a class that closed itself is on no screen, so it doesn't stop fill:
    // fill ends that class at its 12 hours and opens the next.
    vi.setSystemTime(T0 + 13 * 60 * 60_000);
    expect(await fill(t)).toMatch(/^Added 8 sample students/);
    const classes = (await everyRow(t)).lectures;
    expect(classes.map((l) => l.endedAt === undefined)).toEqual([false, true]);
    expect(await t.query(api.checkin.quiz.current, { channel: CH })).toMatchObject({ question: QUIZ, open: false });
  });

  it("fill opens a class when none is open, and the sample students leave every screen when End day ends it", async () => {
    const t = setup();
    await fill(t);
    const classes = (await everyRow(t)).lectures;
    expect(classes).toHaveLength(1);
    expect(classes[0].endedAt).toBeUndefined();
    const prof = await professor(t);
    // End day comes later in the class: rows made at the moment a class ends still count.
    vi.setSystemTime(T0 + 50 * 60_000);
    await prof.mutation(api.live.groups.endDay, { channel: CH });
    expect(await count(t)).toBe(0);
    expect(await lost(t)).toEqual([]);
    expect(await t.query(api.checkin.quiz.current, { channel: CH })).toBeNull();
    expect(await t.query(api.live.questions.list, { channel: CH })).toEqual([]);
  });
});
