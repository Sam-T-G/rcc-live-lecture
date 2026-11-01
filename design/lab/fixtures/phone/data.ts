// Fake class data for the phone scenarios: a made-up 38-student class ("Intro to Web Apps",
// CS 101 at an example college) on its 12-slide deck, 32 students checked in on 8 teams of 4.
// Names are made up. Times are minutes from the scenario clock (NOW). Server refusals use
// refuses() from lib/types.ts.
import type { FunctionReturnType } from "convex/server";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { at } from "../../lib/types";

export const NOW = "2026-11-05T10:14:00-08:00";

type Slide = { title: string; lines: string[] };
const DECK: Slide[] = [
  { title: "Intro to Web Apps: Week 10", lines: ["State and effects in React", "Quiz at the end of the hour"] },
  { title: "What state is", lines: ["Data a component remembers between renders", "Changing it re-renders the component"] },
  { title: "useState", lines: ["const [count, setCount] = useState(0)", "setCount schedules a new render", "Never change state in place"] },
  { title: "Effects", lines: ["useEffect runs after the screen updates", "Use it to sync with something outside React", "Return a function to clean up"] },
  { title: "The dependency array", lines: ["No array: runs after every render", "[]: runs once after the first render", "[id]: runs when id changes"] },
  { title: "A fetch in an effect", lines: ["Start the request in the effect", "Ignore the answer if the component left", "Show a loading line meanwhile"] },
  { title: "Lifting state up", lines: ["Two components need the same data", "Move the state to their closest parent", "Pass it down as props"] },
  { title: "Derived values", lines: ["Compute from state during render", "Don't copy props into state"] },
  { title: "Keys in lists", lines: ["A key tells React which item is which", "Use an id, not the array position"] },
  { title: "Forms", lines: ["Controlled inputs keep their value in state", "onSubmit gets the whole form"] },
  { title: "Debugging renders", lines: ["React DevTools shows each render", "Log in the effect, not in render"] },
  { title: "Before Thursday", lines: ["Lab 6 is due Thursday at 11:59 PM", "Read chapter 8"] },
];
export const COUNT = DECK.length;

type Current = NonNullable<FunctionReturnType<typeof api.deck.current>>;
type Shown = FunctionReturnType<typeof api.deck.slides>;

// The live slide (index is 0-based: index 3 is "Slide 4 of 12").
export function liveSlide(index: number, minutesAgo = 1): Current {
  return { index, beat: 0, count: COUNT, ...DECK[index], at: at(NOW, -minutesAgo) };
}
// Every slide shown so far, up to and including `upTo`.
export function shownUpTo(upTo: number): Shown {
  return DECK.slice(0, upTo + 1).map((s, index) => ({ index, beat: 0, ...s, at: at(NOW, -12 + index * 2) }));
}

// ---------- Quiz and vote ----------
type Poll = NonNullable<FunctionReturnType<typeof api.checkin.quiz.current>>;
const QUIZ_ID = "lab-poll-quiz" as Id<"polls">;
const VOTE_ID = "lab-poll-vote" as Id<"polls">;
const QUIZ_Q = "With an empty dependency array, when does an effect run?";
const QUIZ_CHOICES = ["After every render", "Once, after the first render", "Before the first render", "Only when state changes"];
const VOTE_Q = "Which topic should we review on Thursday?";
const VOTE_CHOICES = ["Effects", "Lifting state up", "Keys in lists", "Forms"];

export const quizOpen: Poll = { id: QUIZ_ID, kind: "quiz", question: QUIZ_Q, choices: QUIZ_CHOICES, open: true, answered: 19, results: null };
export const quizEnded: Poll = { ...quizOpen, open: false, answered: 30, results: { counts: [6, 19, 2, 3], correct: 1 } };
export const voteOpen: Poll = { id: VOTE_ID, kind: "vote", question: VOTE_Q, choices: VOTE_CHOICES, open: true, answered: 14, results: null };
export const voteEnded: Poll = { ...voteOpen, open: false, answered: 29, results: { counts: [12, 9, 3, 5], correct: null } };

