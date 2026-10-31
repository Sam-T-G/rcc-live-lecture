// live/questions: students post questions beside a slide, anonymously or by name, and upvote them.
// Everyone here is checked in and the deck has reached slide 4 (index 3), the way a class runs.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Id } from "../_generated/dataModel";
import { api } from "../_generated/api";
import { at, checkIn, profEnv, setup, slide, TYPED_ISSUER, typed, type T } from "../test.helpers";

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

async function room(t: T, n: number) {
  await slide(t, CH, 3);
  const out = [];
  for (let i = 1; i <= n; i++) {
    const s = student(t, i);
    await checkIn(t, s);
    out.push(s);
  }
  return out;
}
const list = (c: Pick<T, "query">, index?: number) => c.query(api.live.questions.list, { channel: CH, index });
const voteRows = (t: T, question: Id<"questions">) =>
  t.run(async (ctx) => (await ctx.db.query("questionVotes").withIndex("by_question_and_user", (q) => q.eq("question", question)).collect()).length);

describe("F22 questions beside the slide", () => {
  it("F22.2 empty, over 280 characters and a second post within 5 s are refused", async () => {
    const t = setup();
    const [s] = await room(t, 1);
    await expect(s.mutation(api.live.questions.ask, { channel: CH, index: 0, text: "   ", anonymous: true })).rejects.toThrow();
    await expect(s.mutation(api.live.questions.ask, { channel: CH, index: 0, text: "x".repeat(281), anonymous: true })).rejects.toThrow(/280/);
    expect(await list(t)).toEqual([]);
    await s.mutation(api.live.questions.ask, { channel: CH, index: 0, text: "x".repeat(280), anonymous: true });
    vi.setSystemTime(T0 + 1_000);
    await expect(s.mutation(api.live.questions.ask, { channel: CH, index: 0, text: "Why is the sky blue?", anonymous: true })).rejects.toThrow(/Wait/);
    vi.setSystemTime(T0 + 6_000);
    await s.mutation(api.live.questions.ask, { channel: CH, index: 0, text: "Why is the sky blue?", anonymous: true });
    expect(await list(t)).toHaveLength(2);
    await expect(t.mutation(api.live.questions.ask, { channel: CH, index: 0, text: "Hello", anonymous: true })).rejects.toThrow("Sign in first.");
  });

  it("F22.3 upvote toggles, your own is refused, votes equals questionVotes rows", async () => {
    const t = setup();
    const [author, b, c] = await room(t, 3);
    await author.mutation(api.live.questions.ask, { channel: CH, index: 1, text: "What does O(n) mean?", anonymous: false });
    const [q] = await list(t);
    await b.mutation(api.live.questions.vote, { question: q._id });
    await c.mutation(api.live.questions.vote, { question: q._id });
    expect((await list(b))[0]).toMatchObject({ votes: 2, voted: true, mine: false });
    expect(await voteRows(t, q._id)).toBe(2);
    await b.mutation(api.live.questions.vote, { question: q._id }); // a second tap takes it back
    expect((await list(b))[0]).toMatchObject({ votes: 1, voted: false });
    expect(await voteRows(t, q._id)).toBe(1);
    await expect(author.mutation(api.live.questions.vote, { question: q._id })).rejects.toThrow(/own/);
    expect((await list(author))[0]).toMatchObject({ votes: 1, voted: false, mine: true });
    expect(await voteRows(t, q._id)).toBe(1);
    await expect(t.mutation(api.live.questions.vote, { question: q._id })).rejects.toThrow("Sign in first.");
  });

  it("F22.4 sorted by upvotes then newest, for one slide or every slide", async () => {
    const t = setup();
    const ss = await room(t, 6);
    const texts = ["First question", "Second question", "Third question", "Fourth question"];
    for (const [i, text] of texts.entries()) {
      vi.setSystemTime(T0 + i * 6_000);
      await ss[i].mutation(api.live.questions.ask, { channel: CH, index: i === 3 ? 2 : 1, text, anonymous: true });
    }
    const id = async (text: string) => (await list(t)).find((q) => q.text === text)!._id;
    await ss[4].mutation(api.live.questions.vote, { question: await id("Second question") });
    await ss[5].mutation(api.live.questions.vote, { question: await id("Second question") });
    await ss[4].mutation(api.live.questions.vote, { question: await id("Fourth question") });
    expect((await list(t)).map((q) => [q.text, q.votes, q.index])).toEqual([
      ["Second question", 2, 1],
      ["Fourth question", 1, 2],
      ["Third question", 0, 1],
      ["First question", 0, 1],
    ]);
    expect((await list(t, 1)).map((q) => q.text)).toEqual(["Second question", "Third question", "First question"]);
    expect((await list(t, 2)).map((q) => q.text)).toEqual(["Fourth question"]);
    expect(await list(t, 0)).toEqual([]);
  });

  it("F22.5 the author deletes and the votes go too", async () => {
    const t = setup();
    const [author, voter, other] = await room(t, 3);
    await author.mutation(api.live.questions.ask, { channel: CH, index: 0, text: "Can you go back one slide?", anonymous: true });
    const [q] = await list(t);
    await voter.mutation(api.live.questions.vote, { question: q._id });
    await expect(other.mutation(api.live.questions.remove, { question: q._id })).rejects.toThrow(/author/);
    expect(await list(t)).toHaveLength(1);
    await author.mutation(api.live.questions.remove, { question: q._id });
    expect(await list(t)).toEqual([]);
    expect(await voteRows(t, q._id)).toBe(0);
  });

  it("F22.6 anonymous stores no name and list never returns user", async () => {
    const t = setup();
    const [a, b] = await room(t, 2);
    await a.mutation(api.live.questions.ask, { channel: CH, index: 0, text: "Is this on the exam?", anonymous: true });
    vi.setSystemTime(T0 + 6_000);
    await b.mutation(api.live.questions.ask, { channel: CH, index: 0, text: "Where are the slides posted?", anonymous: false });
    const rows = await t.run((ctx) =>
      ctx.db.query("questions").withIndex("by_channel_and_index", (q) => q.eq("channel", CH).eq("index", 0)).take(10),
    );
    expect(rows.find((r) => r.text === "Is this on the exam?")!.name).toBeUndefined();
    const shown = await list(t);
    expect(shown.map((q) => [q.text, q.name])).toEqual([
      ["Where are the slides posted?", "Sample student 2"],
      ["Is this on the exam?", null],
    ]);
    for (const reader of [t, a, b]) {
      for (const q of await list(reader)) expect(q).not.toHaveProperty("user");
      const text = JSON.stringify(await list(reader));
      expect(text).not.toContain(TYPED_ISSUER);
      expect(text).not.toContain("@example.edu");
    }
  });
});
