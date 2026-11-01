// deck: which slide a deck is on, and every slide it has shown in this class, per channel. A press
// (internal.deck.set, which POST /deck calls) opens a class when none is open. A class ends with
// End day (lib.endLecture) or by itself 12 hours after it opened.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { endLecture, ensureLecture, LECTURE_MS, lectureWindow } from "./lib";
import { at, setup, type T } from "./test.helpers";

const CH = "gdg";
const T0 = at(2026, 11, 5, 21, 30);
const MIN = 60_000;
const HOUR = 60 * MIN;
const WEEK = 7 * 24 * HOUR;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
});
afterEach(() => {
  vi.useRealTimers();
});

// One press on the deck. `order` is what the current bridge adds to each send: the id its browser
// tab keeps (run) and a number that goes up with every send from that tab (seq).
const set = (t: T, index: number, beat: number, lines: string[], title = `Slide ${index + 1}`, order: { run?: string; seq?: number } = {}) =>
  t.mutation(internal.deck.set, { channel: CH, index, beat, count: 6, title, lines, ...order });
const current = (t: T) => t.query(api.deck.current, { channel: CH });
const shown = (t: T) => t.query(api.deck.slides, { channel: CH });
// deck.slides as "index: title", to read which deck each page-back slide came from.
const pages = async (t: T) => (await shown(t)).map((s) => `${s.index}: ${s.title}`);
const endDay = (t: T) => t.run((ctx) => endLecture(ctx, CH));
const classes = (t: T) => t.run((ctx) => ctx.db.query("lectures").withIndex("by_channel", (q) => q.eq("channel", CH)).take(10));
const channelRow = (t: T) => t.run((ctx) => ctx.db.query("deckChannels").withIndex("by_channel", (q) => q.eq("channel", CH)).unique());

describe("F7 the deck's slides", () => {
  it("F7.1 deck.current is null before the deck sends, then the newest slide", async () => {
    const t = setup();
    expect(await t.query(api.deck.current, { channel: CH })).toBeNull();
    await set(t, 0, 0, ["Check in at the door"], "Welcome");
    vi.setSystemTime(T0 + 5_000);
    await set(t, 1, 1, ["Quiz", "Teams"], "Today");
    expect(await t.query(api.deck.current, { channel: CH })).toEqual({ index: 1, beat: 1, count: 6, title: "Today", lines: ["Quiz", "Teams"], at: T0 + 5_000 });
    expect(await t.query(api.deck.current, { channel: "another-channel" })).toBeNull();
  });

  it("F7.3 deck.slides returns shown slides in index order and keeps the version with the most presses", async () => {
    const t = setup();
    await set(t, 3, 0, ["three"]);
    await set(t, 0, 0, ["zero"]);
    await set(t, 1, 0, ["a"]);
    await set(t, 1, 2, ["a", "b", "c"]);
    await set(t, 1, 0, ["a"]); // back to slide 2 at its first press
    const slides = await t.query(api.deck.slides, { channel: CH });
    expect(slides.map((s) => s.index)).toEqual([0, 1, 3]); // slide 3 (index 2) was never shown
    expect(slides[1]).toEqual({ index: 1, beat: 2, title: "Slide 2", lines: ["a", "b", "c"], at: T0 });
    expect(await t.query(api.deck.current, { channel: CH })).toMatchObject({ index: 1, beat: 0, lines: ["a"] });
    expect(await t.query(api.deck.slides, { channel: "another-channel" })).toEqual([]);
  });

  it("F7.3 within one class the fullest press of a slide is kept", async () => {
    const t = setup();
    await set(t, 2, 3, ["a", "b", "c", "d"]); // slide 3, to its 4th press
    vi.setSystemTime(T0 + 40 * MIN);
    await set(t, 4, 0, ["later"]);
    // Two hours in: nobody pressed End day and 12 hours haven't passed, so it's the same class.
    vi.setSystemTime(T0 + 2 * HOUR);
    await set(t, 2, 1, ["a", "b"]); // back to slide 3, at its 2nd press
    expect(await classes(t)).toHaveLength(1);
    expect((await shown(t)).find((s) => s.index === 2)).toEqual({ index: 2, beat: 3, title: "Slide 3", lines: ["a", "b", "c", "d"], at: T0 });
    expect(await current(t)).toMatchObject({ index: 2, beat: 1, lines: ["a", "b"] });
  });
});

