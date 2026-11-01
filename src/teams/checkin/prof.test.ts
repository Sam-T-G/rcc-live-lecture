// @vitest-environment node
// prof.tsx: StaffGate (every professor page), DoorGate and the pairing screen (#/checkin/kiosk),
// and the door iPad's device token. The server is swapped for fixed answers by function name and
// the sign-in block for stand-ins, so each test checks only what these parts draw. Effects don't
// run here (no browser), so the pairing screen's request for a code isn't sent.
import { readdirSync, readFileSync } from "node:fs";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { getFunctionName, type FunctionReference } from "convex/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DoorGate, StaffGate } from "./prof";

const results: Record<string, unknown> = {};
const asked: [string, unknown][] = []; // every query a render ran, with its args ("skip" left out)
const auth = { loading: false };
// The browser's sign-in, as useGoogleUser returns it (null: signed out).
const google = { user: null as null | { name: string; email: string } };
vi.mock("convex/react", () => ({
  useConvexAuth: () => ({ isLoading: auth.loading, isAuthenticated: false }),
  useQuery: (ref: FunctionReference<"query">, args: unknown) => {
    if (args === "skip") return undefined;
    asked.push([getFunctionName(ref), args]);
    return results[getFunctionName(ref)];
  },
  useMutation: () => async () => null,
}));
vi.mock("../../blocks/auth", () => ({
  SignInButton: () => "[Google button, typed sign-in under it]",
  GoogleButton: () => "[Google button]",
  SignedInAs: () => "[Signed in as, Not you? Sign out]",
  useGoogleUser: () => ({ user: google.user, signOut: () => {} }),
}));

const DEVICE = "rcc-live:door-device";
const TOKEN = "0123456789abcdef".repeat(4);
let store: Map<string, string>;

