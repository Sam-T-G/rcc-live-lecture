// @vitest-environment node
// Student screens signed out (D1). On the live site students sign in with Google, the same as
// staff, so a student is one identity wherever they sign in: a Google and a typed sign-in with the
// same email are two people to the server (tokenIdentifier is issuer|subject), with two passes and
// two attendance rows (ROLES-UI-risk-2). The typed form shows only in `npm run dev` builds, under
// Google's button, and prod refuses typed tokens (convex/auth.config.ts). Rendered inside the real
// AuthProvider (Convex's provider swapped for a pass-through, as in auth.test.ts), so the real
// sign-in components render; a test stubs import.meta.env.DEV false for a live build.
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
  useConvexAuth: () => ({ isLoading: true, isAuthenticated: false }),
  useQuery: () => undefined,
  useMutation: () => async () => null,
}));

function signedOut(child: () => ReactNode) {
  vi.stubGlobal("localStorage", { getItem: () => null, setItem() {}, removeItem() {} });
  return renderToStaticMarkup(createElement(AuthProvider, { client: {} as ConvexReactClient, children: createElement(child) }));
}

// The box Google's script draws its button into, before the script has loaded.
const GOOGLE_BOX = '<div aria-busy="true" style="min-height:44px"></div>';

describe("D1 student screens signed out", () => {
  const screens: [string, () => ReactNode][] = [
    ["#/checkin/student", Student],
    ["#/live questions", () => createElement(Questions, { index: 0 })],
  ];
  for (const [name, screen] of screens) {
    it(`D1 ${name} on the live site shows Google's button and no typed form`, () => {
      vi.stubEnv("DEV", false);
      const html = signedOut(screen);
      expect(html).toContain(GOOGLE_BOX);
      expect(html).not.toContain("<form");
      expect(html).not.toContain('aria-label="Your email"');
    });

    it(`D1 ${name} in a dev build shows Google's button with the typed test sign-in under it`, () => {
      const html = signedOut(screen);
      expect(html).toContain(GOOGLE_BOX);
      expect(html.match(/<form/g)).toHaveLength(1);
      expect(html.indexOf(GOOGLE_BOX)).toBeLessThan(html.indexOf("Test sign-in (dev only)"));
      expect(html).toContain('aria-label="Your email"');
    });
  }
});
