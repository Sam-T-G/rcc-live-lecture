// @vitest-environment node
// door.tsx: what "Checking this iPad…" draws while the sign-in and the iPad's pairing load. The
// server and the sign-in block are swapped for stand-ins (as in prof.test.ts), so the test checks
// only the markup. Effects don't run here (no browser).
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DoorGate } from "./door";

vi.mock("convex/react", () => ({
  useConvexAuth: () => ({ isLoading: true, isAuthenticated: false }),
  useQuery: () => undefined,
  useMutation: () => async () => null,
}));
vi.mock("../../blocks/auth", () => ({
  SignInButton: () => "[Google button]",
  GoogleButton: () => "[Google button]",
  SignedInAs: () => "[Signed in as]",
  useGoogleUser: () => ({ user: null, signOut: () => {} }),
}));

beforeEach(() => {
  const store = new Map<string, string>();
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
  };
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("sessionStorage", storage);
});

const checking = () => renderToStaticMarkup(createElement(DoorGate, { children: () => "[scanner]" as ReactNode }));
// What a reader sees: the markup without its tags (\s takes the no-break space too).
const words = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

describe("DS-KIOSK 'Checking this iPad…' (DoorGate while the sign-in and the pairing load)", () => {
  it("DS-KIOSK-risk-1 says only 'Check-in kiosk' and 'Checking this iPad…': no 'Code on your pass' field or 'Check in' button that can't be used", () => {
    const html = checking();
    expect(words(html)).toBe("Check-in kiosk Checking this iPad…");
    expect(html).not.toMatch(/<(input|button|label)\b/);
  });

  it("DS-KIOSK-risk-1 keeps the typed-code strip's slot, hidden from screen readers, so the scanner opens in place", () => {
    const html = checking();
    expect(html).toMatch(/<div class="door__strip codein kiosk__type kiosk__type--wait" aria-hidden="true">/);
  });
});
