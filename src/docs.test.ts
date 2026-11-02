// @vitest-environment node
// The agent and project docs match the code (F40, the 2026-10-31 docs sweep). Agents build from
// AGENTS.md, BLOCKS.md, docs/contracts.md and the TEAM.md sheets, so a stale example there turns
// into broken code: a channel nothing sends on, a key arg the coverage test refuses, a function
// that no longer exists. Each check below names the finding it guards.
//
// "Current" docs describe the app as it is and are checked for routes, functions and retired
// words. "History" docs (the 10-29 meeting and its handoffs) start with a "> **History." line
// and are only checked for what must never be in any doc: secrets printed, members' names.
import { existsSync, readdirSync, readFileSync } from "node:fs";
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
  "templates/TEAM.md",
  ...teams.map((t) => `convex/${t}/README.md`),
  ".claude/commands/next.md",
  ".claude/commands/freeze.md",
];
const HISTORY = ["docs/meeting-1029.md", "docs/handoff-live-slides.md", "docs/handoff-professor-view.md"];
const doc = (path: string) => (exists(path) ? read(path) : "");
const lines = (path: string) => doc(path).split("\n");
// A line that tells someone to add a host to DEV_HOSTS, in any form of "add" (sweep2-docs-fixcheck-3).
const ADDS_HOST = /\badd(s|ing|ed)?\b.{0,160}DEV_HOSTS|DEV_HOSTS.{0,160}\badd(s|ing|ed)?\b/i;

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
        if (ADDS_HOST.test(l))
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

