# convex/live

The Live slides team's server functions, called as `api.live.<file>.<function>`. What the team builds and what it keeps is in [src/teams/live/TEAM.md](../../src/teams/live/TEAM.md); what other teams read is in [docs/contracts.md](../../docs/contracts.md). Each file's header comment has the full rules.

#/host's Points tab calls `groups.ts`, its Questions tab `questions.ts`, and its header `read.ts`; see [src/teams/host/TEAM.md](../../src/teams/host/TEAM.md).

`channel` is the deck channel (`"gdg"`). Every read is for the current class only (`lib.lectureWindow`), so between classes every list is empty and every count is 0, except `groups.results` and the saved extra credit in `groups.roster`, which cover every class, so the professor can download the extra credit CSV after End class.

Who may call:

- **anyone:** signed out too.
- **signed in:** `lib.requireUser` ("Sign in first.").
- **checked in:** signed in with a check-in in this class ("Check in first.").
- **professor:** `requireProf` in `convex/checkin/prof.ts`, which also passes admins ("Only professors can do that.").
- **internal:** only other Convex functions.

## lost.ts

| Function | Args | Who | Reads | Writes |
|---|---|---|---|---|
| `toggle` (mutation) | `{ channel, index }` -> true when now lost, false when taken back | checked in; `index` must be a slide this class has shown | `checkins`, `deckSlides`, `deckChannels`, `lost` | `lost` |

## read.ts

The contract other teams read (#/host). Counts include only students checked in to this class.

| Function | Args | Who | Reads | Writes |
|---|---|---|---|---|
| `lostCount` (query) | `{ channel, index }` -> number | anyone | `lost`, `checkins` | none |
| `lostBySlide` (query) | `{ channel }` -> `[{ index, count }]`, by slide | anyone | `lost`, `checkins` | none |
| `mine` (query) | `{ channel, index }` -> whether the caller tapped I'm lost there | anyone (false signed out) | `lost` | none |

## past.ts

| Function | Args | Who | Reads | Writes |
|---|---|---|---|---|
| `past` (query) | `{ channel }` -> ended quizzes and votes, newest first, at most 50: `{ id, kind, question, choices, correct, counts, mine, at }` | anyone (`mine` is null signed out) | `polls`, `pollAnswers` | none |

## questions.ts

| Function | Args | Who | Reads | Writes |
|---|---|---|---|---|
| `list` (query) | `{ channel, index? }` -> `[{ _id, index, text, name, votes, at, mine, voted, private, answer }]`, at most 200 | anyone; another student's private question is left out | `questions`, `questionVotes` | none |
| `ask` (mutation) | `{ channel, index, text, anonymous, private? }` | checked in; 1 to 280 characters; one post every 5 seconds | `checkins`, `deckChannels`, `deckSlides`, `questions` | `questions` |
| `vote` (mutation) | `{ question }`; a second tap takes it back | checked in; not your own, not a private one | `checkins`, `questions`, `questionVotes` | `questions`, `questionVotes` |
| `remove` (mutation) | `{ question }` | the author, a professor or admin | `questions`, `questionVotes`, `staff` | `questions`, `questionVotes` |
| `forHost` (query) | `{ channel }` -> every question in this class, private ones too, newest first, at most 500 | professor | `questions` | none |
| `setStatus` (mutation) | `{ question, status: "new" \| "keep" \| "dismissed" }` | professor | `questions` | `questions` |
| `answer` (mutation) | `{ question, text }`, up to 1000 characters; empty removes it | professor | `questions` | `questions` |
| `share` (mutation) | `{ question, shared }`; a private question: "That question is private." | professor | `questions` | `questions` |
| `organize` (action) | `{ channel }` -> how many questions got a topic. Sends Gemini the numbered texts of every question that isn't dismissed, private ones too, never names | professor | `forHost` | `applyTopics` |
| `applyTopics` (mutation) | `{ items: [{ id, topic, cluster }] }` -> how many it wrote | internal | `questions` | `questions` |

## groups.ts

| Function | Args | Who | Reads | Writes |
|---|---|---|---|---|
| `status` (query) | `{ channel }` -> `{ size, locked, locksAt }` | anyone | `groupSettings`, `checkins`, `lectures` | none |
| `leaderboard` (query) | `{ channel }` -> `{ questions, teams }`; `questions` counts ended quizzes with a right answer | anyone | `checkins`, `groups`, `polls`, `pollAnswers`, `groupPoints` | none |
| `mine` (query) | `{ channel }` -> the caller's team `{ team, color, label }` or null | anyone (null signed out or not checked in) | `checkins`, `groups` | none |
| `join` (mutation) | `{ channel }` -> the caller's team, or null when not checked in | signed in | `checkins`, `groups`, `groupSettings`, `groupPoints` | `groups`, `groupSettings` |
| `setSize` (mutation) | `{ channel, size: 3 \| 4 }`; after the lock it re-deals everyone | professor | `groupSettings`, `checkins`, `groups`, `groupPoints` | `groupSettings`, `groups`, `groupPoints` |
| `roster` (query) | `{ channel }` -> every checked-in student with name, email, team, right answers, changes, points and saved extra credit | professor | `checkins`, `groups`, `polls`, `pollAnswers`, `groupPoints`, `groupResults` | none |
| `adjust` (mutation) | `{ channel, team? \| checkin?, delta, reason? }`; `delta` 1 to 5 or -1 to -5; `reason` up to 80 characters | professor | `checkins`, `groups` | `groupPoints` |
| `removePoints` (mutation) | `{ id }`; undo one change from this class | professor | `groupPoints` | `groupPoints` |
| `pointLog` (query) | `{ channel }` -> this class's changes, newest first by time, at most 200 | professor | `groupPoints`, `checkins`, `groups` | none |
| `endDay` (mutation) | `{ channel }` -> the line to show; refused while a quiz or vote is open | professor | everything `leaderboard` reads | `groupResults`, `lectures` |
| `results` (query) | `{ channel, lecture?, paginationOpts }` -> saved extra credit, 200 rows a page | professor | `groupResults`, `checkins` | none |
| `lock` (mutation) | `{ channel, force?, lecture? }`; re-deals into teams of 3 or 4 | internal (queued by `ensureGroup` and `checkin.attendance.setClassStart`) | `groupSettings`, `checkins`, `groups`, `groupPoints` | `groups`, `groupSettings`, `groupPoints` |

Helpers other modules call: `ensureGroup` (from `checkin.pass.scan`, on every scan: deals a team to a student who has none; after the lock, a scan that checks a student in again after the professor removed their check-in moves them off a team with nobody else checked in on it to the smallest team, unless every team has 5, and turns the old team's point changes into changes for each student dealt to it, as evenly as whole points allow, so the student takes only their own share; a second scan of a student already checked in never moves anyone), `saveExtraCredit` (from `lectures.close` and `lib.ensureLecture` when a class closes by itself).
