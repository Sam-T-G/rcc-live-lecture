// live/read: what other modules read about "I'm lost" taps (docs/contracts.md): how many are lost
// on a slide (lostCount), on every slide that has any (lostBySlide), and whether the signed-in
// student is (mine). Each counts the current class only.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../_generated/api";
import { endLecture, ensureLecture } from "../lib";
import { at, type Caller, checkIn, professor, profEnv, setup, slide, TYPED_ISSUER, typed, type T } from "../test.helpers";

const CH = "gdg";
const user = (n: number) => `${TYPED_ISSUER}|student${n}@example.edu`; // what typed() signs in as

describe("F20 the I'm lost counts", () => {
  it("F20.5 lostCount, lostBySlide and mine keep their shapes on rows inserted with t.run", async () => {
    const t = setup();
    await t.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.insert("lost", { channel: CH, index: 2, user: user(1), at: now });
      await ctx.db.insert("lost", { channel: CH, index: 2, user: user(2), at: now });
      await ctx.db.insert("lost", { channel: CH, index: 0, user: user(1), at: now });
      await ctx.db.insert("lost", { channel: "another-channel", index: 2, user: user(3), at: now });
    });
    expect(await t.query(api.live.read.lostCount, { channel: CH, index: 2 })).toBe(2);
    expect(await t.query(api.live.read.lostCount, { channel: CH, index: 0 })).toBe(1);
    expect(await t.query(api.live.read.lostCount, { channel: CH, index: 5 })).toBe(0);
    expect(await t.query(api.live.read.lostBySlide, { channel: CH })).toEqual([
      { index: 0, count: 1 },
      { index: 2, count: 2 },
    ]);
    expect(await t.query(api.live.read.lostBySlide, { channel: "empty-channel" })).toEqual([]);

    const one = typed(t, "Sample student 1", "student1@example.edu");
    expect(await one.query(api.live.read.mine, { channel: CH, index: 2 })).toBe(true);
    expect(await one.query(api.live.read.mine, { channel: CH, index: 1 })).toBe(false);
    expect(await typed(t, "Sample student 3", "student3@example.edu").query(api.live.read.mine, { channel: CH, index: 2 })).toBe(false);
    expect(await t.query(api.live.read.mine, { channel: CH, index: 2 })).toBe(false); // signed out
  });
});

// ---------- Taps from the real flow: a class, slides, checked-in students ----------

const T0 = at(2026, 11, 5, 21, 30); // the first class opens
const MIN = 60_000;
const DAY = 24 * 60 * MIN;

const student = (t: T, n: number) => typed(t, `Sample student ${n}`, `student${n}@example.edu`);
const openClass = (t: T) => t.run((ctx) => ensureLecture(ctx, CH));
const endClass = (t: T) => t.run((ctx) => endLecture(ctx, CH));
const later = (ms: number) => vi.setSystemTime(Date.now() + ms); // without running the 12-hour close job
async function showSlides(t: T, last: number) {
  for (let i = 0; i <= last; i++) await slide(t, CH, i);
}
// Students 1 to n, each checked in the real way (the admin scans their pass).
async function room(t: T, n: number) {
  const out = [];
  for (let i = 1; i <= n; i++) {
    const s = student(t, i);
    await checkIn(t, s);
    out.push(s);
  }
  return out;
}
// A student's check-in for their second class, written straight to the table, so these tests
// don't depend on how pass.scan treats a student it already checked in once.
const checkInRow = (t: T, n: number) =>
  t.run((ctx) => ctx.db.insert("checkins", { channel: CH, user: user(n), name: `Sample student ${n}`, at: Date.now() }));
const toggle = (as: Caller, index: number) => as.mutation(api.live.lost.toggle, { channel: CH, index });
const lostCount = (as: Caller, index: number) => as.query(api.live.read.lostCount, { channel: CH, index });
const bySlide = (as: Caller) => as.query(api.live.read.lostBySlide, { channel: CH });
const mine = (as: Caller, index: number) => as.query(api.live.read.mine, { channel: CH, index });

