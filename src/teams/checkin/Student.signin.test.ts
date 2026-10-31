// @vitest-environment node
// Student (Student.tsx) signed out: the line above the sign-in matches it. StudentSignIn is the
// typed form for now and becomes Google's button later, so the line doesn't say to type (ROLES-UI-risk-5).
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Student } from "./Student";

vi.mock("convex/react", () => ({ useQuery: () => undefined, useMutation: () => async () => null }));
vi.mock("../../blocks/auth", () => ({ StudentSignIn: () => "[sign-in]", SignedInAs: () => null, useGoogleUser: () => ({ user: null }) }));

describe("Student signed out", () => {
  it("ROLES-UI-risk-5 says to sign in, not to type a name and email, above the sign-in", () => {
    const html = renderToStaticMarkup(createElement(Student));
    expect(html).toContain("<p>Sign in to get your pass.</p>[sign-in]");
    expect(html).not.toMatch(/type your name/i);
  });
});
