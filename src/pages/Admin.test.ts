// @vitest-environment node
// #/admin (Admin.tsx) for each kind of visitor, rendered inside the real AuthProvider (so "Signed
// in as" reads the saved sign-in) with the server swapped for fixed answers by function name.
// People are samples (@example.edu).
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ConvexReactClient } from "convex/react";
import { getFunctionName, type FunctionReference } from "convex/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../blocks/auth";
import Admin from "./Admin";
import { pages } from "./index";

const results: Record<string, unknown> = {};
const asked: string[] = []; // every query a render ran ("skip" left out)
vi.mock("convex/react", async () => {
  const { createElement, Fragment } = await import("react");
  return {
    ConvexProviderWithAuth: ({ children }: { children: unknown }) => createElement(Fragment, null, children as never),
    ConvexReactClient: class {},
    useConvexAuth: () => ({ isLoading: false, isAuthenticated: true }),
    useQuery: (ref: FunctionReference<"query">, args: unknown) => {
      if (args === "skip") return undefined;
      asked.push(getFunctionName(ref));
      return results[getFunctionName(ref)];
    },
    useMutation: () => async () => null,
  };
});

const T = Date.UTC(2026, 9, 31, 21, 41);
const staff = (email: string, role: "admin" | "professor" | "scanner" | null) => ({ email, role, canHoldRole: true });

beforeEach(() => {
  for (const k of Object.keys(results)) delete results[k];
  asked.length = 0;
  Object.assign(results, {
    "staff:people": [
      { email: "admin@example.edu", role: "admin", addedBy: "Server settings", at: null, locked: true },
      { email: "prof@example.edu", role: "professor", addedBy: "admin@example.edu", at: T, locked: false },
      { email: "door@example.edu", role: "scanner", addedBy: "admin@example.edu", at: T, locked: false },
    ],
    "staff:devices": [{ _id: "d1", label: "A-210 door", pairedBy: "prof@example.edu", pairedAt: T, lastUsedAt: null }],
    "staff:changes": [
      { _id: "c2", at: T, by: "admin@example.edu", action: "role", email: "door@example.edu", role: "scanner", oldRole: "professor", label: null, text: "admin@example.edu changed door@example.edu from professor to scanner." },
      { _id: "c1", at: T, by: "admin@example.edu", action: "add", email: "door@example.edu", role: "professor", oldRole: null, label: null, text: "admin@example.edu added door@example.edu as professor." },
    ],
  });
});

// Opens #/admin with this sign-in saved in the browser and staff.me answering `me`.
function open(user: { name: string; email: string } | null, me: unknown) {
  results["staff:me"] = me;
  const saved = user && { token: "header.payload.signature", exp: Date.now() + 3_600_000, picture: "", ...user };
  vi.stubGlobal("localStorage", { getItem: () => (saved ? JSON.stringify(saved) : null), setItem() {}, removeItem() {} });
  return renderToStaticMarkup(createElement(AuthProvider, { client: {} as ConvexReactClient, children: createElement(Admin) }));
}
const words = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");
const headings = (html: string) => [...html.matchAll(/<h2>([^<]*)<\/h2>/g)].map((m) => m[1]);
// The table row that holds `email`.
const row = (html: string, email: string) =>
  html
    .split("<tr>")
    .map((r) => r.slice(0, r.indexOf("</tr>")))
    .find((r) => r.includes(`>${email}<`)) ?? "";

const ADMIN = { name: "Sample admin", email: "admin@example.edu" };

