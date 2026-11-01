// convex/schema.ts: rows written before the class model still validate and still read through
// the functions phones call and through the new indexes, the new fields and tables take what the
// next changes write, and no index that existed before changed (a changed index would rebuild on
// prod at deploy).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { at, setup } from "./test.helpers";

const CH = "gdg";
const T0 = at(2026, 11, 5, 21, 30);
const HOUR = 3_600_000;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
});
afterEach(() => {
  vi.useRealTimers();
});

describe("old rows keep working", () => {
  it("old-shape polls, questions and deckChannels rows validate and read through checkin.quiz.current, live.questions.list and deck.current, and old questions and lost rows read through the new by_channel indexes", async () => {
    const t = setup();
    await t.run(async (ctx) => {
      // The shapes prod holds from 10-29: no index or aiDraft on polls, none of the six new
      // question fields, no run or seq on the deck's row.
      await ctx.db.insert("polls", { channel: CH, question: "Which loop runs at least once?", choices: ["for", "while", "do-while"], correct: 2, kind: "quiz", open: true, at: T0 });
      await ctx.db.insert("questions", { channel: CH, index: 2, user: "test|student1", name: "Sample student 1", text: "Why does the loop stop?", votes: 0, at: T0 });
      await ctx.db.insert("lost", { channel: CH, index: 2, user: "test|student1", at: T0 });
      await ctx.db.insert("deckChannels", { channel: CH, index: 2, beat: 1, count: 12, title: "Loops", lines: ["for", "while"], at: T0 });
      // Nothing reads kiosks or checkins.meters any more, but prod may hold them.
      await ctx.db.insert("kiosks", { channel: CH, code: "ABC234", prevCode: "XYZ789", at: T0, lat: 33.97, lng: -117.38, radius: 50 });
      await ctx.db.insert("checkins", { channel: CH, user: "test|student1", name: "Sample student 1", at: T0, meters: 12, lateMin: 3 });
    });
    expect(await t.query(api.checkin.quiz.current, { channel: CH })).toMatchObject({
      kind: "quiz",
      question: "Which loop runs at least once?",
      choices: ["for", "while", "do-while"],
      open: true,
      answered: 0,
      results: null,
    });
    const listed = await t.query(api.live.questions.list, { channel: CH });
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({ index: 2, text: "Why does the loop stop?", name: "Sample student 1", votes: 0, mine: false, voted: false });
    expect(await t.query(api.live.questions.list, { channel: CH, index: 2 })).toHaveLength(1);
    expect(await t.query(api.deck.current, { channel: CH })).toEqual({ index: 2, beat: 1, count: 12, title: "Loops", lines: ["for", "while"], at: T0 });

    // Before the first class every row is in the window (start 0), and the new indexes hold the
    // rows written before they existed.
    const byChannel = await t.run(async (ctx) => ({
      questions: (await ctx.db.query("questions").withIndex("by_channel", (q) => q.eq("channel", CH).gte("_creationTime", 0)).take(200)).map((q) => q.text),
      lost: (await ctx.db.query("lost").withIndex("by_channel", (q) => q.eq("channel", CH).gte("_creationTime", 0)).take(200)).map((l) => l.index),
    }));
    expect(byChannel).toEqual({ questions: ["Why does the loop stop?"], lost: [2] });
  });

  it("every index that existed before the class model is unchanged, and the only new ones are by_channel on lectures, groupPoints, groupResults, questions and lost, groupResults' by lecture and by user, plus the access tables' (ROLES)", () => {
    const before: Record<string, Record<string, string[]>> = {
      deckChannels: { by_channel: ["channel"] },
      deckSlides: { by_channel_and_index: ["channel", "index"] },
      pings: {},
      kiosks: { by_channel: ["channel"] },
      checkins: { by_channel: ["channel"], by_channel_and_user: ["channel", "user"] },
      passes: { by_user: ["user"], by_code: ["code"], by_prevCode: ["prevCode"] },
      classStarts: { by_channel: ["channel"] },
      polls: { by_channel: ["channel"] },
      pollAnswers: { by_poll: ["poll"], by_poll_and_user: ["poll", "user"] },
      lost: { by_channel_and_index: ["channel", "index"], by_channel_and_index_and_user: ["channel", "index", "user"] },
      questions: { by_channel_and_index: ["channel", "index"], by_channel_and_user: ["channel", "user"] },
      questionVotes: { by_question_and_user: ["question", "user"], by_channel_and_user: ["channel", "user"] },
      groups: { by_channel: ["channel"], by_channel_and_user: ["channel", "user"] },
      groupSettings: { by_channel: ["channel"] },
      quizQuestions: { by_channel: ["channel"] },
      answers: { by_question: ["questionId"], by_question_and_user: ["questionId", "user"] },
      hostRooms: { by_channel: ["channel"] },
      pointEvents: { by_channel: ["channel"] },
      studentQuestions: { by_channel: ["channel"] },
    };
    const added: Record<string, Record<string, string[]>> = {
      lectures: { by_channel: ["channel"] },
      groupPoints: { by_channel: ["channel"] },
      // UB-convex-2/3: results reads one class's rows, roster each student's newest row.
      groupResults: { by_channel: ["channel"], by_channel_and_lecture: ["channel", "lecture"], by_channel_and_user: ["channel", "user"] },
      questions: { by_channel: ["channel"] },
      lost: { by_channel: ["channel"] },
      // ROLES: new tables for the staff list and the door iPads.
      staff: { by_email: ["email"], by_addedBy: ["addedBy"] },
      staffEvents: {},
      devices: { by_tokenHash: ["tokenHash"] },
      pairings: { by_code: ["code"], by_tokenHash: ["tokenHash"], by_expiresAt: ["expiresAt"] },
    };
    const expected = Object.fromEntries(
      [...new Set([...Object.keys(before), ...Object.keys(added)])].map((table) => [table, { ...before[table], ...added[table] }]),
    );
    const now = Object.fromEntries(
      Object.entries(schema.tables).map(([table, def]) => [table, Object.fromEntries(def[" indexes"]().map((i) => [i.indexDescriptor, i.fields]))]),
    );
    expect(now).toEqual(expected);
  });
});

