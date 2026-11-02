// Projector screens: 1920 x 1080, read from the back of a lecture hall. Routes: #/checkin/stage,
// #/live/leaderboard, the late banner. README.md says how to add a scenario.
// One scenario per state in design/system/INVENTORY.md section 4 (PR-01 to PR-30). The class is made up: 38
// students checked in, 8 teams, 12 questions so far.
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { at, fails, fx, hangs, type Fixtures, type Scenario } from "../lib/types";

const NOW = "2026-11-05T10:14:00-08:00";
const DECK = "checkin/stage?deck={origin}/fake-deck.html";

type Team = { team: number; color: string; label: string; members: number; correct: number; changes: number; rank: number; ec: number };
const team = (t: Team) => ({ ...t, points: t.correct + t.changes, perStudent: (t.correct + t.changes) / t.members });

// A team as convex/live/groups.ts names it: team n gets COLORS[n % 12].
const COLORS = ["red", "blue", "yellow", "green", "orange", "purple", "pink", "teal", "brown", "gray", "navy", "lime"];
const named = (n: number, members: number, correct: number, rank: number, ec: number, changes = 0) => {
  const color = COLORS[n % COLORS.length];
  return team({ team: n, color, label: color[0].toUpperCase() + color.slice(1), members, correct, changes, rank, ec });
};

// 38 students in 8 teams (six of 5, two of 4) after 12 questions.
const EIGHT = [
  named(1, 5, 51, 1, 5),
  named(3, 5, 47, 2, 3),
  named(0, 5, 44, 3, 1),
  named(5, 4, 34, 4, 0, 1),
  named(2, 5, 41, 5, 0),
  named(4, 5, 39, 6, 0),
  named(7, 4, 30, 7, 0),
  named(6, 5, 33, 8, 0),
];

// 38 students in 13 teams of 3 (the last has 2), so the board shows 10 and "Plus 3 more teams".
const THIRTEEN = Array.from({ length: 13 }, (_, i) => {
  const members = i === 12 ? 2 : 3;
  const correct = Math.max(4, 33 - i * 2) - (i === 12 ? 10 : 0);
  return named(i, members, correct, i + 1, i === 0 ? 5 : i === 1 ? 3 : i === 2 ? 1 : 0);
});

const pollId = (n: number) => `lab-poll-${n}` as Id<"polls">;

const QUIZ_OPEN = fx(api.checkin.quiz.current, {
  id: pollId(12),
  kind: "quiz",
  question: "Which hook runs after every render by default?",
  choices: ["useMemo", "useEffect", "useRef", "useId"],
  open: true,
  answered: 17,
  results: null,
});

// A question and choices as long as a professor might type them (DCHK-1: a 126-character question).
const LONG_Q =
  "When a component's state changes and React renders it again, which hook runs its callback after the screen updates by default?";
const LONG_CHOICES = [
  "useMemo, which keeps a computed value between renders until its inputs change",
  "useEffect, which runs after the browser paints, once per render unless its list of inputs stays the same",
  "useRef, which holds a value that survives renders without causing one",
  "useId, which makes an id that matches on the server and in the browser",
];

// Stage fixtures for a class in progress: 38 checked in, no question open, nobody late yet.
const stage = (extra: Fixtures = {}): Fixtures => ({
  ...fx(api.checkin.read.count, 38),
  ...fx(api.checkin.quiz.current, null),
  ...fx(api.checkin.attendance.lateFeed, []),
  ...extra,
});

const board = (teams: ReturnType<typeof team>[], questions = 12, extra: Fixtures = {}): Fixtures => ({
  ...fx(api.live.groups.leaderboard, { questions, teams }),
  ...fx(api.live.groups.status, { size: 4, locked: true, locksAt: null }),
  ...fx(api.live.groups.mine, null),
  ...fx(api.checkin.attendance.lateFeed, []),
  ...extra,
});

