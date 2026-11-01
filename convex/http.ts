import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { slideNumbers } from "./deck";

// POST /deck: the deck bridge (public/deck-bridge.js) sends every slide change here.
// It runs inside a slide deck, which can be any origin (a published deck or a local
// file), so it is let in by the shared DECK_BRIDGE_KEY env var, not by origin.
// Answers: 200 "ok"; 400 "bad json", "no channel" or "bad slide"; 403 "wrong key"; 500
// "server error" when deck.set fails (logged here). Every answer carries the CORS headers, so the
// deck reads the status instead of a blocked request.
// "bad slide": index and beat must be whole numbers from 0 to 999 and count from 1 to 999
// (deck.ts slideNumbers), since the iOS app can't read a number it can't turn into an Int:
// on the live slide it shows "Can't load the slides.", and in the page-back list page-back
// stays empty with no message.
// Text is cut to fit: channel 64 UTF-16 units, title 300, at most 12 lines of 400 each. Convex
// stores only valid Unicode, so a cut never keeps half of an emoji, and a lone half sent in the
// JSON becomes U+FFFD.
// `run` (1 to 64 UTF-16 units, no lone surrogate) and `seq` (a whole number, 0 or more) go to deck.set together,
// or neither does when one is missing or the wrong kind, and the press still counts.
const http = httpRouter();

// The first `max` UTF-16 units of `s`, minus a high surrogate left at the end, with every other
// unpaired surrogate replaced by U+FFFD.
function cut(s: string, max: number): string {
  return s
    .slice(0, max)
    .replace(/[\uD800-\uDBFF]$/, "")
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "�");
}

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
    const channel = cut(str(body.channel), 64);
    if (!channel) return new Response("no channel", { status: 400, headers: cors });
    const numbers = slideNumbers(body);
    if (!numbers) return new Response("bad slide", { status: 400, headers: cors });
    const { run, seq } = body;
    const order =
      typeof run === "string" && run.length >= 1 && run.length <= 64 && cut(run, 64) === run && typeof seq === "number" && Number.isSafeInteger(seq) && seq >= 0
        ? { run, seq }
        : {};
    try {
      await ctx.runMutation(internal.deck.set, {
        channel,
        ...numbers,
        title: cut(str(body.title), 300),
        lines: (Array.isArray(body.lines) ? body.lines : [])
          .map(str)
          .filter(Boolean)
          .slice(0, 12)
          .map((l: string) => cut(l, 400))
          .filter(Boolean),
        ...order,
      });
    } catch (e) {
      console.error("POST /deck: deck.set failed", e);
      return new Response("server error", { status: 500, headers: cors });
    }
    return new Response("ok", { status: 200, headers: cors });
  }),
});

export default http;