// ---------- Teams ----------
type Board = FunctionReturnType<typeof api.live.groups.leaderboard>;
type TeamRow = Board["teams"][number];
type Color = TeamRow["color"];
function team(team: number, color: Color, correct: number, rank: number, ec: number): TeamRow {
  const members = 4;
  const label = color[0].toUpperCase() + color.slice(1);
  return { team, color, label, members, correct, changes: 0, points: correct, perStudent: correct / members, rank, ec };
}
// After 2 quizzes, 8 teams of 4. Green (Pip's team) is 3rd.
export const board: Board = {
  questions: 2,
  teams: [
    team(1, "blue", 8, 1, 5),
    team(4, "orange", 7, 2, 3),
    team(3, "green", 6, 3, 1),
    team(0, "red", 5, 4, 0),
    team(5, "purple", 5, 4, 0),
    team(2, "yellow", 4, 6, 0),
    team(6, "pink", 3, 7, 0),
    team(7, "teal", 2, 8, 0),
  ],
};
export const myTeam = { team: 3, color: "green" as Color, label: "Green" };
export const teamsLocked = { size: 4 as const, locked: true as const, locksAt: null };
export const teamsForming = { size: 4 as const, locked: false as const, locksAt: at(NOW, 3) };
export const noBoard: Board = { questions: 0, teams: [] };
// Early in class: teams formed, no quiz ended yet. Each team keeps its number, so Green is still
// team 3, Pip's team (myTeam).
export const boardNoQuiz: Board = {
  questions: 0,
  teams: board.teams.slice(0, 5).map((t) => ({ ...t, correct: 0, points: 0, perStudent: 0, rank: 1, ec: 0 })),
};

// ---------- Past quizzes and votes ----------
type Past = FunctionReturnType<typeof api.live.past.past>;
export const past: Past = [
  {
    id: "lab-past-1" as Id<"polls">,
    kind: "quiz",
    question: "What does setCount do?",
    choices: ["Changes count right away", "Schedules a new render", "Reloads the page", "Nothing until the effect runs"],
    correct: 1,
    counts: [8, 21, 0, 2],
    mine: 1,
    at: at(NOW, -40),
  },
  {
    id: "lab-past-2" as Id<"polls">,
    kind: "vote",
    question: "How was Lab 5?",
    choices: ["Easy", "About right", "Hard", "Didn't finish"],
    correct: null,
    counts: [4, 15, 9, 3],
    mine: 2,
    at: at(NOW, -30),
  },
  {
    id: "lab-past-3" as Id<"polls">,
    kind: "quiz",
    question: "Where should a fetch start in a component?",
    choices: ["In render", "In useEffect", "In useRef", "In the CSS"],
    correct: 1,
    counts: [5, 22, 2, 1],
    mine: 0,
    at: at(NOW, -8),
  },
];

// ---------- Questions ----------
type Question = FunctionReturnType<typeof api.live.questions.list>[number];
const q = (n: number, index: number, text: string, more: Partial<Question> = {}): Question => ({
  _id: `lab-question-${n}` as Id<"questions">,
  index,
  text,
  name: null,
  votes: 0,
  at: at(NOW, -12 + index * 2 + 1),
  mine: false,
  voted: false,
  private: false,
  answer: null,
  ...more,
});
// 12 questions across the slides shown so far (the live slide is index 3 in most scenarios).
export const questions: Question[] = [
  q(1, 0, "Will the quiz count for a grade?", { votes: 6, answer: "Only for extra credit, through the team board." }),
  q(2, 1, "Is a variable inside the component state too?", { votes: 4, name: "Quill" }),
  q(3, 2, "Why can't I push to the array in state?", { votes: 9, voted: true }),
  q(4, 2, "Can setCount take a function?", { votes: 3, name: "Wren", answer: "Yes: setCount(c => c + 1) uses the newest value." }),
  q(5, 2, "What happens if I call setCount twice in a row?", { votes: 2 }),
  q(6, 3, "Does the effect run before or after the screen updates?", { votes: 11, voted: true }),
  q(7, 3, "When do I need the cleanup function?", { votes: 5, name: "Juniper" }),
  q(8, 3, "I'm lost on what 'sync with something outside React' means.", { votes: 0, mine: true, name: "Pip" }),
  q(9, 3, "Can we get the slides after class?", { votes: 0, mine: true, private: true }),
  q(10, 3, "Is useEffect the same as componentDidMount?", { votes: 1, name: "Basil" }),
  q(11, 1, "Is Lab 6 a team lab?", { votes: 7 }),
  q(12, 0, "Where do we turn in Lab 5?", { votes: 1, name: "Marlow", answer: "On Canvas, under Labs." }),
];
// The list query: one slide's questions, or every slide's when no index is given. Most votes first.
export function questionsFor(rows: Question[]) {
  return (args: { channel: string; index?: number }) =>
    rows.filter((r) => args.index === undefined || r.index === args.index).sort((a, b) => b.votes - a.votes || b.at - a.at);
}

// ---------- Late arrivals ----------
// The banner shows only arrivals scanned after the page opened (newArrivals in
// src/teams/checkin/late.ts), so the row is stamped with the page's clock when the feed is read.
export const lateArrival = () => [{ id: "lab-late-1" as Id<"checkins">, first: "Rowan", lateMin: 4, at: Date.now() }];
