// checkin/quiz: the live quiz and vote. The professor asks and ends; checked-in students answer.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../_generated/api";
import { at, checkIn, PROF_KEY, profEnv, setup, typed } from "../test.helpers";

const CH = "gdg";
const T0 = at(2026, 11, 5, 21, 40);
const student = (t: ReturnType<typeof setup>, n: number) => typed(t, `Sample student ${n}`, `student${n}@example.edu`);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  profEnv();
});
afterEach(() => {
  vi.useRealTimers();
});

const ask = (t: ReturnType<typeof setup>, kind: "quiz" | "vote", question: string, choices: string[], correct?: number) =>
  t.mutation(api.checkin.quiz.ask, { key: PROF_KEY, channel: CH, kind, question, choices, correct });
const end = (t: ReturnType<typeof setup>, poll: Awaited<ReturnType<typeof ask>>) => t.mutation(api.checkin.quiz.end, { key: PROF_KEY, poll });

// n checked-in students.
async function room(t: ReturnType<typeof setup>, n: number) {
  const out = [];
  for (let i = 1; i <= n; i++) {
    const s = student(t, i);
    await checkIn(t, s);
    out.push(s);
  }
  return out;
}

describe("F17 the professor asks, ends and sees the numbers", () => {
  it("F17.1 'Type a question.' for spaces, 'Give 2 to 4 choices.' for 1 and 5 choices", async () => {
    const t = setup();
    await expect(ask(t, "quiz", "   ", ["A", "B"])).rejects.toThrow("Type a question.");
    await expect(ask(t, "quiz", "Which one is a vowel?", ["A"])).rejects.toThrow("Give 2 to 4 choices.");
    await expect(ask(t, "vote", "Pick a color", ["Red", "Blue", "Yellow", "Green", "Orange"])).rejects.toThrow("Give 2 to 4 choices.");
    expect(await t.query(api.checkin.quiz.current, { channel: CH })).toBeNull();
    await ask(t, "vote", " Pick a color ", ["Red", "Blue", "Yellow", "Green"]);
    expect(await t.query(api.checkin.quiz.current, { channel: CH })).toMatchObject({
      kind: "vote",
      question: "Pick a color",
      choices: ["Red", "Blue", "Yellow", "Green"],
      open: true,
    });
  });

  it("F17.2 asking closes the open poll", async () => {
    const t = setup();
    const [s] = await room(t, 1);
    const first = await ask(t, "quiz", "Which one is a vowel?", ["A", "B"], 0);
    vi.setSystemTime(T0 + 60_000);
    const second = await ask(t, "quiz", "Which one is a number?", ["7", "Q"], 0);
    expect(await t.query(api.checkin.quiz.current, { channel: CH })).toMatchObject({ id: second, open: true });
    await expect(s.mutation(api.checkin.quiz.answer, { poll: first, choice: 0 })).rejects.toThrow(/ended/);
    expect((await t.query(api.live.past.past, { channel: CH })).map((p) => p.question)).toEqual(["Which one is a vowel?"]);
    await s.mutation(api.checkin.quiz.answer, { poll: second, choice: 0 });
  });

  it("F17.4 stats counts and % right after End", async () => {
    const t = setup();
    const ss = await room(t, 4);
    const poll = await ask(t, "quiz", "What is 2 + 2?", ["3", "4", "5"], 1);
    vi.setSystemTime(T0 + 2_000);
    await ss[0].mutation(api.checkin.quiz.answer, { poll, choice: 1 });
    vi.setSystemTime(T0 + 4_000);
    await ss[2].mutation(api.checkin.quiz.answer, { poll, choice: 1 });
    vi.setSystemTime(T0 + 10_000);
    await ss[1].mutation(api.checkin.quiz.answer, { poll, choice: 0 });
    // While open the professor sees how many answered out of how many checked in.
    expect(await t.query(api.checkin.quiz.stats, { key: PROF_KEY, poll })).toMatchObject({ answered: 3, checkedIn: 4 });
    await end(t, poll);
    // 2 of 3 right is 67%; the answers took 2, 4 and 10 seconds, so the median is 4.
    expect(await t.query(api.checkin.quiz.stats, { key: PROF_KEY, poll })).toMatchObject({
      counts: [1, 2, 0],
      answered: 3,
      checkedIn: 4,
      correct: 1,
      rightPct: 67,
      medianSec: 4,
    });
  });

  it("F17.5 history newest first", async () => {
    const t = setup();
    const ss = await room(t, 2);
    const vote = await ask(t, "vote", "Pizza or tacos?", ["Pizza", "Tacos"]);
    await ss[0].mutation(api.checkin.quiz.answer, { poll: vote, choice: 1 });
    vi.setSystemTime(T0 + 60_000);
    const quiz = await ask(t, "quiz", "What is 2 + 2?", ["3", "4"], 1);
    await ss[0].mutation(api.checkin.quiz.answer, { poll: quiz, choice: 1 });
    await ss[1].mutation(api.checkin.quiz.answer, { poll: quiz, choice: 1 });
    await end(t, quiz);
    const history = await t.query(api.checkin.quiz.history, { key: PROF_KEY, channel: CH });
    expect(history.map((h) => [h.id, h.kind, h.question, h.answered, h.rightPct])).toEqual([
      [quiz, "quiz", "What is 2 + 2?", 2, 100],
      [vote, "vote", "Pizza or tacos?", 1, null],
    ]);
  });
});

