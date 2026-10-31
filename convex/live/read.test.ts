// live/read: what other modules read about "I'm lost" taps (docs/contracts.md).
import { describe, expect, it } from "vitest";
import { api } from "../_generated/api";
import { setup, TYPED_ISSUER, typed } from "../test.helpers";

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
