import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { slideNumbers } from "./deck";

// POST /deck: the deck bridge (public/deck-bridge.js) sends every slide change here.
// It runs inside a slide deck, which can be any origin (a published deck or a local
// file), so it is let in by the shared DECK_BRIDGE_KEY env var, not by origin.
// Answers: 200 "ok"; 400 "bad json", "no channel" or "bad slide"; 403 "wrong key".
// "bad slide": index and beat must be whole numbers from 0 to 999 and count from 1 to 999
// (deck.ts slideNumbers), since the iOS app crashes on a number it can't turn into an Int.
// Text is cut to fit: channel 64 characters, title 300, at most 12 lines of 400 each.
// `run` (1 to 64 characters) and `seq` (a whole number, 0 or more) go to deck.set together,
// or neither does when one is missing or the wrong kind, and the press still counts.
const http = httpRouter();

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

http.route({
  path: "/deck",
  method: "OPTIONS",
  handler: httpAction(async () => new Response(null, { status: 204, headers: cors })),
});

http.route({
  path: "/deck",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(await req.text()) ?? {};
    } catch {
      return new Response("bad json", { status: 400, headers: cors });
    }
    const key = process.env.DECK_BRIDGE_KEY;
    if (!key || body.key !== key) return new Response("wrong key", { status: 403, headers: cors });
    const str = (x: unknown) => (typeof x === "string" ? x : "");
    const channel = str(body.channel).slice(0, 64);
    if (!channel) return new Response("no channel", { status: 400, headers: cors });
    const numbers = slideNumbers(body);
    if (!numbers) return new Response("bad slide", { status: 400, headers: cors });
    const { run, seq } = body;
    const order =
      typeof run === "string" && run.length >= 1 && run.length <= 64 && typeof seq === "number" && Number.isSafeInteger(seq) && seq >= 0
        ? { run, seq }
        : {};
    await ctx.runMutation(internal.deck.set, {
      channel,
      ...numbers,
      title: str(body.title).slice(0, 300),
      lines: (Array.isArray(body.lines) ? body.lines : []).map(str).filter(Boolean).slice(0, 12).map((l: string) => l.slice(0, 400)),
      ...order,
    });
    return new Response("ok", { status: 200, headers: cors });
  }),
});

export default http;
