// One helper every AI feature uses. The key lives in Convex env, never in the browser or repo.
// GEMINI_MODEL is optional; set it to switch models without a code change.
import { ConvexError } from "convex/values";

export async function geminiText(prompt: string): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new ConvexError("The AI key isn't set up yet (GEMINI_API_KEY).");
  const model = process.env.GEMINI_MODEL || "gemini-3.5-flash";
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }] }),
    },
  );
  if (!res.ok) throw new ConvexError(`The AI call failed (${res.status}).`);
  const data: any = await res.json();
  const text: string = (data?.candidates?.[0]?.content?.parts ?? [])
    .map((p: any) => p?.text ?? "")
    .join("")
    .trim();
  if (!text) throw new ConvexError("The AI sent back nothing.");
  return text;
}