describe("F19 page-back shows only this class's slides", () => {
  it("F19.4/F8.2 a new class hides the last class's slides, even when its slide 3 has fewer presses; slides it skips don't page back to the old deck", async () => {
    const t = setup();
    // Last week: slides 1 to 5, with slide 3 shown to its 5th press. Then End day.
    for (const index of [0, 1, 2, 3, 4]) await set(t, index, index === 2 ? 4 : 0, [`Week 1 line ${index + 1}`], `Week 1: slide ${index + 1}`);
    vi.setSystemTime(T0 + HOUR);
    await endDay(t);
    // This week's deck shows slide 1, slide 3 to its 2nd press, then slide 4. Slides 2 and 5 never show.
    vi.setSystemTime(T0 + WEEK);
    await set(t, 0, 0, ["Trees"], "Week 2: slide 1");
    await set(t, 2, 1, ["Roots", "Leaves"], "Week 2: slide 3");
    await set(t, 3, 0, [], "Week 2: slide 4");
    expect(await pages(t)).toEqual(["0: Week 2: slide 1", "2: Week 2: slide 3", "3: Week 2: slide 4"]);
    expect((await shown(t))[1]).toEqual({ index: 2, beat: 1, title: "Week 2: slide 3", lines: ["Roots", "Leaves"], at: T0 + WEEK });
  });

  it("F8.2 a class nobody ended closes itself after 12 hours: deck.current is null, deck.slides is empty, and the next press starts page-back over", async () => {
    const t = setup();
    await set(t, 0, 2, ["a", "b", "c"], "Monday: slide 1");
    await set(t, 1, 0, [], "Monday: slide 2");
    vi.advanceTimersByTime(LECTURE_MS); // the 12-hour close (internal.lectures.close) runs
    await t.finishInProgressScheduledFunctions();
    expect(await current(t)).toBeNull();
    expect(await shown(t)).toEqual([]);

    vi.setSystemTime(T0 + 20 * HOUR);
    await set(t, 0, 0, ["Base case"], "Tuesday: slide 1");
    expect(await pages(t)).toEqual(["0: Tuesday: slide 1"]);
    expect(await classes(t)).toHaveLength(2);
  });

  it("F19.4 before the first class ever, prod's 10-29 slides (older than 12 hours) don't show as live or in page-back; the first press starts a class, and page-back shows only its slides", async () => {
    const t = setup();
    const OCT29 = at(2026, 10, 29, 22, 0);
    await t.run(async (ctx) => {
      // What the 10-29 deck left on prod: rows with no run or seq, and no class yet.
      await ctx.db.insert("deckChannels", { channel: CH, index: 9, beat: 0, count: 40, title: "Oct 29: Teams", lines: [], at: OCT29 });
      await ctx.db.insert("deckSlides", { channel: CH, index: 3, beat: 2, title: "Oct 29: Agents", lines: ["a", "b", "c"], at: OCT29 });
      await ctx.db.insert("deckSlides", { channel: CH, index: 9, beat: 0, title: "Oct 29: Teams", lines: [], at: OCT29 });
    });
    expect((await t.run((ctx) => lectureWindow(ctx, CH))).start).toBe(0); // no class ever
    expect(await current(t)).toBeNull();
    expect(await shown(t)).toEqual([]);

    await set(t, 3, 0, ["Base case"], "Nov 5: Recursion");
    expect(await current(t)).toMatchObject({ index: 3, title: "Nov 5: Recursion", at: T0 });
    expect(await pages(t)).toEqual(["3: Nov 5: Recursion"]);
  });

  it("F19.4 before the first class ever, slides sent in the last 12 hours (a deploy during a class) still read as before", async () => {
    const t = setup();
    const earlier = T0 - HOUR;
    const stale = T0 - LECTURE_MS - MIN;
    await t.run(async (ctx) => {
      await ctx.db.insert("deckChannels", { channel: CH, index: 4, beat: 1, count: 40, title: "Today: Loops", lines: ["for"], at: earlier });
      await ctx.db.insert("deckSlides", { channel: CH, index: 2, beat: 0, title: "Last week: Intro", lines: [], at: stale });
      await ctx.db.insert("deckSlides", { channel: CH, index: 4, beat: 1, title: "Today: Loops", lines: ["for"], at: earlier });
    });
    expect(await current(t)).toMatchObject({ index: 4, title: "Today: Loops", at: earlier });
    expect(await pages(t)).toEqual(["4: Today: Loops"]);
  });
});

