// http: POST /deck, where public/deck-bridge.js sends every slide change.
import { describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import { setup, type T } from "./test.helpers";

const CH = "gdg";
const BRIDGE = "test-bridge-key"; // stands in for DECK_BRIDGE_KEY
const post = (t: T, body: string) => t.fetch("/deck", { method: "POST", headers: { "Content-Type": "text/plain" }, body });

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
    expect((await post(t, JSON.stringify({ key: BRIDGE, index: 1 }))).status).toBe(400);
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

  it("F7.2 channel over 64, title over 300, more than 12 lines or lines over 400 characters are clamped", async () => {
    vi.stubEnv("DECK_BRIDGE_KEY", BRIDGE);
    const t = setup();
    const channel = "c".repeat(100);
    const lines = [...Array.from({ length: 20 }, () => "x".repeat(500)), 7, ""];
    const r = await post(t, JSON.stringify({ key: BRIDGE, channel, index: "3", beat: null, count: true, title: "t".repeat(500), lines }));
    expect(r.status).toBe(200);
    expect(await t.query(api.deck.current, { channel })).toBeNull();
    const cur = await t.query(api.deck.current, { channel: channel.slice(0, 64) });
    expect(cur).toMatchObject({ index: 0, beat: 0, count: 0 }); // numbers that aren't numbers become 0
    expect(cur!.title).toHaveLength(300);
    expect(cur!.lines).toHaveLength(12);
    expect(cur!.lines.every((l) => l.length === 400)).toBe(true);
  });
});
