// live/past: the quizzes and votes the professor has ended in this class, for students to look back on.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../_generated/api";
import { endLecture, ensureLecture } from "../lib";
import { admin, at, checkIn, profEnv, setup, typed, type T } from "../test.helpers";

const CH = "gdg";
const T0 = at(2026, 11, 5, 21, 40);
const HOUR = 3_600_000;
const student = (t: T, n: number) => typed(t, `Sample student ${n}`, `student${n}@example.edu`);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  profEnv();
});
afterEach(() => {
  vi.useRealTimers();
});

// A class opens the way the professor's first action opens one, and End day ends it.
const openClass = (t: T) => t.run((ctx) => ensureLecture(ctx, CH));
const endClass = (t: T) => t.run((ctx) => endLecture(ctx, CH));
const ask = (t: T, kind: "quiz" | "vote", question: string, choices: string[], correct?: number) =>
  admin(t).mutation(api.checkin.quiz.ask, { channel: CH, kind, question, choices, correct });

describe("F23 past questions on the phone", () => {
  it("F23.1 ended quizzes and votes newest first with counts and the caller's pick", async () => {
    const t = setup();
    await openClass(t);
    const a = student(t, 1);
    const b = student(t, 2);
    await checkIn(t, a);
    await checkIn(t, b);
    const quiz = await ask(t, "quiz", "What is 2 + 2?", ["3", "4"], 1);
    await a.mutation(api.checkin.quiz.answer, { poll: quiz, choice: 1 });
    await b.mutation(api.checkin.quiz.answer, { poll: quiz, choice: 0 });
    await admin(t).mutation(api.checkin.quiz.end, { poll: quiz });
    vi.setSystemTime(T0 + 60_000);
    const vote = await ask(t, "vote", "Pizza or tacos?", ["Pizza", "Tacos"]);
    await a.mutation(api.checkin.quiz.answer, { poll: vote, choice: 0 });
    await admin(t).mutation(api.checkin.quiz.end, { poll: vote });

    expect(await a.query(api.live.past.past, { channel: CH })).toMatchObject([
      { id: vote, kind: "vote", question: "Pizza or tacos?", choices: ["Pizza", "Tacos"], correct: null, counts: [1, 0], mine: 0, at: T0 + 60_000 },
      { id: quiz, kind: "quiz", question: "What is 2 + 2?", choices: ["3", "4"], correct: 1, counts: [1, 1], mine: 1, at: T0 },
    ]);
    expect((await b.query(api.live.past.past, { channel: CH })).map((p) => p.mine)).toEqual([null, 0]);
    expect((await t.query(api.live.past.past, { channel: CH })).map((p) => p.mine)).toEqual([null, null]);
  });

  it("F23.2 open ones never appear", async () => {
    const t = setup();
    await openClass(t);
    const a = student(t, 1);
    await checkIn(t, a);
    const first = await ask(t, "quiz", "What is 2 + 2?", ["3", "4"], 1);
    await a.mutation(api.checkin.quiz.answer, { poll: first, choice: 1 });
    expect(await a.query(api.live.past.past, { channel: CH })).toEqual([]);
    await admin(t).mutation(api.checkin.quiz.end, { poll: first });
    vi.setSystemTime(T0 + 60_000);
    await ask(t, "quiz", "What is 3 + 3?", ["6", "7"], 0);
    expect((await a.query(api.live.past.past, { channel: CH })).map((p) => p.question)).toEqual(["What is 2 + 2?"]);
  });

  it("F23 past returns up to 50 ended polls even when newer open ones exist; F8 only this class", async () => {
    const t = setup();
    // Last class: one ended quiz. Between classes the list is empty.
    await openClass(t);
    const last = await ask(t, "quiz", "What is 1 + 1?", ["2", "3"], 0);
    await admin(t).mutation(api.checkin.quiz.end, { poll: last });
    vi.setSystemTime(T0 + HOUR);
    await endClass(t);
    expect(await t.query(api.live.past.past, { channel: CH })).toEqual([]);

    // This class: 52 ended quizzes, then two left open (written straight to the table, since ask
    // keeps only one open).
    const start = T0 + 2 * HOUR;
    vi.setSystemTime(start);
    await openClass(t);
    await t.run(async (ctx) => {
      for (let i = 1; i <= 52; i++)
        await ctx.db.insert("polls", { channel: CH, question: `Question ${i}`, choices: ["A", "B"], correct: 0, kind: "quiz", open: false, at: start + i, closedAt: start + i });
      for (const i of [53, 54]) await ctx.db.insert("polls", { channel: CH, question: `Question ${i}`, choices: ["A", "B"], kind: "vote", open: true, at: start + i });
    });
    const shown = await t.query(api.live.past.past, { channel: CH });
    expect(shown).toHaveLength(50);
    expect(shown[0].question).toBe("Question 52");
    expect(shown[49].question).toBe("Question 3");
    expect(shown.map((p) => p.id)).not.toContain(last);
  });
});
