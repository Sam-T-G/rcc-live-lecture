// live/questions, private questions and names. Private questions follow Sam's decision D12 (e) and
// (f) (sweep1-live-2): the professor's answer to a private question can't be shared, not even with
// its author ("That question is private."), and "Group by topic with AI" sends private question
// texts to Gemini too, never names. UC-spec-1: a by-name post shows the name the student checked
// in with, not the name on a later sign-in. T1 (2026-11-01): list, which anyone can read, gives
// that name as the first name and last initial (lib.shortName); forHost keeps the full name.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../_generated/api";
import { at, checkIn, professor, profEnv, setup, slide, typed, type Caller, type T } from "../test.helpers";

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
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function room(t: T, n: number) {
  await slide(t, CH, 3);
  const out: Caller[] = [];
  for (let i = 1; i <= n; i++) {
    const s = student(t, i);
    await checkIn(t, s);
    out.push(s);
  }
  return out;
}

async function post(s: Caller, text: string, o: { anonymous?: boolean; private?: boolean } = {}) {
  await s.mutation(api.live.questions.ask, { channel: CH, index: 3, text, anonymous: o.anonymous ?? true, ...(o.private ? { private: true } : {}) });
  vi.setSystemTime(Date.now() + 6_000);
}

const list = (c: Pick<T, "query">, index?: number) => c.query(api.live.questions.list, { channel: CH, index });
const forHost = (c: Pick<T, "query">) => c.query(api.live.questions.forHost, { channel: CH });

describe("D12 (e) a private question's answer can't be shared", () => {
  it("sharing it throws 'That question is private.'; the professor keeps the answer; no phone gets it, the author's included", async () => {
    const t = setup();
    const [author, other] = await room(t, 2);
    await post(author, "I don't get slide 4 at all", { anonymous: false, private: true });
    await post(other, "Can you zoom in?");
    const p = await professor(t);
    const secret = (await forHost(p)).find((q) => q.private)!;
    await p.mutation(api.live.questions.answer, { question: secret._id, text: "Come by office hours on Tuesday." });
    await expect(p.mutation(api.live.questions.share, { question: secret._id, shared: true })).rejects.toThrow("That question is private.");
    expect((await forHost(p)).find((q) => q._id === secret._id)).toMatchObject({ answer: "Come by office hours on Tuesday.", shared: false });
    for (const index of [undefined, 3])
      expect((await list(author, index)).find((q) => q._id === secret._id)).toMatchObject({ private: true, answer: null });
    for (const reader of [other, t, p])
      for (const index of [undefined, 3]) expect((await list(reader, index)).map((q) => [q.text, q.answer])).toEqual([["Can you zoom in?", null]]);
    // Stop sharing still works on it (it does nothing).
    await p.mutation(api.live.questions.share, { question: secret._id, shared: false });
  });

  it("a private row marked shared before this rule (an older build) still shows its answer to nobody", async () => {
    const t = setup();
    const [author] = await room(t, 1);
    await post(author, "Old private one", { private: true });
    const p = await professor(t);
    const secret = (await forHost(p)).find((q) => q.private)!;
    await t.run((ctx) => ctx.db.patch("questions", secret._id, { answer: "Old answer", shared: true }));
    expect((await list(author)).find((q) => q._id === secret._id)!.answer).toBeNull();
  });
});

