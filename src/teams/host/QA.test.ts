// @vitest-environment node
// #/host Questions (QA.tsx), rendered to HTML with made-up live.questions.forHost rows (no
// backend): what each question shows, its buttons, the Shared with students card, and the empty
// tab.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { getFunctionName, type FunctionReference } from "convex/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import QA from "./QA";

const state = vi.hoisted(() => ({ items: undefined as unknown, asked: [] as string[] }));
vi.mock("convex/react", () => ({
  useQuery: (ref: FunctionReference<"query">) => {
    state.asked.push(getFunctionName(ref));
    return state.items;
  },
  useMutation: () => async () => null,
  useAction: () => async () => 0,
}));

const item = (o: Record<string, unknown> = {}) => ({
  _id: "q1",
  index: 3,
  text: "What does O(n) mean?",
  name: null,
  private: false,
  votes: 1,
  at: Date.UTC(2026, 10, 5, 21, 40),
  topic: null,
  cluster: null,
  status: "new",
  answer: null,
  shared: false,
  ...o,
});

beforeEach(() => {
  state.items = [
    item(),
    item({ _id: "q2", index: 1, text: "Is this on the exam?", name: "Sample student 2", votes: 4, private: true, answer: "Yes, questions 1 to 3." }),
    item({ _id: "q3", index: 0, text: "Where are the slides posted?", name: "Sample student 3", votes: 0, answer: "On the class site.", shared: true, status: "keep" }),
  ];
  state.asked.length = 0;
});

const tab = () => renderToStaticMarkup(createElement(QA));
// The markup of one question, from its text to the next question (or the end of its list).
function question(html: string, text: string) {
  const start = html.indexOf(`<p class="qa-q__text">${text}</p>`);
  expect(start, text).toBeGreaterThan(-1);
  const next = html.indexOf('<li class="qa-q', start);
  return html.slice(start, next === -1 ? html.indexOf("</ul>", start) : next);
}
// The words on each button in a question, in order.
const buttons = (part: string) => [...part.matchAll(/<button[^>]*><span class="btn__label">([^<]*)<\/span>/g)].map((m) => m[1]);

describe("#/host Questions", () => {
  it("F30.1 the tab reads Live's questions for this class (live.questions.forHost)", () => {
    tab();
    expect(state.asked).toEqual(["live/questions:forHost"]);
  });

  it("F30.1 each question shows its slide, upvotes, and the name or 'Anonymous'; private ones are marked 'Private'", () => {
    const html = tab();
    const first = question(html, "What does O(n) mean?");
    expect(first).toContain(">Slide 4<");
    expect(first).toContain("<span>1 upvote</span>");
    expect(first).toContain("<span>Anonymous</span>");
    expect(first).not.toContain("Private");
    const second = question(html, "Is this on the exam?");
    expect(second).toContain(">Slide 2<");
    expect(second).toContain("<span>4 upvotes</span>");
    expect(second).toContain("<span>Sample student 2</span>");
    expect(second).toContain('<span class="badge badge--warn">Private</span>');
  });

  it("F30.6 every question has a Delete button", () => {
    const html = tab();
    for (const text of ["What does O(n) mean?", "Is this on the exam?", "Where are the slides posted?"])
      expect(buttons(question(html, text))).toContain("Delete");
  });

  it("F30.3/F30.4 an answer shows with 'Share the answer' (a shared one 'Stop sharing'); a question without one offers 'Type answer' and no share", () => {
    const html = tab();
    expect(buttons(question(html, "What does O(n) mean?"))).toEqual(["Keep", "Type answer", "Dismiss", "Delete"]);
    const second = question(html, "Is this on the exam?");
    expect(second).toContain("<strong>Your answer:</strong> Yes, questions 1 to 3.");
    expect(buttons(second)).toEqual(["Keep", "Edit answer", "Share the answer", "Dismiss", "Delete"]);
    const third = question(html, "Where are the slides posted?");
    expect(third).toContain(">Shared with students<");
    expect(buttons(third)).toEqual(["Edit answer", "Stop sharing", "Dismiss", "Delete"]);
  });

  it("F30.4 the Shared with students card lists each shared answer under its question", () => {
    const html = tab();
    const card = html.slice(html.indexOf("<h2>Shared with students</h2>"));
    expect(card).toContain('<p class="qa-shared__q">Where are the slides posted?</p><p class="qa-shared__a">On the class site.</p>');
    expect(card).not.toContain("Is this on the exam?");
  });

  it("host-backend-14 no 'Record answer' button and no 'Voice answers and textbook' card", () => {
    const html = tab();
    expect(html).not.toContain("Record answer");
    expect(html).not.toContain("Voice answers");
    expect(html).not.toContain("textbook");
  });

  it("a dismissed question keeps its words and offers 'Bring back' and Delete", () => {
    state.items = [item({ status: "dismissed" })];
    const html = tab();
    expect(buttons(question(html, "What does O(n) mean?"))).toEqual(["Bring back", "Delete"]);
    expect(html).toContain('<li class="qa-q qa-q--dismissed">');
    expect(html).toContain(">Dismissed<");
  });

  it("with no questions yet, the tab says so and where they come from", () => {
    state.items = [];
    const html = tab();
    expect(html).toContain("No questions yet.");
    expect(html).toContain("Students ask from the Live slides page on their phones.");
    expect(html).toContain("No answers shared yet.");
  });
});
