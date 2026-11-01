// @vitest-environment node
// The agent and project docs match the code (F40, the 2026-10-31 docs sweep). Agents build from
// AGENTS.md, BLOCKS.md, docs/contracts.md and the TEAM.md sheets, so a stale example there turns
// into broken code: a channel nothing sends on, a key arg the coverage test refuses, a function
// that no longer exists. Each check below names the finding it guards.
//
// "Current" docs describe the app as it is and are checked for routes, functions and retired
// words. "History" docs (the 10-29 meeting and its handoffs) start with a "> **History." line
// and are only checked for what must never be in any doc: secrets printed, members' names.
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { pages } from "./pages/index";

const root = new URL("../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), "utf8");
const exists = (path: string) => existsSync(new URL(path, root));

const teams = ["checkin", "live", "host"];
const CURRENT = [
  "AGENTS.md",
  "BLOCKS.md",
  "README.md",
  "docs/contracts.md",
  "docs/direction.md",
  "docs/runbook.md",
  "src/teams/README.md",
  ...teams.map((t) => `src/teams/${t}/TEAM.md`),
  ...teams.map((t) => `convex/${t}/README.md`),
  ".claude/commands/next.md",
  ".claude/commands/freeze.md",
];
const HISTORY = ["docs/meeting-1029.md", "docs/handoff-live-slides.md", "docs/handoff-professor-view.md"];
const doc = (path: string) => (exists(path) ? read(path) : "");
const lines = (path: string) => doc(path).split("\n");

// Every route the app has: each page in src/pages/index.ts and the parts the team pages route.
const checkinParts = [...read("src/teams/checkin/Page.tsx").matchAll(/case "([^"]+)":/g)].map((m) => `checkin/${m[1]}`);
const liveParts = [...read("src/teams/live/Page.tsx").matchAll(/part === "([^"]+)"/g)].map((m) => `live/${m[1]}`);
const ROUTES = new Set([...Object.keys(pages).filter(Boolean), ...checkinParts, ...liveParts, "ui/projector", "ui/projector/dark"]);
// The routes Home lists, which every page map has to name (join is student by another name).
const HOME = [...ROUTES].filter((r) => r !== "checkin/join" && !r.startsWith("ui/"));

// A Convex function a doc names: `api.<module path>.<name>`, `internal.<...>.<name>` or the CLI's
// `<module path>:<name>`. Exists when convex/<module path>.ts exports it.
function convexExport(modulePath: string, name: string) {
  const file = `convex/${modulePath}.ts`;
  if (!exists(file)) return false;
  return new RegExp(`^export (const|async function|function) ${name}\\b`, "m").test(read(file));
}

describe("docs: files", () => {
  it("sweep1-docs-16 docs/runbook.md exists and README and AGENTS.md link it", () => {
    expect(exists("docs/runbook.md")).toBe(true);
    expect(read("README.md")).toContain("docs/runbook.md");
    expect(read("AGENTS.md")).toContain("docs/runbook.md");
  });

  it("sweep1-docs-7/1/11 the 10-29 meeting doc and both handoffs are marked as history", () => {
    for (const path of HISTORY) expect([path, lines(path).slice(0, 4).some((l) => l.startsWith("> **History"))]).toEqual([path, true]);
  });
});

describe("docs: what no doc may say", () => {
  it("sweep1-docs-5 no doc prints a secret: `convex env get` only inside \"$(...)\", never `env list`", () => {
    for (const path of [...CURRENT, ...HISTORY, "ios/README.md", "docs/design.md"])
      for (const l of lines(path)) {
        for (const m of l.matchAll(/convex env get/g)) expect([path, l, l.slice(Math.max(0, m.index - 7), m.index)]).toEqual([path, l, '"$(npx ']);
        expect([path, /convex env list/.test(l)]).toEqual([path, false]);
      }
  });

  it("sweep1-docs-1/11 no doc names a club member", () => {
    for (const path of [...CURRENT, ...HISTORY]) expect([path, doc(path).match(/\b(Josh|Dan)\b/)?.[0] ?? null]).toEqual([path, null]);
  });

  it("sweep1-blocks-6 no doc reads the channel gdg-10-29, which nothing sends on", () => {
    for (const path of [...CURRENT, ...HISTORY]) expect([path, doc(path).includes("gdg-10-29")]).toEqual([path, false]);
  });

  it("sweep1-docs-1/2 sweep1-access-3 current docs describe email roles: no professor key, the old key gate and hook, key arg or convex/host functions", () => {
    const retired = [/professor key/i, /\bProf[G]ate\b/, /\buse[P]rofKey\b/, /requireProf\(ctx, key\)/, /key: v\.optional/, /\bapi\.host\./, /host\/seed/, /What the Live team calls/];
    for (const path of CURRENT)
      for (const re of retired) expect([path, String(re), doc(path).match(re)?.[0] ?? null]).toEqual([path, String(re), null]);
  });

  it("sweep1-access-3 HOST_EMAILS and the old key env vars show up only to say they open nothing or are imported once", () => {
    for (const path of CURRENT)
      for (const l of lines(path))
        if (/HOST_EMAILS|PROFESSOR[_]KEY|KIOSK[_]KEY/.test(l)) expect([path, l, /open(s)? nothing|importHostEmails/.test(l)]).toEqual([path, l, true]);
  });

  it("sweep1-docs-12 a line that says to add a host to DEV_HOSTS names both files", () => {
    for (const path of CURRENT)
      for (const l of lines(path))
        if (/\badd\b.{0,160}DEV_HOSTS|DEV_HOSTS.{0,160}\badd\b/i.test(l))
          expect([path, l, l.includes("convex/auth.config.ts") && l.includes("convex/checkin/prof.ts")]).toEqual([path, l, true]);
  });
});

describe("docs: every route and function a current doc names exists", () => {
  it("sweep1-ledger-5 every #/route is a real route", () => {
    for (const path of [...CURRENT, "docs/design.md"])
      for (const m of doc(path).matchAll(/#\/([a-z]+(?:\/[a-z]+)*)/g)) expect([path, m[1], ROUTES.has(m[1])]).toEqual([path, m[1], true]);
  });

  it("sweep1-ledger-5 every api.*, internal.* and module:function is a real export", () => {
    for (const path of [...CURRENT, "ios/README.md"]) {
      const text = doc(path);
      for (const m of text.matchAll(/(?<![\w/.])(?:api|internal)\.(?!d\.ts\b)((?:[a-z]+\.)+)([a-zA-Z]+)/g))
        expect([path, m[0], convexExport(m[1].slice(0, -1).replace(/\./g, "/"), m[2])]).toEqual([path, m[0], true]);
      for (const m of text.matchAll(/`(?:npx convex run (?:--prod )?)?([a-z]+(?:\/[a-z]+)*):([a-zA-Z]+)[` ]/g))
        expect([path, m[0], convexExport(m[1], m[2])]).toEqual([path, m[0], true]);
    }
  });
});

describe("docs: AGENTS.md", () => {
  const agents = read("AGENTS.md");

  it("sweep1-docs-2 sweep1-access-3 the stack and Convex rules describe Google sign-in and requireProf(ctx), with no 'still stale' caveat", () => {
    expect(agents).not.toMatch(/still describe the professor key|Professors type|no page shows a Google button/);
    expect(agents).toContain("requireProf(ctx)");
    expect(agents).toContain("StaffGate");
  });

  it("sweep1-docs-12 routes, commands, ownership and the camera rule match the app", () => {
    for (const r of HOME) expect([r, agents.includes(`#/${r}`)]).toEqual([r, true]);
    for (const c of ["npm test", "npm run test:watch", "npm run lint", "npm run typecheck:convex"]) expect(agents).toContain(c);
    for (const p of ["`src/portal/`", "`ios/`", "`src/styles/`", "`src/pages/`", "`convex/staff.ts`", "`convex/lectures.ts`"]) expect(agents).toContain(p);
    expect(agents).not.toMatch(/How to work during a sprint|Google Doc|at the review break/);
    expect(agents).toMatch(/decoded QR/);
  });

  it("sweep1-blocks-7 sweep1-docs-9 the read-before-a-change list has docs/design.md", () => {
    expect(agents).toMatch(/Read before[^\n]*docs\/design\.md/);
  });
});

describe("docs: BLOCKS.md", () => {
  const blocks = read("BLOCKS.md");
  const section = (title: string) => blocks.split(/\n## /).find((s) => s.startsWith(title)) ?? "";

  it("sweep1-blocks-6 sweep1-docs-6 sweep1-core-4 the deck section reads CHANNEL, documents api.deck.slides and never reads deckChannels directly", () => {
    const deck = section("Deck bridge");
    expect(deck).toContain("useDeckSlide(CHANNEL)");
    expect(deck).toContain("api.deck.slides");
    expect(deck).not.toMatch(/query the `deckChannels` table/);
  });

  it("sweep1-core-4 a Classes section covers lectureWindow, ensureLecture, checkedIn, notOpenYet, the _creationTime range and .first()", () => {
    const classes = section("Classes");
    for (const w of ["lectureWindow", "ensureLecture", "checkedIn", "notOpenYet", '.gte("_creationTime", start)', ".first()"]) expect([w, classes.includes(w)]).toEqual([w, true]);
  });

  it("sweep1-blocks-7 sweep1-docs-9 Look points at tokens.css, kit.tsx, docs/design.md, #/ui, ErrorBoundary and Projector", () => {
    const look = section("Look");
    for (const w of ["src/styles/tokens.css", "src/blocks/kit.tsx", "docs/design.md", "#/ui", "ErrorBoundary", "Projector"]) expect([w, look.includes(w)]).toEqual([w, true]);
    expect(look).not.toMatch(/`src\/index\.css` has the tokens/);
    expect(look).not.toMatch(/wide for a kiosk or projector/);
  });

  it("sweep1-docs-18 a new route also gets a line in Home.tsx and Home.test.ts", () => {
    const routes = section("Pages and routes");
    expect(routes).toContain("src/pages/Home.tsx");
    expect(routes).toContain("Home.test.ts");
  });
});

describe("docs: contracts.md", () => {
  const contracts = read("docs/contracts.md");
  const tables = [...read("convex/schema.ts").matchAll(/^ {2}(\w+): defineTable/gm)].map((m) => m[1]);

  it("sweep1-docs-3 sweep1-ledger-5 lists every table in convex/schema.ts", () => {
    expect(tables.length).toBeGreaterThan(20);
    for (const t of tables) expect([t, contracts.includes(`\`${t}\``)]).toEqual([t, true]);
  });

  it("sweep1-docs-3 marks kiosks and checkins.meters unused and the five host tables retired", () => {
    const row = (t: string) => contracts.split("\n").find((l) => l.startsWith(`| \`${t}\``)) ?? "";
    expect(row("kiosks")).toMatch(/unused/i);
    expect(contracts).toMatch(/`checkins\.meters`[^\n]*unused/i);
    // The retired tables are the ones schema.ts defines after its "Retired 2026-10-30" comment.
    const schema = read("convex/schema.ts");
    const retired = [...schema.slice(schema.indexOf("// Retired 2026-10-30")).matchAll(/^ {2}(\w+): defineTable/gm)].map((m) => m[1]);
    expect(retired).toHaveLength(5);
    for (const t of retired) expect([t, row(t)]).toEqual([t, expect.stringMatching(/retired/i)]);
  });

  it("sweep1-docs-3 sweep1-ios-3 names the cross-module functions and shared code, with deck.slides and lateFeed for iOS", () => {
    for (const w of ["api.deck.slides", "api.checkin.attendance.lateFeed", "ensureGroup", "saveExtraCredit", "checkedIn", "requireProf", "StaffGate", "QuizCard", "LateBanner", "ios/scripts/test.sh", "src/portal/"])
      expect([w, contracts.includes(w)]).toEqual([w, true]);
  });

  it("sweep1-docs-3 states the real privacy rule and no location check", () => {
    expect(contracts).not.toMatch(/Names go to hosts only|phone in the room/);
    expect(contracts).toMatch(/first name/i);
  });
});

describe("docs: README, direction, runbook, commands, history", () => {
  it("sweep1-docs-13 sweep1-access-4 README has a page map, the iOS app, the Gemini model vars and test roles through devGrant", () => {
    const readme = read("README.md");
    for (const r of HOME) expect([r, readme.includes(`#/${r}`)]).toEqual([r, true]);
    for (const w of ["ios/", "GEMINI_MODEL_FAST", "GEMINI_MODEL_SMART", "staff:devGrant"]) expect([w, readme.includes(w)]).toEqual([w, true]);
    expect(readme).not.toMatch(/makes you an admin on your backend: the professor pages/);
  });

  it("sweep1-docs-15 direction.md describes what's built, with the pipeline walkthrough", () => {
    const direction = read("docs/direction.md");
    expect(direction).not.toMatch(/Nothing here is built|shares their location|`sessions`/);
    for (const w of ["POST /deck", "deckSlides", "lateFeed", "groupResults", "endDay"]) expect([w, direction.includes(w)]).toEqual([w, true]);
  });

  it("sweep1-docs-16 the runbook covers the stage link, the door iPad, the teacher page, End class and deploys", () => {
    const runbook = doc("docs/runbook.md");
    for (const w of ["#/checkin/stage?deck=", "bridge=", "#/checkin/kiosk", "#/checkin/teacher", "End class", "between classes"]) expect([w, runbook.includes(w)]).toEqual([w, true]);
  });

  it("sweep1-docs-4 /freeze and /next run after the meeting: stage by name with convex/_generated, no sprint wording, no 'For' check", () => {
    const freeze = read(".claude/commands/freeze.md");
    const next = read(".claude/commands/next.md");
    expect(freeze).toContain("convex/_generated/");
    expect(freeze).toContain("package-lock.json");
    expect(freeze).toContain("Co-Authored-By");
    for (const text of [freeze, next]) expect(text).not.toMatch(/demo|Ship what runs|beats a bigger|freeze time|sprint/i);
    expect(next).not.toMatch(/"For"/);
    expect(next).toContain("docs/design.md");
  });

  it("sweep1-docs-7 the 10-29 doc has no restore from insurance and no key printing", () => {
    expect(read("docs/meeting-1029.md")).not.toMatch(/insurance|env get/);
  });

  it("sweep1-docs-11 the Live slides handoff no longer lists built work as not done", () => {
    expect(read("docs/handoff-live-slides.md")).not.toMatch(/nothing writes to it|Anyone signed in can post|Final EC is not locked in|← Earlier|key\?/);
  });

  it("sweep1-ios-3 src/teams/README.md names src/portal and ios", () => {
    const teamsReadme = read("src/teams/README.md");
    expect(teamsReadme).toContain("src/portal/");
    expect(teamsReadme).toContain("ios/");
  });
});
