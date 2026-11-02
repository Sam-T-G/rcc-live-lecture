// Phone screens: iPhone Safari, 390 x 844 and 320 wide. Routes: #/, #/checkin/student,
// #/checkin/join, #/live, #/portal. README.md says how to add a scenario. State ids (PH-, SH-)
// are the inventory's. Class data is in fixtures/phone/data.ts.
import { api } from "../../../convex/_generated/api";
import { at, fails, fx, hangs, refuses, type Fixtures, type Scenario } from "../lib/types";
import {
  NOW,
  board,
  boardNoQuiz,
  lateArrival,
  liveSlide,
  myTeam,
  noBoard,
  past,
  questions,
  questionsFor,
  quizEnded,
  quizOpen,
  shownUpTo,
  teamsForming,
  teamsLocked,
  voteEnded,
  voteOpen,
} from "../fixtures/phone/data";

const PASS = { code: "482913", name: "Pip Example", email: "pip@example.edu", at: at(NOW) };

// A signed-in student's pass page: pass up, not checked in, no late arrivals.
function passPage(more: Fixtures = {}): Fixtures {
  return {
    ...fx(api.checkin.pass.mine, PASS),
    ...fx(api.checkin.read.me, false),
    ...fx(api.checkin.attendance.myHideLate, false),
    ...fx(api.checkin.attendance.lateFeed, []),
    ...more,
  };
}

// #/live mid-class: slide 4 of 12 live, team Green, 8 teams, 3 past polls, 12 questions, no quiz.
function livePage(more: Fixtures = {}): Fixtures {
  return {
    ...fx(api.deck.current, liveSlide(3)),
    ...fx(api.deck.slides, shownUpTo(3)),
    ...fx(api.checkin.read.me, true),
    ...fx(api.live.read.mine, false),
    ...fx(api.live.groups.mine, myTeam),
    ...fx(api.live.groups.leaderboard, board),
    ...fx(api.live.groups.status, teamsLocked),
    ...fx(api.live.past.past, past),
    ...fx(api.live.questions.list, questionsFor(questions)),
    ...fx(api.checkin.quiz.current, null),
    ...fx(api.checkin.attendance.lateFeed, []),
    ...more,
  };
}

// #/portal: slide 6 of 12 live.
function portalPage(more: Fixtures = {}): Fixtures {
  return {
    ...fx(api.deck.current, liveSlide(5)),
    ...fx(api.deck.slides, shownUpTo(5)),
    ...fx(api.checkin.attendance.lateFeed, []),
    ...more,
  };
}

const late = [{ afterMs: 500, fixtures: fx(api.checkin.attendance.lateFeed, lateArrival) }];

// The cards beside the slide on #/live, for scrollTo: shots are one viewport tall.
const QUIZ_CARD = "section:has(> .quiz__q)";
const BOARD_CARD = "section.ph-board";
const PAST_CARD = 'section.panel:has-text("Past quizzes and votes")';
const QUESTIONS = "#live-questions";

