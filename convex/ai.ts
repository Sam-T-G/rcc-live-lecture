// One block every AI feature uses: Gemini through the REST API. The key lives in Convex env,
// never in the browser or the repo. Call these from an action (BLOCKS.md, "AI").
//
// Which model: pass a tier or an exact model ID.
//   "fast"  → GEMINI_MODEL_FAST   (a Flash model: cheap, quick, good for most asks)
//   "smart" → GEMINI_MODEL_SMART  (a Pro model: slower, for hard reasoning)
//   any other string is used as the model ID itself.
// GEMINI_MODEL is the fallback for both tiers. `npx convex run ai:models` lists the models
// this key can actually use, so set the env vars from that list, not from memory.
//
// When a call fails, gemini() throws one of three lines, because a function's error text shows
// word for word on the professor's screen. The details (the status code, Google's message, the
// env var that's missing) go to console.error, where `npx convex logs` shows them.
//   GEMINI_API_KEY or the tier's model isn't set -> "The AI isn't set up on this server."
//   Gemini answers 429 or 503 (too many requests, or busy) -> one retry 1 s later; busy again
//     -> "The AI is busy. Try again in a minute."
//   anything else, including no answer within 30 s -> "The AI call failed. Try again."
// Each request is aborted after 30 s, so the professor's button stops spinning instead of
// waiting for the action's own time limit.
import { ConvexError, v } from "convex/values";
import { internalAction } from "./_generated/server";

const API = "https://generativelanguage.googleapis.com/v1beta";
const TIMEOUT_MS = 30_000; // give up on a request Gemini hasn't answered by then
const RETRY_MS = 1_000; // wait this long before the one retry after a 429 or 503
const BUSY = [429, 503];

// What the professor sees.
const NOT_SET_UP = "The AI isn't set up on this server.";
const IS_BUSY = "The AI is busy. Try again in a minute.";
const FAILED = "The AI call failed. Try again.";

// A piece of what you send: text, or a file (an image, audio, a PDF) as base64.
export type Part = { text: string } | { inlineData: { mimeType: string; data: string } };

function key() {
  const k = process.env.GEMINI_API_KEY;
  if (!k) {
    console.error("AI: GEMINI_API_KEY isn't set on this deployment.");
    throw new ConvexError(NOT_SET_UP);
  }
  return k;
}

export function pickModel(model: string = "fast") {
  const env = model === "fast" ? process.env.GEMINI_MODEL_FAST : model === "smart" ? process.env.GEMINI_MODEL_SMART : model;
  const id = env || process.env.GEMINI_MODEL;
  if (!id) {
    console.error(`AI: no model set for "${model}". Run npx convex run ai:models, then set GEMINI_MODEL_FAST and GEMINI_MODEL_SMART.`);
    throw new ConvexError(NOT_SET_UP);
  }
  return id.replace(/^models\//, "");
}

type Reply = {
  candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
};
// How one request went: the reply's text, or what went wrong and whether Gemini said it was busy.
type Attempt = { text: string } | { busy: boolean; detail: string };

// Sends one request and reads the reply, giving up after 30 s. The timer aborts the fetch, and
// every step also races the timer, so the 30 s holds even if a fetch keeps going after the abort.
async function attempt(url: string, init: RequestInit): Promise<Attempt> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const abort = new AbortController();
    const late = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        abort.abort();
        reject(new Error(`no answer in ${TIMEOUT_MS / 1000} s`));
      }, TIMEOUT_MS);
    });
    const inTime = <T>(work: Promise<T>) => Promise.race([work, late]);
    const res = await inTime(fetch(url, { ...init, signal: abort.signal }));
    if (!res.ok) {
      const said = await inTime(res.text()).catch(() => "");
      return { busy: BUSY.includes(res.status), detail: `${res.status} ${said.slice(0, 500)}` };
    }
    const data = (await inTime(res.json())) as Reply;
    const text = (data?.candidates?.[0]?.content?.parts ?? []).map((p) => p?.text ?? "").join("").trim();
    if (text) return { text };
    const why = data?.promptFeedback?.blockReason ?? data?.candidates?.[0]?.finishReason ?? "no reason given";
    return { busy: false, detail: `the reply had no text (${why})` };
  } catch (e) {
    return { busy: false, detail: e instanceof Error ? e.message : String(e) };
  } finally {
    clearTimeout(timer);
  }
}