describe("F20 the counts #/host shows", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    profEnv();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("F20.3 lostCount for the slide goes up by 1 and back down on undo", async () => {
    const t = setup();
    await openClass(t);
    await showSlides(t, 4);
    const [a, b] = await room(t, 2);

    expect(await lostCount(t, 4)).toBe(0);
    await toggle(a, 4);
    expect(await lostCount(t, 4)).toBe(1);
    await toggle(b, 4);
    expect(await lostCount(t, 4)).toBe(2);
    await toggle(a, 4); // a takes it back
    expect(await lostCount(t, 4)).toBe(1);
    await toggle(b, 4);
    expect(await lostCount(t, 4)).toBe(0);
    expect(await lostCount(t, 3)).toBe(0); // the slide before never moved
  });

  it("F20.4 lostBySlide lists every slide with any, in order", async () => {
    const t = setup();
    await openClass(t);
    await showSlides(t, 5);
    const [a, b, c] = await room(t, 3);
    expect(await bySlide(t)).toEqual([]);

    // Taps out of slide order: the list still comes back by slide.
    await toggle(a, 4);
    await toggle(c, 1);
    await toggle(b, 4);
    await toggle(c, 5);
    await toggle(b, 0);
    expect(await bySlide(t)).toEqual([
      { index: 0, count: 1 },
      { index: 1, count: 1 },
      { index: 4, count: 2 },
      { index: 5, count: 1 },
    ]);
    await toggle(c, 1); // c takes back slide 2: it drops off the list
    expect(await bySlide(t)).toEqual([
      { index: 0, count: 1 },
      { index: 4, count: 2 },
      { index: 5, count: 1 },
    ]);
  });
});

describe("F8 lost counts per class", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    profEnv();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("F8 lost counts start at 0 in a new class", async () => {
    const t = setup();
    await openClass(t);
    await showSlides(t, 3);
    const [a, b] = await room(t, 2);
    await toggle(a, 2);
    await toggle(b, 2);
    await toggle(a, 3);
    expect(await lostCount(t, 2)).toBe(2);
    expect(await bySlide(t)).toEqual([
      { index: 2, count: 2 },
      { index: 3, count: 1 },
    ]);
    expect(await mine(a, 2)).toBe(true);

    // End day: between classes nobody is lost.
    later(60 * MIN);
    await endClass(t);
    expect(await lostCount(t, 2)).toBe(0);
    expect(await lostCount(t, 3)).toBe(0);
    expect(await bySlide(t)).toEqual([]);
    expect(await mine(a, 2)).toBe(false);

    // The next class starts from 0 too, with last class's rows still in the table.
    later(7 * DAY);
    await openClass(t);
    await showSlides(t, 3);
    await checkInRow(t, 1);
    await checkInRow(t, 2);
    expect(await lostCount(t, 2)).toBe(0);
    expect(await bySlide(t)).toEqual([]);
    expect(await mine(a, 2)).toBe(false);
    expect(await t.run(async (ctx) => (await ctx.db.query("lost").withIndex("by_channel", (q) => q.eq("channel", CH)).take(10)).length)).toBe(3);

    await toggle(b, 2);
    expect(await lostCount(t, 2)).toBe(1);
    expect(await bySlide(t)).toEqual([{ index: 2, count: 1 }]);
  });
});

describe("F21 reading stays open to anyone", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    profEnv();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("F21.3 signed out, deck.current, deck.slides, live.questions.list, live.past.past, live.groups.leaderboard and status return data, never 'Sign in first.'", async () => {
    const t = setup();
    await openClass(t);
    await showSlides(t, 2);
    const prof = await professor(t);
    const [a, b] = await room(t, 2);
    await a.mutation(api.live.questions.ask, { channel: CH, index: 1, text: "Why does slide 2 loop twice?", anonymous: true });
    const poll = await prof.mutation(api.checkin.quiz.ask, { channel: CH, kind: "quiz", question: "2 + 2?", choices: ["3", "4"], correct: 1 });
    await a.mutation(api.checkin.quiz.answer, { poll, choice: 1 });
    await prof.mutation(api.checkin.quiz.end, { poll });
    await toggle(b, 2);

    // `t` itself is signed out. Every read below resolves with this class's data.
    expect(await t.query(api.deck.current, { channel: CH })).toMatchObject({ index: 2, title: "Slide 3" });
    expect((await t.query(api.deck.slides, { channel: CH })).map((s) => s.index)).toEqual([0, 1, 2]);
    expect(await t.query(api.live.questions.list, { channel: CH })).toEqual([
      expect.objectContaining({ text: "Why does slide 2 loop twice?", name: null, mine: false, voted: false }),
    ]);
    expect(await t.query(api.live.past.past, { channel: CH })).toEqual([expect.objectContaining({ question: "2 + 2?", mine: null })]);
    const board = await t.query(api.live.groups.leaderboard, { channel: CH });
    expect(board.teams.reduce((n, g) => n + g.members, 0)).toBe(2);
    expect(await t.query(api.live.groups.status, { channel: CH })).toEqual(expect.objectContaining({ size: expect.any(Number) }));
    expect(await lostCount(t, 2)).toBe(1);
    expect(await bySlide(t)).toEqual([{ index: 2, count: 1 }]);
    expect(await mine(t, 2)).toBe(false);
  });
});
