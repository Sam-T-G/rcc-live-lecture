// live/questions: students post questions beside a slide on #/live, anonymously or by name, upvote
// them, and can keep one private for the professor; the professor sorts, answers, shares, deletes
// and groups them by topic with AI on #/host Questions. Each class sees only its own questions.
// Unless a test says otherwise, every student is checked in and the deck is on slide 4 (index 3),
// the way a class runs.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Id } from "../_generated/dataModel";
import { api, internal } from "../_generated/api";
import { endLecture, ensureLecture } from "../lib";
import {
  ADMIN_EMAIL,
  HOST_ONLY,
  SCANNER_EMAIL,
  TYPED_ISSUER,
  admin,
  at,
  authMatrix,
  checkIn,
  google,
  grant,
  professor,
  profEnv,
  setup,
  slide,
  typed,
  type Caller,
  type T,
} from "../test.helpers";

const CH = "gdg";
const T0 = at(2026, 11, 5, 21, 40);
const HOUR = 60 * 60_000;
const DAY = 24 * HOUR;
const student = (t: T, n: number) => typed(t, `Sample student ${n}`, `student${n}@example.edu`);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  profEnv();
});
afterEach(() => {
  vi.useRealTimers();
});

// The deck on slide 4 and students `first` to `first + n - 1` checked in.
async function room(t: T, n: number, first = 1) {
  await slide(t, CH, 3);
  const out: Caller[] = [];
  for (let i = first; i < first + n; i++) {
    const s = student(t, i);
    await checkIn(t, s);
    out.push(s);
  }
  return out;
}

// A post on slide 4 (anonymous unless `anonymous: false`), then the clock moves 6 s on, so the
// same student can post again. `private` goes only when set, the way a phone from before private
// questions posts.
async function post(s: Caller, text: string, o: { index?: number; anonymous?: boolean; private?: boolean } = {}) {
  await s.mutation(api.live.questions.ask, { channel: CH, index: o.index ?? 3, text, anonymous: o.anonymous ?? true, ...(o.private ? { private: true } : {}) });
  vi.setSystemTime(Date.now() + 6_000);
}

const list = (c: Pick<T, "query">, index?: number) => c.query(api.live.questions.list, { channel: CH, index });
const forHost = (c: Pick<T, "query">) => c.query(api.live.questions.forHost, { channel: CH });
const one = async (c: Pick<T, "query">, id: Id<"questions">) => (await forHost(c)).find((q) => q._id === id)!;
const row = (t: T, id: Id<"questions">) => t.run((ctx) => ctx.db.get("questions", id));
const voteRows = (t: T, question: Id<"questions">) =>
  t.run(async (ctx) => (await ctx.db.query("questionVotes").withIndex("by_question_and_user", (q) => q.eq("question", question)).collect()).length);
const openClass = (t: T) => t.run((ctx) => ensureLecture(ctx, CH));
const endClass = (t: T) => t.run((ctx) => endLecture(ctx, CH));

// A Gemini reply with this text, the way the REST API sends one, and the AI set up.
const said = (text: string) =>
  new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), { status: 200, headers: { "Content-Type": "application/json" } });
function geminiEnv() {
  vi.stubEnv("GEMINI_API_KEY", "test-gemini-key");
  vi.stubEnv("GEMINI_MODEL_FAST", "test-fast");
}
// The question lines organize sent Gemini, from the request body.
const sentText = (init: RequestInit | undefined) => JSON.parse(String(init?.body)).contents[0].parts[0].text as string;
// A reply that gives each numbered line a topic and a group made from its own text.
const topicsFor = (lines: string) =>
  JSON.stringify({
    items: lines.split("\n").map((l) => {
      const [n, ...rest] = l.split(". ");
      const text = rest.join(". ");
      return { n: Number(n), topic: `About ${text}`, cluster: `Same as ${text}` };
    }),
  });

