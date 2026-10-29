// One block every AI feature uses: Gemini through the REST API. The key lives in Convex env,
// never in the browser or the repo. Call these from an action (BLOCKS.md, "AI").
//
// Which model: pass a tier or an exact model ID.
//   "fast"  → GEMINI_MODEL_FAST   (a Flash model: cheap, quick, good for most asks)
//   "smart" → GEMINI_MODEL_SMART  (a Pro model: slower, for hard reasoning)
//   any other string is used as the model ID itself.
// GEMINI_MODEL is the fallback for both tiers. `npx convex run ai:models` lists the models
// this key can actually use, so set the env vars from that list, not from memory.
import { ConvexError, v } from "convex/values";
import { internalAction } from "./_generated/server";

const API = "https://generativelanguage.googleapis.com/v1beta";

// A piece of what you send: text, or a file (an image, audio, a PDF) as base64.
export type Part = { text: string } | { inlineData: { mimeType: string; data: string } };

function key() {
  const k = process.env.GEMINI_API_KEY;
  if (!k) throw new ConvexError("The AI key isn't set up yet (GEMINI_API_KEY).");
  return k;
}

export function pickModel(model: string = "fast") {
  const env = model === "fast" ? process.env.GEMINI_MODEL_FAST : model === "smart" ? process.env.GEMINI_MODEL_SMART : model;
  const id = env || process.env.GEMINI_MODEL;
  if (!id) throw new ConvexError(`No model set for "${model}". Run npx convex run ai:models, then set GEMINI_MODEL_FAST and GEMINI_MODEL_SMART.`);
  return id.replace(/^models\//, "");
}

// The general call. `json: true` asks for JSON back (parse it yourself); `system` sets the
// instructions the model follows.
export async function gemini(opts: { parts: Part[]; model?: string; system?: string; json?: boolean }): Promise<string> {
  const res = await fetch(`${API}/models/${pickModel(opts.model)}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key() },
    body: JSON.stringify({
      contents: [{ role: "user", parts: opts.parts }],
      ...(opts.system ? { systemInstruction: { parts: [{ text: opts.system }] } } : {}),
      ...(opts.json ? { generationConfig: { responseMimeType: "application/json" } } : {}),
    }),
  });
  if (!res.ok) throw new ConvexError(`The AI call failed (${res.status}).`);
  type Reply = { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const data = (await res.json()) as Reply;
  const text = (data?.candidates?.[0]?.content?.parts ?? []).map((p) => p?.text ?? "").join("").trim();
  if (!text) throw new ConvexError("The AI sent back nothing.");
  return text;
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