describe("D12 (f) organize sends private question texts too, never names", () => {
  it("a private question's text goes to Gemini with the rest, numbered, with no name, and gets a topic", async () => {
    const t = setup();
    const [s1, s2] = await room(t, 2);
    await post(s1, "What is a vowel?", { anonymous: false });
    await post(s2, "I'm failing this class and need to talk", { anonymous: false, private: true });
    const p = await professor(t);
    vi.stubEnv("GEMINI_API_KEY", "test-gemini-key");
    vi.stubEnv("GEMINI_MODEL_FAST", "test-fast");
    const items = [
      { n: 0, topic: "Grades", cluster: "Needs to talk" },
      { n: 1, topic: "Vowels", cluster: "What a vowel is" },
    ];
    const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(
      async () =>
        new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ items }) }] } }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    expect(await p.action(api.live.questions.organize, { channel: CH })).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = String(fetchMock.mock.calls[0][1]?.body);
    expect(body).toContain("0. I'm failing this class and need to talk");
    expect(body).toContain("1. What is a vowel?");
    for (const leak of ["Sample student", "@example.edu"]) expect(body).not.toContain(leak);
    const rows = await forHost(p);
    expect(rows.find((q) => q.private)).toMatchObject({ topic: "Grades", cluster: "Needs to talk" });
    expect(rows.find((q) => !q.private)).toMatchObject({ topic: "Vowels" });

    // A class with only a private question still groups it.
    const t2 = setup();
    const [a] = await room(t2, 1);
    await post(a, "Private only", { private: true });
    fetchMock.mockClear();
    expect(await (await professor(t2)).action(api.live.questions.organize, { channel: CH })).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fetchMock.mockClear();

    // A class with no questions at all still says there is nothing to group.
    const t3 = setup();
    await room(t3, 1);
    await expect((await professor(t3)).action(api.live.questions.organize, { channel: CH })).rejects.toThrow("No questions to group yet.");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("UC-spec-1 by-name posts use the name from check-in", () => {
  it("UC-spec-1 signing in again with the same email and another name keeps the scanned name on new posts", async () => {
    const t = setup();
    await room(t, 1); // checked in as Sample student 1
    const renamed = typed(t, "Professor Lee", "student1@example.edu"); // same tokenIdentifier, new name
    await post(renamed, "Quiz is cancelled, leave now", { anonymous: false });
    // The room sees the scanned name's first name and last initial (T1), never "Professor L.".
    expect((await list(t)).map((q) => q.name)).toEqual(["Sample 1."]);
    expect((await forHost(await professor(t))).map((q) => q.name)).toEqual(["Sample student 1"]);
    // Anonymous still stores no name.
    await post(renamed, "Second one");
    expect((await list(t)).find((q) => q.text === "Second one")!.name).toBeNull();
  });
});

describe("T1 list never returns a full name; forHost still does", () => {
  it("T1 by-name questions come back from list as first name and last initial to every reader, signed out too, on every slide and one slide; forHost has the full names", async () => {
    const t = setup();
    await slide(t, CH, 3);
    const people = [
      typed(t, "Ivy Sample", "student1@example.edu"),
      typed(t, "Mary Ann Lee", "student2@example.edu"),
      typed(t, "Élodie Ñúñez", "student3@example.edu"),
      typed(t, "Ana", "student4@example.edu"),
    ];
    for (const s of people) await checkIn(t, s);
    const [ivy, mary, elodie, ana] = people;
    await post(ivy, "Is this on the exam?", { anonymous: false });
    await post(ivy, "Can you zoom in?"); // anonymous
    await post(mary, "Where are the slides posted?", { anonymous: false });
    await post(elodie, "Can I come to office hours?", { anonymous: false, private: true });
    await post(ana, "What does O(n) mean?", { anonymous: false });
    const p = await professor(t);

    const named = (rows: { text: string; name: string | null }[]) => Object.fromEntries(rows.map((q) => [q.text, q.name]));
    const seen = {
      "Is this on the exam?": "Ivy S.",
      "Can you zoom in?": null,
      "Where are the slides posted?": "Mary L.",
      "What does O(n) mean?": "Ana",
    };
    for (const index of [undefined, 3]) {
      for (const reader of [t, ivy, mary, ana, p]) expect(named(await list(reader, index))).toEqual(seen);
      // The author of the private question sees it, under her short name too.
      expect(named(await list(elodie, index))).toEqual({ ...seen, "Can I come to office hours?": "Élodie Ñ." });
      for (const reader of [t, ivy, mary, elodie, ana, p]) {
        const sent = JSON.stringify(await list(reader, index));
        for (const full of ["Ivy Sample", "Mary Ann Lee", "Élodie Ñúñez", "Sample", "Lee", "Ñúñez"]) expect(sent).not.toContain(full);
      }
    }
    expect(named(await forHost(p))).toEqual({
      "Is this on the exam?": "Ivy Sample",
      "Can you zoom in?": null,
      "Where are the slides posted?": "Mary Ann Lee",
      "Can I come to office hours?": "Élodie Ñúñez",
      "What does O(n) mean?": "Ana",
    });
    // The stored rows keep the full name: the short form is made on each read.
    const stored = await t.run((ctx) => ctx.db.query("questions").withIndex("by_channel", (q) => q.eq("channel", CH)).take(10));
    expect(stored.map((r) => r.name ?? null).sort()).toEqual(["Ana", "Ivy Sample", "Mary Ann Lee", "Élodie Ñúñez", null].sort());
  });
});
