// The screen lab's contract: one scenario is one screen state, rendered by the real app from
// fixture data. Each area's scenarios live in scenarios/<area>.ts as `export const scenarios`.
import { getFunctionName, type FunctionArgs, type FunctionReference, type FunctionReturnType } from "convex/server";
import { ConvexError } from "convex/values";

export const AREAS = ["phone", "host", "staff", "projector", "kiosk"] as const;
export type Area = (typeof AREAS)[number];

// Who is looking at the screen (lib/roles.ts seeds each one):
//   signedout  no sign-in; staff.me is null
//   student    a Google sign-in with no staff role
//   professor  a Google sign-in on the staff list as a professor
//   admin      a Google sign-in on the staff list as an admin
//   door       a door iPad paired on #/admin (a device token, nobody signed in)
export const ROLES = ["signedout", "student", "professor", "admin", "door"] as const;
export type Role = (typeof ROLES)[number];

// A fixture is the value a query returns, or a function of the call's args that returns it (or
// throws, to show an error boundary on purpose). Mutations and actions with a fixture resolve to
// it; without one they resolve to null.
export type Fixture = unknown;
export type Fixtures = Record<string, Fixture>;

// Real keyboard input into one field, after the clicks. Name the field by its label (the kit
// Field's label, or an aria-label: "Code on their phone") or by a Playwright selector. `submit`
// presses Enter in the field when true, or clicks that selector ('button:has-text("Post")', for a
// textarea, where Enter starts a new line).
export type TypeStep = { text: string; label?: string; selector?: string; submit?: true | string };

export type Scenario = {
  // Starts with the area and a dash: "phone-pass-qr". Unique across the lab.
  id: string;
  area: Area;
  // The hash route without "#/": "checkin/student", "live/leaderboard", "host?tab=points".
  // "{origin}" becomes the lab's own origin (a local deck: "checkin/stage?deck={origin}/fake-deck.html").
  route: string;
  role: Role;
  // One line saying the state: "Pass showing a fresh QR".
  title: string;
  // A state that looks like a failure on purpose. "error": the page (or a part) shows its error
  // boundary, and shoot.mjs fails the scenario when it doesn't. "loading" and "empty" are notes
  // for reviewers. A blank page always fails.
  expect?: "error" | "loading" | "empty";
  // "module:function" (as getFunctionName gives it) to the value. Build entries with fx() so tsc
  // checks them against the real return types.
  fixtures: Fixtures;
  // Pins the clock: the page starts at this time and runs on from it. ISO with an offset,
  // "2026-11-05T10:14:00-08:00".
  now?: string;
  // Fixture changes after the page opens, for states that show only on a change (a late arrival
  // on the late banner). shoot.mjs waits for the last one before the screenshot.
  later?: { afterMs: number; fixtures: Fixtures }[];
  // The signed-in person, in place of the role's lab person (lib/roles.ts). name and email default
  // to the role's. endsInMin: the Google sign-in ends that many minutes after the page opens
  // (under 5 shows the sign-in ending banner, SH-09). emailVerified: false gives a Google token
  // whose email Google hasn't verified (SH-13); staff.me then can't hold a role.
  user?: { name?: string; email?: string; endsInMin?: number; emailVerified?: boolean };
  // Presses shoot.mjs makes after the page is ready, in order, as real pointer input: Playwright
  // selectors such as 'button:has-text("Start check-in")'. A browser opened by hand skips them.
  clicks?: string[];
  // Typing after the clicks, as real keystrokes. shoot.mjs checks the field kept the text and types
  // it again when the page drew the form anew (#/admin draws its forms once the staff check lands).
  type?: TypeStep[];
  // Scrolls this element (a Playwright selector) into view before the shot: centered when it fits
  // the viewport, else its top at the top.
  scrollTo?: string;
  // Shoots the whole page instead of one viewport.
  fullPage?: boolean;
  // Moves the pinned clock this many ms forward after the clicks and typing, then waits for the
  // page's next 1 s tick (the pass page's code turns old at 25 s). Timers the page already set
  // still fire on real time. Pins the clock to the real time first when `now` isn't set.
  tickMs?: number;
  // The camera: "fake" (default) gives a still gray frame; "denied" refuses like a blocked prompt.
  camera?: "fake" | "denied";
  // A pass in front of the camera: a stand-in BarcodeDetector reads this text off every frame
  // ("RCC-482913"). Without it the camera sees no code.
  qr?: string;
  // "failed": Google's sign-in script doesn't load (offline or blocked), so its button can't show
  // (SH-05).
  google?: "failed";
  // "refused": the server refuses the role's saved sign-in, so the app drops it and the sign-in
  // says "The server didn’t accept that sign-in." (SH-06). staff.me is null.
  signIn?: "refused";
  // Browser stand-ins for this scenario, run before the app mounts (after the lab's own): a
  // missing navigator.wakeLock, a camera that never finishes starting, a track that ends.
  setup?: (w: Window) => void;
};

type AnyRef = FunctionReference<"query" | "mutation" | "action">;

// One typed fixture: fx(api.checkin.pass.mine, { ... }) gives { "checkin/pass:mine": { ... } }.
// The value is checked against the function's real return type, so tsc catches drift.
export function fx<F extends AnyRef>(
  ref: F,
  value: FunctionReturnType<F> | ((args: FunctionArgs<F>) => FunctionReturnType<F>),
): Fixtures {
  return { [getFunctionName(ref)]: value };
}

// A query fixture that throws, for a scenario with expect: "error".
export function fails(message = "Lab: this query failed on purpose."): (args: unknown) => never {
  return () => {
    throw new Error(message);
  };
}

// A mutation or action that refuses the way the server does: ConvexError("words") reaches the page
// with the words in `data`, so the app's why() and errorText() show them.
export function refuses(words: string): (args: unknown) => never {
  return () => {
    throw new ConvexError(words);
  };
}

// The mark lib/convex-mock.tsx looks for on a hangs() fixture.
export const HANGS = Symbol.for("rcc-lab.hangs");

// A call that never answers: a query stays loading (with no "no fixture" warning, so the shot
// records the loading state on purpose), and a mutation or action never resolves, so its button
// stays busy (Sending, Drafting).
export function hangs(): (args: unknown) => never {
  const f = () => {
    throw new Error("Lab: hangs() is answered by the mock, never called.");
  };
  return Object.assign(f, { [HANGS]: true });
}

// ms since the epoch for an ISO time plus some minutes: at("2026-11-05T10:14:00-08:00", -3).
export function at(iso: string, plusMinutes = 0): number {
  return Date.parse(iso) + plusMinutes * 60_000;
}

// What main.tsx tells shoot.mjs through window.__lab: the scenario without its fixtures and setup.
export type ScenarioMeta = Pick<
  Scenario,
  "id" | "area" | "route" | "role" | "title" | "expect" | "now" | "clicks" | "type" | "scrollTo" | "fullPage" | "tickMs" | "camera" | "qr" | "google" | "signIn"
> & { settleMs: number };
export type LabStatus =
  | { ready: true; mode: "list"; scenarios: ScenarioMeta[]; errors: { area: string; message: string }[] }
  | { ready: true; mode: "scenario"; scenario: ScenarioMeta }
  | { ready: true; mode: "error"; message: string };

declare global {
  interface Window {
    __lab?: LabStatus;
    // Moves the pinned clock forward (tickMs).
    __labTick?: (ms: number) => void;
  }
}