// The general call. `json: true` asks for JSON back (parse it yourself); `system` sets the
// instructions the model follows. Throws one of the three lines at the top of this file.
export async function gemini(opts: { parts: Part[]; model?: string; system?: string; json?: boolean }): Promise<string> {
  const model = pickModel(opts.model);
  const url = `${API}/models/${model}:generateContent`;
  const init: RequestInit = {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key() },
    body: JSON.stringify({
      contents: [{ role: "user", parts: opts.parts }],
      ...(opts.system ? { systemInstruction: { parts: [{ text: opts.system }] } } : {}),
      ...(opts.json ? { generationConfig: { responseMimeType: "application/json" } } : {}),
    }),
  };
  let result = await attempt(url, init);
  if ("busy" in result && result.busy) {
    console.warn(`AI: ${model} is busy (${result.detail}); trying once more in ${RETRY_MS / 1000} s.`);
    await new Promise((resolve) => setTimeout(resolve, RETRY_MS));
    result = await attempt(url, init);
  }
  if ("text" in result) return result.text;
  console.error(`AI: the call to ${model} failed: ${result.detail}`);
  throw new ConvexError(result.busy ? IS_BUSY : FAILED);
}

// Text in, text out, on the fast tier unless you name another. Most features need only this.
export function geminiText(prompt: string, model?: string) {
  return gemini({ parts: [{ text: prompt }], model });
}

// Every model this key can call for generateContent, with its display name.
// Internal, so only the CLI and the dashboard run it: npx convex run ai:models
export const models = internalAction({
  args: {},
  returns: v.array(v.object({ id: v.string(), name: v.string() })),
  handler: async () => {
    const out: { id: string; name: string }[] = [];
    let page = "";
    do {
      const res = await fetch(`${API}/models?pageSize=200${page ? "&pageToken=" + page : ""}`, { headers: { "x-goog-api-key": key() } });
      if (!res.ok) throw new ConvexError(`Listing models failed (${res.status}).`);
      type List = { models?: { name: string; displayName?: string; supportedGenerationMethods?: string[] }[]; nextPageToken?: string };
      const data = (await res.json()) as List;
      for (const m of data.models ?? [])
        if (m.supportedGenerationMethods?.includes("generateContent")) out.push({ id: m.name.replace(/^models\//, ""), name: m.displayName ?? "" });
      page = data.nextPageToken ?? "";
    } while (page);
    return out;
  },
});

// Try a model from the CLI before building on it, optionally with an image from a URL:
//   npx convex run ai:tryIt '{"model":"smart","prompt":"Say hi in five words."}'
//   npx convex run ai:tryIt '{"prompt":"What is in this picture?","imageUrl":"https://...","json":true}'
export const tryIt = internalAction({
  args: { prompt: v.string(), model: v.optional(v.string()), imageUrl: v.optional(v.string()), json: v.optional(v.boolean()) },
  returns: v.object({ model: v.string(), text: v.string() }),
  handler: async (_ctx, { prompt, model, imageUrl, json }) => {
    const parts: Part[] = [{ text: prompt }];
    if (imageUrl) {
      const img = await fetch(imageUrl);
      if (!img.ok) throw new ConvexError(`Couldn't fetch the image (${img.status}).`);
      const bytes = new Uint8Array(await img.arrayBuffer());
      let bin = "";
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      parts.push({ inlineData: { mimeType: img.headers.get("content-type") ?? "image/png", data: btoa(bin) } });
    }
    return { model: pickModel(model), text: await gemini({ parts, model, json }) };
  },
});
