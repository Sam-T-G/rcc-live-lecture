// checkin/quiz: the live quiz and vote, one class at a time. The professor asks (by hand, or from
// the AI's draft on #/host) and ends; students checked in to this class answer; #/host sees who got
// it wrong and asks the AI what to explain again. Every Gemini call goes to a stubbed fetch.
import { ConvexError } from "convex/values";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { endLecture, ensureLecture } from "../lib";
import { admin, at, authMatrix, checkIn, HOST_ONLY, profEnv, setup, slide, type T, TYPED_ISSUER, typed } from "../test.helpers";
import { medianSec } from "./quiz";

const CH = "gdg";
const T0 = at(2026, 11, 5, 21, 40);
const MIN = 60_000;
const HOUR = 60 * MIN;
const student = (t: T, n: number) => typed(t, `Sample student ${n}`, `student${n}@example.edu`);
// The user key convex-test gives student n's typed sign-in (issuer|subject), for rows a test writes itself.
const userOf = (n: number) => `${TYPED_ISSUER}|student${n}@example.edu`;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  profEnv();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// A class opens the way the professor's first action opens one (lib.ensureLecture), and End day
// ends it (lib.endLecture, which live.groups.endDay calls). A test opens the class before its
// students check in, so their check-ins are inside it.
const openClass = (t: T) => t.run((ctx) => ensureLecture(ctx, CH));
const endClass = (t: T) => t.run((ctx) => endLecture(ctx, CH));

type AskArgs = { kind: "quiz" | "vote"; question: string; choices: string[]; correct?: number; index?: number; aiDraft?: boolean };
const askWith = (t: T, a: AskArgs) => admin(t).mutation(api.checkin.quiz.ask, { channel: CH, ...a });
const ask = (t: T, kind: "quiz" | "vote", question: string, choices: string[], correct?: number) => askWith(t, { kind, question, choices, correct });
const end = (t: T, poll: Id<"polls">) => admin(t).mutation(api.checkin.quiz.end, { poll });
const current = (t: T) => t.query(api.checkin.quiz.current, { channel: CH });
const stats = (t: T, poll: Id<"polls">) => admin(t).query(api.checkin.quiz.stats, { poll });
const history = (t: T) => admin(t).query(api.checkin.quiz.history, { channel: CH });
const missing = (t: T) => admin(t).query(api.checkin.quiz.missing, { channel: CH });
const stored = (t: T, poll: Id<"polls">) => t.run((ctx) => ctx.db.get(poll));
const pollCount = (t: T) => t.run(async (ctx) => (await ctx.db.query("polls").withIndex("by_channel", (q) => q.eq("channel", CH)).take(100)).length);

// n students checked in to the open class, in order (the scan deals them Red, Blue, Yellow, ...).
async function room(t: T, n: number) {
  const out = [];
  for (let i = 1; i <= n; i++) {
    const s = student(t, i);
    await checkIn(t, s);
    out.push(s);
  }
  return out;
}

// The words a refused call shows: its ConvexError's text, exactly. Fails the test when the call
// works or throws anything else (a TypeError, an argument validator's error).
async function said(call: Promise<unknown>): Promise<string> {
  let error: unknown;
  try {
    await call;
  } catch (e) {
    error = e;
  }
  expect(error).toBeInstanceOf(ConvexError);
  return (error as ConvexError<string>).data;
}

// The AI set up, with every Gemini call answering `text`. Returns the fetch stub.
const geminiReply = (text: string) =>
  new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), { status: 200, headers: { "Content-Type": "application/json" } });
