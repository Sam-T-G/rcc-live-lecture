// live.questions.vote checks the question's class (T18, 2026-11-01): an upvote counts only for a
// question in the current class (lib.lectureWindow). A vote for a question from an earlier class,
// or one sent between classes, changes nothing and returns quietly, with no new error words: a
// phone left open on last class's list can't move last class's counts.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Id } from "../_generated/dataModel";
import { api } from "../_generated/api";
import { endLecture } from "../lib";
import { at, checkIn, profEnv, setup, slide, typed, type T } from "../test.helpers";

const CH = "gdg";
const T0 = at(2026, 11, 5, 21, 40);
const DAY = 24 * 60 * 60_000;
const student = (t: T, n: number) => typed(t, `Sample student ${n}`, `student${n}@example.edu`);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  profEnv();
});
afterEach(() => {
  vi.useRealTimers();
});

const votesOn = async (t: T, id: Id<"questions">) => {
  const [question, rows] = await t.run(async (ctx) => [
    await ctx.db.get("questions", id),
    await ctx.db.query("questionVotes").withIndex("by_question_and_user", (q) => q.eq("question", id)).take(50),
  ] as const);
  return { votes: question!.votes, rows: rows.length };
};

describe("T18 a vote counts only for a question in the current class", () => {
  it("T18 a vote for last class's question, between classes or in the next class, changes nothing and returns null; this class's questions still count once per student", async () => {
    const t = setup();
    // Class 1: the deck press opens it; students 1 and 2 check in, 1 asks, 2 upvotes.
    await slide(t, CH, 3);
    const [s1, s2, s3] = [student(t, 1), student(t, 2), student(t, 3)];
    await checkIn(t, s1);
    await checkIn(t, s2);
    await s1.mutation(api.live.questions.ask, { channel: CH, index: 3, text: "Is this on the exam?", anonymous: false });
    const old = (await t.run((ctx) => ctx.db.query("questions").withIndex("by_channel", (q) => q.eq("channel", CH)).first()))!._id;
    await s2.mutation(api.live.questions.vote, { question: old });
    expect(await votesOn(t, old)).toEqual({ votes: 1, rows: 1 });

    // Between classes: student 2's second tap would take the upvote back; it changes nothing.
    vi.setSystemTime(T0 + 60 * 60_000);
    await t.run((ctx) => endLecture(ctx, CH));
    expect(await s2.mutation(api.live.questions.vote, { question: old })).toBeNull();
    expect(await votesOn(t, old)).toEqual({ votes: 1, rows: 1 });

    // Class 2 the next day: students 2 and 3 check in. Upvotes on class 1's question, from a
    // student who voted on it, one who never did, and one not checked in to this class, all
    // return null and change nothing.
    vi.setSystemTime(T0 + DAY);
    await slide(t, CH, 3);
    await checkIn(t, s2);
    await checkIn(t, s3);
    for (const voter of [s2, s3, s1]) expect(await voter.mutation(api.live.questions.vote, { question: old })).toBeNull();
    expect(await votesOn(t, old)).toEqual({ votes: 1, rows: 1 });
    expect(await t.query(api.live.questions.list, { channel: CH })).toEqual([]);

    // A question in this class still takes one upvote per student, and a second tap takes it back.
    vi.setSystemTime(T0 + DAY + 6_000);
    await s2.mutation(api.live.questions.ask, { channel: CH, index: 3, text: "Can you zoom in?", anonymous: true });
    const [now] = await t.query(api.live.questions.list, { channel: CH });
    expect(await s3.mutation(api.live.questions.vote, { question: now._id })).toBeNull();
    expect(await votesOn(t, now._id)).toEqual({ votes: 1, rows: 1 });
    expect((await s3.query(api.live.questions.list, { channel: CH }))[0]).toMatchObject({ votes: 1, voted: true });
    await s3.mutation(api.live.questions.vote, { question: now._id });
    expect(await votesOn(t, now._id)).toEqual({ votes: 0, rows: 0 });
    // Student 1 isn't checked in to this class: "Check in first." as before.
    await expect(s1.mutation(api.live.questions.vote, { question: now._id })).rejects.toThrow("Check in first.");
  });
});
