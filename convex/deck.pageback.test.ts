// deck page-back when two decks (or two versions of one slide) are shown in one class
// (DECK-check-1, DECK-convex-1). Within a class deck.set keeps the press of a slide that showed the
// most lines, but only while it is the same slide: a press of a different slide at that number
// replaces the stored one, and deck.slides returns only the slides the live deck tab pressed, so
// page-back never shows another deck's slide (DECK-fixcheck-1).
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

  it("DECK-fixcheck-1 deck B opened mid-deck after deck A: page-back shows only deck B's slides, not deck A's at the numbers B never pressed", async () => {
    const t = setup();
    for (let i = 0; i <= 5; i++) await set(t, i, 0, `A${i}`, [`a${i}`], "deck-A", i + 1);
    vi.setSystemTime(T0 + MIN);
    await set(t, 3, 0, "B3", ["b3"], "deck-B", 1); // deck B opens at #4
    const shown = await t.query(api.deck.slides, { channel: CH });
    expect(shown.map((s) => `${s.index}:${s.title}`)).toEqual(["3:B3"]);
    await set(t, 4, 0, "B4", ["b4"], "deck-B", 2);
    expect((await t.query(api.deck.slides, { channel: CH })).map((s) => `${s.index}:${s.title}`)).toEqual(["3:B3", "4:B4"]);
    // The live slide and page-back answers keep the fields the iOS app decodes.
    expect(Object.keys(shown[0]).sort()).toEqual(["at", "beat", "index", "lines", "title"]);
  });

  it("DECK-fixcheck-1 the same deck reopened in a new tab keeps the slides that tab presses again, at their fullest", async () => {
    const t = setup();
    await set(t, 2, 3, "Trees", ["Root", "Leaf", "Height"], "tab-1", 1);
    await set(t, 3, 0, "Graphs", ["Edge"], "tab-1", 2);
    vi.setSystemTime(T0 + MIN);
    await set(t, 2, 0, "Trees", [], "tab-2", 1);
    expect(await t.query(api.deck.slides, { channel: CH })).toEqual([{ index: 2, beat: 3, title: "Trees", lines: ["Root", "Leaf", "Height"], at: T0 }]);
  });

  it("DECK-fixcheck-1 a beat inside a line grows that line: going back one press on the STAR slide keeps the press that showed every beat", async () => {
    const t = setup();
    const base = ["Busy Saturday. Two coworkers were sick.", "I took the drive-through and the counter.", "I moved two people to the grill.", "Waits stayed under 10 minutes all day."];
    const tags = ["S · Situation", "T · Task", "A · Action", "R · Result"];
    const at = (beat: number) => base.map((l, k) => (k < beat ? `${l} ${tags[k]}` : l));
    for (let b = 0; b <= 4; b++) await set(t, 2, b, "STAR", at(b), "tab", b + 1);
    await set(t, 2, 3, "STAR", at(3), "tab", 6); // the professor presses back once
    expect(await page(t, 2)).toMatchObject({ beat: 4, lines: at(4) });
  });

  it("DECK-fixcheck-1 a slide cut at 12 lines keeps its fullest press when an earlier press shows lines past the 12th", async () => {
    const t = setup();
    // 3 revealed items above 11 lines that always show: the full slide sends the first 12 lines only.
    const always = Array.from({ length: 11 }, (_, k) => `line ${k}`);
    const full = ["one", "two", "three", ...always].slice(0, 12);
    await set(t, 2, 3, "Long", full, "tab", 1);
    await set(t, 2, 1, "Long", ["one", ...always], "tab", 2);
    expect(await page(t, 2)).toMatchObject({ beat: 3, lines: full });
  });

  it("DECK-fixcheck-1 a heading match with lines the stored press never had is still another slide", async () => {
    const t = setup();
    const full = Array.from({ length: 12 }, (_, k) => `line ${k}`);
    await set(t, 2, 3, "Long", full, "tab", 1);
    await set(t, 2, 1, "Long", ["other"], "tab", 2);
    expect(await page(t, 2)).toMatchObject({ beat: 1, lines: ["other"] });
  });
});
