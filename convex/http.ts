import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

// POST /deck: the deck bridge (public/deck-bridge.js) sends every slide change here.
// It runs inside a slide deck, which can be any origin (a published deck or a local
// file), so it is let in by the shared DECK_BRIDGE_KEY env var, not by origin.
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
    let body: any;
    try {
      body = JSON.parse(await req.text());
    } catch {
      return new Response("bad json", { status: 400, headers: cors });
    }
    const key = process.env.DECK_BRIDGE_KEY;
    if (!key || body?.key !== key) return new Response("wrong key", { status: 403, headers: cors });
    const str = (x: unknown) => (typeof x === "string" ? x : "");
    const num = (x: unknown) => (typeof x === "number" && isFinite(x) ? x : 0);
    const channel = str(body.channel).slice(0, 64);
    if (!channel) return new Response("no channel", { status: 400, headers: cors });
    await ctx.runMutation(internal.deck.set, {
      channel,
      index: num(body.index),
      beat: num(body.beat),
      count: num(body.count),
      title: str(body.title).slice(0, 300),
      lines: (Array.isArray(body.lines) ? body.lines : []).map(str).filter(Boolean).slice(0, 12).map((l: string) => l.slice(0, 400)),
    });
    return new Response("ok", { status: 200, headers: cors });
  }),
});

export default http;