// Late arrivals scanned just now. The banner shows only arrivals scanned after the page opened
// (newArrivals in src/teams/checkin/late.ts), so each row is stamped with the page's clock when
// the feed is read.
const arrived =
  (...rows: [id: string, first: string, lateMin: number][]) =>
  () =>
    rows.map(([id, first, lateMin]) => ({ id: id as Id<"checkins">, first, lateMin, at: Date.now() }));

export const scenarios: Scenario[] = [
  // ---- #/checkin/stage ----
  {
    id: "projector-stage-no-deck",
    area: "projector",
    route: "checkin/stage",
    role: "signedout",
    title: "PR-01 Stage with no ?deck= in the link",
    now: NOW,
    fixtures: stage(),
  },
  {
    id: "projector-stage-bad-deck",
    area: "projector",
    route: "checkin/stage?deck=decks/week9/",
    role: "signedout",
    title: "PR-02 Stage with a deck link that can't load",
    now: NOW,
    fixtures: stage(),
  },
  {
    id: "projector-stage-count-loading",
    area: "projector",
    route: DECK,
    role: "signedout",
    title: "PR-03 Stage card, count still loading, no question open",
    expect: "loading",
    now: NOW,
    fixtures: stage(fx(api.checkin.read.count, hangs())),
  },
  {
    id: "projector-stage-count",
    area: "projector",
    route: DECK,
    role: "signedout",
    title: "PR-04 Stage card with 38 checked in, no question open",
    now: NOW,
    fixtures: stage(),
  },
  {
    id: "projector-stage-quiz-open",
    area: "projector",
    // The deck is a local stand-in page (public/fake-deck.html).
    route: DECK,
    role: "signedout",
    title: "PR-05 Stage with the check-in card and an open quiz",
    now: NOW,
    fixtures: {
      ...fx(api.checkin.read.count, 23),
      ...QUIZ_OPEN,
      ...fx(api.checkin.attendance.lateFeed, []),
    },
  },
  {
    id: "projector-stage-quiz-open-empty",
    area: "projector",
    route: DECK,
    role: "signedout",
    title: "PR-05 Quiz just opened: 0 answered (comp projector-stage-quiz-open--empty)",
    now: NOW,
    fixtures: stage(
      fx(api.checkin.quiz.current, {
        id: pollId(12),
        kind: "quiz",
        question: "Which hook runs after every render by default?",
        choices: ["useMemo", "useEffect", "useRef", "useId"],
        open: true,
        answered: 0,
        results: null,
      }),
    ),
  },
  {
    id: "projector-stage-quiz-ended-none",
    area: "projector",
    route: DECK,
    role: "signedout",
    title: "PR-06 Quiz ended with no answers: empty bars (comp projector-stage-quiz-ended--none)",
    now: NOW,
    fixtures: stage(
      fx(api.checkin.quiz.current, {
        id: pollId(12),
        kind: "quiz",
        question: "Which hook runs after every render by default?",
        choices: ["useMemo", "useEffect", "useRef", "useId"],
        open: false,
        answered: 0,
        results: { counts: [0, 0, 0, 0], correct: 1 },
      }),
    ),
  },
  {
    id: "projector-stage-quiz-ended",
    area: "projector",
    route: DECK,
    role: "signedout",
    title: "PR-06 Stage card after the quiz ended: bars with the right answer marked",
    now: NOW,
    fixtures: stage(
      fx(api.checkin.quiz.current, {
        id: pollId(12),
        kind: "quiz",
        question: "Which hook runs after every render by default?",
        choices: ["useMemo", "useEffect", "useRef", "useId"],
        open: false,
        answered: 36,
        results: { counts: [7, 22, 5, 2], correct: 1 },
      }),
    ),
  },
  {
    // MOTION.md results-reveal: the professor ends the open question while the stage is up. The
    // shot is the end state; the motion check plays the change from the scenario's `later` step.
    id: "projector-stage-quiz-reveal",
    area: "projector",
    route: DECK,
    role: "signedout",
    title: "Stage as the professor ends the open quiz (results-reveal)",
    now: NOW,
    fixtures: stage(
      fx(api.checkin.quiz.current, {
        id: pollId(12),
        kind: "quiz",
        question: "Which hook runs after every render by default?",
        choices: ["useMemo", "useEffect", "useRef", "useId"],
        open: true,
        answered: 36,
        results: null,
      }),
    ),
    later: [
      {
        afterMs: 800,
        fixtures: fx(api.checkin.quiz.current, {
          id: pollId(12),
          kind: "quiz",
          question: "Which hook runs after every render by default?",
          choices: ["useMemo", "useEffect", "useRef", "useId"],
          open: false,
          answered: 36,
          results: { counts: [7, 22, 5, 2], correct: 1 },
        }),
      },
    ],
  },
  {
    // IT1-PROJECTOR-check-2: a two-digit count with wide digits keeps "checked in" on its baseline.
    id: "projector-stage-quiz-ended-forty",
    area: "projector",
    route: DECK,
    role: "signedout",
    title: "PR-06 Stage card with 40 checked in after the quiz ended",
    now: NOW,
    fixtures: stage({
      ...fx(api.checkin.read.count, 40),
      ...fx(api.checkin.quiz.current, {
        id: pollId(12),
        kind: "quiz",
        question: "Which hook runs after every render by default?",
        choices: ["useMemo", "useEffect", "useRef", "useId"],
        open: false,
        answered: 36,
        results: { counts: [7, 22, 5, 2], correct: 1 },
      }),
    }),
  },
  {
    // IT1-PROJECTOR-risk-1: two arrivals inside 8 s while the ended quiz stays up; both names show.
    id: "projector-stage-quiz-ended-late-two",
    area: "projector",
    route: DECK,
    role: "signedout",
    title: "PR-09 Stage with the ended quiz up and two late arrivals at once",
    now: NOW,
    fixtures: stage(
      fx(api.checkin.quiz.current, {
        id: pollId(12),
        kind: "quiz",
        question: "Which hook runs after every render by default?",
        choices: ["useMemo", "useEffect", "useRef", "useId"],
        open: false,
        answered: 36,
        results: { counts: [7, 22, 5, 2], correct: 1 },
      }),
    ),
    later: [{ afterMs: 600, fixtures: fx(api.checkin.attendance.lateFeed, arrived(["lab-late-2", "Quill", 6], ["lab-late-3", "Juniper", 7])) }],
  },
  {
    id: "projector-stage-vote-ended",
    area: "projector",
    route: DECK,
    role: "signedout",
    title: "PR-06 Stage card after a vote ended: bars with no right answer",
    now: NOW,
    fixtures: stage(
      fx(api.checkin.quiz.current, {
        id: pollId(11),
        kind: "vote",
        question: "Which topic should we review on Thursday?",
        choices: ["Closures", "Promises", "React state"],
        open: false,
        answered: 34,
        results: { counts: [9, 16, 9], correct: null },
      }),
    ),
  },
  {
    id: "projector-stage-card-hidden",
    area: "projector",
    route: DECK,
    role: "signedout",
    title: "PR-07 Stage with the card hidden: Show check-in button",
    now: NOW,
    fixtures: stage(),
    clicks: ['button[aria-label="Hide check-in"]'],
  },
  {
    id: "projector-stage-bridge-lost",
    area: "projector",
    route: `${DECK}&bridge=saved`,
    role: "signedout",
    title: "PR-08 Stage opened from a ?bridge=saved link in a new tab",
    now: NOW,
    fixtures: stage(),
  },
  {
    id: "projector-stage-late",
    area: "projector",
    route: DECK,
    role: "signedout",
    title: "PR-09 Stage with one late arrival on the banner",
    now: NOW,
    fixtures: stage(),
    later: [{ afterMs: 600, fixtures: fx(api.checkin.attendance.lateFeed, arrived(["lab-late-1", "Wren", 4])) }],
  },
  {
    id: "projector-stage-late-several",
    area: "projector",
    route: DECK,
    role: "signedout",
    title: "PR-09 Stage with three late arrivals stacked, quiz open",
    now: NOW,
    fixtures: stage(QUIZ_OPEN),
    later: [
      {
        afterMs: 600,
        fixtures: fx(
          api.checkin.attendance.lateFeed,
          arrived(["lab-late-2", "Quill", 6], ["lab-late-3", "Juniper", 7], ["lab-late-4", "Pip", 9]),
        ),
      },
    ],
  },
  {
    id: "projector-stage-count-hundreds",
    area: "projector",
    route: DECK,
    role: "signedout",
    title: "PR-04 Stage card with a three-digit count: 128 checked in, the card keeps its box",
    now: NOW,
    fixtures: stage(fx(api.checkin.read.count, 128)),
  },
  {
    id: "projector-stage-quiz-long",
    area: "projector",
    route: DECK,
    role: "signedout",
    title: "PR-05 Open quiz with a 126-character question and four long choices (DCHK-1)",
    now: NOW,
    fixtures: stage(
      fx(api.checkin.quiz.current, {
        id: pollId(13),
        kind: "quiz",
        question: LONG_Q,
        choices: LONG_CHOICES,
        open: true,
        answered: 9,
        results: null,
      }),
    ),
  },
  {
    id: "projector-stage-quiz-ended-long",
    area: "projector",
    route: DECK,
    role: "signedout",
    title: "PR-06 The same long quiz ended: the panel stays in the frame (DCHK-1)",
    now: NOW,
    fixtures: stage(
      fx(api.checkin.quiz.current, {
        id: pollId(13),
        kind: "quiz",
        question: LONG_Q,
        choices: LONG_CHOICES,
        open: false,
        answered: 31,
        results: { counts: [4, 19, 6, 2], correct: 1 },
      }),
    ),
  },
  {
    id: "projector-stage-count-error",
    area: "projector",
    route: DECK,
    role: "signedout",
    title: "PR-10 Stage card where the check-in count failed to load",
    expect: "error",
    now: NOW,
    fixtures: stage(fx(api.checkin.read.count, fails())),
  },
  {
    id: "projector-stage-quiz-error",
    area: "projector",
    route: DECK,
    role: "signedout",
    title: "PR-10 Stage card where the quiz failed to load",
    expect: "error",
    now: NOW,
    fixtures: stage(fx(api.checkin.quiz.current, fails())),
  },

  // ---- #/live/leaderboard ----
  {
    id: "projector-leaderboard-loading",
    area: "projector",
    route: "live/leaderboard",
    role: "signedout",
    title: "PR-20 Team leaderboard while the scores load",
    expect: "loading",
    now: NOW,
    fixtures: board([], 12, fx(api.live.groups.leaderboard, hangs())),
  },
  {
    id: "projector-leaderboard-empty",
    area: "projector",
    route: "live/leaderboard",
    role: "signedout",
    title: "PR-21 Team leaderboard before any team exists",
    expect: "empty",
    now: NOW,
    fixtures: board([], 0, fx(api.live.groups.status, { size: 4, locked: false, locksAt: null })),
  },
  {
    id: "projector-leaderboard-forming",
    area: "projector",
    route: "live/leaderboard",
    role: "signedout",
    title: "PR-22 Teams still forming, no quiz ended yet",
    now: NOW,
    fixtures: board(
      [named(0, 5, 0, 1, 3), named(1, 4, 0, 1, 3), named(2, 4, 0, 1, 3)],
      0,
      fx(api.live.groups.status, { size: 4, locked: false, locksAt: at(NOW, 3) }),
    ),
  },
  {
    id: "projector-leaderboard-five",
    area: "projector",
    route: "live/leaderboard",
    role: "signedout",
    title: "PR-22 Team leaderboard, five teams after two quizzes",
    now: NOW,
    fixtures: {
      ...fx(api.live.groups.leaderboard, {
        questions: 2,
        teams: [
          team({ team: 2, color: "blue", label: "Blue", members: 4, correct: 7, changes: 0, rank: 1, ec: 5 }),
          team({ team: 1, color: "red", label: "Red", members: 4, correct: 6, changes: 0, rank: 2, ec: 3 }),
          team({ team: 4, color: "green", label: "Green", members: 3, correct: 4, changes: 0, rank: 3, ec: 1 }),
          team({ team: 3, color: "yellow", label: "Yellow", members: 4, correct: 4, changes: 0, rank: 4, ec: 0 }),
          team({ team: 5, color: "orange", label: "Orange", members: 3, correct: 2, changes: 0, rank: 5, ec: 0 }),
        ],
      }),
      ...fx(api.live.groups.status, { size: 4, locked: true, locksAt: null }),
      ...fx(api.live.groups.mine, null),
      ...fx(api.checkin.attendance.lateFeed, []),
    },
  },
  {
    // MOTION.md board-reorder: after quiz 3, Green passes Red (6 right on 3 students, 2.0 per student).
    // The shot is the end state; the motion check plays the change from the scenario's `later` step.
    id: "projector-leaderboard-reorder",
    area: "projector",
    route: "live/leaderboard",
    role: "signedout",
    title: "Team leaderboard after a quiz moves Green from 3rd to 2nd (board-reorder)",
    now: NOW,
    fixtures: board([
      team({ team: 2, color: "blue", label: "Blue", members: 4, correct: 7, changes: 0, rank: 1, ec: 5 }),
      team({ team: 1, color: "red", label: "Red", members: 4, correct: 6, changes: 0, rank: 2, ec: 3 }),
      team({ team: 4, color: "green", label: "Green", members: 3, correct: 4, changes: 0, rank: 3, ec: 1 }),
      team({ team: 3, color: "yellow", label: "Yellow", members: 4, correct: 4, changes: 0, rank: 4, ec: 0 }),
      team({ team: 5, color: "orange", label: "Orange", members: 3, correct: 2, changes: 0, rank: 5, ec: 0 }),
    ], 2),
    later: [
      {
        afterMs: 800,
        fixtures: fx(api.live.groups.leaderboard, {
          questions: 3,
          teams: [
            team({ team: 2, color: "blue", label: "Blue", members: 4, correct: 9, changes: 0, rank: 1, ec: 5 }),
            team({ team: 4, color: "green", label: "Green", members: 3, correct: 6, changes: 0, rank: 2, ec: 3 }),
            team({ team: 1, color: "red", label: "Red", members: 4, correct: 7, changes: 0, rank: 3, ec: 1 }),
            team({ team: 3, color: "yellow", label: "Yellow", members: 4, correct: 5, changes: 0, rank: 4, ec: 0 }),
            team({ team: 5, color: "orange", label: "Orange", members: 3, correct: 2, changes: 0, rank: 5, ec: 0 }),
          ],
        }),
      },
    ],
  },
  {
    id: "projector-leaderboard-eight",
    area: "projector",
    route: "live/leaderboard",
    role: "signedout",
    title: "PR-23 Team leaderboard, 8 teams of 38 students after 12 questions",
    now: NOW,
    fixtures: board(EIGHT),
  },
  {
    id: "projector-leaderboard-thirteen",
    area: "projector",
    route: "live/leaderboard",
    role: "signedout",
    title: "PR-24 Team leaderboard, 13 teams: top 10 and Plus 3 more teams",
    now: NOW,
    fixtures: board(THIRTEEN),
  },
  {
    id: "projector-leaderboard-late",
    area: "projector",
    route: "live/leaderboard",
    role: "signedout",
    title: "PR-25 Team leaderboard with a late arrival on the banner",
    now: NOW,
    fixtures: board(EIGHT),
    later: [{ afterMs: 600, fixtures: fx(api.checkin.attendance.lateFeed, arrived(["lab-late-5", "Marlo", 11])) }],
  },
  {
    // IT1-PROJECTOR-check-1: two arrivals inside 8 s on the 8-team board; the strips never cover a row.
    id: "projector-leaderboard-late-two",
    area: "projector",
    route: "live/leaderboard",
    role: "signedout",
    title: "PR-25 Team leaderboard, 8 teams, two late arrivals at once",
    now: NOW,
    fixtures: board(EIGHT),
    later: [{ afterMs: 600, fixtures: fx(api.checkin.attendance.lateFeed, arrived(["lab-late-6", "Quill", 6], ["lab-late-7", "Juniper", 7])) }],
  },
  {
    id: "projector-leaderboard-five-late-two",
    area: "projector",
    route: "live/leaderboard",
    role: "signedout",
    title: "PR-25 Team leaderboard, 5 teams, two late arrivals at once",
    now: NOW,
    fixtures: board(EIGHT.slice(0, 5), 12),
    later: [{ afterMs: 600, fixtures: fx(api.checkin.attendance.lateFeed, arrived(["lab-late-6", "Quill", 6], ["lab-late-7", "Juniper", 7])) }],
  },
  {
    id: "projector-leaderboard-thirteen-late",
    area: "projector",
    route: "live/leaderboard",
    role: "signedout",
    title: "PR-25 Team leaderboard, 13 teams, one late arrival",
    now: NOW,
    fixtures: board(THIRTEEN),
    later: [{ afterMs: 600, fixtures: fx(api.checkin.attendance.lateFeed, arrived(["lab-late-5", "Marlo", 11])) }],
  },
  {
    id: "projector-leaderboard-thirteen-late-two",
    area: "projector",
    route: "live/leaderboard",
    role: "signedout",
    title: "PR-25 Team leaderboard, 13 teams, two late arrivals at once",
    now: NOW,
    fixtures: board(THIRTEEN),
    later: [{ afterMs: 600, fixtures: fx(api.checkin.attendance.lateFeed, arrived(["lab-late-6", "Quill", 6], ["lab-late-7", "Juniper", 7])) }],
  },
  {
    // IT1-PROJECTOR-check-3: on the two-column board Green passes Orange; the moved-row ring
    // clears the numbers line's descenders. The shot is the end state.
    id: "projector-leaderboard-eight-reorder",
    area: "projector",
    route: "live/leaderboard",
    role: "signedout",
    title: "Team leaderboard, 8 teams, after a quiz moves Green to 1st and Purple to 3rd (board-reorder)",
    now: NOW,
    fixtures: board(EIGHT),
    later: [
      {
        afterMs: 800,
        fixtures: fx(api.live.groups.leaderboard, {
          questions: 13,
          teams: [
            team({ ...EIGHT[1], correct: 53, rank: 1, ec: 5 }),
            team({ ...EIGHT[0], rank: 2, ec: 3 }),
            team({ ...EIGHT[3], correct: 36, rank: 3, ec: 1 }),
            team({ ...EIGHT[2], rank: 4, ec: 0 }),
            ...EIGHT.slice(4),
          ],
        }),
      },
    ],
  },
  {
    id: "projector-leaderboard-error",
    area: "projector",
    route: "live/leaderboard",
    role: "signedout",
    title: "Team leaderboard where the scores failed to load",
    expect: "error",
    now: NOW,
    fixtures: board(EIGHT, 12, fx(api.live.groups.leaderboard, fails())),
  },

  // ---- #/ui/projector sample ----
  {
    id: "projector-ui-sample",
    area: "projector",
    route: "ui/projector",
    role: "signedout",
    title: "PR-30 UI kit projector sample, light",
    now: NOW,
    fixtures: {},
  },
  {
    id: "projector-ui-sample-dark",
    area: "projector",
    route: "ui/projector/dark",
    role: "signedout",
    title: "PR-30 UI kit projector sample, dark",
    now: NOW,
    fixtures: {},
  },
];
