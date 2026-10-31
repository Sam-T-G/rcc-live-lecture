// live/past: the quizzes and votes the professor has ended, for students to look back on.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../_generated/api";
import { at, checkIn, PROF_KEY, profEnv, setup, typed, type T } from "../test.helpers";

const CH = "gdg";
const T0 = at(2026, 11, 5, 21, 40);
const student = (t: T, n: number) => typed(t, `Sample student ${n}`, `student${n}@example.edu`);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  profEnv();
});
afterEach(() => {
  vi.useRealTimers();
});

const ask = (t: T, kind: "quiz" | "vote", question: string, choices: string[], correct?: number) =>
  t.mutation(api.checkin.quiz.ask, { key: PROF_KEY, channel: CH, kind, question, choices, correct });

describe("F23 past questions on the phone", () => {
  it("F23.1 ended quizzes and votes newest first with counts and the caller's pick", async () => {
    const t = setup();
    const a = student(t, 1);
    const b = student(t, 2);
    await checkIn(t, a);
    await checkIn(t, b);
    const quiz = await ask(t, "quiz", "What is 2 + 2?", ["3", "4"], 1);
    await a.mutation(api.checkin.quiz.answer, { poll: quiz, choice: 1 });
    await b.mutation(api.checkin.quiz.answer, { poll: quiz, choice: 0 });
    await t.mutation(api.checkin.quiz.end, { key: PROF_KEY, poll: quiz });
    vi.setSystemTime(T0 + 60_000);
    const vote = await ask(t, "vote", "Pizza or tacos?", ["Pizza", "Tacos"]);
    await a.mutation(api.checkin.quiz.answer, { poll: vote, choice: 0 });
    await t.mutation(api.checkin.quiz.end, { key: PROF_KEY, poll: vote });

    expect(await a.query(api.live.past.past, { channel: CH })).toMatchObject([
      { id: vote, kind: "vote", question: "Pizza or tacos?", choices: ["Pizza", "Tacos"], correct: null, counts: [1, 0], mine: 0, at: T0 + 60_000 },
      { id: quiz, kind: "quiz", question: "What is 2 + 2?", choices: ["3", "4"], correct: 1, counts: [1, 1], mine: 1, at: T0 },
    ]);
    expect((await b.query(api.live.past.past, { channel: CH })).map((p) => p.mine)).toEqual([null, 0]);
    expect((await t.query(api.live.past.past, { channel: CH })).map((p) => p.mine)).toEqual([null, null]);
  });

  it("F23.2 open ones never appear", async () => {
    const t = setup();
    const a = student(t, 1);
    await checkIn(t, a);
    const first = await ask(t, "quiz", "What is 2 + 2?", ["3", "4"], 1);
    await a.mutation(api.checkin.quiz.answer, { poll: first, choice: 1 });
    expect(await a.query(api.live.past.past, { channel: CH })).toEqual([]);
    await t.mutation(api.checkin.quiz.end, { key: PROF_KEY, poll: first });
    vi.setSystemTime(T0 + 60_000);
    await ask(t, "quiz", "What is 3 + 3?", ["6", "7"], 0);
    expect((await a.query(api.live.past.past, { channel: CH })).map((p) => p.question)).toEqual(["What is 2 + 2?"]);
  });
});