function gemini(text: string) {
  vi.stubEnv("GEMINI_API_KEY", "test-gemini-key");
  vi.stubEnv("GEMINI_MODEL_FAST", "test-fast");
  const fetchMock = vi.fn(async () => geminiReply(text));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
// The JSON body of the stub's nth request.
const sentBody = (fetchMock: { mock: { calls: unknown[][] } }, n = 0) =>
  JSON.parse(String((fetchMock.mock.calls[n] as [string, RequestInit])[1].body)) as {
    contents: { role: string; parts: { text: string }[] }[];
    systemInstruction?: unknown;
  };
// Keeps ai.ts's console.error lines (what went wrong, for `npx convex logs`) out of the test output.
const quiet = () => vi.spyOn(console, "error").mockImplementation(() => {});

describe("F17 the professor asks, ends and sees the numbers", () => {
  it("F17.1 'Type a question.' for spaces, 'Give 2 to 4 choices.' for 1 and 5 choices", async () => {
    const t = setup();
    expect(await said(ask(t, "quiz", "   ", ["A", "B"]))).toBe("Type a question.");
    expect(await said(ask(t, "quiz", "Which one is a vowel?", ["A"]))).toBe("Give 2 to 4 choices.");
    expect(await said(ask(t, "vote", "Pick a color", ["Red", "Blue", "Yellow", "Green", "Orange"]))).toBe("Give 2 to 4 choices.");
    expect(await current(t)).toBeNull();
    await ask(t, "vote", " Pick a color ", ["Red", "Blue", "Yellow", "Green"]);
    expect(await current(t)).toMatchObject({ kind: "vote", question: "Pick a color", choices: ["Red", "Blue", "Yellow", "Green"], open: true });
  });

  it("F17.2 asking closes the open poll; the same question and choices within 5 s return the open poll (one row)", async () => {
    const t = setup();
    await openClass(t);
    const [s] = await room(t, 1);
    const first = await ask(t, "quiz", "Which one is a vowel?", ["A", "B"], 0);
    // A double tap: the same question, choices and right answer 2 s later.
    vi.setSystemTime(T0 + 2_000);
    expect(await ask(t, "quiz", "Which one is a vowel?", ["A", "B"], 0)).toBe(first);
    expect(await pollCount(t)).toBe(1);
    expect(await current(t)).toMatchObject({ id: first, open: true });
    // 5 s after it opened, the same question is a new poll, and the first one ends.
    vi.setSystemTime(T0 + 5_000);
    const again = await ask(t, "quiz", "Which one is a vowel?", ["A", "B"], 0);
    expect(again).not.toBe(first);
    // Within 5 s, a different question, or the same one with another right answer, is new too.
    vi.setSystemTime(T0 + 6_000);
    const second = await ask(t, "quiz", "Which one is a number?", ["7", "Q"], 1);
    vi.setSystemTime(T0 + 7_000);
    const fixed = await ask(t, "quiz", "Which one is a number?", ["7", "Q"], 0);
    expect(await pollCount(t)).toBe(4);
    expect(await current(t)).toMatchObject({ id: fixed, open: true });
    expect(await said(s.mutation(api.checkin.quiz.answer, { poll: second, choice: 0 }))).toBe("The professor ended this question.");
    expect((await t.query(api.live.past.past, { channel: CH })).map((p) => p.id)).toEqual([second, again, first]);
    await s.mutation(api.checkin.quiz.answer, { poll: fixed, choice: 0 });
  });

  it("host-backend-7 choices ['Paris', '', 'Rome', 'Madrid'] with correct 2 store ['Paris', 'Rome', 'Madrid'] with Rome right; a right answer on a blank box is refused", async () => {
    const t = setup();
    await openClass(t);
    const [s] = await room(t, 1);
    const poll = await ask(t, "quiz", "What is the capital of Italy?", ["Paris", "", "Rome", "Madrid"], 2);
    expect(await stored(t, poll)).toMatchObject({ choices: ["Paris", "Rome", "Madrid"], correct: 1 });
    expect(await current(t)).toMatchObject({ choices: ["Paris", "Rome", "Madrid"] });
    await s.mutation(api.checkin.quiz.answer, { poll, choice: 1 }); // Rome
    await end(t, poll);
    expect((await current(t))!.results).toEqual({ counts: [0, 1, 0], correct: 1 });
    // The dot on a blank box (or one with only spaces) has no choice to point at.
    vi.setSystemTime(T0 + MIN);
    expect(await said(ask(t, "quiz", "What is the capital of Spain?", ["Paris", "", "Rome", "Madrid"], 1))).toBe("Type the right answer's choice.");
    expect(await said(ask(t, "quiz", "What is the capital of Spain?", ["Madrid", "Rome", "  ", ""], 2))).toBe("Type the right answer's choice.");
    // A vote never keeps a right answer, so its blank boxes just drop out.
    const vote = await ask(t, "vote", "Where should we go?", ["", "Rome", "", "Madrid"], 0);
    expect(await stored(t, vote)).toMatchObject({ choices: ["Rome", "Madrid"] });
    expect(await stored(t, vote)).not.toHaveProperty("correct");
  });

  it("checkin-backend-13 correct 1.5 throws", async () => {
    const t = setup();
    for (const correct of [1.5, -1, 4, Number.NaN])
      expect(await said(ask(t, "quiz", "Which one is a vowel?", ["B", "E", "K", "M"], correct))).toBe("Pick a right answer from the choices.");
    expect(await pollCount(t)).toBe(0);
    const poll = await ask(t, "quiz", "Which one is a vowel?", ["B", "E", "K", "M"], 1);
    expect(await stored(t, poll)).toMatchObject({ correct: 1 });
  });

  it("F17.4 stats after End: counts, %, median of answers at 2 s and 10 s is 6 s, answered of checked in (this class)", async () => {
    const t = setup();
    // Last class: a student who doesn't come back today.
    await openClass(t);
    await checkIn(t, student(t, 9));
    vi.setSystemTime(T0 + HOUR);
    await endClass(t);
    // This class: three students check in and two answer, 2 s and 10 s after the question opens.
    const start = T0 + 2 * HOUR;
    vi.setSystemTime(start);
    await openClass(t);
    const [a, b] = await room(t, 3);
    const poll = await ask(t, "quiz", "What is 2 + 2?", ["3", "4", "5"], 1);
    vi.setSystemTime(start + 2_000);
    await a.mutation(api.checkin.quiz.answer, { poll, choice: 1 });
    // While it's open the professor sees how many answered out of how many are here.
    expect(await stats(t, poll)).toMatchObject({ answered: 1, checkedIn: 3 });
    vi.setSystemTime(start + 10_000);
    await b.mutation(api.checkin.quiz.answer, { poll, choice: 0 });
    await end(t, poll);
    expect(await stats(t, poll)).toEqual({ counts: [1, 1, 0], answered: 2, checkedIn: 3, correct: 1, rightPct: 50, medianSec: 6, index: null, aiDraft: false });
    // The middle time: the mean of the two middle times for an even count, rounded to a second.
    expect([medianSec([2, 10]), medianSec([10, 2, 4]), medianSec([2.2, 3]), medianSec([])]).toEqual([6, 4, 3, null]);
  });

  it("F17.5 history: this class's questions newest first, with answered, % right, the slide and the AI tag", async () => {
    const t = setup();
    await openClass(t);
    const ss = await room(t, 2);
    const vote = await ask(t, "vote", "Pizza or tacos?", ["Pizza", "Tacos"]);
    await ss[0].mutation(api.checkin.quiz.answer, { poll: vote, choice: 1 });
    vi.setSystemTime(T0 + MIN);
    const quiz = await askWith(t, { kind: "quiz", question: "What is 2 + 2?", choices: ["3", "4"], correct: 1, index: 3, aiDraft: true });
    await ss[0].mutation(api.checkin.quiz.answer, { poll: quiz, choice: 1 });
    await ss[1].mutation(api.checkin.quiz.answer, { poll: quiz, choice: 1 });
    await end(t, quiz);
    expect(await history(t)).toEqual([
      { id: quiz, kind: "quiz", question: "What is 2 + 2?", answered: 2, rightPct: 100, index: 3, aiDraft: true },
      { id: vote, kind: "vote", question: "Pizza or tacos?", answered: 1, rightPct: null, index: null, aiDraft: false },
    ]);
  });
});

describe("F18 students answer", () => {
  it("F18 student rules unchanged: quiz locks, vote changes until ended, 'Check in first.', 'The professor ended this question.'", async () => {
    const t = setup();
    // A student from the last class who hasn't checked in to this one.
    await openClass(t);
    const gone = student(t, 9);
    await checkIn(t, gone);
    vi.setSystemTime(T0 + HOUR);
    await endClass(t);
    vi.setSystemTime(T0 + 2 * HOUR);
    await openClass(t);
    const [s] = await room(t, 1);

    const quiz = await ask(t, "quiz", "Which one is a vowel?", ["B", "E", "K"], 1);
    await s.mutation(api.checkin.quiz.answer, { poll: quiz, choice: 0 });
    expect(await said(s.mutation(api.checkin.quiz.answer, { poll: quiz, choice: 1 }))).toBe("You already answered.");
    expect(await said(gone.mutation(api.checkin.quiz.answer, { poll: quiz, choice: 1 }))).toBe("Check in first.");
    expect(await said(t.mutation(api.checkin.quiz.answer, { poll: quiz, choice: 1 }))).toBe("Sign in first.");
    await end(t, quiz);
    expect(await said(s.mutation(api.checkin.quiz.answer, { poll: quiz, choice: 1 }))).toBe("The professor ended this question.");

    vi.setSystemTime(T0 + 2 * HOUR + MIN);
    const vote = await ask(t, "vote", "Pick a color", ["Red", "Blue", "Yellow", "Green"]);
    await s.mutation(api.checkin.quiz.answer, { poll: vote, choice: 1 });
    await s.mutation(api.checkin.quiz.answer, { poll: vote, choice: 3 });
    expect(await s.query(api.checkin.quiz.mine, { poll: vote })).toBe(3);
    await end(t, vote);
    expect(await said(s.mutation(api.checkin.quiz.answer, { poll: vote, choice: 0 }))).toBe("The professor ended this question.");
    expect((await current(t))!.results).toEqual({ counts: [0, 0, 0, 1], correct: null });
  });

  it("F18.2 a quiz answer locks ('You already answered.')", async () => {
    const t = setup();
    await openClass(t);
    const [s] = await room(t, 1);
    const poll = await ask(t, "quiz", "Which one is a vowel?", ["B", "E", "K"], 1);
    expect(await s.query(api.checkin.quiz.mine, { poll })).toBeNull();
    await s.mutation(api.checkin.quiz.answer, { poll, choice: 0 });
    expect(await said(s.mutation(api.checkin.quiz.answer, { poll, choice: 1 }))).toBe("You already answered.");
    expect(await s.query(api.checkin.quiz.mine, { poll })).toBe(0);
    expect(await t.query(api.checkin.quiz.mine, { poll })).toBeNull(); // signed out
  });

  it("F18.3 a vote changes and counts once", async () => {
    const t = setup();
    await openClass(t);
    const [s] = await room(t, 1);
    const poll = await ask(t, "vote", "Pick a color", ["Red", "Blue", "Yellow", "Green"], 0);
    await s.mutation(api.checkin.quiz.answer, { poll, choice: 1 });
    await s.mutation(api.checkin.quiz.answer, { poll, choice: 3 });
    expect(await s.query(api.checkin.quiz.mine, { poll })).toBe(3);
    expect(await current(t)).toMatchObject({ answered: 1 });
    await end(t, poll);
    // One student, one count; a vote never keeps a right answer.
    expect((await current(t))!.results).toEqual({ counts: [0, 0, 0, 1], correct: null });
  });

  it("F18.4 'Check in first.', 'Sign in first.', ended and out-of-range errors", async () => {
    const t = setup();
    await openClass(t);
    const [s] = await room(t, 1);
    const poll = await ask(t, "quiz", "Which one is a vowel?", ["B", "E", "K", "M"], 1);
    expect(await said(student(t, 2).mutation(api.checkin.quiz.answer, { poll, choice: 1 }))).toBe("Check in first.");
    expect(await said(t.mutation(api.checkin.quiz.answer, { poll, choice: 1 }))).toBe("Sign in first.");
    for (const choice of [-1, 4, 1.5]) expect(await said(s.mutation(api.checkin.quiz.answer, { poll, choice }))).toBe("Pick one of the choices.");
    await end(t, poll);
    expect(await said(s.mutation(api.checkin.quiz.answer, { poll, choice: 1 }))).toBe("The professor ended this question.");
    expect(await s.query(api.checkin.quiz.mine, { poll })).toBeNull();
  });

  it("F18.6 current never returns counts, correct, index or aiDraft while the poll is open", async () => {
    const t = setup();
    await openClass(t);
    const [s] = await room(t, 1);
    const poll = await askWith(t, { kind: "quiz", question: "Which one is a vowel?", choices: ["B", "E", "K"], correct: 1, index: 3, aiDraft: true });
    await s.mutation(api.checkin.quiz.answer, { poll, choice: 1 });
    const open = await current(t);
    expect(open).toEqual({ id: poll, kind: "quiz", question: "Which one is a vowel?", choices: ["B", "E", "K"], open: true, answered: 1, results: null });
    expect(JSON.stringify(open)).not.toMatch(/correct|counts|index|aiDraft/);
    await end(t, poll);
    // Once it has ended: the counts and the right answer, and still no slide or AI tag.
    const ended = await current(t);
    expect(ended!.results).toEqual({ counts: [0, 1, 0], correct: 1 });
    expect(JSON.stringify(ended)).not.toMatch(/index|aiDraft/);
  });
});

describe("F8 each class has its own questions", () => {
  it("F8 a poll from the last class is not current, answering it throws 'That question is gone.', history shows only this class; a student checked in to both classes answers the class-2 poll (two checkins rows, no unique() error)", async () => {
    const t = setup();
    await openClass(t);
    const [s] = await room(t, 1);
    const old = await ask(t, "quiz", "What is 2 + 2?", ["3", "4"], 1); // still open when the class ends
    vi.setSystemTime(T0 + HOUR);
    await endClass(t);

    // Between classes nothing is current, and last class's open poll can't be answered.
    expect(await current(t)).toBeNull();
    expect(await said(s.mutation(api.checkin.quiz.answer, { poll: old, choice: 1 }))).toBe("That question is gone.");
    expect(await history(t)).toEqual([]);
    expect(await missing(t)).toBeNull();

    // The next class: the same student checks in again, so they have a check-in in each class.
    vi.setSystemTime(T0 + 2 * HOUR);
    await openClass(t);
    await t.run((ctx) => ctx.db.insert("checkins", { channel: CH, user: userOf(1), name: "Sample student 1", at: Date.now() }));
    expect(await current(t)).toBeNull();
    const fresh = await ask(t, "quiz", "What is 3 + 3?", ["6", "7"], 0);
    expect(await current(t)).toMatchObject({ id: fresh, open: true });
    await s.mutation(api.checkin.quiz.answer, { poll: fresh, choice: 0 });
    expect(await said(s.mutation(api.checkin.quiz.answer, { poll: old, choice: 1 }))).toBe("That question is gone.");
    expect((await history(t)).map((h) => h.id)).toEqual([fresh]);
    expect(await stats(t, fresh)).toMatchObject({ answered: 1, checkedIn: 1 });
  });
});

describe("F26 #/host Now: a question drafted from the slide, asked on polls", () => {
  it("F26.1 ask stores the deck's slide as index when none is passed, keeps a passed index, stores aiDraft only when true, and still works with the old argument shape; after End day it stores no index", async () => {
    const t = setup();
    await openClass(t);
    vi.setSystemTime(T0 + MIN);
    await slide(t, CH, 6);

    // The old shape (no index, no aiDraft): the deck's slide, and no AI tag.
    const plain = await ask(t, "quiz", "Which loop runs at least once?", ["for", "do-while"], 1);
    expect(await stored(t, plain)).toMatchObject({ index: 6 });
    expect(await stored(t, plain)).not.toHaveProperty("aiDraft");
    // A passed index wins, so a draft keeps the slide it came from after the deck moves on.
    vi.setSystemTime(T0 + 2 * MIN);
    const drafted = await askWith(t, { kind: "quiz", question: "What does a while loop check?", choices: ["A condition", "A count"], correct: 0, index: 2, aiDraft: true });
    expect(await stored(t, drafted)).toMatchObject({ index: 2, aiDraft: true });
    expect(await stats(t, drafted)).toMatchObject({ index: 2, aiDraft: true });
    // aiDraft false isn't stored; an index that isn't a whole number 0 or over falls back to the deck's slide.
    let minute = 3;
    for (const index of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      vi.setSystemTime(T0 + minute++ * MIN);
      const poll = await askWith(t, { kind: "vote", question: `Vote ${minute}`, choices: ["Yes", "No"], index, aiDraft: false });
      expect(await stored(t, poll)).toMatchObject({ index: 6 });
      expect(await stored(t, poll)).not.toHaveProperty("aiDraft");
    }

    // End day. In the next class the deck's slide is last class's, so a question gets no index
    // until the deck sends one.
    vi.setSystemTime(T0 + HOUR);
    await endClass(t);
    vi.setSystemTime(T0 + 2 * HOUR);
    const next = await ask(t, "vote", "Pizza or tacos?", ["Pizza", "Tacos"]);
    expect(await stored(t, next)).not.toHaveProperty("index");
    expect(await stats(t, next)).toMatchObject({ index: null, aiDraft: false });
    vi.setSystemTime(T0 + 2 * HOUR + MIN);
    await slide(t, CH, 0);
    const after = await ask(t, "vote", "Tea or coffee?", ["Tea", "Coffee"]);
    expect(await stored(t, after)).toMatchObject({ index: 0 });
  });

  it("F26.1 draftQuestion turns a canned Gemini JSON reply (fetch stubbed) into { index, question, 4 choices, correct }; the request body holds only the slide title and lines", async () => {
    const fetchMock = gemini(JSON.stringify({ question: "Which planet is closest to the sun?", choices: ["Venus", "Mercury", "Mars", "Earth"], correct: 1 }));
    const t = setup();
    await openClass(t);
    await room(t, 2); // students in the room, whose names must not reach Gemini
    await slide(t, CH, 4, { title: "The inner planets", lines: ["Mercury is closest to the sun.", "Venus is the hottest."] });
    expect(await admin(t).action(api.checkin.quiz.draftQuestion, { channel: CH })).toEqual({
      index: 4,
      question: "Which planet is closest to the sun?",
      choices: ["Venus", "Mercury", "Mars", "Earth"],
      correct: 1,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const sent = sentBody(fetchMock);
    expect(sent.contents).toEqual([{ role: "user", parts: [{ text: "Slide title: The inner planets\nSlide text:\nMercury is closest to the sun.\nVenus is the hottest." }] }]);
    expect(JSON.stringify(sent)).not.toMatch(/Sample student|example\.edu/);

    // A blank choice drops out and the right answer follows its own choice, as in ask.
    gemini(JSON.stringify({ question: "Which planet is hottest?", choices: ["Mercury", "", "Venus", "Mars"], correct: 2 }));
    expect(await admin(t).action(api.checkin.quiz.draftQuestion, { channel: CH })).toEqual({
      index: 4,
      question: "Which planet is hottest?",
      choices: ["Mercury", "Venus", "Mars"],
      correct: 1,
    });
  });

  it("F26.4 no slide -> 'The deck hasn't sent a slide yet.'; AI env unset -> 'The AI isn't set up on this server.'; a 'null' reply or 1 choice -> 'The AI answer wasn't readable. Try again.' (never a TypeError)", async () => {
    quiet();
    const t = setup();
    // The AI isn't set up yet: no key and no model.
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("GEMINI_MODEL_FAST", "");
    vi.stubEnv("GEMINI_MODEL", "");
    const unset = vi.fn(async () => geminiReply("{}"));
    vi.stubGlobal("fetch", unset);
    expect(await said(admin(t).action(api.checkin.quiz.draftQuestion, { channel: CH }))).toBe("The deck hasn't sent a slide yet.");
    await slide(t, CH, 0, { title: "Vowels", lines: ["A, E, I, O and U are vowels."] });
    expect(await said(admin(t).action(api.checkin.quiz.draftQuestion, { channel: CH }))).toBe("The AI isn't set up on this server.");
    expect(unset).not.toHaveBeenCalled();

    // Replies that aren't a usable question: not JSON, null, a list, 1 choice, no question, or a
    // right answer that isn't one of the choices.
    const unusable = [
      "null",
      "Here is a question about vowels.",
      "[]",
      JSON.stringify({ question: "Which one is a vowel?", choices: ["E"], correct: 0 }),
      JSON.stringify({ question: "Which one is a vowel?", choices: ["E", "", "  "], correct: 0 }),
      JSON.stringify({ choices: ["B", "E"], correct: 1 }),
      JSON.stringify({ question: "Which one is a vowel?", choices: ["B", "E"], correct: 5 }),
      JSON.stringify({ question: "Which one is a vowel?", choices: ["B", "", "E"], correct: 1 }),
    ];
    for (const reply of unusable) {
      const fetchMock = gemini(reply);
      expect(await said(admin(t).action(api.checkin.quiz.draftQuestion, { channel: CH }))).toBe("The AI answer wasn't readable. Try again.");
      expect(fetchMock).toHaveBeenCalledTimes(1);
    }
  });

  it("F26.5 authMatrix(draftQuestion): refused signed out, as a student, a scanner, a paired iPad and a typed sign-in on prod before fetch is called; allowed for professors and admins", async () => {
    const fetchMock = gemini(JSON.stringify({ question: "Which one is a vowel?", choices: ["A", "B", "C", "D"], correct: 0 }));
    await authMatrix(HOST_ONLY, async (as, t) => {
      await slide(t, CH, 0, { title: "Vowels", lines: ["A, E, I, O and U are vowels."] });
      await as.action(api.checkin.quiz.draftQuestion, { channel: CH });
    });
    // Only the three allowed rows reached Gemini.
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe("F27 Who got it wrong, and the AI note, on polls", () => {
  it("F27.1 missing: null with no quiz; skips votes and quizzes with no right answer; lists only wrong answers with check-in name, team label and color (null without a team) and the picked text; byTeam counts", async () => {
    const t = setup();
    await openClass(t);
    expect(await missing(t)).toBeNull();
    const [s1, s2, s3] = await room(t, 3); // Red, Blue and Yellow, in check-in order
    // A student checked in with no team yet.
    await t.run((ctx) => ctx.db.insert("checkins", { channel: CH, user: userOf(4), name: "Sample student 4", at: Date.now() }));
    const s4 = student(t, 4);
    // A quiz with no right answer has nobody wrong.
    await ask(t, "quiz", "Which part did you like best?", ["Slides", "Demo"]);
    expect(await missing(t)).toBeNull();

    vi.setSystemTime(T0 + MIN);
    const quiz = await ask(t, "quiz", "Which planet is closest to the sun?", ["Venus", "Mercury", "Mars"], 1);
    await s1.mutation(api.checkin.quiz.answer, { poll: quiz, choice: 1 });
    await s2.mutation(api.checkin.quiz.answer, { poll: quiz, choice: 0 });
    await s3.mutation(api.checkin.quiz.answer, { poll: quiz, choice: 2 });
    await s4.mutation(api.checkin.quiz.answer, { poll: quiz, choice: 0 });
    const expected = {
      kind: "quiz",
      poll: quiz,
      question: "Which planet is closest to the sun?",
      choices: ["Venus", "Mercury", "Mars"],
      correct: 1,
      open: true,
      answered: 4,
      counts: [2, 1, 1],
      byTeam: [
        { team: 0, color: "red", label: "Red", answered: 1, right: 1 },
        { team: 1, color: "blue", label: "Blue", answered: 1, right: 0 },
        { team: 2, color: "yellow", label: "Yellow", answered: 1, right: 0 },
      ],
      wrong: [
        { name: "Sample student 2", team: { team: 1, color: "blue", label: "Blue" }, picked: "Venus" },
        { name: "Sample student 3", team: { team: 2, color: "yellow", label: "Yellow" }, picked: "Mars" },
        { name: "Sample student 4", team: null, picked: "Venus" },
      ],
    };
    expect(await missing(t)).toEqual(expected);

    // A vote and a quiz with no right answer asked after it are skipped: the list stays on the
    // quiz, which asking them ended.
    vi.setSystemTime(T0 + 2 * MIN);
    await ask(t, "vote", "Pizza or tacos?", ["Pizza", "Tacos"]);
    vi.setSystemTime(T0 + 3 * MIN);
    await ask(t, "quiz", "Which part did you like best?", ["Slides", "Demo"]);
    const after = await missing(t);
    expect(after).toEqual({ ...expected, open: false });
    // No user key or email anywhere in it.
    expect(JSON.stringify(after)).not.toMatch(/example\.edu|test-login/);
  });

  it("F27.1 a class whose newest question is a vote, with no quiz with a right answer, gets kind 'vote' and no wrong list", async () => {
    const t = setup();
    await openClass(t);
    const vote = await ask(t, "vote", "Pizza or tacos?", ["Pizza", "Tacos"]);
    expect(await missing(t)).toEqual({ kind: "vote", poll: vote, question: "Pizza or tacos?" });
  });

  it("F27.1 a returning student is listed under this class's team, not last class's: missing's wrong list, byTeam and the AI note's team lines", async () => {
    const fetchMock = gemini("Blue picked Venus. Explain again why Mercury is closest to the sun.");
    const t = setup();
    // Class 1: student 1 scans first (Red), student 2 second (Blue).
    await openClass(t);
    const [s1, s2] = await room(t, 2);
    await endClass(t);

    // Class 2: the order flips, so student 2 is Red and student 1 is Blue.
    vi.setSystemTime(T0 + 2 * HOUR);
    await openClass(t);
    await checkIn(t, s2);
    await checkIn(t, s1);
    const quiz = await ask(t, "quiz", "Which planet is closest to the sun?", ["Venus", "Mercury", "Mars"], 1);
    await s1.mutation(api.checkin.quiz.answer, { poll: quiz, choice: 0 });
    await s2.mutation(api.checkin.quiz.answer, { poll: quiz, choice: 1 });

    const m = await missing(t);
    expect(m?.kind).toBe("quiz");
    if (m?.kind !== "quiz") return;
    expect(m.wrong).toEqual([{ name: "Sample student 1", team: { team: 1, color: "blue", label: "Blue" }, picked: "Venus" }]);
    expect(m.byTeam).toEqual([
      { team: 0, color: "red", label: "Red", answered: 1, right: 1 },
      { team: 1, color: "blue", label: "Blue", answered: 1, right: 0 },
    ]);
    await admin(t).action(api.checkin.quiz.feedback, { channel: CH });
    expect(JSON.stringify(sentBody(fetchMock))).toContain("By team: Red: 1 of 1 right; Blue: 0 of 1 right");
  });

  it("F27.2 feedback request body has counts and team labels and none of the sample names; F27.3 'Ask the room a quiz question first.' and 'No answers yet.'", async () => {
    const fetchMock = gemini("Most of the room picked Venus. Explain again why Mercury is closest to the sun.");
    const t = setup();
    await openClass(t);
    // F27.3: no question yet, then only a vote, then a quiz nobody answered.
    expect(await said(admin(t).action(api.checkin.quiz.feedback, { channel: CH }))).toBe("Ask the room a quiz question first.");
    await ask(t, "vote", "Pizza or tacos?", ["Pizza", "Tacos"]);
    expect(await said(admin(t).action(api.checkin.quiz.feedback, { channel: CH }))).toBe("Ask the room a quiz question first.");
    vi.setSystemTime(T0 + MIN);
    const quiz = await ask(t, "quiz", "Which planet is closest to the sun?", ["Venus", "Mercury", "Mars"], 1);
    expect(await said(admin(t).action(api.checkin.quiz.feedback, { channel: CH }))).toBe("No answers yet.");
    expect(fetchMock).not.toHaveBeenCalled();

    // F27.2: three students on three teams, two of them wrong.
    const [s1, s2, s3] = await room(t, 3);
    await s1.mutation(api.checkin.quiz.answer, { poll: quiz, choice: 0 });
    await s2.mutation(api.checkin.quiz.answer, { poll: quiz, choice: 1 });
    await s3.mutation(api.checkin.quiz.answer, { poll: quiz, choice: 0 });
    expect(await admin(t).action(api.checkin.quiz.feedback, { channel: CH })).toBe("Most of the room picked Venus. Explain again why Mercury is closest to the sun.");
    const sent = sentBody(fetchMock);
    expect(sent.contents).toEqual([
      {
        role: "user",
        parts: [
          {
            text:
              "Question: Which planet is closest to the sun?\nA. Venus: 2 picked\nB. Mercury (right): 1 picked\nC. Mars: 0 picked\n" +
              "By team: Red: 0 of 1 right; Blue: 1 of 1 right; Yellow: 0 of 1 right",
          },
        ],
      },
    ]);
    expect(JSON.stringify(sent)).not.toMatch(/Sample student|example\.edu/);
  });

  it("F27.4 authMatrix(missing) and authMatrix(feedback): students, scanners, paired iPads and typed sign-ins on prod refused (feedback before fetch); professors and admins allowed", async () => {
    await authMatrix(HOST_ONLY, (as) => as.query(api.checkin.quiz.missing, { channel: CH }));
    const fetchMock = gemini("Most of the room picked B. Go over vowels again.");
    await authMatrix(HOST_ONLY, async (as, t) => {
      await openClass(t);
      const s = student(t, 1);
      await checkIn(t, s);
      const poll = await admin(t).mutation(api.checkin.quiz.ask, { channel: CH, kind: "quiz", question: "Which one is a vowel?", choices: ["E", "B"], correct: 0 });
      await s.mutation(api.checkin.quiz.answer, { poll, choice: 1 });
      await as.action(api.checkin.quiz.feedback, { channel: CH });
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