describe("F8 classes and the live slide", () => {
  it("deck.set opens a class when none is open", async () => {
    const t = setup();
    const win = () => t.run((ctx) => lectureWindow(ctx, CH));
    expect((await win()).lecture).toBeNull();

    await set(t, 0, 0, ["Welcome"]);
    const [first] = await classes(t);
    expect(first).toMatchObject({ channel: CH, startedAt: T0 });
    expect(first.endedAt).toBeUndefined();
    expect(await win()).toMatchObject({ lecture: first._id, start: T0 });

    // More presses in the same class open nothing new, and a press on another channel opens that
    // channel's class only.
    vi.setSystemTime(T0 + 3 * HOUR);
    await set(t, 1, 0, []);
    await t.mutation(internal.deck.set, { channel: "another-channel", index: 0, beat: 0, count: 6, title: "Elsewhere", lines: [] });
    expect(await classes(t)).toHaveLength(1);

    // After End day, the next press opens the next class.
    await endDay(t);
    vi.setSystemTime(T0 + WEEK);
    await set(t, 0, 0, ["Welcome back"]);
    const next = (await classes(t)).filter((c) => c._id !== first._id);
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({ startedAt: T0 + WEEK });
    expect(await win()).toMatchObject({ lecture: next[0]._id, start: T0 + WEEK });
  });

  it("F8 deck.current is null after End day and in a new class until the deck sends; the next press returns it", async () => {
    const t = setup();
    await set(t, 5, 1, ["Base case"], "Recursion");
    expect(await current(t)).toMatchObject({ index: 5, title: "Recursion" });

    vi.setSystemTime(T0 + HOUR);
    await endDay(t);
    expect(await current(t)).toBeNull();
    expect(await shown(t)).toEqual([]);

    // Next week the class opens before the deck sends (lib.ensureLecture, as a pass scan or a quiz
    // opens one), and phones still wait for the slides.
    vi.setSystemTime(T0 + WEEK);
    await t.run((ctx) => ensureLecture(ctx, CH));
    expect(await current(t)).toBeNull();
    expect(await shown(t)).toEqual([]);

    vi.setSystemTime(T0 + WEEK + 5 * MIN);
    await set(t, 0, 0, ["Bring a laptop"], "Trees");
    expect(await current(t)).toEqual({ index: 0, beat: 0, count: 6, title: "Trees", lines: ["Bring a laptop"], at: T0 + WEEK + 5 * MIN });
    expect(await pages(t)).toEqual(["0: Trees"]);
  });

  it("core-backend-14 an older seq from the same run is ignored; a new run is accepted", async () => {
    const t = setup();
    // Two quick presses from one deck tab: slide 5 (seq 2) gets here before slide 4 (seq 1).
    await set(t, 4, 0, ["five"], undefined, { run: "tab-A", seq: 2 });
    await set(t, 3, 0, ["four"], undefined, { run: "tab-A", seq: 1 });
    expect(await current(t)).toMatchObject({ index: 4, lines: ["five"] });
    // That tab's next press moves the slide on.
    await set(t, 5, 0, ["six"], undefined, { run: "tab-A", seq: 3 });
    expect(await current(t)).toMatchObject({ index: 5 });

    // Another tab (a new run) is accepted whatever its seq, and from then on its own seq counts.
    await set(t, 1, 0, ["two"], undefined, { run: "tab-B", seq: 1 });
    expect(await current(t)).toMatchObject({ index: 1 });
    await set(t, 0, 0, ["one"], undefined, { run: "tab-B", seq: 0 });
    expect(await current(t)).toMatchObject({ index: 1 });

    // A press with no run or seq (a deck that loads an older bridge) always counts.
    await set(t, 2, 0, ["three"]);
    expect(await current(t)).toMatchObject({ index: 2 });
    expect(await channelRow(t)).not.toHaveProperty("run");
  });

  it("core-backend-14 a press that arrives late still pages back: deck.slides keeps the slide it showed", async () => {
    const t = setup();
    await set(t, 2, 0, ["three"], undefined, { run: "tab-A", seq: 1 });
    await set(t, 4, 0, ["five"], undefined, { run: "tab-A", seq: 3 });
    await set(t, 3, 2, ["a", "b", "c"], undefined, { run: "tab-A", seq: 2 }); // slide 4, sent before slide 5
    expect(await current(t)).toMatchObject({ index: 4 });
    expect(await pages(t)).toEqual(["2: Slide 3", "3: Slide 4", "4: Slide 5"]);
    expect((await shown(t))[1]).toMatchObject({ beat: 2, lines: ["a", "b", "c"] });
  });

  it("core-backend-14 the last class's seq never holds back a press in a new class", async () => {
    const t = setup();
    await set(t, 5, 0, [], undefined, { run: "tab-A", seq: 500 });
    vi.setSystemTime(T0 + HOUR);
    await endDay(t);
    vi.setSystemTime(T0 + WEEK);
    await set(t, 0, 0, ["Trees"], "Week 2: slide 1", { run: "tab-A", seq: 7 });
    expect(await current(t)).toMatchObject({ index: 0, title: "Week 2: slide 1" });
  });

  it("ios-3/ios-7 deck.current returns exactly the keys index, beat, count, title, lines, at and deck.slides exactly index, beat, title, lines, at (the iOS app decodes these and npm run build never builds it)", async () => {
    const t = setup();
    await set(t, 1, 2, ["a", "b"], "Two", { run: "tab-A", seq: 3 });
    const live = await current(t);
    expect(Object.keys(live ?? {}).sort()).toEqual(["at", "beat", "count", "index", "lines", "title"]);
    const [page] = await shown(t);
    expect(Object.keys(page).sort()).toEqual(["at", "beat", "index", "lines", "title"]);
    // The row keeps run and seq for the next press, and neither reaches a phone.
    expect(await channelRow(t)).toMatchObject({ run: "tab-A", seq: 3 });
  });

  it("core-backend-13 deck.set refuses slide numbers the iOS app can't read, and a refused press opens no class", async () => {
    const t = setup();
    const ok = { channel: CH, index: 3, beat: 0, count: 10, title: "Loops", lines: [] };
    const bad = [{ index: 1e20 }, { index: -5 }, { index: 1.5 }, { beat: -1 }, { beat: 1.5 }, { count: 0 }, { index: 1000 }, { beat: 1000 }, { count: 1000 }, { index: NaN }, { count: Infinity }];
    for (const b of bad) await expect(t.mutation(internal.deck.set, { ...ok, ...b }), JSON.stringify(b)).rejects.toThrow(/whole numbers/);
    expect(await current(t)).toBeNull();
    expect(await classes(t)).toEqual([]);

    await t.mutation(internal.deck.set, { ...ok, index: 999, beat: 999, count: 999 });
    expect(await current(t)).toMatchObject({ index: 999, beat: 999, count: 999 });
  });

  it("sweep2-server-fixcheck-1 a bad page-back row from before slideNumbers stays when a new deck tab presses that slide, and End class drops it", async () => {
    const t = setup();
    await set(t, 2, 0, ["Loops"], "Slide 3", { run: "A", seq: 1 });
    // Only a row written before set checked slide numbers can hold one the iOS app can't read.
    await t.run(async (ctx) => {
      const row = await ctx.db.query("deckSlides").withIndex("by_channel_and_index", (q) => q.eq("channel", CH).eq("index", 2)).unique();
      await ctx.db.patch("deckSlides", row!._id, { beat: 1e300 });
    });
    vi.setSystemTime(T0 + MIN);
    await set(t, 2, 0, ["Loops"], "Slide 3", { run: "B", seq: 1 });
    await set(t, 3, 0, ["While"], "Slide 4", { run: "B", seq: 2 });
    expect((await shown(t)).map((s) => [s.index, s.beat])).toEqual([[2, 1e300], [3, 0]]);

    await endDay(t);
    vi.setSystemTime(T0 + 2 * MIN);
    await set(t, 2, 0, ["Loops"], "Slide 3", { run: "B", seq: 3 });
    expect((await shown(t)).map((s) => [s.index, s.beat])).toEqual([[2, 0]]);
  });
});