describe("what the next changes write", () => {
  it("polls, questions and deckChannels take their new optional fields, and the same functions still read them", async () => {
    const t = setup();
    await t.run(async (ctx) => {
      await ctx.db.insert("polls", { channel: CH, question: "Pick one", choices: ["A", "B"], kind: "vote", index: 4, aiDraft: true, open: true, at: T0 });
      await ctx.db.insert("questions", {
        channel: CH,
        index: 4,
        user: "test|student2",
        text: "Can you go over slide 5 again?",
        votes: 0,
        private: true,
        answer: "Yes, after the quiz.",
        shared: false,
        status: "keep",
        topic: "Loops",
        cluster: "Loop end conditions",
        at: T0,
      });
      await ctx.db.insert("deckChannels", { channel: CH, index: 4, beat: 0, count: 12, title: "Slide 5", lines: [], at: T0, run: "run-1", seq: 7 });
    });
    expect(await t.query(api.checkin.quiz.current, { channel: CH })).toMatchObject({ kind: "vote", question: "Pick one", open: true });
    expect(await t.query(api.deck.current, { channel: CH })).toMatchObject({ index: 4, title: "Slide 5" });
    // The question is read straight from the table: who may see a private question is
    // live.questions.list's rule (tested there), not the schema's.
    const stored = await t.run((ctx) => ctx.db.query("questions").withIndex("by_channel_and_index", (q) => q.eq("channel", CH).eq("index", 4)).take(10));
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ private: true, answer: "Yes, after the quiz.", shared: false, status: "keep", topic: "Loops", cluster: "Loop end conditions" });
  });

  it("lectures, groupPoints and groupResults take their rows and read through by_channel", async () => {
    const t = setup();
    const counts = await t.run(async (ctx) => {
      const lecture = await ctx.db.insert("lectures", { channel: CH, startedAt: T0, startsAt: T0 + 30 * 60_000, graceMin: 5, endedAt: T0 + 2 * HOUR });
      await ctx.db.insert("lectures", { channel: CH, startedAt: T0 + 24 * HOUR }); // open: no end yet
      await ctx.db.insert("groupPoints", { channel: CH, user: "test|student1", delta: -1, reason: "Phone out during the quiz", at: T0 });
      await ctx.db.insert("groupPoints", { channel: CH, team: 2, delta: 2, reason: "Helped another team", at: T0 });
      await ctx.db.insert("groupResults", { channel: CH, lecture, endedAt: T0 + 2 * HOUR, user: "test|student1", team: 0, rank: 1, points: 6, ec: 4 });
      const read = (table: "lectures" | "groupPoints" | "groupResults") => ctx.db.query(table).withIndex("by_channel", (q) => q.eq("channel", CH)).take(10);
      return [(await read("lectures")).length, (await read("groupPoints")).length, (await read("groupResults")).length];
    });
    expect(counts).toEqual([2, 2, 1]);
  });

  it("questions.by_channel and lost.by_channel read one class from its start (.gte('_creationTime', start))", async () => {
    const t = setup();
    const row = (index: number, user: string) => ({ channel: CH, index, user, at: Date.now() });
    await t.run(async (ctx) => {
      await ctx.db.insert("questions", { ...row(9, "test|student1"), text: "From last class", votes: 0 });
      await ctx.db.insert("lost", row(9, "test|student1"));
    });
    vi.setSystemTime(T0 + 24 * HOUR); // the next class
    const start = Date.now();
    await t.run(async (ctx) => {
      await ctx.db.insert("questions", { ...row(1, "test|student2"), text: "From this class", votes: 0 });
      await ctx.db.insert("lost", row(1, "test|student2"));
      await ctx.db.insert("lost", { ...row(1, "test|student3"), channel: "another-channel" });
    });
    const now = await t.run(async (ctx) => ({
      questions: (await ctx.db.query("questions").withIndex("by_channel", (q) => q.eq("channel", CH).gte("_creationTime", start)).take(200)).map((q) => q.text),
      lost: (await ctx.db.query("lost").withIndex("by_channel", (q) => q.eq("channel", CH).gte("_creationTime", start)).take(200)).map((l) => l.user),
      allQuestions: (await ctx.db.query("questions").withIndex("by_channel", (q) => q.eq("channel", CH)).take(200)).length,
    }));
    expect(now).toEqual({ questions: ["From this class"], lost: ["test|student2"], allQuestions: 2 });
  });

  it("takes rows that fit the new fields and refuses the same rows with one field wrong or missing", async () => {
    const t = setup();
    const lecture = await t.run((ctx) => ctx.db.insert("lectures", { channel: CH, startedAt: T0 }));
    const question = { channel: CH, index: 0, user: "test|student1", text: "Hi", votes: 0, at: T0 };
    const result = { channel: CH, endedAt: T0, user: "test|student1", team: 0, rank: 1, points: 3, ec: 5 };
    const change = { channel: CH, team: 1, reason: "Bonus", at: T0 };
    const cases = [
      // status is keep or dismissed; a new question has no status
      { table: "questions", good: { ...question, status: "dismissed" }, bad: { ...question, status: "new" }, error: /Validator error/ },
      // a saved result always names the class it came from
      { table: "groupResults", good: { ...result, lecture }, bad: result, error: /Missing required field `lecture`/ },
      // a class always has a start
      { table: "lectures", good: { channel: CH, startedAt: T0 + 1 }, bad: { channel: CH }, error: /Missing required field `startedAt`/ },
      // a point change always has its number of points
      { table: "groupPoints", good: { ...change, delta: 1 }, bad: change, error: /Missing required field `delta`/ },
    ] as const;
    for (const { table, good, bad, error } of cases) {
      await t.run((ctx) => ctx.db.insert(table, good as never));
      await expect(t.run((ctx) => ctx.db.insert(table, bad as never))).rejects.toThrow(error);
    }
  });
});
