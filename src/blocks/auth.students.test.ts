// @vitest-environment node
// Student screens signed out show one way to sign in (ROLES-UI-risk-2). Google and the typed form
// give the same email two identities (tokenIdentifier is issuer|subject), so a student who checks in
// one way and signs back in the other way is a new student to the server: "Check in first." on the
// quiz, a second pass, a second attendance row. Until prod stops taking typed sign-ins, student
// screens show only the typed form; staff screens keep Google's button with the typed form under it.
// Rendered inside the real AuthProvider (Convex's provider swapped for a pass-through, as in
// auth.test.ts), so the real sign-in components render.
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ConvexReactClient } from "convex/react";
import { describe, expect, it, vi } from "vitest";
import { AuthProvider } from "./auth";
import { Student } from "../teams/checkin/Student";
import Questions from "../teams/live/Questions";

vi.mock("convex/react", () => ({
  ConvexProviderWithAuth: ({ children }: { children: ReactNode }) => children,
  ConvexReactClient: class {},
  useQuery: () => undefined,
  useMutation: () => async () => null,
}));

function signedOut(child: () => ReactNode) {
  vi.stubGlobal("localStorage", { getItem: () => null, setItem() {}, removeItem() {} });
  return renderToStaticMarkup(createElement(AuthProvider, { client: {} as ConvexReactClient, children: createElement(child) }));
}

// The box Google's script draws its button into, before the script has loaded.
const GOOGLE_BOX = '<div aria-busy="true" style="min-height:44px"></div>';

describe("student screens signed out (ROLES-UI-risk-2)", () => {
  const screens: [string, () => ReactNode][] = [
    ["#/checkin/student", Student],
    ["#/live questions", () => createElement(Questions, { index: 0 })],
  ];
  for (const [name, screen] of screens)
    it(`ROLES-UI-risk-2 ${name} shows the typed sign-in only, with no Google button`, () => {
      const html = signedOut(screen);
      expect(html).not.toContain(GOOGLE_BOX);
      expect(html.match(/<form/g)).toHaveLength(1);
      expect(html).toContain('aria-label="Your email"');
      expect(html).not.toMatch(/Or type your name/);
    });
});
