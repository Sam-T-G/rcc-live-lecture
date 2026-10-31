// deck page-back when two decks (or two versions of one slide) are shown in one class
// (DECK-check-1, DECK-convex-1). Within a class deck.set keeps the press of a slide that showed the
// most lines, but only while it is the same slide: a press of a different slide at that number
// replaces the stored one, so page-back never shows another deck's slide.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { at, setup, type T } from "./test.helpers";

const CH = "gdg";
const T0 = at(2026, 11, 5, 21, 30);
const MIN = 60_000;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
});
afterEach(() => {
  vi.useRealTimers();
});

const set = (t: T, index: number, beat: number, title: string, lines: string[], run?: string, seq?: number) =>
  t.mutation(internal.deck.set, { channel: CH, index, beat, count: 6, title, lines, ...(run !== undefined && seq !== undefined ? { run, seq } : {}) });
const page = async (t: T, index: number) => (await t.query(api.deck.slides, { channel: CH })).find((s) => s.index === index);
const classes = (t: T) => t.run((ctx) => ctx.db.query("lectures").withIndex("by_channel", (q) => q.eq("channel", CH)).take(10));

describe("page-back with two decks in one class", () => {
  it("DECK-check-1 slide 3 at beat 1 from one deck, then slide 3 at beat 0 from another: page-back shows the second deck's slide", async () => {
    const t = setup();
    await set(t, 2, 1, "What Gus does", ["Scans", "Talks"], "deck-A", 1);
    vi.setSystemTime(T0 + 10 * MIN);
    await set(t, 1, 0, "Check deck two", ["two"], "deck-B", 1);
    await set(t, 2, 0, "Check deck three", ["three"], "deck-B", 2);
    await set(t, 3, 0, "Check deck four", ["four"], "deck-B", 3);
    expect(await classes(t)).toHaveLength(1);
    expect(await page(t, 2)).toEqual({ index: 2, beat: 0, title: "Check deck three", lines: ["three"], at: T0 + 10 * MIN });
  });

  it("DECK-convex-1 deck A's slide 3 at beat 4, then deck B's slide 3 at beat 0 with the same heading but other lines: deck B's wins", async () => {
    const t = setup();
    await set(t, 2, 4, "Recursion", ["a", "b", "c", "d"], "lecture", 3);
    vi.setSystemTime(T0 + 20 * MIN);
    await set(t, 2, 0, "Recursion", ["Lab: write fib"], "lab", 1);
    expect(await page(t, 2)).toMatchObject({ beat: 0, title: "Recursion", lines: ["Lab: write fib"] });
  });

  it("DECK-convex-1 an edited slide (same heading, new text) replaces the older, fuller version", async () => {
    const t = setup();
    await set(t, 2, 2, "Loops", ["for", "while", "do"], "tab", 1);
    vi.setSystemTime(T0 + 5 * MIN);
    await set(t, 2, 0, "Loops", ["for each"], "tab", 2);
    expect(await page(t, 2)).toMatchObject({ beat: 0, lines: ["for each"] });
  });

  it("the same slide pressed again from its start keeps its fullest press, also from another tab and with lines after the revealed items", async () => {
    const t = setup();
    // Slide 3 has a caption after its 3 revealed items; at beat 0 only the caption shows.
    await set(t, 2, 3, "Trees", ["Root", "Leaf", "Height", "Caption"], "tab-1", 1);
    vi.setSystemTime(T0 + 5 * MIN);
    await set(t, 2, 0, "Trees", ["Caption"], "tab-1", 2);
    await set(t, 2, 1, "Trees", ["Root", "Caption"], "tab-2", 1); // the deck reopened in a new tab
    await set(t, 2, 0, "Trees", ["Caption"]); // a deck on an older bridge
    expect(await page(t, 2)).toEqual({ index: 2, beat: 3, title: "Trees", lines: ["Root", "Leaf", "Height", "Caption"], at: T0 });
  });
});