describe("ROLES #/admin as an admin", () => {
  it("ROLES shows Add someone, People, Pair a door iPad, Door iPads and Changes, under who is signed in", () => {
    const html = open(ADMIN, staff("admin@example.edu", "admin"));
    expect(html).toContain("<h1>Admin</h1>");
    expect(headings(html)).toEqual(["Add someone", "People", "Pair a door iPad", "Door iPads", "Changes"]);
    expect(words(html)).toContain("Signed in as Sample admin (admin@example.edu)");
  });

  it("ROLES People marks a permanent admin (ADMIN_EMAILS) Permanent, with no role picker and no Remove; everyone else has both", () => {
    const html = open(ADMIN, staff("admin@example.edu", "admin"));
    const locked = row(html, "admin@example.edu");
    expect(locked).toContain("Permanent");
    expect(locked).toContain(">Server settings<");
    expect(locked).not.toContain("<select");
    expect(locked).not.toContain("Remove");
    for (const [email, role] of [
      ["prof@example.edu", "professor"],
      ["door@example.edu", "scanner"],
    ]) {
      const r = row(html, email);
      expect(r).toContain(`<select aria-label="Role for ${email}">`);
      expect(r).toContain(`<option value="${role}" selected="">`);
      expect(r).toContain(">Remove<");
      expect(r).not.toContain("Permanent");
    }
    expect(words(html)).toContain("You can't change or remove a permanent admin here: they're set in the server settings (ADMIN_EMAILS).");
  });

  it("ROLES Add someone takes an email and a role: Professor, Scanner or Admin", () => {
    const html = open(ADMIN, staff("admin@example.edu", "admin"));
    const add = html.slice(html.indexOf("<h2>Add someone</h2>"), html.indexOf("<h2>People</h2>"));
    expect(add).toContain('type="email"');
    expect([...add.matchAll(/<span class="seg__label">([^<]*)<\/span>/g)].map((m) => m[1])).toEqual(["Professor", "Scanner", "Admin"]);
    expect(add).toContain(">Add<");
  });

  it("ROLES Door iPads lists each paired iPad with who paired it, its last scan and Unpair; Pair a door iPad takes the code and a name", () => {
    const html = open(ADMIN, staff("admin@example.edu", "admin"));
    const ipads = words(html.slice(html.indexOf("<h2>Door iPads</h2>"), html.indexOf("<h2>Changes</h2>")));
    expect(ipads).toContain("A-210 door");
    expect(ipads).toContain("Paired by prof@example.edu");
    expect(ipads).toContain("No scans yet.");
    expect(ipads).toContain("Unpair");
    const pair = words(html.slice(html.indexOf("<h2>Pair a door iPad</h2>"), html.indexOf("<h2>Door iPads</h2>")));
    expect(pair).toContain("Code on the iPad");
    expect(pair).toContain("Where the iPad is, like A-210 door.");
  });

  it("ROLES Changes lists each change as a sentence, newest first", () => {
    const html = words(open(ADMIN, staff("admin@example.edu", "admin")));
    const role = html.indexOf("admin@example.edu changed door@example.edu from professor to scanner.");
    const add = html.indexOf("admin@example.edu added door@example.edu as professor.");
    expect(role).toBeGreaterThan(-1);
    expect(add).toBeGreaterThan(role);
  });
});

describe("ROLES #/admin for everyone else", () => {
  it("ROLES a professor sees only Pair a door iPad and Door iPads, and 'Only admins can add people.'", () => {
    const html = open({ name: "Sample professor", email: "prof@example.edu" }, staff("prof@example.edu", "professor"));
    expect(headings(html)).toEqual(["Pair a door iPad", "Door iPads"]);
    expect(html).toContain("Only admins can add people.");
    expect(asked).not.toContain("staff:people");
    expect(asked).not.toContain("staff:changes");
  });

  it("ROLES a scanner or a student sees 'Admins only.' with the email they're signed in with, and none of the lists", () => {
    for (const role of ["scanner", null] as const) {
      asked.length = 0;
      const html = open({ name: "Sample student 1", email: "student1@example.edu" }, staff("student1@example.edu", role));
      expect(html).toContain("<p>Admins only.</p>");
      expect(words(html)).toContain("Signed in as Sample student 1 (student1@example.edu)");
      expect(headings(html)).toEqual([]);
      expect(asked).toEqual(["staff:me"]);
    }
  });

  it("ROLES signed out: 'Admins only.' and the Google sign-in", () => {
    const html = open(null, null);
    expect(html).toContain("<p>Admins only.</p>");
    expect(html).toContain("Sign in with the Google account your admin added.");
    expect(html).toContain('<div aria-busy="true" style="min-height:44px"></div>');
    expect(asked).toEqual(["staff:me"]);
  });

  it("ROLES #/admin is a page", () => {
    expect(pages.admin).toBeTypeOf("function");
  });
});

// ROLES-UI-fixcheck-2: Safari and Firefox need a click to renew a Google sign-in, so #/admin says
// when it ends, with Google's button, from 5 minutes before (a minute before the token runs out).
describe("ROLES-UI-fixcheck-2 #/admin says when a Google sign-in ends", () => {
  const b64url = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  function openGoogle(email: string, role: "admin" | "professor", minutesLeft: number) {
    results["staff:me"] = staff(email, role);
    const exp = Date.now() + minutesLeft * 60_000;
    const token = `${b64url({ alg: "RS256" })}.${b64url({ iss: "https://accounts.google.com", exp: Math.floor(exp / 1000), email })}.sig`;
    const saved = { token, exp, name: email, email, picture: "" };
    vi.stubGlobal("localStorage", { getItem: () => JSON.stringify(saved), setItem() {}, removeItem() {} });
    return { html: renderToStaticMarkup(createElement(AuthProvider, { client: {} as ConvexReactClient, children: createElement(Admin) })), endsAt: exp - 60_000 };
  }
  const time = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  for (const role of ["admin", "professor"] as const)
    it(`ROLES-UI-fixcheck-2 as ${role === "admin" ? "an admin" : "a professor"} with 3 minutes left: the end time and Google's button`, () => {
      const { html, endsAt } = openGoogle(`${role}@example.edu`, role, 3);
      expect(words(html)).toContain(`Your sign-in ends at ${time(endsAt)}. Sign in with Google again before then to keep this page open.`);
      expect(html).toContain('<div aria-busy="true" style="min-height:44px"></div>');
    });

  it("ROLES-UI-fixcheck-2 with 30 minutes left: no notice", () => {
    const { html } = openGoogle("admin@example.edu", "admin", 30);
    expect(html).not.toContain("Your sign-in ends at");
  });
});
