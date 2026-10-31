// @vitest-environment node
// prof.tsx, from the 2026-10-31 review of ROLES-UI: what a Google account with an unverified
// email is told, and who the door iPad's scanner opens for. Same stand-ins as prof.test.ts: the
// server's answers are fixed by function name and the sign-in block is swapped for markers, with
// the signed-in browser's token set per test. A server render runs no effects, so a test that
// checks one sets `effects.run` and useEffect then runs its function during the render.
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { getFunctionName, type FunctionReference } from "convex/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DoorGate, StaffGate } from "./prof";

const results: Record<string, unknown> = {};
const signedIn: { user: { token: string; email: string } | null; endsAt: number | null } = { user: null, endsAt: null };
const effects = vi.hoisted(() => ({ run: false }));
const signOut = vi.fn();
vi.mock("react", async (orig) => {
  const R = await orig<typeof import("react")>();
  return { ...R, useEffect: (fn: () => void) => void (effects.run && fn()) };
});
vi.mock("convex/react", () => ({
  useConvexAuth: () => ({ isLoading: false, isAuthenticated: false }),
  useQuery: (ref: FunctionReference<"query">, args: unknown) => (args === "skip" ? undefined : results[getFunctionName(ref)]),
  useMutation: () => async () => null,
}));
vi.mock("../../blocks/auth", () => ({
  SignInButton: () => "[Google button, typed sign-in under it]",
  GoogleButton: () => "[Google button]",
  SignedInAs: () => (signedIn.user ? `[Signed in as ${signedIn.user.email}, Not you? Sign out]` : null),
  useGoogleUser: () => ({ user: signedIn.user, endsAt: signedIn.endsAt, signOut }),
}));

const DEVICE = "rcc-live:door-device";
const TOKEN = "0123456789abcdef".repeat(4);
let store: Map<string, string>;

// An ID token with this payload (the signature isn't checked on the client).
const b64url = (s: string) => btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const jwt = (payload: object) => `${b64url('{"alg":"RS256"}')}.${b64url(JSON.stringify(payload))}.sig`;
const signIn = (payload: { iss: string; email: string; email_verified?: boolean }) => {
  signedIn.user = { token: jwt(payload), email: payload.email };
};

beforeEach(() => {
  for (const k of Object.keys(results)) delete results[k];
  signedIn.user = null;
  signedIn.endsAt = null;
  effects.run = false;
  signOut.mockClear();
  store = new Map();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
  });
});

const staff = (email: string, role: "admin" | "professor" | "scanner" | null, canHoldRole = true) => ({ email, role, canHoldRole });
const page = () => renderToStaticMarkup(createElement(StaffGate, { title: "Live quiz", children: "[the quiz page]" }));
const kiosk = () =>
  renderToStaticMarkup(createElement(DoorGate, { children: (device: string | undefined) => `[scanner, device ${device ?? "none"}]` as ReactNode }));
const words = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ");

describe("ROLES a Google account whose email Google hasn't verified", () => {
  for (const iss of ["https://accounts.google.com", "accounts.google.com"]) {
    it(`ROLES is told Google hasn't verified the email, not to sign in with Google again (iss ${iss})`, () => {
      signIn({ iss, email: "prof@example.edu", email_verified: false });
      results["staff:me"] = staff("prof@example.edu", null, false);
      const html = words(page());
      expect(html).toContain("Google hasn't verified prof@example.edu");
      expect(html).toContain("Sign out");
      expect(html).not.toContain("Sign out, then sign in with Google.");
      expect(html).not.toContain("isn't on the staff list");
      expect(html).not.toContain("[the quiz page]");
    });
  }

  it("ROLES a typed sign-in that can't hold a role still gets 'Sign out, then sign in with Google.'", () => {
    signIn({ iss: "https://test-login.rcc-live-lecture.local", email: "admin@example.edu" });
    results["staff:me"] = staff("admin@example.edu", null, false);
    const html = words(page());
    expect(html).toContain("Staff sign in with Google, so the app can check that admin@example.edu is yours. Sign out, then sign in with Google.");
    expect(html).not.toContain("hasn't verified");
  });
});

