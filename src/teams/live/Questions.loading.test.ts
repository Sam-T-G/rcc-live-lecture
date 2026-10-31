// @vitest-environment node
// The Questions card on #/live (Questions.tsx) while the page still waits for the deck: Page.tsx
// passes index undefined until deck.current arrives. The card says "Loading questions…", shows no
// form, and runs no list query, so a mid-class reload never claims "the slides haven't started".
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { getFunctionName, type FunctionReference } from "convex/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Questions from "./Questions";

const state = vi.hoisted(() => ({ asked: [] as [string, unknown][] }));
vi.mock("convex/react", () => ({
  useQuery: (ref: FunctionReference<"query">, args: unknown) => {
    if (args === "skip") return undefined;
    state.asked.push([getFunctionName(ref), args]);
    return [{ _id: "q1", index: 3, text: "What does O(n) mean?", name: null, votes: 2, at: 0, mine: false, voted: false, private: false, answer: null }];
  },
  useMutation: () => async () => null,
}));
vi.mock("../../blocks/auth", () => ({ useGoogleUser: () => ({ user: { name: "Sample student 1" } }), StudentSignIn: () => "[sign in]" }));

beforeEach(() => {
  state.asked.length = 0;
});

describe("#/live Questions card while the slides load", () => {
  it("UC-risk-3 index undefined: 'Loading questions…', no form, no 'once the slides start', no query", () => {
    const html = renderToStaticMarkup(createElement(Questions, { index: undefined }));
    expect(html).toContain("Loading questions…");
    expect(html).not.toContain("<form");
    expect(html).not.toContain("You can ask once the slides start.");
    expect(html).not.toContain("No questions yet.");
    expect(state.asked).toEqual([]);
  });

});