beforeEach(() => {
  for (const k of Object.keys(results)) delete results[k];
  asked.length = 0;
  auth.loading = false;
  google.user = null;
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
// What a reader sees: the markup without its tags.
const words = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");

describe("ROLES StaffGate on every professor page", () => {
  it("ROLES signed out: the Google sign-in button and 'Sign in with the Google account your admin added.'", () => {
    results["staff:me"] = null;
    const html = page();
    expect(html).toContain("<h1>Live quiz</h1>");
    expect(html).toContain("Sign in with the Google account your admin added.");
    expect(html).toContain("[Google button, typed sign-in under it]");
    expect(html).not.toContain("[the quiz page]");
  });

  it("ROLES signed in without the role: '{email} isn't on the staff list. Ask an admin to add you on #/admin.' and Sign out", () => {
    results["staff:me"] = staff("student1@example.edu", null);
    const html = words(page());
    expect(html).toContain("student1@example.edu isn't on the staff list. Ask an admin to add you on #/admin.");
    expect(html).toContain("Sign out");
    expect(html).not.toContain("[the quiz page]");
  });

  it("ROLES a professor and an admin get the page", () => {
    for (const role of ["professor", "admin"] as const) {
      results["staff:me"] = staff("prof@example.edu", role);
      expect(page()).toBe("[the quiz page]");
    }
  });

  // sweep2-host-1: a professor page on a shared lectern PC has to say who is signed in and offer
  // Sign out, or the next person at the PC opens it as that professor.
  it("sweep2-host-1 a professor page says who is signed in and has Sign out, above the page", () => {
    for (const role of ["professor", "admin"] as const) {
      results["staff:me"] = staff("prof@example.edu", role);
      google.user = { name: "Sample professor", email: "prof@example.edu" };
      const html = page();
      expect(html, role).toContain("[Signed in as, Not you? Sign out]");
      expect(html.indexOf("[Signed in as"), role).toBeLessThan(html.indexOf("[the quiz page]"));
    }
  });

  it("ROLES a scanner gets no professor page, and is told the role scans passes at the door", () => {
    results["staff:me"] = staff("door@example.edu", "scanner");
    const html = words(page());
    expect(html).not.toContain("[the quiz page]");
    expect(html).toContain("door@example.edu is on the staff list as a scanner, so you can scan passes at the door but can't open this page.");
    expect(html).toContain("Sign out");
  });

  it("ROLES a typed sign-in that can't hold a role (prod) is told to sign out and sign in with Google, not 'isn't on the staff list'", () => {
    results["staff:me"] = staff("admin@example.edu", null, false);
    const html = words(page());
    expect(html).toContain("Staff sign in with Google, so the app can check that admin@example.edu is yours. Sign out, then sign in with Google.");
    expect(html).toContain("Sign out");
    // No sign-in on top of the live one: Convex would keep sending the typed token until a reload.
    expect(html).not.toContain("[Google button");
    expect(html).not.toContain("isn't on the staff list");
    expect(html).not.toContain("[the quiz page]");
  });

  it("ROLES asks staff.me with no key, and only once Convex has the sign-in ('Checking who is signed in…' until then)", () => {
    auth.loading = true;
    results["staff:me"] = staff("prof@example.edu", "professor");
    const html = page();
    expect(html).toContain("Checking who is signed in…");
    expect(html).not.toContain("[the quiz page]");
    expect(asked).toEqual([]);
    auth.loading = false;
    expect(page()).toBe("[the quiz page]");
    expect(asked).toEqual([["staff:me", {}]]);
  });
});

describe("ROLES DoorGate and the pairing screen on #/checkin/kiosk", () => {
  it("ROLES without a staff sign-in the door iPad shows 'Pair this iPad' and its 6-digit code big", () => {
    store.set(DEVICE, TOKEN);
    results["staff:me"] = null;
    results["staff:deviceStatus"] = { status: "waiting", code: "482913", expiresAt: Date.now() + 9 * 60_000 };
    const html = kiosk();
    expect(html).toContain("<h1>Pair this iPad</h1>");
    expect(html).toContain('<span class="big__value">482 913</span>');
    expect(words(html)).toContain("A professor or admin types this code on #/admin, under Pair a door iPad.");
    expect(words(html)).toContain("The code works until");
    expect(html).not.toContain("[scanner");
    // No Google button at the door: scanners sign in on their own phone (prof.access.test.ts,
    // sweep1-checkin-1).
    expect(html).not.toContain("[Google button");
    expect(asked).toContainEqual(["staff:deviceStatus", { token: TOKEN }]);
  });

  it("sweep2-access-1 an 8-digit code (every 6-digit one held by open requests) shows as two groups of 4", () => {
    store.set(DEVICE, TOKEN);
    results["staff:me"] = null;
    results["staff:deviceStatus"] = { status: "waiting", code: "48291305", expiresAt: Date.now() + 9 * 60_000 };
    expect(kiosk()).toContain('<span class="big__value">4829 1305</span>');
  });

  it("ROLES a paired iPad opens the scanner, which scans with the iPad's device token", () => {
    store.set(DEVICE, TOKEN);
    results["staff:me"] = null;
    results["staff:deviceStatus"] = { status: "paired", label: "A-210 door" };
    expect(kiosk()).toBe(`[scanner, device ${TOKEN}]`);
  });

  it("ROLES a scanner who signs in on the iPad gets the scanner without pairing; a professor or admin gets the pairing screen", () => {
    store.set(DEVICE, TOKEN);
    results["staff:deviceStatus"] = { status: "none" };
    results["staff:me"] = staff("door@example.edu", "scanner");
    expect(kiosk()).toBe("[scanner, device none]");
    for (const role of ["professor", "admin"] as const) {
      results["staff:me"] = staff("prof@example.edu", role);
      const html = kiosk();
      expect(html).toContain("<h1>Pair this iPad</h1>");
      expect(html).not.toContain("[scanner");
    }
  });

  it("ROLES unpaired (the status query says none) the iPad is back on the pairing screen, getting a code", () => {
    store.set(DEVICE, TOKEN);
    results["staff:me"] = null;
    results["staff:deviceStatus"] = { status: "none" };
    const html = kiosk();
    expect(html).toContain("<h1>Pair this iPad</h1>");
    expect(html).toContain("Getting a code…");
    expect(html).not.toContain("[scanner");
  });

  // sweep2-checkin-check-1: the first paint comes before the server's clock answers (effects don't
  // run here), and this iPad's clock may be fast, so a code past it shows "Getting a code…", not
  // "The code expired.". pairing.test.ts checks "The code expired." once the clock answers.
  it("ROLES a code past its expiry hides the code; before the server's clock answers it says 'Getting a code…', not 'The code expired.'", () => {
    store.set(DEVICE, TOKEN);
    results["staff:me"] = null;
    results["staff:deviceStatus"] = { status: "waiting", code: "482913", expiresAt: Date.now() - 1000 };
    const html = kiosk();
    expect(html).toContain("Getting a code…");
    expect(html).not.toContain("The code expired.");
    expect(html).not.toContain("Get a new code");
    expect(html).not.toContain("482 913");
  });

  it("ROLES a student signed in on the kiosk sees the pairing screen and that their email isn't on the staff list", () => {
    store.set(DEVICE, TOKEN);
    results["staff:me"] = staff("student1@example.edu", null);
    results["staff:deviceStatus"] = { status: "waiting", code: "482913", expiresAt: Date.now() + 60_000 };
    const html = words(kiosk());
    expect(html).toContain("Pair this iPad");
    expect(html).toContain("student1@example.edu isn't on the staff list.");
  });
});

describe("ROLES the door iPad's device token", () => {
  // prof.tsx keeps the token in memory too (for a browser with localStorage off), so each test
  // loads a fresh copy of it.
  async function fresh() {
    vi.resetModules();
    return await import("./prof");
  }

  it("ROLES the token is 32 bytes from crypto.getRandomValues as 64 lower-case hex characters, kept in localStorage", async () => {
    const prof = await fresh();
    const fill = vi.spyOn(crypto, "getRandomValues").mockImplementation(<T extends ArrayBufferView | null>(a: T) => {
      const bytes = a as unknown as Uint8Array;
      bytes.forEach((_, i) => (bytes[i] = i * 8));
      return a;
    });
    expect(prof.readDeviceToken()).toBeUndefined();
    const token = prof.newDeviceToken();
    expect(fill).toHaveBeenCalledOnce();
    expect((fill.mock.calls[0][0] as Uint8Array).length).toBe(32);
    expect(token).toBe(Array.from({ length: 32 }, (_, i) => (i * 8).toString(16).padStart(2, "0")).join(""));
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(store.get(DEVICE)).toBe(token);
    expect(prof.readDeviceToken()).toBe(token);
    fill.mockRestore();
  });

  it("ROLES two iPads get different tokens, and a saved value that isn't a device token is ignored", async () => {
    const prof = await fresh();
    store.set(DEVICE, "not-a-token");
    expect(prof.readDeviceToken()).toBeUndefined();
    const first = prof.newDeviceToken();
    store.clear();
    expect(prof.newDeviceToken()).not.toBe(first);
  });

  it("ROLES with localStorage off the token lasts in memory until a reload", async () => {
    const prof = await fresh();
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("off");
      },
      setItem: () => {
        throw new Error("off");
      },
    });
    const token = prof.newDeviceToken();
    expect(prof.readDeviceToken()).toBe(token);
  });
});

describe("ROLES no key left on the client", () => {
  it("ROLES no file in src/ has ProfGate, useProfKey, setProfKey, the saved professor key, PROFESSOR_KEY or KIOSK_KEY", () => {
    const SRC = new URL("../../", import.meta.url);
    const files = readdirSync(SRC, { recursive: true, encoding: "utf8" }).filter(
      (f) => /\.(ts|tsx)$/.test(f) && !f.endsWith("prof.test.ts"),
    );
    expect(files.length).toBeGreaterThan(30);
    const found = files.flatMap((f) => {
      const src = readFileSync(new URL(f, SRC), "utf8");
      return ["ProfGate", "useProfKey", "setProfKey", "rcc-live:prof-key", "PROFESSOR_KEY", "KIOSK_KEY"].filter((w) => src.includes(w)).map((w) => `${f}: ${w}`);
    });
    expect(found).toEqual([]);
  });
});
