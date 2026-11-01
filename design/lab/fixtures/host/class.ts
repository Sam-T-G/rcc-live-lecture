// One made-up class for the host scenarios: "Data Structures 1" on a Thursday afternoon, 38
// students checked in, 10 teams (teams of 4 give eight teams of 4 and two of 3), three quizzes
// ended, 12 questions from students. Names are invented first names with a last initial.
import type { FunctionReturnType } from "convex/server";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { at } from "../../lib/types";

export const NOW = "2026-11-05T14:38:00-08:00";

type Slide = NonNullable<FunctionReturnType<typeof api.deck.current>>;
type Board = FunctionReturnType<typeof api.live.groups.leaderboard>;
type Roster = FunctionReturnType<typeof api.live.groups.roster>;
type Log = FunctionReturnType<typeof api.live.groups.pointLog>;
type Poll = NonNullable<FunctionReturnType<typeof api.checkin.quiz.current>>;
type Stats = NonNullable<FunctionReturnType<typeof api.checkin.quiz.stats>>;
type Missing = FunctionReturnType<typeof api.checkin.quiz.missing>;
type Questions = FunctionReturnType<typeof api.live.questions.forHost>;
type Draft = FunctionReturnType<typeof api.checkin.quiz.draftQuestion>;
type Classes = FunctionReturnType<typeof api.checkin.attendance.lectures>;

export const CHECKED_IN = 38;

// This class opened at 2:00 PM (start 2:00, 5 minutes' grace); Tuesday's class ended at 3:20 PM.
const DAY = 86_400_000;
const TUESDAY: Classes[number] = {
  lecture: "lab-lecture-7" as Id<"lectures">,
  open: false,
  startedAt: at(NOW, -38) - 2 * DAY,
  startsAt: at(NOW, -38) - 2 * DAY,
  graceMin: 5,
  endedAt: at(NOW, 42) - 2 * DAY,
  count: 36,
};
export const classes: Classes = [
  { lecture: "lab-lecture-8" as Id<"lectures">, open: true, startedAt: at(NOW, -38), startsAt: at(NOW, -38), graceMin: 5, endedAt: null, count: CHECKED_IN },
  TUESDAY,
];
// Before class: no class open yet, Tuesday's is the last one.
export const classesBefore: Classes = [TUESDAY];

export const slide: Slide = {
  index: 3,
  beat: 0,
  count: 12,
  title: "Stacks and queues",
  lines: ["A stack takes from the top: last in, first out.", "A queue takes from the front: first in, first out."],
  at: at(NOW, -2),
};

export const lostBySlide = [
  { index: 1, count: 1 },
  { index: 2, count: 4 },
  { index: 3, count: 3 },
];

// Team number to color, as convex/live/groups.ts describe() names them.
const COLORS = ["red", "blue", "yellow", "green", "orange", "purple", "pink", "teal", "brown", "gray"];
const teamInfo = (team: number) => ({ team, color: COLORS[team], label: COLORS[team][0].toUpperCase() + COLORS[team].slice(1) });

const NAMES = [
  "Pip", "Quill", "Wren", "Juniper", "Basil", "Marlo", "Tamsin", "Odie", "Fen", "Rook",
  "Sable", "Linden", "Bramble", "Kestrel", "Clover", "Ash", "Briar", "Hollis", "Ivo", "Juno",
  "Kit", "Lark", "Moss", "Nell", "Orrin", "Perrin", "Rue", "Sorrel", "Tansy", "Umber",
  "Vesper", "Wilder", "Yarrow", "Zinnia", "Ember", "Fable", "Gale", "Hazel",
];
const INITIALS = "ABCDEFGHJKLMNOPRSTW";

// Teams 0-7 have 4 students, teams 8 and 9 have 3: 38 in all.
const teamOfStudent = (i: number) => (i < 32 ? Math.floor(i / 4) : 8 + Math.floor((i - 32) / 3));
// Right answers out of 3 quizzes, a made-up spread.
const RIGHT = [3, 2, 3, 1, 2, 2, 3, 0, 1, 2, 2, 1, 3, 3, 2, 3, 0, 1, 2, 1, 2, 2, 1, 1, 3, 1, 0, 2, 1, 1, 2, 0, 2, 3, 1, 1, 0, 2];
// The professor's own changes: +1 for Juniper, -1 for Odie, +1 for team Pink.
const CHANGES: Record<number, number> = { 3: 1, 7: -1 };
const TEAM_CHANGES: Record<number, number> = { 6: 1 };
// Extra credit saved in earlier classes.
const SAVED: Record<number, number> = { 0: 5, 1: 5, 2: 5, 3: 5, 12: 3, 13: 3, 14: 3, 15: 3, 20: 1.5, 21: 1.5 };

