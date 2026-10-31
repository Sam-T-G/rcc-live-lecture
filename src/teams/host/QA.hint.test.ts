// @vitest-environment node
// The hint under "Your answer" in #/host Questions (QA.tsx) says what Save does for this question:
// an answer that's already shared reaches every phone as soon as it's saved (convex/live/questions.ts
// answer() keeps shared), a private question's shared answer reaches only the student who asked it
// (list() in convex/live/questions.ts gives a private row to its author alone), and any other answer
// stays with the professor until they share it. Rendered to HTML with the editor open.
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

  it("a private question not shared yet: only the professor sees the answer, and sharing reaches only the student who asked", () => {
    const html = editor({ private: true });
    expect(html).toContain("Only you see this answer until you share it. Then only the student who asked sees it.");
    expect(html).not.toContain("only after you share it");
    expect(html).not.toContain("so only you see this answer");
  });

  it("a private question already shared: saving reaches the student who asked, not every student", () => {
    const html = editor({ private: true, shared: true });
    expect(html).toContain("The student who asked sees your changes as soon as you save.");
    expect(html).not.toContain("Students see your changes");
    expect(html).toContain(">Shared with the student who asked<");
    expect(html).not.toContain(">Shared with students<");
  });
});
