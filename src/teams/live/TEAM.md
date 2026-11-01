# Team: Live slides

The agent reads this before every change. Where it disagrees with the Status section of AGENTS.md, AGENTS.md wins. Sam's decisions (D6, D12 and the rest) are the source.

**Goal:** a student in the room follows the professor's slides on their phone and takes part: they say when they're lost, ask and upvote questions, and play on a small team for extra credit.

## Must do

- #/live shows the slide the professor is on, live. The student can page back through slides this class has shown without moving the projector, and the phone follows live again once the professor reaches that slide.
- "I'm lost" on the slide on screen, for checked-in students. A second tap takes it back. The professor sees how many are lost on the slide on screen and on every slide (#/host).
- Questions beside the slide: anonymous by default, by name if the student unticks it, or private ("Only the professor sees it"). Checked-in students upvote other people's public questions. Sorted by upvotes, then newest. The professor sorts, answers, shares an answer under a public question, deletes, and groups questions by topic with AI on #/host Questions.
- Teams: each student joins a team when their pass is scanned. Teams lock 5 minutes after the class start or the first check-in, whichever is later, and the lock re-deals everyone into teams of 3 or 4 (the professor picks 3 or 4; fewer than 6 students stay on one team). After the lock a newcomer joins the smallest team, up to 5; only when every team has 5 does a new team open, and the next newcomer joins it (D12 l).
- The board ranks teams by points per student (right answers on ended quizzes plus the professor's point changes, divided by members; D6). 1st place gets 5 extra credit, 2nd 3, 3rd 1; ties split the places they fill. #/live shows it on the phone and #/live/leaderboard on the projector.
- End class (#/host Points or #/checkin/teacher) saves each student's extra credit and ends the class. The professor downloads it as a CSV.
- Past quizzes and votes: once the professor ends one, the student sees the question, the counts, the right answer (quizzes) and their own pick.

**Not doing:** showing students or shared screens who answered what, or showing anyone who tapped I'm lost: phones and the projector show counts and totals only, and the professor sees I'm lost as counts too. Professors do see each student's answers: "Who got it wrong" on #/host Now lists each student who picked a wrong choice, with their pick, and the roster (`live.groups.roster`) lists each student's right answers and points.

## What it sees

- **Sign-in:** every row a student writes (`lost`, `questions`, `questionVotes`, `groups`, `groupPoints` for one student, `groupResults`) keeps their sign-in id (`tokenIdentifier`, which holds a typed sign-in's email). No function sends it to a screen.
- **Slides:** the slide text the deck sends (headings and visible lines, never speaker notes).
- **I'm lost:** one row per student per slide per class: who and which slide. Screens get counts only, and only for students checked in to this class, so a check-in the professor removes drops out of the counts.
- **Questions:** the text, the slide, and the name from the student's check-in unless they post anonymously (anonymous hides it from the professor too). A private question shows only to its author and the professor, can't be upvoted, and its answer can't be shared, not even with its author (D12 e). The professor's typed answer (up to 1000 characters) stays with the professor until they share it; a shared answer shows under the question on every phone.
- **AI:** "Group by topic with AI" sends Google's Gemini the text of every question in this class that isn't dismissed, private ones included (D12 f), each with a number in place of the student and never a name. The form on #/live tells a student this when they tick the private box. The topics come back to the professor only.
- **Teams:** a team number per checked-in student, shown as a color. Phones and the projector show only team colors and totals, never names.
- **Points:** each change the professor makes, for a team or one student, with its reason (up to 80 characters) and time. Only the professor sees the list.
- **Extra credit:** End class (`live.groups.endDay`) saves one `groupResults` row per student on a team with their name and email from their check-in, team, rank, points, extra credit and running total. Only the professor reads them, for the CSV.
- No camera, location or microphone.

## Where it lives

- Pages: `src/teams/live/Page.tsx` (#/live, #/live/leaderboard), `Leaderboard.tsx`, `Questions.tsx`, `PastQuestions.tsx`. The professor's side is in `src/teams/host/` (Questions tab `QA.tsx`, Points tab `Boards.tsx`) and the teacher page `src/teams/checkin/Teacher.tsx`.
- Server: `convex/live/`, called as `api.live.<file>.<function>`. Every function, its args, who may call it and the tables it touches are in [convex/live/README.md](../../../convex/live/README.md). In short:
  - `lost.ts`: `toggle` (checked in).
  - `read.ts`: `lostCount`, `lostBySlide`, `mine` (anyone). Other teams read these (docs/contracts.md).
  - `past.ts`: `past` (anyone).
  - `questions.ts`: `list` (anyone); `ask`, `vote` (checked in); `remove` (the author, a professor or admin); `forHost`, `setStatus`, `answer`, `share`, `organize` (professor or admin); `applyTopics` (internal).
  - `groups.ts`: `status`, `leaderboard`, `mine` (anyone); `join` (signed in, deals only checked-in students); `setSize`, `roster`, `adjust`, `removePoints`, `pointLog`, `endDay`, `results` (professor or admin); `lock` (internal). `checkin.pass.scan` calls `ensureGroup`, and the class close calls `saveExtraCredit`.
- Tables: writes `lost`, `questions`, `questionVotes`, `groups`, `groupSettings`, `groupPoints`, `groupResults`. Reads `checkins`, `polls` and `pollAnswers` (Check-in's quiz), `deckChannels` and `deckSlides` (the deck), and `lectures` (the class window, `lib.lectureWindow`): every read is for the current class only.
- Channel: `CHANNEL` from `src/blocks/deck.ts` (`"gdg"`).

## Tests

- Server, convex-test: `convex/live/*.test.ts` (groups, groups.redeal, groups.fixes, groups.sweep, lost, read, past, questions, questions.private), plus `convex/privacy.test.ts` for what students and signed-out readers can see.
- Screens, rendered in Node: `src/teams/live/*.test.ts`. `Questions.ask.test.ts` checks what the form sends (anonymous by default, `private: true` once ticked).
- The gate: `npm run build && npm run lint && npm test && npm run typecheck:convex`.