export const roster: Roster = NAMES.map((n, i) => {
  const right = RIGHT[i];
  const changes = CHANGES[i] ?? 0;
  return {
    checkin: `lab-checkin-${i + 1}` as Id<"checkins">,
    name: `${n} ${INITIALS[i % INITIALS.length]}.`,
    email: `${n.toLowerCase()}@example.edu`,
    team: teamInfo(teamOfStudent(i)),
    right,
    answered: 3,
    changes,
    points: right + changes,
    ec: SAVED[i] ?? 0,
  };
}).sort((a, b) => b.points - a.points || b.right - a.right || a.name.localeCompare(b.name)); // as live.groups.roster sorts

// The board, best per student first; tied teams share a rank; 1st 5, 2nd 3, 3rd 1 extra credit.
function board(): Board["teams"] {
  const raw = COLORS.map((_, team) => {
    const kids = roster.filter((r) => r.team?.team === team);
    const correct = kids.reduce((s, r) => s + r.right, 0);
    const changes = kids.reduce((s, r) => s + r.changes, 0) + (TEAM_CHANGES[team] ?? 0);
    const points = correct + changes;
    return { ...teamInfo(team), members: kids.length, correct, changes, points, perStudent: points / kids.length };
  }).sort((a, b) => b.perStudent - a.perStudent);
  const EC = [5, 3, 1];
  return raw.map((g) => {
    const rank = raw.filter((x) => x.perStudent > g.perStudent).length + 1;
    const tied = raw.filter((x) => x.perStudent === g.perStudent).length;
    // Tied places split the extra credit of the places they cover.
    const share = Array.from({ length: tied }, (_, k) => EC[rank - 1 + k] ?? 0).reduce((s, n) => s + n, 0) / tied;
    return { ...g, rank, ec: share };
  });
}
export const leaderboard: Board = { questions: 3, teams: board() };

export const teamStatus: FunctionReturnType<typeof api.live.groups.status> = { size: 4, locked: false, locksAt: at(NOW, 3) };

export const pointLog: Log = [
  { id: "lab-points-3" as Id<"groupPoints">, at: at(NOW, -4), delta: 1, reason: "Helped the next table", team: teamInfo(6), name: null },
  { id: "lab-points-2" as Id<"groupPoints">, at: at(NOW, -9), delta: -1, reason: "Answer shouted out", team: teamInfo(1), name: "Odie H." },
  { id: "lab-points-1" as Id<"groupPoints">, at: at(NOW, -11), delta: 1, reason: "Found the off-by-one", team: teamInfo(0), name: "Juniper D." },
];

// ---------- Ask the room ----------

export const QUIZ_ID = "lab-poll-4" as Id<"polls">;
const QUIZ = {
  question: "Which structure hands back the oldest item first?",
  choices: ["Stack", "Queue", "Hash table", "Binary tree"],
  correct: 1,
};

export const quizOpen: Poll = { id: QUIZ_ID, kind: "quiz", question: QUIZ.question, choices: QUIZ.choices, open: true, answered: 14, results: null };
export const quizOpenStats: Stats = { counts: [3, 9, 1, 1], answered: 14, checkedIn: CHECKED_IN, correct: 1, rightPct: null, medianSec: null, index: 3, aiDraft: true };

export const quizEnded: Poll = { ...quizOpen, open: false, answered: 35, results: { counts: [7, 25, 2, 1], correct: 1 } };
export const quizEndedStats: Stats = { counts: [7, 25, 2, 1], answered: 35, checkedIn: CHECKED_IN, correct: 1, rightPct: 71, medianSec: 18, index: 3, aiDraft: true };

export const VOTE_QUESTION = "What should we cover next?";
export const voteOpen: Poll = {
  id: "lab-poll-5" as Id<"polls">,
  kind: "vote",
  question: VOTE_QUESTION,
  choices: ["Linked lists", "Hash tables", "Recursion"],
  open: true,
  answered: 21,
  results: null,
};
export const voteOpenStats: Stats = { counts: [6, 11, 4], answered: 21, checkedIn: CHECKED_IN, correct: null, rightPct: null, medianSec: null, index: 3, aiDraft: false };
export const voteEnded: Poll = { ...voteOpen, open: false, answered: 27, results: { counts: [8, 14, 5], correct: null } };
export const voteEndedStats: Stats = { counts: [8, 14, 5], answered: 27, checkedIn: CHECKED_IN, correct: null, rightPct: null, medianSec: 11, index: 3, aiDraft: false };

// The students who picked a wrong choice, in the order they answered.
function wrongOf(n: number) {
  const picks = [0, 0, 2, 0, 0, 3, 0, 0, 2, 0];
  return roster
    .filter((r) => r.right < 2)
    .slice(0, n)
    .map((r, k) => ({ name: r.name, team: r.team, picked: QUIZ.choices[picks[k % picks.length]] }));
}
const byTeam = COLORS.slice(0, 8).map((_, t) => ({ ...teamInfo(t), answered: 4, right: 3 }));

