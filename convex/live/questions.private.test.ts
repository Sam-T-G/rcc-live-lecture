// live/questions, private questions and names (fixes UC-convex-1, UC-convex-2, UC-spec-1):
// the professor's shared answer to a private question reaches its author and nobody else, organize
// never sends a private question to Gemini, and a by-name post shows the name the student checked
// in with, not the name on a later sign-in.
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

describe("UC-convex-1 the answer to a private question reaches its author", () => {
  it("UC-convex-1 sharing a private question's answer shows it to the author only; Stop sharing hides it again", async () => {
    const t = setup();
    const [author, other] = await room(t, 2);
    await post(author, "I don't get slide 4 at all", { anonymous: false, private: true });
    await post(other, "Can you zoom in?");
    const p = await professor(t);
    const secret = (await forHost(p)).find((q) => q.private)!;
    await p.mutation(api.live.questions.answer, { question: secret._id, text: "Come by office hours on Tuesday." });
    await p.mutation(api.live.questions.share, { question: secret._id, shared: true });
    expect((await forHost(p)).find((q) => q._id === secret._id)).toMatchObject({ shared: true });
    for (const index of [undefined, 3])
      expect((await list(author, index)).find((q) => q._id === secret._id)).toMatchObject({ private: true, answer: "Come by office hours on Tuesday." });
    // Everyone else still sees only the public question, with no answer.
    for (const reader of [other, t, p])
      for (const index of [undefined, 3]) expect((await list(reader, index)).map((q) => [q.text, q.answer])).toEqual([["Can you zoom in?", null]]);
    await p.mutation(api.live.questions.share, { question: secret._id, shared: false });
    expect((await list(author)).find((q) => q._id === secret._id)!.answer).toBeNull();
  });
});

describe("UC-convex-2 organize never sends a private question to Gemini", () => {
  it("UC-convex-2 private rows are left out of the request and get no topic; only private rows -> nothing goes out", async () => {
    const t = setup();
    const [s1, s2] = await room(t, 2);
    await post(s1, "What is a vowel?");
    await post(s2, "I'm failing this class and need to talk", { private: true });
    const p = await professor(t);
    vi.stubEnv("GEMINI_API_KEY", "test-gemini-key");
    vi.stubEnv("GEMINI_MODEL_FAST", "test-fast");
    const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(
      async () =>
        new Response(
          JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ items: [{ n: 0, topic: "Vowels", cluster: "What a vowel is" }] }) }] } }] }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);
    expect(await p.action(api.live.questions.organize, { channel: CH })).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = String(fetchMock.mock.calls[0][1]?.body);
    expect(body).toContain("What is a vowel?");
    expect(body).not.toContain("failing");
    const rows = await forHost(p);
    expect(rows.find((q) => q.private)).toMatchObject({ topic: null, cluster: null });
    expect(rows.find((q) => !q.private)).toMatchObject({ topic: "Vowels" });

    // A class with only a private question: nothing to group, and nothing goes to Gemini.
    const t2 = setup();
    const [a] = await room(t2, 1);
    await post(a, "Private only", { private: true });
    fetchMock.mockClear();
    await expect((await professor(t2)).action(api.live.questions.organize, { channel: CH })).rejects.toThrow("No questions to group yet.");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("UC-spec-1 by-name posts use the name from check-in", () => {
  it("UC-spec-1 signing in again with the same email and another name keeps the scanned name on new posts", async () => {
    const t = setup();
    await room(t, 1); // checked in as Sample student 1
    const renamed = typed(t, "Professor Lee", "student1@example.edu"); // same tokenIdentifier, new name
    await post(renamed, "Quiz is cancelled, leave now", { anonymous: false });
    expect((await list(t)).map((q) => q.name)).toEqual(["Sample student 1"]);
    expect((await forHost(await professor(t))).map((q) => q.name)).toEqual(["Sample student 1"]);
    // Anonymous still stores no name.
    await post(renamed, "Second one");
    expect((await list(t)).find((q) => q.text === "Second one")!.name).toBeNull();
  });
});
