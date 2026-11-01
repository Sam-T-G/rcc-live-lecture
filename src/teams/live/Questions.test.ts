// @vitest-environment node
// The Questions card on #/live (Questions.tsx), rendered to HTML with a signed-in student and
// made-up list rows (no backend): the form before and after the slides start, the empty list, the
// private box and tag, and the professor's shared answer.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { getFunctionName, type FunctionReference } from "convex/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Questions from "./Questions";

const state = vi.hoisted(() => ({
  rows: undefined as unknown,
  user: null as unknown,
  asked: [] as [string, unknown][], // the queries the card ran, with their args
}));
vi.mock("convex/react", () => ({
  useQuery: (ref: FunctionReference<"query">, args: unknown) => {
    if (args === "skip") return undefined;
    state.asked.push([getFunctionName(ref), args]);
    return state.rows;
  },
  useMutation: () => async () => null,
}));
vi.mock("../../blocks/auth", () => ({ useGoogleUser: () => ({ user: state.user }), StudentSignIn: () => "[sign in]" }));

const row = (o: Record<string, unknown> = {}) => ({
  _id: "q1",
  index: 3,
  text: "What does O(n) mean?",
  name: null,
  votes: 2,
  at: Date.UTC(2026, 10, 5, 21, 40),
  mine: false,
  voted: false,
  private: false,
  answer: null,
  ...o,
});

beforeEach(() => {
  state.rows = [row()];
  state.user = { name: "Sample student 1", email: "student1@example.edu" };
  state.asked.length = 0;
});

const card = (index: number | null) => renderToStaticMarkup(createElement(Questions, { index }));

describe("#/live Questions card", () => {
  it("live-frontend-20 before the deck sends a slide, the form is hidden, 'You can ask once the slides start.' shows, and 'This slide' lists nothing", () => {
    const html = card(null);
    expect(html).toContain("You can ask once the slides start.");
    expect(html).not.toContain("<form");
    expect(html).not.toContain("What does O(n) mean?");
    expect(html).toContain("No questions yet.");
    expect(state.asked).toEqual([]); // no list query for a slide that doesn't exist yet
  });

  it("live-frontend-20 once the deck sends a slide, the form shows and 'This slide' asks for that slide's questions", () => {
    const html = card(3);
    expect(html).toContain("<form");
    expect(html).not.toContain("You can ask once the slides start.");
    expect(state.asked).toEqual([["live/questions:list", { channel: "gdg", index: 3 }]]);
    expect(html).toContain("What does O(n) mean?");
  });

  it("live-frontend-24 an empty list says 'No questions yet.' and nothing more", () => {
    state.rows = [];
    const html = card(3);
    expect(html).toContain(">No questions yet.<");
    expect(html).not.toContain("Be the first");
  });

  it("F30.5 the form has an 'Only the professor sees it' box, and your own private question shows a 'Private' tag", () => {
    state.rows = [row({ mine: true, private: true, text: "Slide 4 lost me" }), row({ _id: "q2", text: "Can you zoom in?" })];
    const html = card(3);
    expect(html).toMatch(/<label><input type="checkbox"\/>Only the professor sees it<\/label>/);
    // The AI note shows only once the box is ticked (Questions.ask.test.ts).
    expect(html).not.toContain("Gemini");
    expect(html.match(/>Private</g)).toHaveLength(1);
    const own = html.slice(html.indexOf("Slide 4 lost me"), html.indexOf("Can you zoom in?"));
    expect(own).not.toBe("");
    expect(own).toContain('<span class="badge badge--neutral">Private</span>');
  });

  it("F30.4 a shared answer shows under its question as 'Professor's answer: ...'; a question without one has no answer line", () => {
    state.rows = [row({ answer: "It means the time grows with the input." }), row({ _id: "q2", text: "Can you zoom in?" })];
    const html = card(3);
    expect(html).toContain("<strong>Professor&#x27;s answer:</strong> It means the time grows with the input.");
    expect(html.match(/Professor&#x27;s answer/g)).toHaveLength(1);
  });

  it("signed out, the card shows the sign-in and no post form", () => {
    state.user = null;
    const html = card(3);
    expect(html).toContain("Sign in to post and upvote.");
    expect(html).toContain("[sign in]");
    expect(html).not.toContain("<form");
    // sweep2-live-2: the sign-in sits in its own box, which "Sign in to tap I'm lost" scrolls to.
    expect(html).toContain('<div id="live-signin"><p class="muted">Sign in to post and upvote.</p>[sign in]</div>');
  });
});
