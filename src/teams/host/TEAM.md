# Team: Professor view

The agent reads this before every change to #/host. Sam's decisions (AGENTS.md "Status") win over anything here.

**Goal:** while teaching, the professor sees how many students checked in and who's lost on each slide, asks the room a quiz or a vote, answers students' questions, and runs the teams' points and extra credit.

The professor approves everything students see. The AI drafts, sorts and summarizes, and never shares anything on its own.

## Must do

- Header: the slide the deck is on, how many students checked in to this class, how many tapped "I'm lost" on this slide, and "Lost by slide" for every slide with taps this class. A link to Attendance (#/checkin/teacher).
- **Now** tab: "Ask the room" drafts a quiz from the slide with Gemini or takes one the professor types, then opens it as a quiz or a vote on every phone, on #/checkin/quiz and on the stage. While it's open the bars and "N of M answered" move; after End, each choice's %, the right answer (or the vote's top pick), % right and the median time. "Who got it wrong" lists each student who picked a wrong choice on the newest quiz with a right answer, and "Ask the AI" returns 2 or 3 sentences on what to explain again.
- **Points** tab: team size (3 or 4), every team with its place, points and extra credit, +1 and -1 per team, every student checked in with their points and +1 and -1 (with an optional reason), the point changes with Undo, End class (saves each student's extra credit and ends the class; it can't be undone and is refused while a quiz or vote is open), and "Download extra credit (CSV)" with every class's saved extra credit.
- **Questions** tab: every question students posted on #/live in this class, private ones too, with its slide, upvotes and name ("Anonymous" when hidden). Keep or dismiss (sorts this list only), type an answer, share it (not a private one), or delete the question from every phone. "Group by topic with AI" sorts the list into topics.
- The three tabs stay mounted, so a half-written quiz, the AI note and the topic grouping survive a tab switch.

Private questions (Sam's decision D12 e and f): a private question's answer can't be shared, so its row has no share button and `share()` throws "That question is private."; only the professor sees that answer. "Group by topic with AI" sends private question texts too, numbered, never with a name.

## Not doing

- Its own tables: since Sam's decision 1 (2026-10-30), #/host reads and writes Check-in's quiz and Live slides' teams and questions.
- Voice answers, recordings and a textbook import: they need the microphone or a new store, so they wait for Sam.

## Who can open it

Professors and admins on the staff list, through `<StaffGate>` (`src/teams/checkin/prof.tsx`). Admins give the role on #/admin. Signed out, the page shows the Google sign-in button; signed in without a role, it says to ask an admin. `HOST_EMAILS` opens nothing.

## Where it lives

- Page: `src/teams/host/Page.tsx` (routed as "host" in `src/pages/index.ts`), with `AskRoom.tsx` and `Missing.tsx` (Now), `Boards.tsx`, `Team.tsx` and `csv.ts` (Points), and `QA.tsx` (Questions). Any other #/host/<part> shows "No page at #/host/<part>".
- Server: #/host has no server folder of its own. It calls the modules students already use:
  - `convex/checkin/quiz.ts`: `current`, `stats`, `ask`, `end`, `draftQuestion`, `missing`, `feedback`.
  - `convex/live/groups.ts`: `status`, `leaderboard`, `roster`, `setSize`, `adjust`, `removePoints`, `pointLog`, `endDay`, `results`.
  - `convex/live/questions.ts`: `forHost`, `setStatus`, `answer`, `share`, `remove`, `organize`.
  - `api.live.read.lostCount` and `lostBySlide`, `api.checkin.read.count`, `api.checkin.attendance.lectures`, `api.deck.current`.
- `convex/host/` takes no code: the old professor view's functions were deleted (UZ), and `convex/retired.test.ts` fails if a code file is added there. A new #/host feature goes in the module that owns its table, with its tests next to it.
- Channel: `CHANNEL` from `src/blocks/deck.ts` (`"gdg"`).

## What it reads, writes and shows

- Writes `polls` (ask, end), `groupSettings` (team size), `groupPoints` (point changes and Undo), `groupResults` and `lectures` (End class saves extra credit and ends the class), and `questions` (status, answer, shared, topic, cluster; delete also removes its `questionVotes`). Opening a quiz also opens a class (`lectures`) when none is open.
- Shows names and emails: the Points tab's student list and the extra credit CSV (class end time, name, email, team, place, team points, extra credit). The CSV is for the instructor of record; never commit one.
- Sends to Gemini: the slide text (draft a quiz), the quiz, its choices, counts and team labels ("Ask the AI"), and the texts of questions that aren't dismissed, private ones too ("Group by topic with AI"). Never a name or email.
- The old professor view's tables (`quizQuestions`, `answers`, `hostRooms`, `pointEvents`, `studentQuestions`) stay defined in `convex/schema.ts` for prod's rows; nothing reads or writes them.
- On your own dev backend these tables start empty: fill them with `npx convex run dev/seed:fill '{"channel":"gdg"}'` after adding your deployment's host to `DEV_HOSTS` in `convex/checkin/prof.ts` and `convex/auth.config.ts` (README step 5).

## Tests

- Screens: `Page.test.ts` (tabs, header, unknown part), `AskRoom.test.ts`, `Boards*.test.ts`, `csv.test.ts`, `QA.test.ts`, `QA.hint.test.ts`.
- Server: the tests next to each module above (`convex/checkin/quiz.test.ts`, `convex/live/groups*.test.ts`, `convex/live/questions*.test.ts`, `convex/live/read.test.ts`), and `convex/retired.test.ts` for the retired tables and the empty `convex/host/`.
