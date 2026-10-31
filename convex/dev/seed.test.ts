// dev/seed: sample check-ins and "I'm lost" taps for a dev backend, and removing them again.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../_generated/api";
import { at, checkIn, profEnv, setup, slide, typed, type T } from "../test.helpers";

const CH = "gdg";
const T0 = at(2026, 11, 5, 21, 30);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  profEnv();
});
afterEach(() => {
  vi.useRealTimers();
});

const count = (t: T, channel = CH) => t.query(api.checkin.read.count, { channel });
const lost = (t: T) => t.query(api.live.read.lostBySlide, { channel: CH });

describe("dev seed", () => {
  it("fill adds sample check-ins on a fresh backend and clear removes them", async () => {
    const t = setup();
    expect(typeof (await t.mutation(internal.dev.seed.fill, { channel: CH }))).toBe("string");
    expect(await count(t)).toBe(8);
    // With no deck yet the taps go on the first slide: samples 3 and 6 (a third of the 8).
    expect(await lost(t)).toEqual([{ index: 0, count: 2 }]);
    expect(typeof (await t.mutation(internal.dev.seed.clear, { channel: CH }))).toBe("string");
    expect(await count(t)).toBe(0);
    expect(await lost(t)).toEqual([]);
  });

  it("fill follows the deck's slide and its people count; clear leaves real students and other channels alone", async () => {
    const t = setup();
    await slide(t, CH, 2);
    await checkIn(t, typed(t, "Sample student 1", "student1@example.edu"));
    await t.mutation(internal.dev.seed.fill, { channel: CH });
    await t.mutation(internal.dev.seed.fill, { channel: "another-channel", people: 3 });
    expect(await count(t)).toBe(9);
    expect(await count(t, "another-channel")).toBe(3);
    // Samples 3 and 6 are lost on the deck's slide, and samples 1 and 2 on the slide before it.
    expect(await lost(t)).toEqual([
      { index: 1, count: 2 },
      { index: 2, count: 2 },
    ]);
    await t.mutation(internal.dev.seed.clear, { channel: CH });
    expect(await count(t)).toBe(1);
    expect(await lost(t)).toEqual([]);
    expect(await count(t, "another-channel")).toBe(3);
  });
});