export const missingOpen: Missing = {
  kind: "quiz",
  poll: QUIZ_ID,
  question: QUIZ.question,
  choices: QUIZ.choices,
  correct: QUIZ.correct,
  open: true,
  answered: 14,
  counts: quizOpenStats.counts,
  byTeam,
  wrong: wrongOf(5),
};
export const missingEnded: Missing = { ...missingOpen, open: false, answered: 35, counts: quizEndedStats.counts, wrong: wrongOf(10) };
export const missingNobody: Missing = { ...missingOpen, answered: 6, counts: [0, 6, 0, 0], wrong: [] };
export const missingVote: Missing = { kind: "vote", poll: voteOpen.id, question: VOTE_QUESTION };

export const draft: Draft = {
  index: 3,
  question: "You push 1, 2, then 3 onto a stack. Which number comes off first?",
  choices: ["1", "2", "3", "It depends on the stack's size"],
  correct: 2,
};

export const aiNote =
  "Seven students picked Stack, so some still mix up which end each structure takes from. " +
  "Show the line at a coffee shop next to a pile of plates, and point to where each one takes the next item from.";

// ---------- Questions from students ----------

const q = (n: number, fields: Partial<Questions[number]> & { text: string; index: number }): Questions[number] => ({
  _id: `lab-question-${n}` as Id<"questions">,
  name: null,
  private: false,
  votes: 0,
  at: at(NOW, -40 + n * 3),
  topic: null,
  cluster: null,
  status: "new",
  answer: null,
  shared: false,
  ...fields,
});

// Newest first, as forHost returns them. 12 questions.
export const questions: Questions = [
  q(12, { text: "Is a deque a stack or a queue?", index: 3, votes: 6, name: "Rook S." }),
  q(11, { text: "Can I ask how the midterm is curved? I missed the email.", index: 3, private: true, name: "Tamsin D." }),
  q(10, { text: "What happens if you pop from an empty stack?", index: 3, votes: 4, status: "keep", answer: "Most languages throw an error. In Python, list.pop() on an empty list raises IndexError.", shared: true, name: "Fen J." }),
  q(9, { text: "Why is a queue first in first out again?", index: 3, votes: 3 }),
  q(8, { text: "Does the browser back button use a stack?", index: 2, votes: 5, name: "Clover A." }),
  q(7, { text: "Is there going to be a lab on this?", index: 2, status: "dismissed" }),
  q(6, { text: "How is a queue different from a list?", index: 2, votes: 2, name: "Hollis C." }),
  q(5, { text: "Which one is faster, stack or queue?", index: 2, votes: 1, status: "keep", answer: "Both add and remove in constant time. Pick by the order you need, not by speed." }),
  q(4, { text: "What does LIFO stand for?", index: 1, votes: 2, name: "Moss K." }),
  q(3, { text: "Can a stack be built from two queues?", index: 1, votes: 3 }),
  q(2, { text: "Slides are a bit small from the back row.", index: 1, votes: 7, name: "Gale F." }),
  q(1, { text: "Is a stack the same as the call stack?", index: 1, votes: 2, name: "Ivo J." }),
];

// The same questions after the professor pressed Keep on the three most upvoted ones that had no
// answer yet (statuses come from the server, so the lab shows them as saved).
const KEPT = new Set([2, 12, 8]);
export const questionsKept: Questions = questions.map((x) => (KEPT.has(Number(x._id.split("-").pop())) ? { ...x, status: "keep" as const } : x));

// The same questions after "Group by topic with AI": topics and clusters filled in.
const TOPICS: Record<number, { topic: string | null; cluster: string | null }> = {
  12: { topic: "Queues", cluster: "Deques" },
  11: { topic: null, cluster: null },
  10: { topic: "Stacks", cluster: "Empty stacks" },
  9: { topic: "Queues", cluster: "First in, first out" },
  8: { topic: "Stacks", cluster: "Stacks in real programs" },
  7: { topic: "Class logistics", cluster: null },
  6: { topic: "Queues", cluster: "First in, first out" },
  5: { topic: "Stacks", cluster: "Speed" },
  4: { topic: "Stacks", cluster: "Last in, first out" },
  3: { topic: "Queues", cluster: "Building one from the other" },
  2: { topic: "Class logistics", cluster: "Slides" },
  1: { topic: "Stacks", cluster: "Stacks in real programs" },
};
export const questionsGrouped: Questions = questions.map((x) => {
  const n = Number(x._id.split("-").pop());
  return { ...x, ...TOPICS[n] };
});
