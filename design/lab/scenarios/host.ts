// Host screens: the professor's laptop at the lectern, 1440 x 900 and 1280. Route: #/host, every tab.
// README.md says how to add a scenario. The class data is in fixtures/host/class.ts.
// IDs in titles (HO-, SH-) are the states in design/system/INVENTORY.md.
import { api } from "../../../convex/_generated/api";
import { fails, fx, hangs, refuses, type Fixtures, type Scenario } from "../lib/types";
import * as C from "../fixtures/host/class";

const NOW = C.NOW;
const PROF = { email: "quill@example.edu" };

// The tab buttons (Page.tsx gives each an id).
const TAB = { points: "#host-tab-Points", questions: "#host-tab-Questions" };

// Header only: the slide, counts and lost by slide, mid-class, with this class open.
const header: Fixtures = {
  ...fx(api.deck.current, C.slide),
  ...fx(api.checkin.read.count, C.CHECKED_IN),
  ...fx(api.live.read.lostCount, 3),
  ...fx(api.live.read.lostBySlide, C.lostBySlide),
  ...fx(api.checkin.attendance.lectures, C.classes),
};
// The Points tab, filled.
const points: Fixtures = {
  ...fx(api.live.groups.leaderboard, C.leaderboard),
  ...fx(api.live.groups.status, C.teamStatus),
  ...fx(api.live.groups.roster, C.roster),
  ...fx(api.live.groups.pointLog, C.pointLog),
};
// The Questions tab, filled.
const questions: Fixtures = { ...fx(api.live.questions.forHost, C.questions) };
// Now tab with no question yet.
const noQuestion: Fixtures = {
  ...fx(api.checkin.quiz.current, null),
  ...fx(api.checkin.quiz.missing, null),
};
// A class in full swing: every tab filled, no question asked yet.
const live: Fixtures = { ...header, ...noQuestion, ...points, ...questions };

// Each tab's queries, still loading.
const pointsLoading: Fixtures = {
  ...fx(api.live.groups.leaderboard, hangs()),
  ...fx(api.live.groups.status, hangs()),
  ...fx(api.live.groups.roster, hangs()),
  ...fx(api.live.groups.pointLog, hangs()),
};
const nowLoading: Fixtures = { ...fx(api.checkin.quiz.current, hangs()), ...fx(api.checkin.quiz.missing, hangs()) };
const questionsLoading: Fixtures = { ...fx(api.live.questions.forHost, hangs()) };

const quizOpen: Fixtures = {
  ...fx(api.checkin.quiz.current, C.quizOpen),
  ...fx(api.checkin.quiz.stats, C.quizOpenStats),
  ...fx(api.checkin.quiz.missing, C.missingOpen),
};
const quizEnded: Fixtures = {
  ...fx(api.checkin.quiz.current, C.quizEnded),
  ...fx(api.checkin.quiz.stats, C.quizEndedStats),
  ...fx(api.checkin.quiz.missing, C.missingEnded),
};

const host = (s: Omit<Scenario, "area" | "role" | "now" | "route"> & Partial<Pick<Scenario, "role" | "route">>): Scenario => ({
  area: "host",
  role: "professor",
  route: "host",
  now: NOW,
  ...s,
});

