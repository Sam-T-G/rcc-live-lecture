// F43.2 privacy: what anyone signed out, and any student, can read. One class with three typed
// students: Ana checks in late, Ben posts a question under his name, Cleo posts a question that
// only the professor can see (by name, so a leak would show her name too), and Dee is the student
// who looks. Every public query is called signed out and as Dee. The queries come from loading
// each Convex module, so a new query fails this test until it gets a line in ARGS. An answer may
// hold no email, no sign-in id (tokenIdentifier) and no full name, except Ben's name on the
// question he chose to post under it, the first names the late banner shows (lateFeed), and Dee's
// own name and email on her own pass. Cleo's private question and the professor's answer to it
// reach nobody else. A host-only query refuses them instead ("Sign in first." or "Only ...").
import { makeFunctionReference } from "convex/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  ADMIN_EMAIL,
  at,
  checkIn,
  GOOGLE_ISSUER,
  PROF_EMAIL,
  professor,
  profEnv,
  setup,
  slide,
  TYPED_ISSUER,
  typed,
  type Caller,
  type T,
} from "./test.helpers";
import { modules } from "./test.setup";

const CH = "gdg";
const MIN = 60_000;
const T0 = at(2026, 11, 5, 17, 0);

const ANA = { name: "Ana Sample", email: "student1@example.edu" };
const BEN = { name: "Ben Sample", email: "student2@example.edu" };
const CLEO = { name: "Cleo Sample", email: "student3@example.edu" };
const DEE = { name: "Dee Sample", email: "student4@example.edu" };
const BEN_TEXT = "Can you go over slide 1 again?";
const ANA_TEXT = "Is this on the exam?";
const CLEO_TEXT = "I missed the start, which chapter is this?";
const CLEO_ANSWER = "Chapter 26, section 2.";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  profEnv();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

