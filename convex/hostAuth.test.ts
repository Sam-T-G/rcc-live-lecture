// The role gate on convex/host/: its professor functions are deployed and public until UZ deletes
// the folder, and some return private data (qa.list: private questions with names; board.students:
// the roster) or spend Gemini credit (ai.*). Each one gets an authMatrix test here, so an edit that
// drops a guard fails the gate. Delete this file with convex/host/.
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { HOST_ONLY, type T, authMatrix, slide } from "./test.helpers";

const CH = "gdg";

// A Gemini reply with this text, the way the REST API sends one.
const said = (text: string) =>
  new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

// The AI set up, with fetch answering `text` for every Gemini call. Returns the fetch stub.
function gemini(text: string) {
  vi.stubEnv("GEMINI_API_KEY", "test-gemini-key");
  vi.stubEnv("GEMINI_MODEL_FAST", "test-fast");
  const fetchMock = vi.fn(async () => said(text));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

// An open quiz question on slide 0, with one wrong answer from a sample student.
async function quizQuestion(t: T): Promise<Id<"quizQuestions">> {
  return await t.run(async (ctx) => {
    const questionId = await ctx.db.insert("quizQuestions", {
      channel: CH,
      index: 0,
      text: "Which one is a vowel?",
      choices: ["A", "B"],
      correct: 0,
      status: "open",
      points: 10,
      openedAt: Date.now(),
    });
    await ctx.db.insert("answers", { questionId, user: "student-1", name: "Sample student 1", choice: 1, correct: false, points: 0, at: Date.now() });
    return questionId;
  });
}

// A public question from a sample student.
async function studentQuestion(t: T): Promise<Id<"studentQuestions">> {
  return await t.run(
    async (ctx) =>
      await ctx.db.insert("studentQuestions", {
        channel: CH,
        index: 0,
        user: "student-1",
        name: "Sample student 1",
        text: "What is a vowel?",
        visibility: "public",
        status: "new",
        shared: false,
        at: Date.now(),
      }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ROLES convex/host/ professor functions refuse everyone but professors and admins", () => {
  it("ROLES authMatrix for host.board.teams", async () => {
    await authMatrix(HOST_ONLY, (as) => as.query(api.host.board.teams, { channel: CH }));
  });

  it("ROLES authMatrix for host.board.students", async () => {
    await authMatrix(HOST_ONLY, (as) => as.query(api.host.board.students, { channel: CH }));
  });

  it("ROLES authMatrix for host.board.missing", async () => {
    await authMatrix(HOST_ONLY, (as) => as.query(api.host.board.missing, { channel: CH }));
  });

  it("ROLES authMatrix for host.points.adjust", async () => {
    await authMatrix(HOST_ONLY, (as) =>
      as.mutation(api.host.points.adjust, { channel: CH, user: "student-1", name: "Sample student 1", delta: -1 }),
    );
  });

  it("ROLES authMatrix for host.points.endDay", async () => {
    await authMatrix(HOST_ONLY, (as) => as.mutation(api.host.points.endDay, { channel: CH }));
  });

  it("ROLES authMatrix for host.teams.reshuffle", async () => {
    await authMatrix(HOST_ONLY, (as) => as.mutation(api.host.teams.reshuffle, { channel: CH }));
  });

  it("ROLES authMatrix for host.questions.open", async () => {
    await authMatrix(HOST_ONLY, (as) =>
      as.mutation(api.host.questions.open, { channel: CH, index: 0, text: "Which one is a vowel?", choices: ["A", "B"], correct: 0 }),
    );
  });

  it("ROLES authMatrix for host.questions.close", async () => {
    await authMatrix(HOST_ONLY, async (as, t) => {
      const questionId = await quizQuestion(t);
      await as.mutation(api.host.questions.close, { questionId });
    });
  });

  it("ROLES authMatrix for host.questions.forHost", async () => {
    await authMatrix(HOST_ONLY, (as) => as.query(api.host.questions.forHost, { channel: CH }));
  });

  it("ROLES authMatrix for host.qa.list (private questions and names)", async () => {
    await authMatrix(HOST_ONLY, (as) => as.query(api.host.qa.list, { channel: CH }));
  });

  it("ROLES authMatrix for host.qa.setStatus", async () => {
    await authMatrix(HOST_ONLY, async (as, t) => {
      const id = await studentQuestion(t);
      await as.mutation(api.host.qa.setStatus, { id, status: "keep" });
    });
  });

  it("ROLES authMatrix for host.qa.answer", async () => {
    await authMatrix(HOST_ONLY, async (as, t) => {
      const id = await studentQuestion(t);
      await as.mutation(api.host.qa.answer, { id, text: "A, E, I, O and U." });
    });
  });

  it("ROLES authMatrix for host.qa.share", async () => {
    await authMatrix(HOST_ONLY, async (as, t) => {
      const id = await studentQuestion(t);
      await as.mutation(api.host.qa.share, { id, shared: true });
    });
  });
});

// The AI actions: a refused caller never reaches Gemini, so only the 3 allowed rows call fetch.
describe("ROLES convex/host/ AI actions spend Gemini credit only for professors and admins", () => {
  it("ROLES authMatrix for host.ai.draftQuestion", async () => {
    const fetchMock = gemini(JSON.stringify({ text: "Which one is a vowel?", choices: ["A", "B", "C", "D"], correct: 0 }));
    await authMatrix(HOST_ONLY, async (as, t) => {
      await slide(t, CH, 0, { title: "Vowels", lines: ["A, E, I, O and U are vowels."] });
      await as.action(api.host.ai.draftQuestion, { channel: CH });
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("ROLES authMatrix for host.ai.feedback", async () => {
    const fetchMock = gemini("Most of the room picked B. Go over vowels again.");
    await authMatrix(HOST_ONLY, async (as, t) => {
      await quizQuestion(t);
      await as.action(api.host.ai.feedback, { channel: CH });
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("ROLES authMatrix for host.ai.organize", async () => {
    const fetchMock = gemini(JSON.stringify({ items: [{ n: 0, topic: "Vowels", cluster: "What a vowel is" }] }));
    await authMatrix(HOST_ONLY, async (as, t) => {
      await studentQuestion(t);
      await as.action(api.host.ai.organize, { channel: CH });
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