describe("F18 students answer", () => {
  it("F18.2 a quiz answer locks ('You already answered.')", async () => {
    const t = setup();
    const [s] = await room(t, 1);
    const poll = await ask(t, "quiz", "Which one is a vowel?", ["B", "E", "K"], 1);
    expect(await s.query(api.checkin.quiz.mine, { poll })).toBeNull();
    await s.mutation(api.checkin.quiz.answer, { poll, choice: 0 });
    await expect(s.mutation(api.checkin.quiz.answer, { poll, choice: 1 })).rejects.toThrow("You already answered.");
    expect(await s.query(api.checkin.quiz.mine, { poll })).toBe(0);
    expect(await t.query(api.checkin.quiz.mine, { poll })).toBeNull(); // signed out
  });

  it("F18.3 a vote changes and counts once", async () => {
    const t = setup();
    const [s] = await room(t, 1);
    const poll = await ask(t, "vote", "Pick a color", ["Red", "Blue", "Yellow", "Green"], 0);
    await s.mutation(api.checkin.quiz.answer, { poll, choice: 1 });
    await s.mutation(api.checkin.quiz.answer, { poll, choice: 3 });
    expect(await s.query(api.checkin.quiz.mine, { poll })).toBe(3);
    expect(await t.query(api.checkin.quiz.current, { channel: CH })).toMatchObject({ answered: 1 });
    await end(t, poll);
    // One student, one count; a vote never keeps a right answer.
    expect((await t.query(api.checkin.quiz.current, { channel: CH }))!.results).toEqual({ counts: [0, 0, 0, 1], correct: null });
  });

  it("F18.4 'Check in first.', 'Sign in first.', ended and out-of-range errors", async () => {
    const t = setup();
    const [s] = await room(t, 1);
    const poll = await ask(t, "quiz", "Which one is a vowel?", ["B", "E", "K", "M"], 1);
    await expect(student(t, 2).mutation(api.checkin.quiz.answer, { poll, choice: 1 })).rejects.toThrow("Check in first.");
    await expect(t.mutation(api.checkin.quiz.answer, { poll, choice: 1 })).rejects.toThrow("Sign in first.");
    for (const choice of [-1, 4, 1.5])
      await expect(s.mutation(api.checkin.quiz.answer, { poll, choice })).rejects.toThrow("Pick one of the choices.");
    await end(t, poll);
    await expect(s.mutation(api.checkin.quiz.answer, { poll, choice: 1 })).rejects.toThrow(/ended/);
    expect(await s.query(api.checkin.quiz.mine, { poll })).toBeNull();
  });

  it("F18.6 current returns no counts or right answer while open", async () => {
    const t = setup();
    const [s] = await room(t, 1);
    const poll = await ask(t, "quiz", "Which one is a vowel?", ["B", "E", "K"], 1);
    await s.mutation(api.checkin.quiz.answer, { poll, choice: 1 });
    const open = await t.query(api.checkin.quiz.current, { channel: CH });
    expect(open).toMatchObject({ id: poll, kind: "quiz", open: true, answered: 1, results: null });
    expect(JSON.stringify(open)).not.toMatch(/correct|counts/);
    await end(t, poll);
    expect((await t.query(api.checkin.quiz.current, { channel: CH }))!.results).toEqual({ counts: [0, 1, 0], correct: 1 });
  });
});