describe("F22 questions beside the slide", () => {
  it("F22.2 empty, 281 characters and a second post within 5 s refused; 280 characters accepted", async () => {
    const t = setup();
    const [s] = await room(t, 1);
    const ask = (text: string) => s.mutation(api.live.questions.ask, { channel: CH, index: 3, text, anonymous: true });
    await expect(ask("   ")).rejects.toThrow("Write something first.");
    await expect(ask("x".repeat(281))).rejects.toThrow("280 characters at most.");
    expect(await list(t)).toEqual([]);
    await ask(` ${"x".repeat(280)} `);
    vi.setSystemTime(T0 + 4_000);
    await expect(ask("Why is the sky blue?")).rejects.toThrow("Wait 5 seconds before posting again.");
    vi.setSystemTime(T0 + 6_000);
    await ask("Why is the sky blue?");
    expect((await list(t)).map((q) => q.text.length).sort()).toEqual([20, 280]);
    await expect(t.mutation(api.live.questions.ask, { channel: CH, index: 3, text: "Hello", anonymous: true })).rejects.toThrow("Sign in first.");
  });

  it("F22.3 upvote toggles, your own is refused, votes equals questionVotes rows", async () => {
    const t = setup();
    const [author, b, c] = await room(t, 3);
    await post(author, "What does O(n) mean?", { index: 1, anonymous: false });
    const [q] = await list(t);
    await b.mutation(api.live.questions.vote, { question: q._id });
    await c.mutation(api.live.questions.vote, { question: q._id });
    expect((await list(b))[0]).toMatchObject({ votes: 2, voted: true, mine: false });
    expect(await voteRows(t, q._id)).toBe(2);
    await b.mutation(api.live.questions.vote, { question: q._id }); // a second tap takes it back
    expect((await list(b))[0]).toMatchObject({ votes: 1, voted: false });
    expect(await voteRows(t, q._id)).toBe(1);
    await expect(author.mutation(api.live.questions.vote, { question: q._id })).rejects.toThrow("You can't upvote your own.");
    expect((await list(author))[0]).toMatchObject({ votes: 1, voted: false, mine: true });
    expect(await voteRows(t, q._id)).toBe(1);
    await expect(t.mutation(api.live.questions.vote, { question: q._id })).rejects.toThrow("Sign in first.");
  });

  it("F22.4 sorted by upvotes then newest, for one slide or every slide", async () => {
    const t = setup();
    const ss = await room(t, 6);
    const texts = ["First question", "Second question", "Third question", "Fourth question"];
    for (const [i, text] of texts.entries()) await post(ss[i], text, { index: i === 3 ? 2 : 1 });
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

  it("F22.5/F30.6 remove: another student, a scanner, a typed sign-in with the admin's email and a signed-out caller refused; the author, a professor and an admin allowed; the votes go too", async () => {
    const t = setup();
    const [author, voter, other] = await room(t, 3);
    await grant(t, SCANNER_EMAIL, "scanner");
    for (const text of ["Can you go back one slide?", "Is this on the exam?", "Where are the slides posted?"]) await post(author, text);
    const [a, b, c] = (await list(t)).sort((x, y) => x.at - y.at).map((q) => q._id);
    await voter.mutation(api.live.questions.vote, { question: a });
    for (const as of [other, google(t, "Sample scanner", SCANNER_EMAIL), typed(t, "Sample admin", ADMIN_EMAIL)])
      await expect(as.mutation(api.live.questions.remove, { question: a })).rejects.toThrow("Only the author or a professor can delete this.");
    await expect(t.mutation(api.live.questions.remove, { question: a })).rejects.toThrow("Sign in first.");
    expect(await list(t)).toHaveLength(3);
    await author.mutation(api.live.questions.remove, { question: a });
    expect(await voteRows(t, a)).toBe(0);
    await (await professor(t)).mutation(api.live.questions.remove, { question: b });
    await admin(t).mutation(api.live.questions.remove, { question: c });
    expect(await list(t)).toEqual([]);
    await author.mutation(api.live.questions.remove, { question: a }); // already gone: nothing happens
  });

  it("F22.6 list never returns user, for any reader; anonymous stores no name; forHost never returns user either", async () => {
    const t = setup();
    const [a, b] = await room(t, 2);
    await post(a, "Is this on the exam?");
    await post(b, "Where are the slides posted?", { anonymous: false });
    await post(b, "I'm lost on the formula", { anonymous: false, private: true });
    const rows = await t.run((ctx) => ctx.db.query("questions").withIndex("by_channel_and_index", (q) => q.eq("channel", CH).eq("index", 3)).take(10));
    expect(rows.find((r) => r.text === "Is this on the exam?")!.name).toBeUndefined();
    expect((await list(t)).map((q) => [q.text, q.name])).toEqual([
      ["Where are the slides posted?", "Sample student 2"],
      ["Is this on the exam?", null],
    ]);
    for (const reader of [t, a, b, await professor(t)]) {
      for (const q of await list(reader)) expect(q).not.toHaveProperty("user");
      const text = JSON.stringify(await list(reader));
      expect(text).not.toContain(TYPED_ISSUER);
      expect(text).not.toContain("@example.edu");
    }
    const host = await forHost(await professor(t));
    expect(host).toHaveLength(3);
    for (const q of host) expect(q).not.toHaveProperty("user");
    expect(JSON.stringify(host)).not.toContain(TYPED_ISSUER);
    expect(JSON.stringify(host)).not.toContain("@example.edu");
  });
});

describe("F21 only checked-in students post and upvote", () => {
  it("F21.1 ask and vote throw 'Check in first.' with no check-in in this class", async () => {
    const t = setup();
    await openClass(t);
    const [s1] = await room(t, 1);
    await post(s1, "What is a hash route?");
    const [q1] = await list(t);
    const never = student(t, 9); // signed in, never checked in
    await expect(never.mutation(api.live.questions.ask, { channel: CH, index: 3, text: "Can I ask?", anonymous: true })).rejects.toThrow("Check in first.");
    await expect(never.mutation(api.live.questions.vote, { question: q1._id })).rejects.toThrow("Check in first.");

    // The next class: student 1's check-in was last class's.
    vi.setSystemTime(T0 + HOUR);
    await endClass(t);
    vi.setSystemTime(T0 + 5 * DAY);
    await openClass(t);
    const [s2] = await room(t, 1, 2);
    await post(s2, "Is this on the exam?");
    const [q2] = await list(t);
    await expect(s1.mutation(api.live.questions.ask, { channel: CH, index: 3, text: "Can I ask?", anonymous: true })).rejects.toThrow("Check in first.");
    await expect(s1.mutation(api.live.questions.vote, { question: q2._id })).rejects.toThrow("Check in first.");
    expect((await list(t)).map((q) => [q.text, q.votes])).toEqual([["Is this on the exam?", 0]]);
    expect(await voteRows(t, q2._id)).toBe(0);
  });
});

describe("live-backend-16 questions go on slides the deck has shown", () => {
  it("live-backend-16 index -1, 2.5 and a slide past the deck's current one are refused", async () => {
    const t = setup();
    const [s] = await room(t, 1); // the deck is on slide 4 (index 3)
    for (const index of [-1, 2.5, 4, 999])
      await expect(s.mutation(api.live.questions.ask, { channel: CH, index, text: "Which slide is this?", anonymous: true })).rejects.toThrow(
        "That slide hasn't been shown yet.",
      );
    expect(await list(t)).toEqual([]);
    await post(s, "A question on slide 1", { index: 0 });
    await post(s, "A question on slide 4", { index: 3 });
    expect((await list(t)).map((q) => q.index).sort()).toEqual([0, 3]);
  });

  it("live-backend-16 a slide the deck showed earlier in this class still takes questions after the professor goes back", async () => {
    const t = setup();
    const [s] = await room(t, 1);
    await slide(t, CH, 6);
    await slide(t, CH, 2); // back to slide 3: slide 7 was shown, slide 8 never was
    await post(s, "A question on slide 7", { index: 6 });
    await expect(s.mutation(api.live.questions.ask, { channel: CH, index: 7, text: "A question on slide 8", anonymous: true })).rejects.toThrow(
      "That slide hasn't been shown yet.",
    );
    expect((await list(t)).map((q) => q.index)).toEqual([6]);
  });
});

describe("live-frontend-17 names on by-name posts", () => {
  it("live-frontend-17 a by-name post never shows an email; a spaces-only name is stored as 'Student'", async () => {
    const t = setup();
    await slide(t, CH, 3);
    // The typed sign-in sends the email as the name when the name box holds only spaces.
    const posters = [
      typed(t, "jane.doe@example.edu", "jane.doe@example.edu"),
      typed(t, "   ", "sam.student@example.edu"),
      typed(t, "Ada ada.l@example.edu", "ada.l@example.edu"),
    ];
    for (const [i, s] of posters.entries()) {
      await checkIn(t, s);
      await post(s, `Question ${i + 1}`, { anonymous: false });
    }
    const shown = (await list(t)).map((q) => [q.text, q.name]).sort();
    expect(shown).toEqual([
      ["Question 1", "jane.doe"],
      ["Question 2", "Student"],
      ["Question 3", "Ada"],
    ]);
    const stored = await t.run((ctx) => ctx.db.query("questions").withIndex("by_channel", (q) => q.eq("channel", CH)).take(10));
    for (const r of stored) expect(r.name).not.toContain("@");
    expect(JSON.stringify(await forHost(await professor(t)))).not.toContain("@");
  });
});

describe("F30 the professor's Questions tab on #/host", () => {
  it("F30.1 forHost lists every question in this class with slide, upvotes, and name or null when anonymous; host-only", async () => {
    const t = setup();
    const [s1, s2, s3] = await room(t, 3);
    await post(s1, "What does O(n) mean?", { index: 1 });
    await post(s2, "Is this on the exam?", { index: 2, anonymous: false });
    const exam = (await list(t)).find((q) => q.text === "Is this on the exam?")!._id;
    await s1.mutation(api.live.questions.vote, { question: exam });
    await s3.mutation(api.live.questions.vote, { question: exam });
    const p = await professor(t);
    expect(await forHost(p)).toEqual([
      {
        _id: exam,
        index: 2,
        text: "Is this on the exam?",
        name: "Sample student 2",
        private: false,
        votes: 2,
        at: expect.any(Number),
        topic: null,
        cluster: null,
        status: "new",
        answer: null,
        shared: false,
      },
      expect.objectContaining({ index: 1, text: "What does O(n) mean?", name: null, private: false, votes: 0, status: "new" }),
    ]);
    await expect(forHost(s1)).rejects.toThrow("Only professors can do that.");
    await expect(forHost(t)).rejects.toThrow("Sign in first.");
  });

  it("F30.5 a private question is left out of another student's list (with and without index) and a signed-out list; the author sees it with private: true; upvoting it is refused; sharing it throws 'That question is private.'", async () => {
    const t = setup();
    const [author, other] = await room(t, 2);
    await post(author, "I don't get slide 4 at all", { anonymous: false, private: true });
    await post(author, "Can you zoom in?");
    const p = await professor(t);
    const secret = (await forHost(p)).find((q) => q.private)!;
    expect(secret).toMatchObject({ text: "I don't get slide 4 at all", name: "Sample student 1", private: true, votes: 0 });
    for (const reader of [other, t, p]) for (const index of [undefined, 3]) expect((await list(reader, index)).map((q) => q.text)).toEqual(["Can you zoom in?"]);
    for (const index of [undefined, 3])
      expect((await list(author, index)).map((q) => [q.text, q.private, q.mine])).toEqual([
        ["Can you zoom in?", false, true],
        ["I don't get slide 4 at all", true, true],
      ]);
    await expect(other.mutation(api.live.questions.vote, { question: secret._id })).rejects.toThrow("You can't upvote a private question.");
    expect(await voteRows(t, secret._id)).toBe(0);
    await p.mutation(api.live.questions.answer, { question: secret._id, text: "Slide 4 is the hash route diagram." });
    expect((await list(author)).find((q) => q.private)!.answer).toBeNull(); // saved, not shared
    // Sam's decision D12 (e): a private question's answer can't be shared, not even with its author.
    await expect(p.mutation(api.live.questions.share, { question: secret._id, shared: true })).rejects.toThrow("That question is private.");
    expect((await forHost(p)).find((q) => q.private)).toMatchObject({ answer: "Slide 4 is the hash route diagram.", shared: false });
    expect((await list(author)).find((q) => q.private)!.answer).toBeNull();
    for (const reader of [other, t, p]) expect((await list(reader)).map((q) => q.text)).toEqual(["Can you zoom in?"]);
  });

  it("F30.3 answer trims and caps at 1000; an empty answer clears answer and shared; saving never shares", async () => {
    const t = setup();
    const [s] = await room(t, 1);
    await post(s, "Is the database live?");
    const p = await professor(t);
    const [{ _id: q }] = await forHost(p);
    await p.mutation(api.live.questions.answer, { question: q, text: "  It updates live.  " });
    expect(await one(p, q)).toMatchObject({ answer: "It updates live.", status: "keep", shared: false });
    expect((await list(s))[0].answer).toBeNull(); // saving never shares
    const long = "a".repeat(1000);
    await p.mutation(api.live.questions.answer, { question: q, text: ` ${long} ` });
    expect((await one(p, q)).answer).toBe(long);
    await expect(p.mutation(api.live.questions.answer, { question: q, text: long + "a" })).rejects.toThrow("1000 characters at most.");
    expect((await one(p, q)).answer).toBe(long);
    // Sharing, then saving an edit: still shared, and the room sees the new words.
    await p.mutation(api.live.questions.share, { question: q, shared: true });
    await p.mutation(api.live.questions.answer, { question: q, text: "It updates within a second." });
    expect((await list(s))[0].answer).toBe("It updates within a second.");
    // An empty answer removes it and stops sharing it.
    await p.mutation(api.live.questions.answer, { question: q, text: "   " });
    expect(await one(p, q)).toMatchObject({ answer: null, shared: false });
    expect(await row(t, q)).not.toHaveProperty("answer");
    expect((await list(s))[0].answer).toBeNull();
  });

  it("F30.4 share needs an answer; list returns answer only when shared, the author included; Stop sharing hides it", async () => {
    const t = setup();
    const [author, other] = await room(t, 2);
    await post(author, "Where is the data stored?");
    const p = await professor(t);
    const [{ _id: q }] = await forHost(p);
    await expect(p.mutation(api.live.questions.share, { question: q, shared: true })).rejects.toThrow("Type an answer first.");
    await p.mutation(api.live.questions.answer, { question: q, text: "In Convex, on its servers." });
    const answers = async (index?: number) => Promise.all([author, other, t].map(async (c) => (await list(c, index))[0].answer));
    expect(await answers()).toEqual([null, null, null]);
    await p.mutation(api.live.questions.share, { question: q, shared: true });
    expect(await answers()).toEqual(Array(3).fill("In Convex, on its servers."));
    expect(await answers(3)).toEqual(Array(3).fill("In Convex, on its servers."));
    expect(await one(p, q)).toMatchObject({ shared: true });
    await p.mutation(api.live.questions.share, { question: q, shared: false }); // Stop sharing
    expect(await answers()).toEqual([null, null, null]);
    expect(await one(p, q)).toMatchObject({ answer: "In Convex, on its servers.", shared: false });
  });

  it("setStatus 'new' clears status, 'dismissed' unsets shared; a missing question -> 'That question is gone.'", async () => {
    const t = setup();
    const [s] = await room(t, 1);
    await post(s, "Is the database live?");
    const p = await professor(t);
    const [{ _id: q }] = await forHost(p);
    await p.mutation(api.live.questions.setStatus, { question: q, status: "keep" });
    expect((await one(p, q)).status).toBe("keep");
    await p.mutation(api.live.questions.setStatus, { question: q, status: "new" });
    expect((await one(p, q)).status).toBe("new");
    expect(await row(t, q)).not.toHaveProperty("status");
    await p.mutation(api.live.questions.answer, { question: q, text: "It updates live." });
    await p.mutation(api.live.questions.share, { question: q, shared: true });
    await p.mutation(api.live.questions.setStatus, { question: q, status: "dismissed" });
    expect(await one(p, q)).toMatchObject({ status: "dismissed", shared: false, answer: "It updates live." });
    // Dismiss only sorts the professor's list: the room still sees the question, without the answer.
    expect((await list(s)).map((x) => [x.text, x.answer])).toEqual([["Is the database live?", null]]);
    await p.mutation(api.live.questions.remove, { question: q });
    await expect(p.mutation(api.live.questions.setStatus, { question: q, status: "keep" })).rejects.toThrow("That question is gone.");
    await expect(p.mutation(api.live.questions.answer, { question: q, text: "Yes." })).rejects.toThrow("That question is gone.");
    await expect(p.mutation(api.live.questions.share, { question: q, shared: true })).rejects.toThrow("That question is gone.");
  });

  it("applyTopics skips missing ids; topic 60, cluster 80 characters; an empty topic writes nothing", async () => {
    const t = setup();
    const [s] = await room(t, 1);
    await post(s, "What is a vowel?");
    await post(s, "Is Y a vowel?");
    const [a, gone] = (await list(t)).sort((x, y) => x.at - y.at).map((q) => q._id);
    await t.run((ctx) => ctx.db.delete("questions", gone));
    const apply = (items: { id: Id<"questions">; topic: string; cluster: string }[]) => t.mutation(internal.live.questions.applyTopics, { items });
    expect(await apply([{ id: a, topic: `  ${"T".repeat(70)}  `, cluster: "C".repeat(90) }, { id: gone, topic: "Vowels", cluster: "Y" }])).toBe(1);
    expect(await row(t, a)).toMatchObject({ topic: "T".repeat(60), cluster: "C".repeat(80) });
    expect(await apply([{ id: a, topic: "   ", cluster: "Anything" }])).toBe(0);
    expect(await row(t, a)).toMatchObject({ topic: "T".repeat(60), cluster: "C".repeat(80) });
    // Whole characters: 70 emoji keep 60, never half of one. An empty group label removes it.
    expect(await apply([{ id: a, topic: "🙂".repeat(70), cluster: "  " }])).toBe(1);
    const after = (await row(t, a))!;
    expect(Array.from(after.topic!)).toEqual(Array(60).fill("🙂"));
    expect(after).not.toHaveProperty("cluster");
  });
});

describe("F30.2 Group by topic with AI (organize, fetch stubbed)", () => {
  it("F30.2 dismissed rows aren't sent (private ones are: questions.private.test.ts); the body has only the numbered texts, no names; topics land on the right ids", async () => {
    const t = setup();
    const [s1, s2, s3] = await room(t, 3);
    await post(s1, "What is a vowel?", { anonymous: false });
    await post(s2, "Is Y a\nvowel?", { anonymous: false });
    await post(s3, "When is the exam?", { anonymous: false });
    await post(s1, "Off topic: is the cafe open?", { anonymous: false });
    const p = await professor(t);
    const off = (await forHost(p)).find((q) => q.text.startsWith("Off topic"))!;
    await p.mutation(api.live.questions.setStatus, { question: off._id, status: "dismissed" });
    geminiEnv();
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => said(topicsFor(sentText(init))));
    vi.stubGlobal("fetch", fetchMock);
    expect(await p.action(api.live.questions.organize, { channel: CH })).toBe(3);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    // Newest first, numbered from 0, one line each: nothing else goes with them.
    expect(sentText(init)).toBe("0. When is the exam?\n1. Is Y a vowel?\n2. What is a vowel?");
    for (const leak of ["Sample student", "@example.edu", TYPED_ISSUER, "Off topic"]) expect(String(init?.body)).not.toContain(leak);
    const after = await forHost(p);
    for (const q of after.filter((x) => x._id !== off._id))
      expect(q).toMatchObject({ topic: `About ${q.text.replace(/\s+/g, " ")}`, cluster: `Same as ${q.text.replace(/\s+/g, " ")}` });
    expect(after.find((x) => x._id === off._id)).toMatchObject({ topic: null, cluster: null });
  });

  it("F30.2 a question deleted between the read and the write is skipped", async () => {
    const t = setup();
    const [s1, s2] = await room(t, 2);
    await post(s1, "What is a vowel?");
    await post(s2, "Is Y a vowel?");
    const p = await professor(t);
    const gone = (await forHost(p)).find((q) => q.text === "Is Y a vowel?")!._id;
    geminiEnv();
    // The author deletes their question while the AI is still answering.
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      await s2.mutation(api.live.questions.remove, { question: gone });
      return said(topicsFor(sentText(init)));
    });
    vi.stubGlobal("fetch", fetchMock);
    expect(await p.action(api.live.questions.organize, { channel: CH })).toBe(1);
    expect((await forHost(p)).map((q) => [q.text, q.topic])).toEqual([["What is a vowel?", "About What is a vowel?"]]);
    expect(await row(t, gone)).toBeNull();
  });

  it("F30.2 a reply that isn't JSON, or has no usable topics, shows an error and writes nothing", async () => {
    const t = setup();
    const [s] = await room(t, 1);
    await post(s, "What is a vowel?");
    const p = await professor(t);
    geminiEnv();
    vi.stubGlobal("fetch", vi.fn(async () => said("Sure! Vowels: question 0.")));
    await expect(p.action(api.live.questions.organize, { channel: CH })).rejects.toThrow("The AI answer wasn't readable. Try again.");
    vi.stubGlobal("fetch", vi.fn(async () => said(JSON.stringify({ items: [{ n: 5, topic: "Vowels", cluster: "x" }, { n: 0, topic: 3, cluster: "x" }] }))));
    await expect(p.action(api.live.questions.organize, { channel: CH })).rejects.toThrow("The AI didn't group any questions. Try again.");
    expect((await forHost(p)).map((q) => [q.topic, q.cluster])).toEqual([[null, null]]);
  });

  it("F30.2 with no questions, or only dismissed ones, nothing goes to Gemini", async () => {
    const t = setup();
    const [s] = await room(t, 1);
    const p = await professor(t);
    geminiEnv();
    const fetchMock = vi.fn(async () => said("{}"));
    vi.stubGlobal("fetch", fetchMock);
    await expect(p.action(api.live.questions.organize, { channel: CH })).rejects.toThrow("No questions to group yet.");
    await post(s, "What is a vowel?");
    const [{ _id: q }] = await forHost(p);
    await p.mutation(api.live.questions.setStatus, { question: q, status: "dismissed" });
    await expect(p.action(api.live.questions.organize, { channel: CH })).rejects.toThrow("No questions to group yet.");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("F8 each class sees only its own questions", () => {
  it("F8 the last class's questions don't show under 'This slide' or 'All slides'; with 250 class-1 questions on slides 0-2, 'All slides' in class 2 still returns class 2's question on slide 9", async () => {
    const t = setup();
    await openClass(t);
    const [s1] = await room(t, 1);
    await post(s1, "Class 1 question on slide 3", { index: 2 });
    await t.run(async (ctx) => {
      for (let i = 0; i < 250; i++)
        await ctx.db.insert("questions", { channel: CH, index: i % 3, user: `sample|${i}`, text: `Class 1 sample question ${i}`, votes: 0, at: Date.now() });
    });
    expect(await list(t)).toHaveLength(200); // "All slides" shows the newest 200
    vi.setSystemTime(T0 + HOUR);
    await endClass(t);
    expect(await list(t)).toEqual([]); // between classes
    expect(await list(t, 2)).toEqual([]);
    vi.setSystemTime(T0 + 5 * DAY);
    await openClass(t);
    await slide(t, CH, 9);
    const s2 = student(t, 2);
    await checkIn(t, s2);
    await post(s2, "Class 2 question on slide 10", { index: 9 });
    expect((await list(t)).map((q) => [q.text, q.index])).toEqual([["Class 2 question on slide 10", 9]]);
    expect(await list(t, 2)).toEqual([]);
    expect((await list(t, 9)).map((q) => q.text)).toEqual(["Class 2 question on slide 10"]);
    expect((await forHost(await professor(t))).map((q) => q.text)).toEqual(["Class 2 question on slide 10"]);
  });

  it("F8 in a new class no slide takes questions until the deck sends one, last class's slides included", async () => {
    const t = setup();
    await openClass(t);
    await room(t, 1); // class 1: the deck reached slide 4
    vi.setSystemTime(T0 + HOUR);
    await endClass(t);
    vi.setSystemTime(T0 + 5 * DAY);
    await openClass(t);
    const s2 = student(t, 2);
    await checkIn(t, s2);
    for (const index of [0, 3])
      await expect(s2.mutation(api.live.questions.ask, { channel: CH, index, text: "Can I ask yet?", anonymous: true })).rejects.toThrow(
        "That slide hasn't been shown yet.",
      );
    await slide(t, CH, 0);
    await post(s2, "Can I ask yet?", { index: 0 });
    expect((await list(t)).map((q) => q.text)).toEqual(["Can I ask yet?"]);
  });
});

describe("F30/F39.3 the professor's question functions let in only professors and admins", () => {
  // A by-name question from a student who is none of authMatrix's callers, on that row's backend.
  async function question(t: T) {
    await slide(t, CH, 3);
    const s = student(t, 9);
    await checkIn(t, s);
    await s.mutation(api.live.questions.ask, { channel: CH, index: 3, text: "What is a vowel?", anonymous: false });
    return (await t.run((ctx) => ctx.db.query("questions").withIndex("by_channel", (q) => q.eq("channel", CH)).first()))!._id;
  }

  it("F30/F39.3 authMatrix for forHost", async () => {
    await authMatrix(HOST_ONLY, (as) => as.query(api.live.questions.forHost, { channel: CH }));
  });

  it("F30/F39.3 authMatrix for setStatus", async () => {
    await authMatrix(HOST_ONLY, async (as, t) => {
      const q = await question(t);
      await as.mutation(api.live.questions.setStatus, { question: q, status: "keep" });
    });
  });

  it("F30/F39.3 authMatrix for answer", async () => {
    await authMatrix(HOST_ONLY, async (as, t) => {
      const q = await question(t);
      await as.mutation(api.live.questions.answer, { question: q, text: "A, E, I, O and U." });
    });
  });

  it("F30/F39.3 authMatrix for share", async () => {
    await authMatrix(HOST_ONLY, async (as, t) => {
      const q = await question(t);
      await t.run((ctx) => ctx.db.patch("questions", q, { answer: "A, E, I, O and U." }));
      await as.mutation(api.live.questions.share, { question: q, shared: true });
    });
  });

  it("F30/F39.3 authMatrix for organize: a refused caller never reaches Gemini", async () => {
    geminiEnv();
    const fetchMock = vi.fn(async () => said(JSON.stringify({ items: [{ n: 0, topic: "Vowels", cluster: "What a vowel is" }] })));
    vi.stubGlobal("fetch", fetchMock);
    await authMatrix(HOST_ONLY, async (as, t) => {
      await question(t);
      await as.action(api.live.questions.organize, { channel: CH });
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("F30/F39.3 authMatrix for remove on another student's question: only professors and admins", async () => {
    await authMatrix(HOST_ONLY, async (as, t) => {
      const q = await question(t);
      await as.mutation(api.live.questions.remove, { question: q });
    });
  });
});
