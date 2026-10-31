// ai: Gemini through its REST API. Every test stubs fetch, so nothing reaches Google.
import { ConvexError } from "convex/values";
import { afterEach, describe, expect, it, vi } from "vitest";
import { internal } from "./_generated/api";
import { setup } from "./test.helpers";

const API = "https://generativelanguage.googleapis.com/v1beta";
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
const said = (text: string) => json({ candidates: [{ content: { parts: [{ text }] } }] });
const status = (code: number, message: string) => new Response(JSON.stringify({ error: { code, message } }), { status: code });

// fetch's arguments, typed, for the calls a stub received.
type Call = [url: string, init?: RequestInit];
const calls = (m: { mock: { calls: unknown[][] } }) => m.mock.calls as Call[];
const header = (init: RequestInit | undefined, name: string) => new Headers(init?.headers).get(name);
const body = (init: RequestInit | undefined) => JSON.parse(String(init?.body));

// What the professor sees on a failed call.
const NOT_SET_UP = "The AI isn't set up on this server.";
const IS_BUSY = "The AI is busy. Try again in a minute.";
const FAILED = "The AI call failed. Try again.";
const RETRY_MS = 1_000;
const TIMEOUT_MS = 30_000;

// The key and the fast model, as on a backend where the AI is set up.
function geminiEnv() {
  vi.stubEnv("GEMINI_API_KEY", "test-gemini-key");
  vi.stubEnv("GEMINI_MODEL_FAST", "test-fast");
}

// Keeps console.error and console.warn out of the test output and returns everything they got.
function logs() {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  return () => [...error.mock.calls, ...warn.mock.calls].map((args) => args.map(String).join(" ")).join("\n");
}
// How many times gemini() said it would retry, from the logs.
const retries = (logged: () => string) => (logged().match(/trying once more/g) ?? []).length;

type Outcome = { value: unknown } | { error: unknown };

// Starts a call and records when it settles, so a test can check it's still waiting while it
// moves fake time.
function track(call: Promise<unknown>) {
  const run = {
    done: false,
    outcome: call.then(
      (value): Outcome => ({ value }),
      (error: unknown): Outcome => ({ error }),
    ),
  };
  void run.outcome.then(() => {
    run.done = true;
  });
  return run;
}

// The line a failed call shows: the ConvexError's text. Fails the test when the call worked or
// threw something else.
function lineOf(outcome: Outcome) {
  expect(outcome).toHaveProperty("error");
  const e = "error" in outcome ? outcome.error : undefined;
  expect(e).toBeInstanceOf(ConvexError);
  return (e as ConvexError<string>).data;
}
const shown = async (call: Promise<unknown>) => lineOf(await track(call).outcome);

