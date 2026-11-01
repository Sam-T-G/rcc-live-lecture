// @vitest-environment node
// SignInButton, StudentSignIn, GoogleButton and SignedInAs (auth.tsx), rendered inside the real
// AuthProvider. AuthProvider reads the saved sign-in from localStorage when it first renders;
// Convex's own provider is swapped for one that only renders its children, so nothing connects to
// a backend. Effects don't run here, so Google's script never loads and its button's box stays
// empty. `npm run dev` builds have import.meta.env.DEV true, as tests do; a test stubs it false for
// a live build (`npm run build`).
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ConvexReactClient } from "convex/react";
import { describe, expect, it, vi } from "vitest";
import { AuthProvider, GoogleButton, SignedInAs, SignInButton, StudentSignIn } from "./auth";

vi.mock("convex/react", () => ({
  ConvexProviderWithAuth: ({ children }: { children: ReactNode }) => children,
  ConvexReactClient: class {},
  useConvexAuth: () => ({ isLoading: true, isAuthenticated: false }),
}));

function render(saved: { name: string; email: string } | null, child: () => ReactNode = SignedInAs) {
  const stored = saved && { token: "header.payload.signature", exp: Date.now() + 3_600_000, picture: "", ...saved };
  vi.stubGlobal("localStorage", { getItem: () => (stored ? JSON.stringify(stored) : null), setItem() {}, removeItem() {} });
  return renderToStaticMarkup(createElement(AuthProvider, { client: {} as ConvexReactClient, children: createElement(child) }));
}

// The box Google's script draws its button into, before the script has loaded.
const GOOGLE_BOX = '<div aria-busy="true" style="min-height:44px"></div>';

describe("D1 sign-in: Google's button everywhere, the typed test sign-in in dev builds alone", () => {
  for (const [name, part] of [["SignInButton", SignInButton], ["StudentSignIn", StudentSignIn]] as const) {
    it(`D1 a live build's ${name} is Google's button with no typed form`, () => {
      vi.stubEnv("DEV", false);
      const html = render(null, part);
      expect(html).toBe(`<div><div>${GOOGLE_BOX}</div></div>`);
      expect(html).not.toContain("<form");
    });

    it(`D1 a dev build's ${name} has the typed form under Google's button, headed 'Test sign-in (dev only)'`, () => {
      const html = render(null, part);
      expect(html).toContain(GOOGLE_BOX);
      expect(html.indexOf(GOOGLE_BOX)).toBeLessThan(html.indexOf("<form"));
      expect(html).toContain("<strong style=\"width:100%\">Test sign-in (dev only)</strong>");
      expect(html).toContain('aria-label="Your name"');
      expect(html).toContain('aria-label="Your email"');
    });
  }

  it("ROLES GoogleButton alone is the Google box with no typed sign-in", () => {
    const html = render(null, GoogleButton);
    expect(html).toBe(`<div>${GOOGLE_BOX}</div>`);
  });
});

describe("SignedInAs", () => {
  it("shows 'Signed in as <name> (<email>)' and a 'Not you? Sign out' button", () => {
    const html = render({ name: "Jane Doe", email: "jane@example.edu" });
    expect(html).toContain("Signed in as Jane Doe (jane@example.edu)");
    expect(html).toContain('<button type="button" class="btn btn--quiet">Not you? Sign out</button>');
  });

  it("shows the email once when the name is the email", () => {
    const html = render({ name: "jane@example.edu", email: "jane@example.edu" });
    expect(html).toContain("Signed in as jane@example.edu</span>");
  });

  it("renders nothing when signed out", () => {
    expect(render(null)).toBe("");
  });
});
