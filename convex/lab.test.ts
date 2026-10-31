// lab: the functions #/lab calls to check each building block. whoami, pings and lastPing are
// open to anyone; ping and aiPing are for professors and admins (convex/lab.ts says why). Every
// test that reaches aiPing stubs fetch, so nothing goes to Google.
import { ConvexError } from "convex/values";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import { ADMIN_EMAIL, admin, at, authMatrix, google, grant, HOST_ONLY, profEnv, professor, SCANNER_EMAIL, setup, typed } from "./test.helpers";

const REPLY = "the AI block works.";

// GEMINI_API_KEY and the fast model set, as on a backend where the AI is set up, and fetch
// answering the way Gemini does. Returns the fetch stub, to count the requests sent to Gemini.
function gemini() {
  vi.stubEnv("GEMINI_API_KEY", "test-gemini-key");
  vi.stubEnv("GEMINI_MODEL_FAST", "test-fast-model");
  const reply = { candidates: [{ content: { parts: [{ text: REPLY }] } }] };
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(reply), { status: 200, headers: { "Content-Type": "application/json" } }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

// The words a refused call shows on #/lab: its ConvexError's text. Fails the test when the call
// worked or threw any other error, because prod sends the page "Server Error" in place of any
// error that isn't a ConvexError.
async function refusal(call: Promise<unknown>) {
  const error = await call.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(ConvexError);
  return (error as ConvexError<string>).data;
}

// Students and a scanner, signed in on `t`: none of them may ping or ask the AI.
const notProfessors = (t: ReturnType<typeof setup>) => [
  typed(t, "Sample student 1", "student1@example.edu"),
  google(t, "Sample student 2", "student2@example.edu"),
  google(t, "Sample scanner", SCANNER_EMAIL),
];

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("F45 the lab page", () => {
  it("F45.1 whoami says who the server sees and their role: none for a typed sign-in (even with the admin's email) or a Google student, and scanner, professor or admin for staff; isHost only for professors and admins", async () => {
    profEnv();
    const t = setup();
    await grant(t, SCANNER_EMAIL, "scanner");
    expect(await t.query(api.lab.whoami, {})).toBeNull();
    expect(await typed(t, "Sample student 1", "student1@example.edu").query(api.lab.whoami, {})).toEqual({
      name: "Sample student 1",
      email: "student1@example.edu",
      isHost: false,
      role: null,
    });
    expect(await typed(t, "Sample admin", ADMIN_EMAIL).query(api.lab.whoami, {})).toMatchObject({ isHost: false, role: null });
    expect(await google(t, "Sample student 2", "student2@example.edu").query(api.lab.whoami, {})).toMatchObject({ isHost: false, role: null });
    expect(await google(t, "Sample scanner", SCANNER_EMAIL).query(api.lab.whoami, {})).toMatchObject({ isHost: false, role: "scanner" });
    expect(await (await professor(t)).query(api.lab.whoami, {})).toMatchObject({ isHost: true, role: "professor" });
    expect(await admin(t).query(api.lab.whoami, {})).toEqual({ name: "Sample admin", email: ADMIN_EMAIL, isHost: true, role: "admin" });
  });

  it("F45.2 ping saves a professor's press (pings and lastPing move); a typed or Google student and a scanner get 'Only professors can do that.' and signed out gets 'Sign in first.', both as ConvexErrors, not prod's 'Server Error'", async () => {
    profEnv();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(at(2026, 11, 5, 21, 30));
    const t = setup();
    await grant(t, SCANNER_EMAIL, "scanner");
    expect(await t.query(api.lab.pings, {})).toBe(0);
    expect(await t.query(api.lab.lastPing, {})).toBeNull();

    await (await professor(t)).mutation(api.lab.ping, {});
    expect(await t.query(api.lab.pings, {})).toBe(1);
    expect(await t.query(api.lab.lastPing, {})).toBe(at(2026, 11, 5, 21, 30));
    vi.setSystemTime(at(2026, 11, 5, 21, 31));
    await admin(t).mutation(api.lab.ping, {});
    expect(await t.query(api.lab.pings, {})).toBe(2);
    expect(await t.query(api.lab.lastPing, {})).toBe(at(2026, 11, 5, 21, 31));

    vi.setSystemTime(at(2026, 11, 5, 21, 32));
    for (const who of notProfessors(t)) expect(await refusal(who.mutation(api.lab.ping, {}))).toBe("Only professors can do that.");
    expect(await refusal(t.mutation(api.lab.ping, {}))).toBe("Sign in first.");
    expect(await t.query(api.lab.pings, {})).toBe(2);
    expect(await t.query(api.lab.lastPing, {})).toBe(at(2026, 11, 5, 21, 31));
  });

  it("F45.2 aiPing answers a professor with Gemini's reply, or 'The AI isn't set up on this server.' without GEMINI_API_KEY; a typed or Google student and a scanner get 'Only professors can do that.' and signed out gets 'Sign in first.'; all as ConvexErrors, and no refused call reaches Gemini", async () => {
    profEnv();
    const fetchMock = gemini();
    const t = setup();
    await grant(t, SCANNER_EMAIL, "scanner");
    for (const who of notProfessors(t)) expect(await refusal(who.action(api.lab.aiPing, {}))).toBe("Only professors can do that.");
    expect(await refusal(t.action(api.lab.aiPing, {}))).toBe("Sign in first.");
    expect(fetchMock).not.toHaveBeenCalled();

    const prof = await professor(t);
    expect(await prof.action(api.lab.aiPing, {})).toBe(REPLY);
    expect(await admin(t).action(api.lab.aiPing, {})).toBe(REPLY);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // The detail goes to console.error (convex/ai.ts); the page shows the line.
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("GEMINI_API_KEY", undefined);
    expect(await refusal(prof.action(api.lab.aiPing, {}))).toBe("The AI isn't set up on this server.");
    expect(logged).toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("core-backend-17 with 600 pings, lastPing moves when a new ping lands, and pings still counts 500 for #/lab tabs opened before lastPing", async () => {
    profEnv();
    vi.useFakeTimers({ toFake: ["Date"] });
    const start = at(2026, 11, 5, 20, 0);
    vi.setSystemTime(start + 600_000);
    const t = setup();
    await t.run(async (ctx) => {
      for (let i = 0; i < 600; i++) await ctx.db.insert("pings", { user: "sample", at: start + i * 1000 });
    });
    expect(await t.query(api.lab.pings, {})).toBe(500);
    expect(await t.query(api.lab.lastPing, {})).toBe(start + 599_000);

    vi.setSystemTime(at(2026, 11, 5, 21, 30));
    await (await professor(t)).mutation(api.lab.ping, {});
    expect(await t.query(api.lab.lastPing, {})).toBe(at(2026, 11, 5, 21, 30));
    expect(await t.query(api.lab.pings, {})).toBe(500);
  });
});

describe("F39.3 ping and aiPing are for professors and admins", () => {
  it("F39.3 authMatrix(ping): refused signed out, as a Google student, an unverified admin, a typed admin on prod, an unpaired or paired iPad and a scanner; allowed as a test professor on a dev backend, a Google professor and an admin", async () => {
    await authMatrix(HOST_ONLY, (as) => as.mutation(api.lab.ping, {}));
  });

  it("F39.3 authMatrix(aiPing), fetch stubbed: the same rows, and only the three allowed rows send a request to Gemini", async () => {
    const fetchMock = gemini();
    await authMatrix(HOST_ONLY, (as) => as.action(api.lab.aiPing, {}));
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
