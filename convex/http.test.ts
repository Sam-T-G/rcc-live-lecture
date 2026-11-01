// http: POST /deck, where public/deck-bridge.js sends every slide change.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import { at, setup, type T } from "./test.helpers";

const CH = "gdg";
const BRIDGE = "test-bridge-key"; // stands in for DECK_BRIDGE_KEY
const post = (t: T, body: string) => t.fetch("/deck", { method: "POST", headers: { "Content-Type": "text/plain" }, body });

// A press opens a class, and a class schedules its 12-hour close: fake timers keep that job from
// waiting on a real 12-hour timer.
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(at(2026, 11, 5, 21, 30));
});
afterEach(() => {
  vi.useRealTimers();
});

describe("F7 POST /deck", () => {
  it("F7.1 POST /deck: OPTIONS 204 with CORS headers", async () => {
    const t = setup();
    const r = await t.fetch("/deck", { method: "OPTIONS" });
    expect(r.status).toBe(204);
    expect(r.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(r.headers.get("Access-Control-Allow-Methods")).toContain("POST");
    expect(r.headers.get("Access-Control-Allow-Headers")).toContain("Content-Type");
  });

  it("F7.1 POST /deck: bad JSON 400, wrong or missing key 403, no channel 400, right key 200", async () => {
    vi.stubEnv("DECK_BRIDGE_KEY", BRIDGE);
    const t = setup();
    expect((await post(t, "{not json")).status).toBe(400);
    for (const body of [{ channel: CH, index: 1 }, { key: "not-the-key", channel: CH, index: 1 }]) {
      const r = await post(t, JSON.stringify(body));
      expect([r.status, await r.text()]).toEqual([403, "wrong key"]);
    }
    expect((await post(t, "null")).status).toBe(403);
    // Valid slide numbers, so only the missing (or empty) channel can refuse it.
    for (const body of [{ key: BRIDGE, index: 1, beat: 0, count: 1 }, { key: BRIDGE, channel: "", index: 1, beat: 0, count: 1 }]) {
      const r = await post(t, JSON.stringify(body));
      expect([r.status, await r.text()]).toEqual([400, "no channel"]);
    }
    expect(await t.query(api.deck.current, { channel: "" })).toBeNull();
    expect(await t.run((ctx) => ctx.db.query("lectures").take(1))).toEqual([]); // a refused press opens no class
    expect(await t.query(api.deck.current, { channel: CH })).toBeNull();

    const ok = await post(t, JSON.stringify({ key: BRIDGE, channel: CH, index: 2, beat: 1, count: 10, title: "Teams", lines: ["Red", "Blue"] }));
    expect(ok.status).toBe(200);
    expect(ok.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(await t.query(api.deck.current, { channel: CH })).toMatchObject({ index: 2, beat: 1, count: 10, title: "Teams", lines: ["Red", "Blue"] });

    // With DECK_BRIDGE_KEY unset nothing gets in, not even a body with no key.
    vi.stubEnv("DECK_BRIDGE_KEY", undefined);
    expect((await post(t, JSON.stringify({ key: BRIDGE, channel: CH, index: 3 }))).status).toBe(403);
    expect((await post(t, JSON.stringify({ channel: CH, index: 3 }))).status).toBe(403);
    expect((await t.query(api.deck.current, { channel: CH }))!.index).toBe(2);
  });

  // This post sends valid slide numbers (index 3, beat 0, count 10) and checks only the four clamps,
  // so the rule for bad slide numbers can change without touching this test.
  it("F7.2 channel over 64, title over 300, more than 12 lines or lines over 400 characters are clamped", async () => {
    vi.stubEnv("DECK_BRIDGE_KEY", BRIDGE);
    const t = setup();
    const channel = "c".repeat(100);
    const lines = Array.from({ length: 20 }, () => "x".repeat(500));
    const r = await post(t, JSON.stringify({ key: BRIDGE, channel, index: 3, beat: 0, count: 10, title: "t".repeat(500), lines }));
    expect(r.status).toBe(200);
    expect(await t.query(api.deck.current, { channel })).toBeNull();
    const cur = await t.query(api.deck.current, { channel: channel.slice(0, 64) });
    expect(cur).not.toBeNull();
    expect(cur!.title).toHaveLength(300);
    expect(cur!.lines).toHaveLength(12);
    expect(cur!.lines.every((l) => l.length === 400)).toBe(true);
  });

  it("F7.2 clamps; index 1e20, -5 and 1.5 and count 0 -> 400 'bad slide' and nothing is stored; whole numbers from 0 to 999 (count from 1) get through", async () => {
    vi.stubEnv("DECK_BRIDGE_KEY", BRIDGE);
    const t = setup();
    const ok = { key: BRIDGE, channel: CH, index: 3, beat: 0, count: 10, title: "Loops", lines: ["for"] };
    // The iOS app turns each number into a Swift Int, can't read 1e20 and shows "Can't load the
    // slides."; the web showed "Slide -4 of 0" for the rest. A missing number or one sent as text
    // is refused too.
    const bad: Record<string, unknown>[] = [
      { index: 1e20 },
      { index: -5 },
      { index: 1.5 },
      { count: 0 },
      { beat: -1 },
      { beat: 1.5 },
      { index: 1000 },
      { beat: 1000 },
      { count: 1000 },
      { index: "3" },
      { beat: null },
      { count: true },
      { index: undefined },
    ];
    for (const b of bad) {
      const r = await post(t, JSON.stringify({ ...ok, ...b }));
      expect([JSON.stringify(b), r.status, await r.text()]).toEqual([JSON.stringify(b), 400, "bad slide"]);
    }
    // The key is checked first, so a sender without it learns nothing from the numbers.
    expect((await post(t, JSON.stringify({ ...ok, key: "not-the-key", index: -5 }))).status).toBe(403);
    expect(await t.query(api.deck.current, { channel: CH })).toBeNull();
    expect(await t.run((ctx) => ctx.db.query("lectures").take(5))).toEqual([]); // a refused press opens no class

    for (const edge of [{ index: 0, beat: 0, count: 1 }, { index: 999, beat: 999, count: 999 }]) {
      expect((await post(t, JSON.stringify({ ...ok, ...edge }))).status).toBe(200);
      expect(await t.query(api.deck.current, { channel: CH })).toMatchObject(edge);
    }
  });

  it("core-backend-14 POST /deck passes run and seq to deck.set: a press that gets here after a newer one from the same deck tab doesn't move deck.current", async () => {
    vi.stubEnv("DECK_BRIDGE_KEY", BRIDGE);
    const t = setup();
    const send = (index: number, order: Record<string, unknown>) =>
      post(t, JSON.stringify({ key: BRIDGE, channel: CH, index, beat: 0, count: 10, title: `Slide ${index + 1}`, lines: [], ...order }));
    const row = () => t.run((ctx) => ctx.db.query("deckChannels").withIndex("by_channel", (q) => q.eq("channel", CH)).unique());
    const SEQ = 1_793_000_000_000; // the bridge's seq counts up from the clock

    expect((await send(6, { run: "tab-A", seq: SEQ + 2 })).status).toBe(200);
    expect((await send(5, { run: "tab-A", seq: SEQ + 1 })).status).toBe(200); // sent first, got here second
    expect(await t.query(api.deck.current, { channel: CH })).toMatchObject({ index: 6 });
    expect(await row()).toMatchObject({ index: 6, run: "tab-A", seq: SEQ + 2 });
    expect((await send(2, { run: "tab-B", seq: 1 })).status).toBe(200);
    expect(await t.query(api.deck.current, { channel: CH })).toMatchObject({ index: 2 });

    // A run or seq that is missing or the wrong kind drops both: the press counts like one from an
    // older bridge, so a stray value never stops the slides.
    const odd: Record<string, unknown>[] = [
      { run: "tab-B" },
      { seq: 5 },
      { run: 42, seq: 5 },
      { run: "", seq: 5 },
      { run: "r".repeat(65), seq: 5 },
      { run: "tab-B", seq: "5" },
      { run: "tab-B", seq: -1 },
      { run: "tab-B", seq: 1.5 },
    ];
    for (const [k, order] of odd.entries()) {
      expect((await send(k, order)).status).toBe(200);
      const stored = await row();
      expect([JSON.stringify(order), stored?.index, stored?.run, stored?.seq]).toEqual([JSON.stringify(order), k, undefined, undefined]);
    }
  });
});
