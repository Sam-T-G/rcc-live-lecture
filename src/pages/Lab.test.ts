// @vitest-environment node
// #/lab (Lab.tsx and LabVision.tsx): the sign-in panel's words, who gets Ping and Ask the AI, the
// newest ping's time, and errors as Status errors (role="alert"). There is no browser DOM here,
// so, as in src/teams/checkin/pairing.test.ts, the server's answers are fixed by function name,
// the sign-in, QR and vision blocks are swapped for stand-ins, and React's state hooks for a small
// stand-in that keeps each hook's value between renders. A test renders with renderToStaticMarkup,
// presses a button by calling its onClick, then renders again to see what the press changed.
// People are samples (@example.edu).
import { createElement, isValidElement, type ComponentType, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { getFunctionName, type FunctionReference } from "convex/server";
import { ConvexError } from "convex/values";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Lab, { Ai, Sync } from "./Lab";
import Vision from "./LabVision";

const hooks = vi.hoisted(() => ({ slots: [] as unknown[], at: 0 }));
vi.mock("react", async (orig) => {
  const R = await orig<typeof import("react")>();
  function slot<T>(make: () => T): T {
    const i = hooks.at++;
    if (!(i in hooks.slots)) hooks.slots[i] = make();
    return hooks.slots[i] as T;
  }
  return {
    ...R,
    useState: (init: unknown) => {
      const i = hooks.at;
      const value = slot(() => (typeof init === "function" ? (init as () => unknown)() : init));
      const set = (next: unknown) => {
        hooks.slots[i] = typeof next === "function" ? (next as (v: unknown) => unknown)(hooks.slots[i]) : next;
      };
      return [value, set];
    },
    useRef: (init: unknown) => slot(() => ({ current: init })),
    useCallback: (fn: unknown) => fn,
    useEffect: () => {},
  };
});

// The server: each query's answer by function name, every query a render asked for, and the
// two calls the lab's buttons make.
const results: Record<string, unknown> = {};
const asked: string[] = [];
const ping = vi.fn<() => Promise<null>>(async () => null);
const aiPing = vi.fn<() => Promise<string>>(async () => "the AI block works.");
vi.mock("convex/react", () => ({
  useConvexAuth: () => ({ isLoading: false, isAuthenticated: true }),
  useQuery: (ref: FunctionReference<"query">, args?: unknown) => {
    if (args === "skip") return undefined;
    asked.push(getFunctionName(ref));
    return results[getFunctionName(ref)];
  },
  useMutation: () => ping,
  useAction: () => aiPing,
}));

// The browser's sign-in, as the sign-in block reports it.
const signedIn: { user: { name: string; email: string } | null } = { user: null };
vi.mock("../blocks/auth", () => ({
  SignInButton: () => "[Google button, typed sign-in under it]",
  GoogleButton: () => "[Google button]",
  SignedInAs: () => null,
  useGoogleUser: () => ({ user: signedIn.user, signOut: () => {} }),
}));
vi.mock("../blocks/qr", () => ({ QR: ({ value }: { value: string }) => `[QR code for ${value}]` }));

// The vision block: no MediaPipe in these tests. The camera reports `cameraError`, and loading a
// model runs `load`.
const vision = vi.hoisted(() => ({ cameraError: null as string | null, load: async (): Promise<unknown> => ({}) }));
vi.mock("../blocks/vision", () => ({
  VISION: { gestures: { what: "hand gestures" }, hands: { what: "21 points per hand" } },
  drawSeen: () => {},
  loadVision: () => vision.load(),
  useCamera: () => ({ video: { current: null }, on: false, error: vision.cameraError, start: async () => {}, stop: () => {} }),
  useVisionLoop: () => {},
}));

type Role = "admin" | "professor" | "scanner";
const staff = (email: string, role: Role | null) => ({ email, role, canHoldRole: true });
const whoami = (name: string, email: string, role: Role | null) => ({ name, email, isHost: role === "professor" || role === "admin", role });
const signIn = (name: string, email: string, role: Role | null) => {
  signedIn.user = { name, email };
  results["lab:whoami"] = whoami(name, email, role);
  results["staff:me"] = staff(email, role);
};

// React writes ' as &#x27; and " as &quot;. Tests compare plain words.
const plain = (html: string) => html.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
// Renders a component from fresh state (`fresh`) or from the state the last press left.
function render(component: ComponentType, fresh = false) {
  if (fresh) hooks.slots = [];
  hooks.at = 0;
  return plain(renderToStaticMarkup(createElement(component)));
}
const page = () => render(Lab, true);
// The words on every <button> in the markup.
const buttons = (html: string) => [...html.matchAll(/<button\b[^>]*>(.*?)<\/button>/g)].map((m) => m[1].replace(/<[^>]+>/g, "").trim());
// The words of every Status error (role="alert") in the markup.
const alerts = (html: string) => [...html.matchAll(/<p class="status status--error" role="alert">(.*?)<\/p>/g)].map((m) => m[1]);

type El = ReactElement<{ children?: ReactNode; onClick?: () => unknown }>;
function elements(node: ReactNode, out: El[] = []): El[] {
  if (Array.isArray(node)) node.forEach((n) => elements(n, out));
  else if (isValidElement(node)) {
    out.push(node as El);
    elements((node as El).props.children, out);
  }
  return out;
}
// Calls the component the way a render would, then presses its button that says `label`.
async function press(component: () => ReactNode, label: string) {
  hooks.at = 0;
  const button = elements(component()).find((e) => e.props.children === label && e.props.onClick);
  expect(button, `a button that says "${label}"`).toBeDefined();
  await button!.props.onClick!();
}

const PING_LINE = "Only professors and admins can press Ping, since each press saves a row on the server.";
const AI_LINE = "Only professors and admins can ask the AI, since each question uses the app's Gemini key.";
const SIGN_IN_LINE = "Sign in with the Google account your admin added.";

beforeEach(() => {
  for (const k of Object.keys(results)) delete results[k];
  asked.length = 0;
  signedIn.user = null;
  results["staff:me"] = null;
  results["lab:whoami"] = null;
  results["lab:lastPing"] = null;
  results["deck:current"] = null;
  hooks.slots = [];
  ping.mockClear();
  aiPing.mockClear();
  vision.cameraError = null;
  vision.load = async () => ({});
  vi.stubGlobal("location", { origin: "http://localhost:5173", pathname: "/" });
});

describe("#/lab", () => {
  it("blocks-frontend-21 the first panel is 'Sign in' (Google's button with the typed form under it), and no line says 'Each panel tests one building block.'", () => {
    const html = page();
    expect(html).toContain("<h1>Lab</h1>");
    expect(html).toContain("<h2>Sign in</h2>");
    expect(html.indexOf("<h2>Sign in</h2>")).toBeLessThan(html.indexOf("<h2>Live sync</h2>"));
    expect(html).toContain("[Google button, typed sign-in under it]");
    expect(html).not.toContain("Google sign-in");
    expect(html).not.toContain("Each panel tests one building block.");
  });

  it("F45.1 signed in, the sign-in panel says the role the server gives: 'The server says you're a student.' for a typed sign-in, and a scanner, a professor or an admin for staff", () => {
    signIn("Sample student 1", "student1@example.edu", null);
    expect(page()).toContain("Signed in as <b>Sample student 1</b>. The server says you're a student.");
    signIn("Sample scanner", "door@example.edu", "scanner");
    expect(page()).toContain("The server says you're a scanner.");
    signIn("Sample professor", "prof@example.edu", "professor");
    expect(page()).toContain("The server says you're a professor.");
    signIn("Sample admin", "admin@example.edu", "admin");
    expect(page()).toContain("The server says you're an admin.");
    expect(page()).not.toContain("you're a host");
    results["lab:whoami"] = null;
    expect(page()).toContain("The server didn't accept the sign-in.");
  });

  it("F45.2 Ping and Ask the AI are buttons only for professors and admins; signed out, a student and a scanner see who may use them instead, and signed out also which account to sign in with", () => {
    let html = page();
    expect(html).toContain(`${PING_LINE} ${SIGN_IN_LINE}`);
    expect(html).toContain(`${AI_LINE} ${SIGN_IN_LINE}`);
    expect(buttons(html)).not.toContain("Ping");
    expect(buttons(html)).not.toContain("Ask the AI");

    for (const [name, email, role] of [
      ["Sample student 1", "student1@example.edu", null],
      ["Sample scanner", "door@example.edu", "scanner"],
    ] as const) {
      signIn(name, email, role);
      html = page();
      expect(html).toContain(`<p>${PING_LINE}</p>`);
      expect(html).toContain(`<p>${AI_LINE}</p>`);
      expect(buttons(html)).not.toContain("Ping");
      expect(buttons(html)).not.toContain("Ask the AI");
    }

    for (const [name, email, role] of [
      ["Sample professor", "prof@example.edu", "professor"],
      ["Sample admin", "admin@example.edu", "admin"],
    ] as const) {
      signIn(name, email, role);
      html = page();
      expect(buttons(html)).toEqual(expect.arrayContaining(["Ping", "Ask the AI"]));
      expect(html).toContain("Open #/lab on two devices and press Ping on one. The time changes on both.");
      expect(html).not.toContain(PING_LINE);
      expect(html).not.toContain(AI_LINE);
    }
  });

  it("core-backend-17 the live sync panel shows the newest ping's time from lab.lastPing, to the second, and 'No pings yet.' before the first; it never reads lab.pings, which stops counting at 500", () => {
    expect(page()).toContain(`<p class="status status--empty" role="status">No pings yet.</p>`);
    const T = Date.UTC(2026, 10, 5, 21, 30, 5);
    results["lab:lastPing"] = T;
    const time = new Date(T).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" });
    expect(page()).toContain(`Last ping at <b>${time}</b>.`);
    expect(asked).toContain("lab:lastPing");
    expect(asked).not.toContain("lab:pings");
  });

  it("F45.2 a refused Ping shows the server's words as a Status error (role=alert), and a Ping that works clears them", async () => {
    signIn("Sample professor", "prof@example.edu", "professor");
    render(Sync, true);
    ping.mockRejectedValueOnce(new ConvexError("Only professors can do that."));
    await press(Sync, "Ping");
    expect(alerts(render(Sync))).toEqual(["Only professors can do that."]);

    await press(Sync, "Ping");
    expect(ping).toHaveBeenCalledTimes(2);
    expect(alerts(render(Sync))).toEqual([]);
  });

  it("F45.2 Ask the AI shows Gemini's answer, and a failed call shows the server's words as a Status error (role=alert) in its place", async () => {
    signIn("Sample professor", "prof@example.edu", "professor");
    render(Ai, true);
    await press(Ai, "Ask the AI");
    let html = render(Ai);
    expect(html).toContain("Gemini answered: <b>the AI block works.</b>");
    expect(alerts(html)).toEqual([]);

    aiPing.mockRejectedValueOnce(new ConvexError("The AI is busy. Try again in a minute."));
    await press(Ai, "Ask the AI");
    html = render(Ai);
    expect(alerts(html)).toEqual(["The AI is busy. Try again in a minute."]);
    expect(html).not.toContain("Gemini answered");
  });

  it("blocks-frontend-21 the vision panel shows a blocked camera and a model that didn't load as Status errors (role=alert)", async () => {
    vision.cameraError = "Camera blocked. Allow it in the browser's address bar.";
    expect(alerts(render(Vision, true))).toEqual(["Camera blocked. Allow it in the browser's address bar."]);

    vision.cameraError = null;
    vision.load = async () => {
      throw new Error("offline");
    };
    render(Vision, true);
    await press(Vision, "Use the camera");
    const html = render(Vision);
    expect(alerts(html)).toEqual(["The model didn't load. Check the connection."]);
    expect(html).not.toContain("Loading the model");
  });
});
