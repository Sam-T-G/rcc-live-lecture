// @vitest-environment node
// The hint under "Your answer" in #/host Questions (QA.tsx) says what Save does for this question:
// an answer that's already shared reaches every phone as soon as it's saved (convex/live/questions.ts
// answer() keeps shared), a private question's answer stays with the professor because it can't be
// shared (Sam's decision D12 e; share() refuses it), and any other answer stays with the professor
// until they share it. Rendered to HTML with the editor open.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Question } from "./QA";

vi.mock("convex/react", () => ({ useQuery: () => undefined, useMutation: () => async () => null, useAction: () => async () => 0 }));

const item = (o: Record<string, unknown> = {}) => ({
  _id: "q1",
  index: 0,
  text: "Does it update live?",
  name: null,
  private: false,
  votes: 0,
  at: Date.UTC(2026, 10, 5, 21, 40),
  topic: null,
  cluster: null,
  status: "keep",
  answer: "It updates live.",
  shared: false,
  ...o,
});

// The editor, open, for one question.
const editor = (o: Record<string, unknown>) =>
  renderToStaticMarkup(createElement(Question, { q: item(o) as never, open: true }));

describe("#/host Questions answer hint", () => {
  it("an answer not shared yet: students see it only after you share it", () => {
    const html = editor({});
    expect(html).toContain("Students see it only after you share it.");
    expect(html).toContain(">It updates live.</textarea>");
  });

  it("an answer already shared: saving sends the change to every phone, and the hint says so", () => {
    const html = editor({ shared: true });
    expect(html).toContain("Students see your changes as soon as you save.");
    expect(html).not.toContain("only after you share it");
  });

  it("D12 e a private question: only the professor sees the answer, and it can't be shared", () => {
    for (const shared of [false, true]) {
      const html = editor({ private: true, shared });
      expect(html).toContain("Only you see this answer. A private question’s answer can’t be shared.");
      expect(html).not.toContain("only after you share it");
      expect(html).not.toContain("Students see your changes");
      expect(html).not.toContain(">Shared with");
    }
  });
});