describe("docs: the 2026-10-31 docs fix check", () => {
  const blocks = read("BLOCKS.md");
  const contracts = read("docs/contracts.md");

  it("sweep1-docs-fixcheck-1 deck rows are read with lib.deckFrom/slidesFrom, not lectureWindow's start", () => {
    const rule = blocks.split("\n").find((l) => l.startsWith("**Reading, on the server:**")) ?? "";
    expect(rule).toContain("deckFrom(ctx, channel)");
    expect(rule).toContain("slidesFrom(lecture)");
    expect(rule).not.toMatch(/`at` with the class window's start \(`lectureWindow`/);
    const perClass = contracts.split("\n").find((l) => l.includes("every per-class read")) ?? "";
    expect(perClass).toContain("deckFrom");
  });

  it("sweep1-docs-fixcheck-2 every 'README step N' points at the step it means", () => {
    const readme = read("README.md");
    const setup = readme.slice(readme.indexOf("## Set up a laptop"));
    const step = (n: string) => setup.split("\n").find((l) => l.startsWith(`${n}. `)) ?? "";
    const files = ["BLOCKS.md", "docs/contracts.md", "src/teams/host/TEAM.md", "docs/meeting-1029.md", "convex/dev/seed.ts", "convex/dev/seed.test.ts", "convex/checkin/prof.ts"];
    let seen = 0;
    for (const path of files)
      for (const m of doc(path).matchAll(/README step\s+(\d+)/g)) {
        seen++;
        const before = doc(path).slice(Math.max(0, m.index - 300), m.index);
        const about = before.includes("DEV_HOSTS") ? "DEV_HOSTS" : "npx convex dev";
        expect([path, m[0], step(m[1]).includes(about)]).toEqual([path, m[0], true]);
      }
    expect(seen).toBeGreaterThan(5);
  });

  it("sweep1-docs-fixcheck-3 each table's row names every convex file that queries it (dev/seed aside)", () => {
    const rows = contracts.split("\n");
    const files = (dir: string): string[] =>
      readdirSync(new URL(dir, root), { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? (e.name === "_generated" || e.name === "dev" ? [] : files(`${dir}${e.name}/`)) : [`${dir}${e.name}`],
      );
    for (const file of files("convex/").filter((f) => f.endsWith(".ts") && !f.includes(".test.") && !f.includes("test.helpers"))) {
      const rel = file.slice("convex/".length, -".ts".length);
      const base = rel.split("/").pop() ?? rel;
      for (const m of read(file).matchAll(/\.query\("(\w+)"\)/g)) {
        const row = rows.find((l) => l.startsWith(`| \`${m[1]}\``)) ?? "";
        const named = row.includes(`${rel}.ts`) || row.includes(rel.replace(/\//g, ".")) || row.includes(`\`${base}.ts\``);
        expect([m[1], rel, named]).toEqual([m[1], rel, true]);
      }
    }
  });

  it("sweep1-docs-fixcheck-4 AGENTS.md says the old key env vars are removed by hand, not by importHostEmails", () => {
    const line = lines("AGENTS.md").find((l) => /removes the `PROFESSOR[_]KEY`/.test(l)) ?? "";
    expect(line).not.toContain("(importHostEmails)");
    expect(line).toMatch(/by hand/);
  });

  it('sweep1-docs-fixcheck-5 every "End the ..." button a current doc quotes is on a screen', () => {
    const screens = ["src/teams/host/AskRoom.tsx", "src/teams/checkin/Quiz.tsx"].map(read).join("\n");
    for (const path of CURRENT)
      for (const m of doc(path).matchAll(/"(End the \w+)"/g)) expect([path, m[1], screens.includes(m[1])]).toEqual([path, m[1], true]);
  });

  it("sweep1-docs-fixcheck-6 Live's 'Not doing' line leaves professors' per-student views in", () => {
    const line = lines("src/teams/live/TEAM.md").find((l) => l.startsWith("**Not doing:**")) ?? "";
    expect(line).not.toMatch(/every board shows counts and totals only/);
    expect(line).toContain("Who got it wrong");
    expect(line).toContain("roster");
  });

  it("sweep1-docs-fixcheck-7 the privacy rules name the door iPad, which shows the scanned student's name", () => {
    const rules = [
      ["docs/runbook.md", "**What stays private:**"],
      ["AGENTS.md", "Who sees names:"],
      ["docs/contracts.md", "**Privacy:**"],
    ];
    for (const [path, start] of rules) {
      const line = lines(path).find((l) => l.includes(start)) ?? "";
      expect([path, line.includes("door iPad")]).toEqual([path, true]);
    }
  });

  it("sweep1-docs-check-1 the runbook says a stage link with no ?bridge= sends nothing and shows no warning", () => {
    const line = lines("docs/runbook.md").find((l) => l.includes("Phones aren't getting these slides.")) ?? "";
    expect(line).toContain("?bridge=saved");
    expect(line).toMatch(/no `\?bridge=`[^.]*no warning/);
  });
});

// The 2026-11-01 check of the 10-31 docs fixes (these ids are that round's findings).
describe("docs: the 2026-11-01 docs fix check", () => {
  // live.questions.list is open to anyone, signed out too, and since T1 (2026-11-01) it gives a
  // by-name post the first name and last initial (lib.shortName; convex/live/questions.private.test.ts
  // pins it), and the door iPad shows the same short form (checkin.pass.scan's `short`), so every
  // privacy line says so and none still says a full check-in name or the sign-in name shows there.
  it("sweep1-docs-fixcheck-1 T1 the privacy rules say questions by name and the door iPad show the first name and last initial", () => {
    const rules = [
      ["docs/runbook.md", "**What stays private:**"],
      ["AGENTS.md", "Who sees names:"],
      ["docs/contracts.md", "**Privacy:**"],
    ];
    for (const [path, start] of rules) {
      const line = lines(path).find((l) => l.includes(start)) ?? "";
      expect([path, /question[^.]*by name[^.]*first name and last initial/i.test(line)]).toEqual([path, true]);
      expect([path, /door iPad[^.]*first name and last initial/i.test(line)]).toEqual([path, true]);
      expect([path, /full check-in name|sign-in name|each scanned name/i.test(line)]).toEqual([path, false]);
    }
    const contractsLine = lines("docs/contracts.md").find((l) => l.includes("**Privacy:**")) ?? "";
    expect(contractsLine).toContain("`live.questions.list`");
    expect(contractsLine).toContain("`short`");
  });

  it("sweep1-docs-fixcheck-2 BLOCKS.md doesn't list 'after a class ends' as a way deckFrom differs from lectureWindow", () => {
    const rule = lines("BLOCKS.md").find((l) => l.startsWith("**Reading, on the server:**")) ?? "";
    const differs = rule.slice(rule.indexOf("It differs from"));
    expect(differs.startsWith("It differs from")).toBe(true);
    expect(differs.split(".")[0] + ".").not.toMatch(/after a class ends it is the time it ended/);
    expect(differs).toMatch(/before a channel's first class it is 12 hours ago/);
  });
});

// The 2026-11-01 second docs sweep (these ids are that round's findings).
describe("docs: the 2026-11-01 second sweep", () => {
  const blocks = read("BLOCKS.md");
  const agents = read("AGENTS.md");
  const section = (text: string, title: string) => text.split(/\n## /).find((s) => s.startsWith(title)) ?? "";
  const line = (path: string, has: string) => lines(path).find((l) => l.includes(has)) ?? "";
  const ownerRow = (path: string) => agents.split("\n").find((l) => l.startsWith("|") && l.includes(`\`${path}\``) && l.includes("Sam only")) ?? "";

  it("sweep2-host-8 sweep2-docs-3 the runbook's #/host line gives Questions newest first and the reason only for students", () => {
    const host = line("docs/runbook.md", "**#/host** has three tabs");
    expect(host).not.toMatch(/sorted by upvotes|deductions with a reason/);
    expect(host).toMatch(/Questions:\*\*[^.]*newest first/);
    expect(host).toMatch(/reason[^.]*student|student[^.]*reason/);
    // forHost really is newest first, and a team's +1 or −1 sends no reason.
    expect(read("convex/live/questions.ts")).toMatch(/export const forHost[\s\S]{0,400}\.order\("desc"\)/);
    expect(read("src/teams/host/Boards.tsx")).toContain("adjust({ channel: CHANNEL, team: g.team, delta: 1 })");
  });

  it('sweep2-docs-4 the runbook puts "That code is old." on the door iPad or the teacher page, where it shows', () => {
    const row = line("docs/runbook.md", "That code is old.");
    expect(row).not.toMatch(/student's pass says/);
    expect(row).toContain("door iPad");
    expect(row).toContain("teacher page");
    expect(read("src/teams/checkin/Kiosk.tsx")).toContain('"That code is old.');
    expect(read("src/teams/checkin/Student.tsx")).not.toContain("That code is old.");
  });

  it("sweep2-docs-1 the AI recipe starts with requireProf(ctx), says how a student-facing action is gated and that names stay out of Gemini", () => {
    const ai = section(blocks, "AI (Gemini)");
    const from = ai.indexOf("```ts");
    const recipe = ai.slice(from, ai.indexOf("```", from + 5));
    expect(recipe).toContain("await requireProf(ctx);");
    expect(recipe).toContain('import { requireProf } from "../checkin/prof";');
    for (const w of ["requireUser", "checkedIn", "never a name"]) expect([w, ai.includes(w)]).toEqual([w, true]);
  });

  it("sweep2-docs-5 the AI recipe never sends a camera frame to Gemini", () => {
    const ai = section(blocks, "AI (Gemini)");
    expect(ai).not.toMatch(/canvas from the camera/);
    expect(ai).toMatch(/camera frame[^.]*never goes to Gemini/);
    expect(section(blocks, "Vision")).toMatch(/never a camera frame/);
  });

  it("sweep2-docs-2 a new sub-page's steps name every file the docs test checks, and AGENTS.md lets the module add its Pages row", () => {
    const routes = section(blocks, "Pages and routes");
    for (const w of ["src/pages/Home.tsx", "Home.test.ts", "routes.test.ts", "AGENTS.md", "README.md"]) expect([w, routes.includes(w)]).toEqual([w, true]);
    expect(ownerRow("AGENTS.md")).toMatch(/Pages/);
  });

  it("sweep2-docs-6 README step 6 says which doctor.sh FIX lines to skip", () => {
    const readme = read("README.md");
    const step6 = readme.slice(readme.indexOf("## Set up a laptop")).split("\n").find((l) => l.startsWith("6. ")) ?? "";
    expect(step6).not.toMatch(/until it says Ready/);
    for (const w of ["ADMIN_EMAILS", "DECK_BRIDGE_KEY"]) expect([w, step6.includes(w)]).toEqual([w, true]);
  });

  it("sweep2-docs-7 every line that adds a host to DEV_HOSTS says Sam adds it, and the ownership table says so too", () => {
    let seen = 0;
    for (const path of CURRENT)
      for (const l of lines(path))
        if (ADDS_HOST.test(l)) {
          seen++;
          expect([path, l, /\basks? Sam\b|\bSam (also )?adds\b/i.test(l)]).toEqual([path, l, true]);
        }
    expect(seen).toBeGreaterThan(4);
    expect(ownerRow("convex/auth.config.ts")).toMatch(/DEV_HOSTS/);
  });

  it("sweep2-docs-8 templates/TEAM.md has the current sheet's sections, no sprint parts, and is a checked current doc", () => {
    const t = doc("templates/TEAM.md");
    for (const h of ["**Goal:**", "## Must do", "**Not doing:**", "## What it sees", "## Where it lives", "## Tests"]) expect([h, t.includes(h)]).toEqual([h, true]);
    expect(t).not.toMatch(/sprint|\bPM\b|Seats|pitch|demo path/i);
    expect(CURRENT).toContain("templates/TEAM.md");
  });

  it("sweep2-docs-10 sweep2-docs-fixcheck-2 design.md, AGENTS.md and kit.tsx leave #/host its own kept-mounted tabs", () => {
    expect(line("docs/design.md", "sections as `Tabs`")).toMatch(/#\/host[^.]*mounted/);
    const design = read("docs/design.md");
    const from = design.indexOf("### Tabs");
    const tabs = design.slice(from, design.indexOf("\n### ", from + 5));
    expect(tabs).toContain("<Tabs label=");
    expect(tabs).not.toMatch(/Professor view|"now"|<Now \/>|<Questions \/>/);
    expect(line("AGENTS.md", "Reuse a block or kit part")).toMatch(/#\/host[^.]*mounted/);
    const kit = read("src/blocks/kit.tsx");
    const at = kit.indexOf("export function Tabs");
    expect(kit.slice(kit.lastIndexOf("\n\n", at), at)).not.toMatch(/professor view/i);
    // sweep2-docs-check2-1: reviewers copy from the #/ui gallery, so its kit Tabs demo (and the
    // tab state samples under it) use design.md's example too, not #/host's Now / Questions / Teams.
    const ui = read("src/pages/UIKit.tsx");
    const tabsAt = ui.indexOf("<Tabs");
    const demo = ui.slice(tabsAt, ui.indexOf("<Segmented", tabsAt));
    expect(demo).toContain('label="Attendance"');
    expect(demo).not.toMatch(/Professor view|"now"|\bNow\b|\bQuestions\b|\bTeams\b/);
  });

  it("sweep2-docs-fixcheck-1 a convex/ comment that tells someone to add a host says to ask Sam and points at README step 4", () => {
    const files = (dir: string): string[] =>
      readdirSync(new URL(dir, root), { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? (e.name === "_generated" ? [] : files(`${dir}${e.name}/`)) : [`${dir}${e.name}`],
      );
    let seen = 0;
    for (const file of files("convex/").filter((f) => f.endsWith(".ts") && !f.includes(".test."))) {
      // Each run of // lines is one paragraph; check it sentence by sentence.
      const comments = read(file)
        .split("\n")
        .map((l) => l.trim())
        .map((l) => (l.startsWith("//") ? l.slice(2).trim() : "\u0000"))
        .join(" ");
      for (const para of comments.split("\u0000"))
        for (const sentence of para.split(/(?<=\.)\s+(?=[A-Z])/))
          // Also any sentence naming DEV_HOSTS with a form of "add", passive included ("a lead's own
          // dev backend gets added there"), so the old wording can't come back unseen.
          if (/\badd(s|ing|ed)?\b[^.]{0,80}\bhost\b/i.test(sentence) || (sentence.includes("DEV_HOSTS") && /\badd(s|ing|ed)?\b/i.test(sentence))) {
            seen++;
            expect([file, sentence, /\basks? Sam\b|\bSam (also )?adds\b/i.test(sentence) && sentence.includes("README step 4")]).toEqual([file, sentence, true]);
          }
    }
    expect(seen).toBeGreaterThan(3);
    // The devGrant entry in staff.ts's header is what a lead reads before running devGrant.
    const staff = read("convex/staff.ts");
    const grantAt = staff.indexOf("//   staff:devGrant");
    const grant = staff.slice(grantAt, staff.indexOf("//   staff:devRevoke", grantAt));
    expect(grantAt).toBeGreaterThan(-1);
    expect(grant).toMatch(/ask\s+(\/\/\s+)?Sam/);
    expect(grant).toContain("README step 4");
    expect(grant).toContain("convex/auth.config.ts");
    expect(grant).not.toMatch(/gets\s+(\/\/\s+)?added/);
  });

  it("sweep2-docs-check-1 live TEAM.md says only a student's point change carries a reason, as #/host sends it", () => {
    const points = line("src/teams/live/TEAM.md", "- **Points:**");
    expect(points).not.toMatch(/for a team or one student, with its reason/);
    expect(points).toMatch(/a team's change has none/);
    const calls = read("src/teams/host/Boards.tsx").match(/adjust\(\{ channel: CHANNEL, team:[^)]*\)/g) ?? [];
    expect(calls.length).toBe(2);
    for (const call of calls) expect(call).not.toContain("reason");
  });

  it("sweep2-docs-11 no current doc or design.md names an End day button; the button is End class", () => {
    for (const path of [...CURRENT, "docs/design.md"]) expect([path, doc(path).match(/\bEnd day\b/)?.[0] ?? null]).toEqual([path, null]);
  });

  it("sweep2-docs-12 contracts.md gives ensureGroup its fresh arg", () => {
    expect(read("docs/contracts.md")).toContain("ensureGroup(ctx, channel, user, fresh)");
    expect(read("convex/live/groups.ts")).toContain("ensureGroup(ctx: MutationCtx, channel: string, user: string, fresh = false)");
  });

  it("sweep2-docs-13 direction.md divides by the team's checked-in students, not team size", () => {
    const direction = read("docs/direction.md");
    expect(direction).not.toMatch(/divides by team size/);
    expect(direction).toContain("divides by the team's checked-in students");
  });

  it("sweep2-access-3 the devices row names every function that writes or reads devices", () => {
    const row = read("docs/contracts.md").split("\n").find((l) => l.startsWith("| `devices`")) ?? "";
    for (const w of ["staff.approvePairing", "staff.unpair", "staff:devRevoke", "checkin.pass.scan", "requireScanner", "pairedDevice", "deviceByHash", "checkin.pass.canScan", "staff.requestPairing", "staff.deviceStatus", "staff.devices"])
      expect([w, row.includes(w)]).toEqual([w, true]);
  });
});

// The 2026-11-01 check of the second server sweep (these ids are that round's findings).
describe("docs: the 2026-11-01 server sweep check", () => {
  // Open requests can hold every 6-digit code, and then the door iPad shows 8 digits
  // (convex/staff.ts requestPairing), so no doc or comment may promise 6 digits alone.
  it("sweep2-server-fixcheck-2 sweep2-server-check-docs-1 every line that gives the pairing code 6 digits also says it can have 8", () => {
    for (const path of [...CURRENT, "convex/checkin/prof.ts", "src/teams/checkin/prof.tsx"])
      for (const l of lines(path)) if (/6-digit (pairing )?code/.test(l)) expect([path, l, /\b8\b|8-digit/.test(l)]).toEqual([path, l, true]);
  });

  // A bad page-back row (written before slideNumbers) stays when a new deck tab presses that
  // slide (convex/deck.test.ts pins it), and the iOS app keeps the list it already had.
  it("sweep2-server-fixcheck-1 deck.ts and http.ts don't say a new run clears a bad page-back row, or that page-back goes empty", () => {
    for (const path of ["convex/deck.ts", "convex/http.ts"]) {
      const text = doc(path).replace(/\n\/\/ /g, " ");
      expect([path, /until a new run|leaves page-back empty|page-back\s+stays empty/.test(text)]).toEqual([path, false]);
      expect([path, /stops updating/.test(text)]).toEqual([path, true]);
    }
  });
});
