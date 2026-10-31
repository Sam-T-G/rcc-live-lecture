// deck: which slide a deck is on, and every slide it has shown, per channel.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { at, setup, type T } from "./test.helpers";

const CH = "gdg";
const T0 = at(2026, 11, 5, 21, 30);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
});
afterEach(() => {
  vi.useRealTimers();
});

const set = (t: T, index: number, beat: number, lines: string[], title = `Slide ${index + 1}`) =>
  t.mutation(internal.deck.set, { channel: CH, index, beat, count: 6, title, lines });

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
});
