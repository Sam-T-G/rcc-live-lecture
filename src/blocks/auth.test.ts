// @vitest-environment node
// SignedInAs (auth.tsx), rendered inside the real AuthProvider. AuthProvider reads the saved
// sign-in from localStorage when it first renders; Convex's own provider is swapped for one that
// only renders its children, so nothing connects to a backend.
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ConvexReactClient } from "convex/react";
import { describe, expect, it, vi } from "vitest";
import { AuthProvider, SignedInAs } from "./auth";

vi.mock("convex/react", () => ({ ConvexProviderWithAuth: ({ children }: { children: ReactNode }) => children, ConvexReactClient: class {} }));

function render(saved: { name: string; email: string } | null) {
  const stored = saved && { token: "header.payload.signature", exp: Date.now() + 3_600_000, picture: "", ...saved };
  vi.stubGlobal("localStorage", { getItem: () => (stored ? JSON.stringify(stored) : null), setItem() {}, removeItem() {} });
  return renderToStaticMarkup(createElement(AuthProvider, { client: {} as ConvexReactClient, children: createElement(SignedInAs) }));
}

describe("SignedInAs", () => {
  it("shows 'Signed in as <name> (<email>)' and a 'Not you? Sign out' button", () => {
    const html = render({ name: "Jane Doe", email: "jane@example.edu" });
    expect(html).toContain("Signed in as Jane Doe (jane@example.edu)");
    expect(html).toContain('<button type="button" class="quiet">Not you? Sign out</button>');
  });

  it("shows the email once when the name is the email", () => {
    const html = render({ name: "jane@example.edu", email: "jane@example.edu" });
    expect(html).toContain("Signed in as jane@example.edu</span>");
  });

  it("renders nothing when signed out", () => {
    expect(render(null)).toBe("");
  });
});
