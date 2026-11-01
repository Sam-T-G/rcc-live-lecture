// How each lab role looks to the app, found in the app's own code:
// - A sign-in is a Google ID token saved in localStorage under "rcc-live:google-id-token"
//   (src/blocks/auth.tsx). A live build keeps only a token whose issuer is Google, and staff
//   checks need email_verified (src/teams/checkin/prof.tsx). The lab's token is unsigned: the app
//   only decodes it, and no server ever sees it.
// - Staff roles come from the staff.me query: null signed out, else { email, role, canHoldRole }.
// - A door iPad is paired when its device token (localStorage "rcc-live:door-device", 64 hex
//   characters) gets { status: "paired" } from staff.deviceStatus.
import type { Fixtures, Scenario } from "./types";

const SIGN_IN = "rcc-live:google-id-token";
const DEVICE = "rcc-live:door-device";
const MIN = 60_000;
const DAY = 86_400_000;

// Lab people: made-up names on example.edu.
export const PEOPLE: Record<"student" | "professor" | "admin", { name: string; email: string }> = {
  student: { name: "Pip Example", email: "pip@example.edu" },
  professor: { name: "Quill Example", email: "quill@example.edu" },
  admin: { name: "Wren Example", email: "wren@example.edu" },
};

const DOOR_TOKEN = "1ab0".repeat(16);

type Who = Pick<Scenario, "role" | "user" | "signIn">;

// The signed-in person for a role with a sign-in, with the scenario's `user` on top; else null.
function person(s: Who) {
  if (s.role !== "student" && s.role !== "professor" && s.role !== "admin") return null;
  return { ...PEOPLE[s.role], ...s.user };
}

function b64url(s: string) {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// A token shaped like Google's, never signed. It ends 10 days after the lab's "now" unless the
// scenario says when (user.endsInMin): far enough that no sign-in warning shows, near enough that
// the app's timers stay under setTimeout's 24.8-day limit (a longer wait fires at once).
function fakeToken(p: { name: string; email: string }, exp: number, verified: boolean, now: number) {
  const payload = {
    iss: "https://accounts.google.com",
    aud: "lab",
    sub: "lab-" + p.email,
    email: p.email,
    email_verified: verified,
    name: p.name,
    picture: "",
    iat: Math.floor(now / 1000),
    exp: Math.floor(exp / 1000),
  };
  return `${b64url(JSON.stringify({ alg: "none", typ: "JWT" }))}.${b64url(JSON.stringify(payload))}.lab`;
}

// Clears this origin's storage, then saves what the role needs.
export function seedRole(s: Who, now: number) {
  try {
    localStorage.clear();
    sessionStorage.clear();
  } catch {
    /* storage off: nothing to clear */
  }
  const p = person(s);
  if (p) {
    const exp = now + (s.user?.endsInMin !== undefined ? s.user.endsInMin * MIN : 10 * DAY);
    const token = fakeToken(p, exp, s.user?.emailVerified !== false, now);
    localStorage.setItem(SIGN_IN, JSON.stringify({ token, exp, name: p.name, email: p.email, picture: "" }));
  }
  if (s.role === "door") localStorage.setItem(DEVICE, DOOR_TOKEN);
}

// The fixtures every scenario of the role starts with; the scenario's own fixtures win. The server
// gives a Google email Google hasn't verified no role, and sees nobody when it refused the sign-in.
export function roleFixtures(s: Who): Fixtures {
  const p = person(s);
  const verified = s.user?.emailVerified !== false;
  const me = p && s.signIn !== "refused" ? { email: p.email, role: s.role === "student" || !verified ? null : s.role, canHoldRole: verified } : null;
  const out: Fixtures = { "staff:me": me };
  if (s.role === "door") out["staff:deviceStatus"] = { status: "paired", label: "Door iPad (lab)" };
  return out;
}
