// ai: Gemini through its REST API. Every test stubs fetch, so nothing reaches Google.
import { ConvexError } from "convex/values";
import { describe, expect, it, vi } from "vitest";
import { internal } from "./_generated/api";
import { setup } from "./test.helpers";

const API = "https://generativelanguage.googleapis.com/v1beta";
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
const said = (text: string) => json({ candidates: [{ content: { parts: [{ text }] } }] });

// fetch's arguments, typed, for the calls a stub received.
type Call = [url: string, init?: RequestInit];
const calls = (m: { mock: { calls: unknown[][] } }) => m.mock.calls as Call[];
const header = (init: RequestInit | undefined, name: string) => new Headers(init?.headers).get(name);
const body = (init: RequestInit | undefined) => JSON.parse(String(init?.body));

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

  it("a missing model env throws (any ConvexError), and so does a missing key, before any request", async () => {
    const fetchMock = vi.fn(async () => said("unused"));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("GEMINI_API_KEY", "test-gemini-key");
    vi.stubEnv("GEMINI_MODEL_FAST", undefined);
    vi.stubEnv("GEMINI_MODEL", undefined);
    const t = setup();
    expect(await t.action(internal.ai.tryIt, { prompt: "Hello" }).catch((e: unknown) => e)).toBeInstanceOf(ConvexError);
    vi.stubEnv("GEMINI_MODEL_FAST", "test-fast");
    vi.stubEnv("GEMINI_API_KEY", undefined);
    expect(await t.action(internal.ai.tryIt, { prompt: "Hello" }).catch((e: unknown) => e)).toBeInstanceOf(ConvexError);
    expect(await t.action(internal.ai.models, {}).catch((e: unknown) => e)).toBeInstanceOf(ConvexError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("F39.5 an action that calls fetch without a stub fails with 'No network in tests'", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-gemini-key");
    const t = setup();
    await expect(t.action(internal.ai.models, {})).rejects.toThrow("No network in tests");
  });
});