type S = Omit<Scenario, "area" | "now">;
const list: S[] = [
  // ---------- #/ ----------
  { id: "phone-home", route: "", role: "signedout", title: "PH-01 Home: links for students, professors and builders", fixtures: {} },
  { id: "phone-not-found", route: "nowhere", role: "signedout", title: "SH-01 No page at #/nowhere", fixtures: {} },

  // ---------- #/checkin/student ----------
  { id: "phone-pass-signedout", route: "checkin/student", role: "signedout", title: "PH-10 Pass page before sign-in: Google's button", fixtures: {} },
  { id: "phone-join-signedout", route: "checkin/join", role: "signedout", title: "PH-10 #/checkin/join before sign-in (same page)", fixtures: {} },
  {
    id: "phone-pass-google-failed",
    route: "checkin/student",
    role: "signedout",
    title: "PH-10 + SH-05 Google's sign-in script didn't load",
    google: "failed",
    fixtures: {},
  },
  {
    id: "phone-pass-sign-in-failed",
    route: "checkin/student",
    role: "student",
    title: "PH-10 + SH-06 The server didn't accept the saved sign-in",
    signIn: "refused",
    fixtures: passPage(),
  },
  {
    id: "phone-pass-making",
    route: "checkin/student",
    role: "student",
    title: "PH-11 Making your pass (no pass yet)",
    expect: "loading",
    fixtures: passPage({ ...fx(api.checkin.pass.mine, null) }),
  },
  {
    id: "phone-pass-failed",
    route: "checkin/student",
    role: "student",
    title: "PH-12 Pass request failed before any pass",
    fixtures: passPage({ ...fx(api.checkin.pass.mine, null), ...fx(api.checkin.pass.refresh, fails("Lab: network down.")) }),
  },
  { id: "phone-pass-qr", route: "checkin/student", role: "student", title: "PH-13 Pass showing a fresh QR code", fixtures: passPage() },
  {
    id: "phone-pass-code-old",
    route: "checkin/student",
    role: "student",
    title: "PH-14 Code over 25 s old: Getting a new code",
    expect: "loading",
    fixtures: passPage(),
    // The page times the code by its own clock; no new code arrives, so it turns old at 25 s.
    tickMs: 26_500,
  },
  {
    id: "phone-pass-new-code",
    route: "checkin/student",
    role: "student",
    title: "PH-14 Asks for a new code stopped getting through: Getting a new code (comp phone-pass--new-code)",
    expect: "loading",
    fixtures: passPage({ ...fx(api.checkin.pass.refresh, hangs()) }),
    tickMs: 26_500,
  },
  {
    id: "phone-pass-refresh-error",
    route: "checkin/student",
    role: "student",
    title: "PH-15 Pass up with a refresh error under it",
    fixtures: passPage({ ...fx(api.checkin.pass.refresh, fails("Lab: network down.")) }),
  },
  {
    id: "phone-pass-hide-late-on",
    route: "checkin/student",
    role: "student",
    title: "PH-17 Pass with 'Don't show my first name' ticked",
    fixtures: passPage({ ...fx(api.checkin.attendance.myHideLate, true) }),
  },
  {
    id: "phone-pass-hide-late-error",
    route: "checkin/student",
    role: "student",
    title: "PH-17 Ticking 'Don't show my first name' failed",
    fixtures: passPage({ ...fx(api.checkin.attendance.setHideLate, fails("Lab: network down.")) }),
    clicks: ['label:has-text("Don’t show my first name") input'],
  },
  {
    id: "phone-pass-signed-out-by-server",
    route: "checkin/student",
    role: "student",
    title: "PH-18 Server says 'Sign in first.': back to the sign-in",
    fixtures: passPage({ ...fx(api.checkin.pass.mine, null), ...fx(api.checkin.pass.refresh, refuses("Sign in first.")) }),
  },
  { id: "phone-pass-late-banner", route: "checkin/student", role: "student", title: "SH-10 Pass with the late banner", fixtures: passPage(), later: late },
  {
    id: "phone-late-error",
    route: "checkin/student",
    role: "student",
    title: "PH-13 + SH-04 The late banner didn't load: its error row under the pass, clear of Not you? Sign out",
    expect: "error",
    fixtures: passPage({ ...fx(api.checkin.attendance.lateFeed, fails()) }),
  },
  {
    id: "phone-checkedin",
    route: "checkin/student",
    role: "student",
    title: "PH-16 Checked in, no question open",
    fixtures: passPage({ ...fx(api.checkin.read.me, true), ...fx(api.checkin.quiz.current, null) }),
  },
  {
    id: "phone-checkedin-quiz-open",
    route: "checkin/student",
    role: "student",
    title: "PH-16 + PH-43 Checked in, quiz open, no answer",
    fixtures: passPage({ ...fx(api.checkin.read.me, true), ...fx(api.checkin.quiz.current, quizOpen), ...fx(api.checkin.quiz.mine, null) }),
  },
  {
    id: "phone-checkedin-quiz-sent",
    route: "checkin/student",
    role: "student",
    title: "PH-16 + PH-44 Checked in, answer sent",
    fixtures: passPage({ ...fx(api.checkin.read.me, true), ...fx(api.checkin.quiz.current, quizOpen), ...fx(api.checkin.quiz.mine, 1) }),
  },
  {
    id: "phone-checkedin-results",
    route: "checkin/student",
    role: "student",
    title: "PH-16 + PH-46 Checked in, quiz results: right",
    fixtures: passPage({ ...fx(api.checkin.read.me, true), ...fx(api.checkin.quiz.current, quizEnded), ...fx(api.checkin.quiz.mine, 1) }),
  },
  {
    id: "phone-checkedin-late-banner",
    route: "checkin/student",
    role: "student",
    title: "SH-10 Checked in with the late banner",
    fixtures: passPage({ ...fx(api.checkin.read.me, true), ...fx(api.checkin.quiz.current, null) }),
    later: late,
  },

  // ---------- #/live ----------
  {
    id: "phone-live-loading",
    route: "live",
    role: "student",
    title: "PH-20 Loading the slides (every card loading)",
    expect: "loading",
    fixtures: {
      ...fx(api.checkin.read.me, true),
      ...fx(api.checkin.attendance.lateFeed, []),
      ...fx(api.deck.current, hangs()),
      ...fx(api.deck.slides, hangs()),
      ...fx(api.checkin.quiz.current, hangs()),
      ...fx(api.live.groups.mine, hangs()),
      ...fx(api.live.groups.leaderboard, hangs()),
      ...fx(api.live.groups.status, hangs()),
      ...fx(api.live.past.past, hangs()),
    },
  },
  {
    id: "phone-live-waiting",
    route: "live",
    role: "student",
    title: "PH-21 + PH-62 + PH-51 + PH-56 Before the slides start",
    expect: "empty",
    fixtures: livePage({
      ...fx(api.deck.current, null),
      ...fx(api.deck.slides, []),
      ...fx(api.live.groups.mine, null),
      ...fx(api.live.groups.leaderboard, noBoard),
      ...fx(api.live.groups.status, { size: 4 as const, locked: false as const, locksAt: null }),
      ...fx(api.live.past.past, []),
    }),
  },
  { id: "phone-live-slide", route: "live", role: "student", title: "PH-22 Live slide 4 of 12, checked in, on Green", fixtures: livePage() },
  {
    id: "phone-live-paged-back",
    route: "live",
    role: "student",
    title: "PH-23 Paged back to slide 3: Back to live",
    fixtures: livePage(),
    clicks: ['button:has-text("← Back")'],
  },
  {
    id: "phone-live-signedout",
    route: "live",
    role: "signedout",
    title: "PH-24 + PH-41 + PH-61 Signed out, quiz open",
    // checkin.read.me answers false to a signed-out caller.
    fixtures: livePage({
      ...fx(api.checkin.read.me, false),
      ...fx(api.live.groups.mine, null),
      ...fx(api.checkin.quiz.current, quizOpen),
      ...fx(api.checkin.quiz.mine, null),
    }),
  },
  {
    id: "phone-live-not-checked-in",
    route: "live",
    role: "student",
    title: "PH-25 + PH-42 Signed in, not checked in, quiz open",
    fixtures: livePage({
      ...fx(api.checkin.read.me, false),
      ...fx(api.live.groups.mine, null),
      ...fx(api.checkin.quiz.current, quizOpen),
      ...fx(api.checkin.quiz.mine, null),
    }),
  },
  { id: "phone-live-lost", route: "live", role: "student", title: "PH-27 Counted as lost on slide 4", fixtures: livePage({ ...fx(api.live.read.mine, true) }) },
  {
    id: "phone-live-lost-error",
    route: "live",
    role: "student",
    title: "PH-28 I'm lost tap failed",
    fixtures: livePage({ ...fx(api.live.lost.toggle, refuses("Check in first.")) }),
    clicks: ['button:has-text("I’m lost")'],
  },
  {
    id: "phone-live-quiz-open",
    route: "live",
    role: "student",
    title: "PH-43 Quiz open, four choices to tap",
    fixtures: livePage({ ...fx(api.checkin.quiz.current, quizOpen), ...fx(api.checkin.quiz.mine, null) }),
    scrollTo: QUIZ_CARD,
  },
  {
    id: "phone-quiz-sending",
    route: "live",
    role: "student",
    title: "PH-43 Tapped B, the answer is on its way (comp phone-quiz-sending)",
    fixtures: livePage({ ...fx(api.checkin.quiz.current, quizOpen), ...fx(api.checkin.quiz.mine, null), ...fx(api.checkin.quiz.answer, hangs()) }),
    clicks: ["button.quiz__pick >> nth=1"],
    scrollTo: QUIZ_CARD,
  },
  {
    id: "phone-live-quiz-sent",
    route: "live",
    role: "student",
    title: "PH-44 Answer sent (picked B)",
    fixtures: livePage({ ...fx(api.checkin.quiz.current, quizOpen), ...fx(api.checkin.quiz.mine, 1) }),
    scrollTo: QUIZ_CARD,
  },
  {
    id: "phone-live-quiz-error",
    route: "live",
    role: "student",
    title: "PH-48 Answer refused: question ended",
    fixtures: livePage({
      ...fx(api.checkin.quiz.current, quizOpen),
      ...fx(api.checkin.quiz.mine, null),
      ...fx(api.checkin.quiz.answer, refuses("The professor ended this quiz.")),
    }),
    clicks: ["button.quiz__pick >> nth=1"],
    scrollTo: QUIZ_CARD,
  },
  {
    id: "phone-live-vote-picked",
    route: "live",
    role: "student",
    title: "PH-45 Vote open, picked B",
    fixtures: livePage({ ...fx(api.checkin.quiz.current, voteOpen), ...fx(api.checkin.quiz.mine, 1) }),
    scrollTo: QUIZ_CARD,
  },
  {
    id: "phone-live-results-right",
    route: "live",
    role: "student",
    title: "PH-46 Quiz results: You got it right",
    fixtures: livePage({ ...fx(api.checkin.quiz.current, quizEnded), ...fx(api.checkin.quiz.mine, 1) }),
    scrollTo: QUIZ_CARD,
  },
  {
    id: "phone-live-results-wrong",
    route: "live",
    role: "student",
    title: "PH-46 Quiz results: Not this time",
    fixtures: livePage({ ...fx(api.checkin.quiz.current, quizEnded), ...fx(api.checkin.quiz.mine, 0) }),
    scrollTo: QUIZ_CARD,
  },
  {
    id: "phone-live-vote-results",
    route: "live",
    role: "student",
    title: "PH-47 The room voted",
    fixtures: livePage({ ...fx(api.checkin.quiz.current, voteEnded), ...fx(api.checkin.quiz.mine, 1) }),
    scrollTo: QUIZ_CARD,
  },
  {
    id: "phone-live-cards-loading",
    route: "live",
    role: "student",
    title: "PH-50 + PH-55 + PH-65 Side cards loading under a live slide (whole page)",
    expect: "loading",
    fixtures: livePage({
      ...fx(api.live.groups.leaderboard, hangs()),
      ...fx(api.live.past.past, hangs()),
      ...fx(api.live.questions.list, hangs()),
    }),
    fullPage: true,
    // A whole-page shot draws the sticky action bar where the first screen ends, over the cards.
    // Here it sits at the page's end, where it comes to rest on a phone.
    setup: (w) => {
      const style = w.document.createElement("style");
      style.textContent = ".ph .ph-actions { position: static; }";
      w.document.head.append(style);
    },
  },
  {
    id: "phone-live-teams-forming",
    route: "live",
    role: "student",
    title: "PH-54 Teams still forming, no quiz ended yet",
    fixtures: livePage({
      ...fx(api.live.groups.leaderboard, boardNoQuiz),
      ...fx(api.live.groups.status, teamsForming),
      ...fx(api.live.groups.mine, { team: 3, color: "green", label: "Green" }),
      ...fx(api.live.past.past, []),
    }),
    scrollTo: BOARD_CARD,
  },
  {
    id: "phone-live-all-teams",
    route: "live",
    role: "student",
    title: "PH-53 All 8 teams opened",
    fixtures: livePage(),
    clicks: ['summary:has-text("All 8 teams")'],
    scrollTo: BOARD_CARD,
  },
  {
    id: "phone-live-past-open",
    route: "live",
    role: "student",
    title: "PH-57 A past quiz opened",
    fixtures: livePage(),
    clicks: ['summary:has-text("Where should a fetch start")'],
    scrollTo: PAST_CARD,
  },
  {
    id: "phone-live-questions-all",
    route: "live",
    role: "student",
    title: "PH-60 + PH-67 Questions on all slides",
    fixtures: livePage(),
    clicks: ['label.seg__option:has-text("All slides")'],
    scrollTo: QUESTIONS,
  },
  {
    id: "phone-live-questions-empty",
    route: "live",
    role: "student",
    title: "PH-66 No questions yet on this slide",
    expect: "empty",
    fixtures: livePage({ ...fx(api.live.questions.list, []) }),
    scrollTo: QUESTIONS,
  },
  {
    id: "phone-live-post-error",
    route: "live",
    role: "student",
    title: "PH-63 + PH-64 Post refused: wait before posting again",
    fixtures: livePage({ ...fx(api.live.questions.ask, refuses("Wait 5 seconds before posting again.")) }),
    type: [{ label: "Your question or comment", text: "Does the cleanup run before the next effect?", submit: `${QUESTIONS} button[type="submit"]` }],
    scrollTo: `${QUESTIONS} form.live-ask`,
  },
  {
    id: "phone-live-upvote-error",
    route: "live",
    role: "student",
    title: "PH-68 Upvote failed under its question",
    fixtures: livePage({ ...fx(api.live.questions.vote, refuses("That question is gone.")) }),
    clicks: [`${QUESTIONS} button:has-text("▲") >> nth=1`],
    scrollTo: `${QUESTIONS} li.q >> nth=1`,
  },
  {
    id: "phone-live-card-error",
    route: "live",
    role: "student",
    title: "SH-04 Questions card failed; the slide stays up",
    expect: "error",
    fixtures: livePage({ ...fx(api.live.questions.list, fails()) }),
    scrollTo: QUESTIONS,
  },
  {
    id: "phone-live-page-error",
    route: "live",
    role: "student",
    title: "SH-03 Whole page failed: Something went wrong",
    expect: "error",
    fixtures: livePage({ ...fx(api.deck.current, fails()) }),
  },
  { id: "phone-live-late-banner", route: "live", role: "student", title: "SH-10 Live slide with the late banner", fixtures: livePage(), later: late },
  { id: "phone-live-not-found", route: "live/nowhere", role: "student", title: "SH-02 No page at #/live/nowhere", fixtures: {} },

  // ---------- #/portal ----------
  {
    id: "phone-portal-loading",
    route: "portal",
    role: "signedout",
    title: "PH-70 Slides only: loading",
    expect: "loading",
    fixtures: { ...fx(api.checkin.attendance.lateFeed, []), ...fx(api.deck.current, hangs()), ...fx(api.deck.slides, hangs()) },
  },
  {
    id: "phone-portal-waiting",
    route: "portal",
    role: "signedout",
    title: "PH-71 Slides only: waiting for the slides",
    expect: "empty",
    fixtures: portalPage({ ...fx(api.deck.current, null), ...fx(api.deck.slides, []) }),
  },
  { id: "phone-portal-live", route: "portal", role: "signedout", title: "PH-72 Slides only: live slide 6 of 12", fixtures: portalPage() },
  {
    id: "phone-portal-paged-back",
    route: "portal",
    role: "signedout",
    title: "PH-73 Slides only: paged back, Back to live in the bar",
    fixtures: portalPage(),
    clicks: ['button:has-text("← Back")'],
  },
  {
    id: "phone-portal-moved-on",
    route: "portal",
    role: "signedout",
    title: "PH-74 Slides only: paged back, professor moved on",
    fixtures: portalPage(),
    clicks: ['button:has-text("← Back")'],
    // After the click: the professor goes to slide 7.
    later: [{ afterMs: 3000, fixtures: { ...fx(api.deck.current, liveSlide(6)), ...fx(api.deck.slides, shownUpTo(6)) } }],
  },
  { id: "phone-portal-late-banner", route: "portal", role: "signedout", title: "PH-75 Slides only with the late banner", fixtures: portalPage(), later: late },
  {
    id: "phone-portal-error",
    route: "portal",
    role: "signedout",
    title: "SH-03 Slides only: the page failed",
    expect: "error",
    fixtures: portalPage({ ...fx(api.deck.current, fails()) }),
  },
];

export const scenarios: Scenario[] = list.map((s) => ({ ...s, area: "phone", now: NOW }));