// Every public query, as "module:name" (internal ones can't be called from a page).
async function publicQueries(): Promise<string[]> {
  const out: string[] = [];
  for (const [file, load] of Object.entries(modules)) {
    const mod = file.replace(/^\.\//, "").replace(/\.[cm]?[jt]s$/, "");
    if (mod.startsWith("_generated/")) continue;
    for (const [name, value] of Object.entries((await load()) as Record<string, unknown>)) {
      const f = value as { isQuery?: boolean; isInternal?: boolean };
      if (typeof value === "function" && f.isQuery && !f.isInternal) out.push(`${mod}:${name}`);
    }
  }
  return out.sort();
}

// The args each public query is called with (some twice). `poll` is the class's quiz.
type Ids = { poll: Id<"polls"> };
const ARGS: Record<string, (ids: Ids) => Record<string, unknown>[]> = {
  "deck:current": () => [{ channel: CH }],
  "deck:slides": () => [{ channel: CH }],
  "lab:whoami": () => [{}],
  "lab:pings": () => [{}],
  "lab:lastPing": () => [{}],
  "staff:me": () => [{}],
  "staff:people": () => [{}],
  "staff:changes": () => [{}],
  "staff:devices": () => [{}],
  "staff:deviceStatus": () => [{ token: "0".repeat(64) }],
  "checkin/attendance:classStart": () => [{ channel: CH }],
  "checkin/attendance:sheet": () => [{ channel: CH }],
  "checkin/attendance:lectures": () => [{ channel: CH }],
  "checkin/attendance:lateFeed": () => [{ channel: CH }],
  "checkin/attendance:myHideLate": () => [{}],
  "checkin/pass:amHost": () => [{}],
  "checkin/pass:canScan": () => [{}],
  "checkin/pass:mine": () => [{}],
  "checkin/read:count": () => [{ channel: CH }],
  "checkin/read:me": () => [{ channel: CH }],
  "checkin/read:names": () => [{ channel: CH }],
  "checkin/quiz:current": () => [{ channel: CH }],
  "checkin/quiz:mine": ({ poll }) => [{ poll }],
  "checkin/quiz:stats": ({ poll }) => [{ poll }],
  "checkin/quiz:history": () => [{ channel: CH }],
  "checkin/quiz:missing": () => [{ channel: CH }],
  "live/groups:status": () => [{ channel: CH }],
  "live/groups:mine": () => [{ channel: CH }],
  "live/groups:leaderboard": () => [{ channel: CH }],
  "live/groups:roster": () => [{ channel: CH }],
  "live/groups:pointLog": () => [{ channel: CH }],
  "live/groups:results": () => [{ channel: CH, paginationOpts: { numItems: 50, cursor: null } }],
  "live/past:past": () => [{ channel: CH }],
  "live/read:lostCount": () => [{ channel: CH, index: 0 }],
  "live/read:lostBySlide": () => [{ channel: CH }],
  "live/read:mine": () => [{ channel: CH, index: 0 }],
  "live/questions:list": () => [{ channel: CH }, { channel: CH, index: 0 }],
  "live/questions:forHost": () => [{ channel: CH }],
};

// The class: the start saved at 17:00 with 5 minutes' grace, the deck on slide 1, Ben, Cleo and
// Dee checked in at 17:01, Ana at 17:12 (12 minutes late). Ana posts anonymously, Ben by name,
// Cleo by name and only for the professor, who types an answer to Cleo (a private question's
// answer can't be shared: Sam's decision D12 e, so the share is refused). A quiz ends
// with answers from Ana and Ben, and Dee taps I'm lost.
async function classWithThree(t: T) {
  const prof = await professor(t);
  await prof.mutation(api.checkin.attendance.setClassStart, { channel: CH, startsAt: T0, graceMin: 5 });
  await slide(t, CH, 0);
  const ana = typed(t, ANA.name, ANA.email);
  const ben = typed(t, BEN.name, BEN.email);
  const cleo = typed(t, CLEO.name, CLEO.email);
  const dee = typed(t, DEE.name, DEE.email);
  vi.setSystemTime(T0 + MIN);
  for (const s of [ben, cleo, dee]) await checkIn(t, s);
  vi.setSystemTime(T0 + 12 * MIN);
  await checkIn(t, ana);
  vi.setSystemTime(T0 + 13 * MIN);
  await ana.mutation(api.live.questions.ask, { channel: CH, index: 0, text: ANA_TEXT, anonymous: true });
  await ben.mutation(api.live.questions.ask, { channel: CH, index: 0, text: BEN_TEXT, anonymous: false });
  await cleo.mutation(api.live.questions.ask, { channel: CH, index: 0, text: CLEO_TEXT, anonymous: false, private: true });
  const secret = (await prof.query(api.live.questions.forHost, { channel: CH })).find((q) => q.private)!;
  await prof.mutation(api.live.questions.answer, { question: secret._id, text: CLEO_ANSWER });
  await expect(prof.mutation(api.live.questions.share, { question: secret._id, shared: true })).rejects.toThrow("That question is private.");
  const poll = await prof.mutation(api.checkin.quiz.ask, { channel: CH, kind: "quiz", question: "Which one?", choices: ["This", "That"], correct: 0 });
  await ana.mutation(api.checkin.quiz.answer, { poll, choice: 0 });
  await ben.mutation(api.checkin.quiz.answer, { poll, choice: 1 });
  await prof.mutation(api.checkin.quiz.end, { poll });
  await dee.mutation(api.live.lost.toggle, { channel: CH, index: 0 });
  return { prof, ana, ben, cleo, dee, ids: { poll } };
}

// What may not show in an answer to someone who isn't staff: the other students' emails and full
// names, the staff's emails and names, anyone's sign-in id, and Cleo's private question and its
// answer. Ben's name counts as allowed only in the `name` of his own question, so it's taken out
// of those rows first.
const FORBIDDEN = [
  ANA.email, BEN.email, CLEO.email, PROF_EMAIL, ADMIN_EMAIL,
  ANA.name, BEN.name, CLEO.name, "Sample professor", "Sample admin",
  TYPED_ISSUER, GOOGLE_ISSUER, "accounts.google.com", "test-login",
  CLEO_TEXT, CLEO_ANSWER,
];
function leaks(fn: string, value: unknown): string[] {
  let v = value;
  if (fn === "live/questions:list" && Array.isArray(v))
    v = v.map((q: { name?: string | null; text?: string }) => (q.text === BEN_TEXT && q.name === BEN.name ? { ...q, name: "(chosen)" } : q));
  const s = JSON.stringify(v) ?? "";
  return FORBIDDEN.filter((x) => s.toLowerCase().includes(x.toLowerCase()));
}

// Calls every public query as `who` and returns what came back, by "module:name #n".
async function readAll(who: Caller, ids: Ids) {
  const fns = await publicQueries();
  const missing = fns.filter((fn) => !(fn in ARGS));
  expect(missing, "public queries with no line in ARGS").toEqual([]);
  const got: Record<string, { ok: true; value: unknown } | { ok: false; error: string }> = {};
  for (const fn of fns) {
    const sets = ARGS[fn](ids);
    for (let i = 0; i < sets.length; i++) {
      const key = `${fn} #${i + 1}`;
      try {
        got[key] = { ok: true, value: await who.query(makeFunctionReference<"query">(fn), sets[i] as never) };
      } catch (e) {
        got[key] = { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    }
  }
  return got;
}

describe("F43.2 privacy: what a signed-out caller and another student can read", () => {
  it("F43.2 signed out and as another typed student, no query returns an email, a sign-in id, a full name or a private question", async () => {
    const t = setup();
    const { dee, ids } = await classWithThree(t);
    for (const [who, caller] of [["signed out", t], ["Dee", dee]] as const) {
      const got = await readAll(caller, ids);
      for (const [key, r] of Object.entries(got)) {
        const fn = key.split(" #")[0];
        if (r.ok) expect(leaks(fn, r.value), `${who}: ${key}`).toEqual([]);
        // A refusal has to be about who is calling, never a bad arg that hides an answer.
        else expect(r.error, `${who}: ${key}`).toMatch(/Sign in first\.|Only (professors|admins) can do that\./);
      }
    }
  });

  it("F43.2 the answers that do come back are the allowed ones: first names late, chosen names on questions, counts on the board", async () => {
    const t = setup();
    const { cleo, dee, ids } = await classWithThree(t);
    const late = await t.query(api.checkin.attendance.lateFeed, { channel: CH });
    expect(late.map((r) => [r.first, r.lateMin])).toEqual([["Ana", 12]]);
    const asDee = await dee.query(api.live.questions.list, { channel: CH });
    expect(asDee.map((q) => [q.text, q.name]).sort()).toEqual([
      [BEN_TEXT, BEN.name],
      [ANA_TEXT, null],
    ].sort());
    // Cleo sees her own private question, and no answer: it can't be shared.
    const asCleo = await cleo.query(api.live.questions.list, { channel: CH });
    expect(asCleo.find((q) => q.text === CLEO_TEXT)).toMatchObject({ private: true, answer: null });
    // The signed-out read of the same list has no private row.
    expect((await t.query(api.live.questions.list, { channel: CH })).some((q) => q.private)).toBe(false);
    // Dee's own pass has her own name and email, and nobody else's.
    expect(await dee.query(api.checkin.pass.mine, {})).toMatchObject({ name: DEE.name, email: DEE.email });
    expect(await t.query(api.checkin.pass.mine, {})).toBeNull();
    // The board and the past quizzes are counts: no names.
    const board = await t.query(api.live.groups.leaderboard, { channel: CH });
    expect(board.teams.length).toBeGreaterThan(0);
    expect(leaks("live/groups:leaderboard", board)).toEqual([]);
    expect(leaks("live/past:past", await dee.query(api.live.past.past, { channel: CH }))).toEqual([]);
    expect(await t.query(api.checkin.quiz.mine, { poll: ids.poll })).toBeNull();
  });

  it("F43.2 the professor's own lists still name every student, so the check above isn't empty", async () => {
    const t = setup();
    const { prof } = await classWithThree(t);
    const sheet = await prof.query(api.checkin.attendance.sheet, { channel: CH });
    expect(sheet.map((r) => r.email).sort()).toEqual([ANA.email, BEN.email, CLEO.email, DEE.email].sort());
    const forHost = await prof.query(api.live.questions.forHost, { channel: CH });
    expect(forHost.find((q) => q.text === CLEO_TEXT)).toMatchObject({ private: true, name: CLEO.name });
  });
});