// Lets the action run (without moving the fake clock) until `ready` is true.
async function until(ready: () => boolean) {
  for (let i = 0; i < 100 && !ready(); i++) await vi.advanceTimersByTimeAsync(0);
  expect(ready()).toBe(true);
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("ai", () => {
  it("models lists the models this key can call for generateContent, across pages", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-gemini-key");
    const pages = [
      {
        models: [
          { name: "models/test-flash", displayName: "Test Flash", supportedGenerationMethods: ["generateContent", "countTokens"] },
          { name: "models/test-embed", displayName: "Test Embed", supportedGenerationMethods: ["embedContent"] },
        ],
        nextPageToken: "page-2",
      },
      { models: [{ name: "models/test-pro", supportedGenerationMethods: ["generateContent"] }] },
    ];
    const fetchMock = vi.fn(async () => json(pages[fetchMock.mock.calls.length - 1]));
    vi.stubGlobal("fetch", fetchMock);
    const t = setup();
    expect(await t.action(internal.ai.models, {})).toEqual([
      { id: "test-flash", name: "Test Flash" },
      { id: "test-pro", name: "" },
    ]);
    const [first, second] = calls(fetchMock);
    expect(first[0]).toBe(`${API}/models?pageSize=200`);
    expect(second[0]).toBe(`${API}/models?pageSize=200&pageToken=page-2`);
    expect(header(first[1], "x-goog-api-key")).toBe("test-gemini-key");
  });

  it("tryIt sends the prompt to the tier's model and returns its text", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-gemini-key");
    vi.stubEnv("GEMINI_MODEL_FAST", "models/test-fast");
    vi.stubEnv("GEMINI_MODEL_SMART", "test-smart");
    const fetchMock = vi.fn(async () => said("Hi from the test model."));
    vi.stubGlobal("fetch", fetchMock);
    const t = setup();

    expect(await t.action(internal.ai.tryIt, { prompt: "Say hi in five words." })).toEqual({ model: "test-fast", text: "Hi from the test model." });
    let [url, init] = calls(fetchMock)[0];
    expect(url).toBe(`${API}/models/test-fast:generateContent`);
    expect(header(init, "x-goog-api-key")).toBe("test-gemini-key");
    expect(body(init)).toEqual({ contents: [{ role: "user", parts: [{ text: "Say hi in five words." }] }] });

    expect(await t.action(internal.ai.tryIt, { prompt: "Answer in JSON.", model: "smart", json: true })).toMatchObject({ model: "test-smart" });
    [url, init] = calls(fetchMock)[1];
    expect(url).toBe(`${API}/models/test-smart:generateContent`);
    expect(body(init).generationConfig).toEqual({ responseMimeType: "application/json" });
  });

  it("tryIt with an image URL sends the image as base64 next to the prompt", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-gemini-key");
    vi.stubEnv("GEMINI_MODEL_FAST", "test-fast");
    const png = new Uint8Array([137, 80, 78, 71]);
    const fetchMock = vi.fn(async (url: string) =>
      url === "https://example.edu/sample.png" ? new Response(png, { status: 200, headers: { "Content-Type": "image/png" } }) : said("A sample picture."),
    );
    vi.stubGlobal("fetch", fetchMock);
    const t = setup();
    expect(await t.action(internal.ai.tryIt, { prompt: "What is in this picture?", imageUrl: "https://example.edu/sample.png" })).toEqual({
      model: "test-fast",
      text: "A sample picture.",
    });
    const sent = body(calls(fetchMock)[1][1]);
    expect(sent.contents[0].parts).toEqual([{ text: "What is in this picture?" }, { inlineData: { mimeType: "image/png", data: btoa(String.fromCharCode(...png)) } }]);
  });

  it("core-backend-16 a missing model or GEMINI_API_KEY throws 'The AI isn't set up on this server.' before any request, and the detail goes to console.error", async () => {
    const logged = logs();
    const fetchMock = vi.fn(async () => said("unused"));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("GEMINI_API_KEY", "test-gemini-key");
    vi.stubEnv("GEMINI_MODEL_FAST", undefined);
    vi.stubEnv("GEMINI_MODEL", undefined);
    const t = setup();
    expect(await shown(t.action(internal.ai.tryIt, { prompt: "Hello" }))).toBe(NOT_SET_UP);
    expect(logged()).toContain('no model set for "fast"');

    vi.stubEnv("GEMINI_MODEL_FAST", "test-fast");
    vi.stubEnv("GEMINI_API_KEY", undefined);
    expect(await shown(t.action(internal.ai.tryIt, { prompt: "Hello" }))).toBe(NOT_SET_UP);
    expect(await shown(t.action(internal.ai.models, {}))).toBe(NOT_SET_UP);
    expect(logged()).toContain("GEMINI_API_KEY isn't set");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("core-backend-16 a 503 then a 200 returns the reply after one retry 1 s later (fake timers)", async () => {
    geminiEnv();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const logged = logs();
    const fetchMock = vi.fn(async () => (fetchMock.mock.calls.length === 1 ? status(503, "The model is overloaded.") : said("Hi after one retry.")));
    vi.stubGlobal("fetch", fetchMock);
    const t = setup();
    const run = track(t.action(internal.ai.tryIt, { prompt: "Hello" }));

    // The first request came back busy and the retry waits on its 1 s timer.
    await until(() => retries(logged) === 1);
    await vi.advanceTimersByTimeAsync(RETRY_MS - 1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(run.done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await run.outcome).toEqual({ value: { model: "test-fast", text: "Hi after one retry." } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(calls(fetchMock)[1][0]).toBe(`${API}/models/test-fast:generateContent`);
    expect(logged()).toContain("503 ");
    expect(logged()).toContain("The model is overloaded.");
  });

  it("core-backend-16 429 twice throws 'The AI is busy. Try again in a minute.', and a busy reply then a 500 throws 'The AI call failed. Try again.'; the logs have the status and Google's message, never the key (fake timers)", async () => {
    geminiEnv();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const logged = logs();
    const t = setup();

    const busy = vi.fn(async () => status(429, "Resource has been exhausted (check quota)."));
    vi.stubGlobal("fetch", busy);
    let run = track(t.action(internal.ai.tryIt, { prompt: "Hello" }));
    await until(() => retries(logged) === 1);
    await vi.advanceTimersByTimeAsync(RETRY_MS);
    expect(lineOf(await run.outcome)).toBe(IS_BUSY);
    expect(busy).toHaveBeenCalledTimes(2); // one retry, no more

    const busyThenBroken = vi.fn(async () => (busyThenBroken.mock.calls.length === 1 ? status(503, "Busy.") : status(500, "Internal error.")));
    vi.stubGlobal("fetch", busyThenBroken);
    run = track(t.action(internal.ai.tryIt, { prompt: "Hello" }));
    await until(() => retries(logged) === 2);
    await vi.advanceTimersByTimeAsync(RETRY_MS);
    expect(lineOf(await run.outcome)).toBe(FAILED);
    expect(busyThenBroken).toHaveBeenCalledTimes(2);

    expect(logged()).toContain("429 ");
    expect(logged()).toContain("Resource has been exhausted (check quota).");
    expect(logged()).toContain("500 ");
    expect(logged()).not.toContain("test-gemini-key");
  });

  it("core-backend-16 any other failure throws 'The AI call failed. Try again.' with no retry: a 500, a reply with no text, a blocked prompt, a reply that isn't JSON, a fetch that throws", async () => {
    geminiEnv();
    const logged = logs();
    const t = setup();
    const replies: (() => Promise<Response>)[] = [
      async () => status(500, "Internal error."),
      async () => json({ candidates: [{ content: { parts: [] }, finishReason: "MAX_TOKENS" }] }),
      async () => json({ promptFeedback: { blockReason: "SAFETY" } }),
      async () => new Response("<html>Bad gateway</html>", { status: 200 }),
      async () => {
        throw new TypeError("fetch failed");
      },
    ];
    for (const reply of replies) {
      const fetchMock = vi.fn(reply);
      vi.stubGlobal("fetch", fetchMock);
      expect(await shown(t.action(internal.ai.tryIt, { prompt: "Hello" }))).toBe(FAILED);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    }
    for (const detail of ["500 ", "Internal error.", "MAX_TOKENS", "SAFETY", "fetch failed"]) expect(logged()).toContain(detail);
    expect(logged()).not.toContain("trying once more");
  });

  it("core-backend-16 a request Gemini doesn't answer is aborted after 30 s and throws 'The AI call failed. Try again.', also when fetch ignores the abort (fake timers)", async () => {
    geminiEnv();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const logged = logs();
    const t = setup();
    // A fetch that never answers but stops once aborted, the way a real fetch does, and one that
    // never stops at all.
    const hangs: ((init?: RequestInit) => Promise<Response>)[] = [
      (init) => new Promise((_, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("The request was aborted.")))),
      () => new Promise(() => {}),
    ];
    for (const hang of hangs) {
      const signals: (AbortSignal | null | undefined)[] = [];
      const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
        signals.push(init?.signal);
        return hang(init);
      });
      vi.stubGlobal("fetch", fetchMock);
      const run = track(t.action(internal.ai.tryIt, { prompt: "Hello" }));
      await until(() => fetchMock.mock.calls.length === 1);
      await vi.advanceTimersByTimeAsync(TIMEOUT_MS - 1);
      expect(run.done).toBe(false);
      expect(signals[0]?.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(signals[0]?.aborted).toBe(true);
      expect(lineOf(await run.outcome)).toBe(FAILED);
      expect(fetchMock).toHaveBeenCalledTimes(1); // a request that ran out of time isn't retried
    }
    expect(logged()).toContain("no answer in 30 s");
  });

  it("F39.5 an action that calls fetch without a stub fails with 'No network in tests'", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-gemini-key");
    const t = setup();
    await expect(t.action(internal.ai.models, {})).rejects.toThrow("No network in tests");
  });
});