export const scenarios: Scenario[] = [
  // ---------- Staff gate (SH-11..SH-16) ----------
  host({
    id: "host-gate-loading",
    title: "SH-11 Checking who is signed in",
    expect: "loading",
    fixtures: { ...fx(api.staff.me, hangs()) },
  }),
  host({
    id: "host-gate-signedout",
    role: "signedout",
    title: "SH-12 Signed out: sign in with Google",
    fixtures: {},
  }),
  host({
    id: "host-gate-typed",
    role: "student",
    title: "SH-14 Typed sign-in can't hold a staff role",
    fixtures: { ...fx(api.staff.me, { email: "pip@example.edu", role: null, canHoldRole: false }) },
  }),
  host({
    id: "host-gate-scanner",
    role: "student",
    user: { name: "Sable Example", email: "sable@example.edu" },
    title: "SH-15 Scanner can't open the professor view",
    fixtures: { ...fx(api.staff.me, { email: "sable@example.edu", role: "scanner", canHoldRole: true }) },
  }),
  host({
    id: "host-gate-not-staff",
    role: "student",
    title: "SH-16 Google account not on the staff list",
    fixtures: {},
  }),
  host({
    id: "host-unknown-part",
    route: "host/settings",
    title: "SH-02 No page at #/host/settings",
    fixtures: {},
  }),

  // ---------- Header and the Now tab ----------
  host({
    id: "host-loading",
    title: "HO-01 HO-10 HO-20 Everything still loading",
    expect: "loading",
    fixtures: {
      ...fx(api.staff.me, { ...PROF, role: "professor", canHoldRole: true }),
      ...fx(api.deck.current, hangs()),
      ...fx(api.checkin.read.count, hangs()),
      ...fx(api.live.read.lostBySlide, hangs()),
      ...fx(api.checkin.attendance.lectures, hangs()),
      ...nowLoading,
      ...pointsLoading,
      ...questionsLoading,
    },
  }),
  host({
    id: "host-before-class",
    title: "HO-02 HO-11 HO-21 Before class: no slide, nobody in, no class open",
    expect: "empty",
    fixtures: {
      ...fx(api.deck.current, null),
      ...fx(api.checkin.read.count, 0),
      ...fx(api.live.read.lostBySlide, []),
      ...fx(api.checkin.attendance.lectures, C.classesBefore),
      ...noQuestion,
      ...fx(api.live.groups.leaderboard, { questions: 0, teams: [] }),
      ...fx(api.live.groups.status, { size: 4, locked: false, locksAt: null }),
      ...fx(api.live.groups.roster, []),
      ...fx(api.live.groups.pointLog, []),
      ...fx(api.live.questions.forHost, []),
    },
  }),
  host({
    id: "host-now-ready",
    title: "HO-03 HO-04 HO-11 Slide 4 up, 38 in, no question yet",
    fixtures: live,
  }),
  host({
    id: "host-now-nobody-lost",
    title: "HO-04 Nobody has tapped I'm lost yet",
    fixtures: { ...live, ...fx(api.live.read.lostCount, 0), ...fx(api.live.read.lostBySlide, []) },
  }),
  host({
    id: "host-now-cards-loading",
    title: "HO-10 HO-20 Header in, question cards loading",
    expect: "loading",
    fixtures: { ...header, ...nowLoading, ...pointsLoading, ...questionsLoading },
  }),
  host({
    id: "host-now-drafting",
    title: "HO-12 Draft with AI busy",
    fixtures: { ...live, ...fx(api.checkin.quiz.draftQuestion, hangs()) },
    clicks: ['button:has-text("Draft with AI")'],
  }),
  host({
    id: "host-now-ai-draft",
    title: "HO-13 AI draft form, quiz, right answer C",
    fixtures: { ...live, ...fx(api.checkin.quiz.draftQuestion, C.draft) },
    clicks: ['button:has-text("Draft with AI")'],
  }),
  host({
    id: "host-now-write-own",
    title: "HO-13 Write my own: blank quiz form",
    fixtures: live,
    clicks: ['button:has-text("Write my own")'],
  }),
  host({
    id: "host-now-write-vote",
    title: "HO-14 Write my own, switched to Vote",
    fixtures: live,
    clicks: ['button:has-text("Write my own")', '.seg label:has-text("Vote")'],
  }),
  host({
    id: "host-now-draft-while-open",
    title: "HO-15 New AI draft while a quiz is open",
    fixtures: { ...live, ...quizOpen, ...fx(api.checkin.quiz.draftQuestion, C.draft) },
    clicks: ['button:has-text("Draft with AI")'],
  }),
  host({
    id: "host-now-quiz-open",
    title: "HO-16 HO-24 Quiz open, 14 of 38 answered, 5 wrong so far",
    fixtures: { ...live, ...quizOpen },
  }),
  host({
    id: "host-now-quiz-open-nobody-wrong",
    title: "HO-16 HO-23 Quiz open, 6 answered, nobody wrong yet",
    fixtures: {
      ...live,
      ...quizOpen,
      ...fx(api.checkin.quiz.stats, { ...C.quizOpenStats, counts: [0, 6, 0, 0], answered: 6 }),
      ...fx(api.checkin.quiz.missing, C.missingNobody),
    },
  }),
  host({
    id: "host-now-vote-open",
    title: "HO-16 HO-22 Vote open; Who got it wrong says it's a vote",
    fixtures: {
      ...live,
      ...fx(api.checkin.quiz.current, C.voteOpen),
      ...fx(api.checkin.quiz.stats, C.voteOpenStats),
      ...fx(api.checkin.quiz.missing, C.missingVote),
    },
  }),
  host({
    id: "host-now-quiz-ended",
    title: "HO-17 HO-24 Quiz ended: 71% right, 10 wrong listed",
    fixtures: { ...live, ...quizEnded },
  }),
  host({
    id: "host-now-vote-ended",
    title: "HO-17 HO-22 Vote ended: top pick, no right answer (comp host-quiz-ended--vote)",
    fixtures: {
      ...live,
      ...fx(api.checkin.quiz.current, C.voteEnded),
      ...fx(api.checkin.quiz.stats, C.voteEndedStats),
      ...fx(api.checkin.quiz.missing, C.missingVote),
    },
  }),
  host({
    id: "host-now-ai-note",
    title: "HO-25 Ask the AI note under who got it wrong",
    fixtures: { ...live, ...quizEnded, ...fx(api.checkin.quiz.feedback, C.aiNote) },
    clicks: ['button:has-text("Ask the AI")'],
  }),
  host({
    id: "host-now-ai-note-error",
    title: "HO-25 Ask the AI failed",
    fixtures: { ...live, ...quizEnded, ...fx(api.checkin.quiz.feedback, refuses("Something went wrong. Try again.")) },
    clicks: ['button:has-text("Ask the AI")'],
  }),
  host({
    id: "host-now-draft-error",
    title: "HO-18 Draft with AI refused: unreadable answer",
    fixtures: { ...live, ...fx(api.checkin.quiz.draftQuestion, refuses("The AI answer wasn't readable. Try again.")) },
    clicks: ['button:has-text("Draft with AI")'],
  }),
  host({
    id: "host-now-right-on-blank",
    title: "HO-18 Right answer marked on a blank choice",
    fixtures: live,
    clicks: [
      'button:has-text("Write my own")',
      'input[aria-label="C is the right answer"]',
      'button[type="submit"]:has-text("Ask the room")',
    ],
  }),
  host({
    id: "host-now-error",
    title: "SH-04 The Now tab didn't load",
    expect: "error",
    fixtures: { ...live, ...fx(api.checkin.quiz.current, fails()) },
  }),
  host({
    id: "host-lost-error",
    title: "SH-04 Lost by slide didn't load",
    expect: "error",
    fixtures: { ...live, ...fx(api.live.read.lostBySlide, fails()) },
  }),

  // ---------- Points tab ----------
  host({
    id: "host-points-loading",
    title: "HO-30 HO-33 HO-34 Points tab loading",
    expect: "loading",
    fixtures: { ...header, ...noQuestion, ...pointsLoading, ...questionsLoading },
    clicks: [TAB.points],
  }),
  host({
    id: "host-points-empty",
    title: "HO-30 HO-33 HO-34 Class open: no teams, no students, no point changes",
    expect: "empty",
    fixtures: {
      ...header,
      ...noQuestion,
      ...fx(api.checkin.read.count, 0),
      ...fx(api.checkin.attendance.lectures, [{ ...C.classes[0], count: 0 }]),
      ...fx(api.live.groups.leaderboard, { questions: 0, teams: [] }),
      ...fx(api.live.groups.status, { size: 4, locked: false, locksAt: null }),
      ...fx(api.live.groups.roster, []),
      ...fx(api.live.groups.pointLog, []),
      ...fx(api.live.questions.forHost, []),
    },
    clicks: [TAB.points],
  }),
  host({
    id: "host-points-teams",
    title: "HO-31 HO-32 10 teams ranked, 38 students, teams lock at 2:41 PM",
    fixtures: live,
    clicks: [TAB.points],
  }),
  host({
    id: "host-points-locked",
    title: "HO-31 Teams are final, teams of 3 picked",
    fixtures: { ...live, ...fx(api.live.groups.status, { size: 3, locked: true, locksAt: null }) },
    clicks: [TAB.points],
  }),
  host({
    id: "host-points-filter",
    title: "HO-32 Students filtered to team Green",
    fixtures: live,
    clicks: [TAB.points, '.points-filter button:has-text("Green")'],
  }),
  host({
    id: "host-points-filter-none",
    title: "HO-33 Nobody on this team is checked in",
    expect: "empty",
    fixtures: {
      ...live,
      ...fx(
        api.live.groups.roster,
        C.roster.filter((r) => r.team?.label !== "Green"),
      ),
    },
    clicks: [TAB.points, '.points-filter button:has-text("Green")'],
  }),
  host({
    id: "host-points-changes",
    title: "HO-34 Point changes with Undo",
    fixtures: live,
    clicks: [TAB.points],
    scrollTo: 'section.panel:has-text("Point changes")',
  }),
  host({
    id: "host-points-end-confirm",
    title: "HO-35 End this class? confirm",
    fixtures: live,
    clicks: [TAB.points, 'button:has-text("End class")'],
    scrollTo: ".confirm",
  }),
  host({
    id: "host-points-end-done",
    title: "HO-35 Class ended: the server's message",
    fixtures: {
      ...live,
      ...fx(api.live.groups.endDay, "Green came 1st with 11 points, 2.8 per student. Saved extra credit for 11 students. The next class starts from 0 points."),
    },
    clicks: [TAB.points, 'button:has-text("End class")', '.confirm button:has-text("End class")'],
    scrollTo: 'section.panel:has-text("End of class")',
  }),
  host({
    id: "host-points-download-empty",
    title: "HO-35 Download with no extra credit saved yet",
    fixtures: { ...live, ...fx(api.live.groups.results, { page: [], isDone: true, continueCursor: "" }) },
    clicks: [TAB.points, 'button:has-text("Download extra credit (CSV)")'],
    scrollTo: 'section.panel:has-text("End of class")',
  }),
  host({
    id: "host-points-change-error",
    title: "HO-36 A −1 the server refused",
    fixtures: { ...live, ...fx(api.live.groups.adjust, refuses("Only professors can do that.")) },
    clicks: [TAB.points, 'button[aria-label="Take 1 point off Gray"]'],
  }),
  host({
    id: "host-points-tab-error",
    title: "SH-04 The Points tab didn't load",
    expect: "error",
    fixtures: { ...live, ...fx(api.live.groups.leaderboard, fails()) },
    clicks: [TAB.points],
  }),

  // ---------- Questions tab ----------
  host({
    id: "host-questions-loading",
    title: "HO-40 Questions loading",
    expect: "loading",
    fixtures: { ...header, ...noQuestion, ...points, ...questionsLoading },
    clicks: [TAB.questions],
  }),
  host({
    id: "host-questions-empty",
    title: "HO-41 No questions yet",
    expect: "empty",
    fixtures: { ...live, ...fx(api.live.questions.forHost, []) },
    clicks: [TAB.questions],
  }),
  host({
    id: "host-questions-list",
    title: "HO-42 HO-44 HO-46 HO-48 12 questions: private, kept, answered, shared, dismissed",
    fixtures: live,
    clicks: [TAB.questions],
  }),
  host({
    id: "host-questions-kept",
    title: "HO-42 The three most upvoted unanswered questions kept (comp host-questions--kept)",
    fixtures: { ...live, ...fx(api.live.questions.forHost, C.questionsKept) },
    clicks: [TAB.questions],
  }),
  host({
    id: "host-questions-answer-editor",
    title: "HO-43 Typing an answer to the top question",
    fixtures: live,
    clicks: [TAB.questions, 'button:has-text("Type answer")'],
  }),
  host({
    id: "host-questions-delete-confirm",
    title: "HO-45 Delete this question from every phone?",
    fixtures: live,
    clicks: [TAB.questions, '.qa-q__actions button:has-text("Delete")'],
  }),
  host({
    id: "host-questions-grouping",
    title: "HO-47 Grouping with AI busy",
    fixtures: { ...live, ...fx(api.live.questions.organize, hangs()) },
    clicks: [TAB.questions, "label.host-switch"],
  }),
  host({
    id: "host-questions-grouped",
    title: "HO-47 Grouped by topic with clusters, Dismissed last",
    fixtures: { ...live, ...fx(api.live.questions.forHost, C.questionsGrouped) },
    clicks: [TAB.questions, "label.host-switch"],
  }),
  host({
    id: "host-questions-group-error",
    title: "HO-47 Grouping failed",
    fixtures: { ...live, ...fx(api.live.questions.organize, refuses("Something went wrong. Try again.")) },
    clicks: [TAB.questions, "label.host-switch"],
  }),
  host({
    id: "host-questions-tab-error",
    title: "SH-04 The Questions tab didn't load",
    expect: "error",
    fixtures: { ...live, ...fx(api.live.questions.forHost, fails()) },
    clicks: [TAB.questions],
  }),
];
