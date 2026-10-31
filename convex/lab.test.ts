// lab: the functions the /lab page calls to check each building block. ping and aiPing are
// called as a Google host, which works today and after they become professor-only (LAB).
import { describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import { googleHost, HOST_EMAIL, profEnv, setup, typed } from "./test.helpers";

describe("F45 the lab page", () => {
  it("F45.1 whoami says student for a typed sign-in and host for a Google host", async () => {
    profEnv();
    const t = setup();
    expect(await t.query(api.lab.whoami, {})).toBeNull();
    expect(await typed(t, "Sample student 1", "student1@example.edu").query(api.lab.whoami, {})).toEqual({
      name: "Sample student 1",
      email: "student1@example.edu",
      isHost: false,
    });
    expect(await typed(t, "Sample professor", HOST_EMAIL).query(api.lab.whoami, {})).toMatchObject({ isHost: false });
    expect(await googleHost(t).query(api.lab.whoami, {})).toEqual({ name: "Sample professor", email: HOST_EMAIL, isHost: true });
  });

  it("F45.2 ping adds one to pings, and a signed-out ping is refused", async () => {
    profEnv();
    const t = setup();
    expect(await t.query(api.lab.pings, {})).toBe(0);
    await googleHost(t).mutation(api.lab.ping, {});
    await googleHost(t).mutation(api.lab.ping, {});
    expect(await t.query(api.lab.pings, {})).toBe(2);
    await expect(t.mutation(api.lab.ping, {})).rejects.toThrow();
    expect(await t.query(api.lab.pings, {})).toBe(2);
  });

  it("F45.2 aiPing returns the model's reply, and refuses a signed-out caller before calling Gemini", async () => {
    profEnv();
    vi.stubEnv("GEMINI_API_KEY", "test-gemini-key");
    vi.stubEnv("GEMINI_MODEL_FAST", "test-fast-model");
    const reply = { candidates: [{ content: { parts: [{ text: "the AI block works." }] } }] };
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(reply), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const t = setup();
    await expect(t.action(api.lab.aiPing, {})).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await googleHost(t).action(api.lab.aiPing, {})).toBe("the AI block works.");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
