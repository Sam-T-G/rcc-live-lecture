// @vitest-environment node
// Student (Student.tsx) signed out: the line above the sign-in matches it. StudentSignIn is the
// typed form for now and becomes Google's button later, so the line doesn't say to type (ROLES-UI-risk-5).
// Signed in with Google, the page says when the sign-in ends for its last 5 minutes (sweep1-ledger-1).
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Student } from "./Student";

const who = vi.hoisted(() => ({ user: null as null | { name: string; email: string }, endsAt: null as number | null }));
vi.mock("convex/react", () => ({ useQuery: () => undefined, useMutation: () => async () => null }));
vi.mock("../../blocks/auth", () => ({
  StudentSignIn: () => "[sign-in]",
  SignedInAs: () => null,
  GoogleButton: () => "[Google button]",
  useGoogleUser: () => ({ user: who.user, endsAt: who.endsAt, signOut: () => {} }),
}));

beforeEach(() => {
  who.user = null;
  who.endsAt = null;
});

describe("Student signed out", () => {
  it("ROLES-UI-risk-5 says to sign in, not to type a name and email, above the sign-in", () => {
    const html = renderToStaticMarkup(createElement(Student));
    expect(html).toContain("<p>Sign in to get your pass.</p>[sign-in]");
    expect(html).not.toMatch(/type your name/i);
  });
});

describe("Student signed in", () => {
  it("sweep1-ledger-1 in a Google sign-in's last 5 minutes, the pass page says when it ends with Google's button", () => {
    who.user = { name: "Sample student 1", email: "student1@example.edu" };
    expect(renderToStaticMarkup(createElement(Student))).not.toContain("Your sign-in ends at");
    who.endsAt = Date.UTC(2026, 10, 5, 22, 29);
    const time = new Date(who.endsAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    const html = renderToStaticMarkup(createElement(Student)).replace(/&#x27;/g, "'");
    expect(html).toContain(`Your sign-in ends at ${time}.`);
    expect(html).toContain("Sign in with Google again before then, or this page signs you out.");
    expect(html).toContain("[Google button]");
  });
});
