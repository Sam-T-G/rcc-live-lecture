// http: POST /deck text that Convex can store, and an answer the deck can read when the store fails.
// Convex keeps strings as valid Unicode, so a lone half of a UTF-16 surrogate pair (half an emoji)
// fails the write on a real backend. convex-test stores it anyway, so these tests check the text
// that reaches deck.set instead.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import { at, setup, type T } from "./test.helpers";

const CH = "gdg";
const BRIDGE = "test-bridge-key"; // stands in for DECK_BRIDGE_KEY
const post = (t: T, body: string) => t.fetch("/deck", { method: "POST", headers: { "Content-Type": "text/plain" }, body });
const LONE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
const EMOJI = "\u{1F600}"; // two UTF-16 units

// A press opens a class, which schedules its 12-hour close: fake timers keep that job off a real timer.
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(at(2026, 11, 5, 21, 30));
  vi.stubEnv("DECK_BRIDGE_KEY", BRIDGE);
});
afterEach(() => {
  vi.useRealTimers();
});

describe("POST /deck text", () => {
  it("DECK-convex-2 cutting the channel, title and lines never splits an emoji, and a lone half sent in the JSON becomes U+FFFD", async () => {
    const t = setup();
    const channel = "c".repeat(63) + EMOJI; // the emoji sits on units 63-64
    const title = "t".repeat(299) + EMOJI + "rest"; // units 299-300
    const line = "x".repeat(399) + EMOJI + "rest"; // units 399-400
    const r = await post(t, JSON.stringify({ key: BRIDGE, channel, index: 1, beat: 0, count: 5, title, lines: [line, "a\uD83Db", "\uDE00z"] }));
    expect(r.status).toBe(200);
    const row = await t.run((ctx) => ctx.db.query("deckChannels").take(5));
    expect(row).toHaveLength(1);
    const { channel: kept, title: keptTitle, lines } = row[0];
    for (const s of [kept, keptTitle, ...lines]) expect([s.slice(-8), LONE.test(s)]).toEqual([s.slice(-8), false]);
    expect(kept).toBe("c".repeat(63));
    expect(keptTitle).toBe("t".repeat(299));
    expect(lines).toEqual(["x".repeat(399), "a�b", "�z"]);
    // A whole emoji under the limit stays.
    expect(await post(t, JSON.stringify({ key: BRIDGE, channel: CH, index: 0, beat: 0, count: 5, title: `Hi ${EMOJI}`, lines: [EMOJI] }))).toHaveProperty("status", 200);
    expect(await t.query(api.deck.current, { channel: CH })).toMatchObject({ title: `Hi ${EMOJI}`, lines: [EMOJI] });
  });

  it("DECK-convex-2 when deck.set fails, the answer is a 500 with the CORS headers, so the deck reads the status instead of a blocked request", async () => {
    const t = setup();
    // Two rows for one channel make deck.set's .unique() throw: a stand-in for any write that fails.
    await t.run(async (ctx) => {
      for (let k = 0; k < 2; k++) await ctx.db.insert("deckChannels", { channel: CH, index: k, beat: 0, count: 5, title: "", lines: [], at: 0 });
    });
    const r = await post(t, JSON.stringify({ key: BRIDGE, channel: CH, index: 2, beat: 0, count: 5, title: "Trees", lines: [] }));
    expect([r.status, await r.text(), r.headers.get("Access-Control-Allow-Origin")]).toEqual([500, "server error", "*"]);
  });
});