// ROLES-UI-fixcheck-2: in Safari and Firefox, Google's renewal needs a click on its One Tap card,
// so a professor page says when the sign-in ends and shows Google's button from 5 minutes before.
describe("ROLES-UI-fixcheck-2 a professor page says when the sign-in ends", () => {
  it("ROLES-UI-fixcheck-2 shows the end time and Google's button above the page while the sign-in is ending", () => {
    signIn({ iss: "https://accounts.google.com", email: "prof@example.edu", email_verified: true });
    signedIn.endsAt = Date.UTC(2026, 10, 5, 22, 41);
    results["staff:me"] = staff("prof@example.edu", "professor");
    const html = words(page());
    const time = new Date(signedIn.endsAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    expect(html).toContain(`Your sign-in ends at ${time}. Sign in with Google again before then to keep this page open.`);
    expect(html).toContain("[Google button]");
    expect(html.indexOf("[Google button]")).toBeLessThan(html.indexOf("[the quiz page]"));
  });

  it("ROLES-UI-fixcheck-2 shows nothing extra when the sign-in isn't ending", () => {
    signIn({ iss: "https://accounts.google.com", email: "prof@example.edu", email_verified: true });
    results["staff:me"] = staff("prof@example.edu", "admin");
    expect(page()).toBe("[the quiz page]");
  });
});

describe("ROLES the door iPad opens the scanner only for a paired iPad or a scanner sign-in", () => {
  it("ROLES signed out, the pairing screen offers sign-in to scanners only", () => {
    store.set(DEVICE, TOKEN);
    results["staff:me"] = null;
    results["staff:deviceStatus"] = { status: "waiting", code: "482913", expiresAt: Date.now() + 9 * 60_000 };
    const html = words(kiosk());
    expect(html).toContain("Scanners can sign in here instead of pairing.");
    expect(html).not.toMatch(/professors and admins can sign in here/i);
    expect(html).toContain("[Google button, typed sign-in under it]");
  });

  for (const role of ["professor", "admin"] as const) {
    it(`ROLES a ${role} signed in on the iPad gets the pairing screen with the code, how to pair it on #/admin, and Sign out`, () => {
      store.set(DEVICE, TOKEN);
      signIn({ iss: "https://accounts.google.com", email: "prof@example.edu", email_verified: true });
      results["staff:me"] = staff("prof@example.edu", role);
      results["staff:deviceStatus"] = { status: "waiting", code: "482913", expiresAt: Date.now() + 9 * 60_000 };
      const html = words(kiosk());
      expect(html).not.toContain("[scanner");
      expect(html).toContain("Pair this iPad");
      expect(html).toContain("482 913");
      expect(html).toContain("prof@example.edu");
      expect(html).toContain("#/admin");
      expect(html).toContain("Sign out");
    });
  }

  it("ROLES a scanner signed in on the iPad gets the scanner, with who is signed in and Sign out", () => {
    store.set(DEVICE, TOKEN);
    signIn({ iss: "https://accounts.google.com", email: "door@example.edu", email_verified: true });
    results["staff:me"] = staff("door@example.edu", "scanner");
    results["staff:deviceStatus"] = { status: "none" };
    const html = kiosk();
    expect(html).toContain("[scanner, device none]");
    expect(html).toContain("[Signed in as door@example.edu, Not you? Sign out]");
  });

  // ROLES-UI-fixcheck-1: an admin who approved the iPad's own code on it and went back to the
  // kiosk would otherwise stay signed in at the door, where Google's sign-in renewal can show
  // "Continue as admin@…" to anyone in line.
  for (const role of ["professor", "admin"] as const) {
    it(`ROLES-UI-fixcheck-1 a paired iPad with a ${role} still signed in signs them out and opens no scanner until they're gone`, () => {
      store.set(DEVICE, TOKEN);
      signIn({ iss: "https://accounts.google.com", email: "admin@example.edu", email_verified: true });
      results["staff:me"] = staff("admin@example.edu", role);
      results["staff:deviceStatus"] = { status: "paired", label: "A-210 door" };
      const html = words(kiosk());
      expect(html).not.toContain("[scanner");
      expect(html).toContain("Signing out admin@example.edu");
      expect(html).toContain("Sign out");
      expect(signOut).not.toHaveBeenCalled();
      effects.run = true;
      kiosk();
      expect(signOut).toHaveBeenCalledTimes(1);
    });
  }

  it("ROLES-UI-fixcheck-1 a paired iPad with a scanner or nobody signed in signs nobody out", () => {
    effects.run = true;
    store.set(DEVICE, TOKEN);
    results["staff:deviceStatus"] = { status: "paired", label: "A-210 door" };
    signIn({ iss: "https://accounts.google.com", email: "door@example.edu", email_verified: true });
    results["staff:me"] = staff("door@example.edu", "scanner");
    expect(kiosk()).toContain(`[scanner, device ${TOKEN}]`);
    signedIn.user = null;
    results["staff:me"] = null;
    expect(kiosk()).toBe(`[scanner, device ${TOKEN}]`);
    expect(signOut).not.toHaveBeenCalled();
  });

  it("ROLES a paired iPad with nobody signed in shows only the scanner", () => {
    store.set(DEVICE, TOKEN);
    results["staff:me"] = null;
    results["staff:deviceStatus"] = { status: "paired", label: "A-210 door" };
    expect(kiosk()).toBe(`[scanner, device ${TOKEN}]`);
  });
});
