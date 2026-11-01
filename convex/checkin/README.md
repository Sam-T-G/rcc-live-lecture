# convex/checkin

The Check-in team's server functions, called as `api.checkin.<file>.<function>`. What the pages do and what the team keeps: `src/teams/checkin/TEAM.md`. What other teams may read, and the shared tables: docs/contracts.md. #/host's Now tab calls `quiz.ts`; see `src/teams/host/TEAM.md`.

Who may call: **anyone** (signed out too), **student** (anyone signed in), **professor** (a professor or admin on the staff list, `requireProf`), **scanner** (a scanner, professor or admin, or a paired door iPad's device token, `requireScanner`). Every read is for this class (`lib.lectureWindow`) unless it says otherwise.

## prof.ts

No functions. The access checks every other file calls: `staffRole(ctx)`, `requireProf(ctx)`, `requireAdmin(ctx)`, `requireScanner(ctx, device?)`. The staff list, pairing and #/admin functions are in `convex/staff.ts`.

## pass.ts

Writes `passes`, `checkins`, `lectures` (a scan opens a class when none is open) and `devices` (last used). `scan` also calls Live's `ensureGroup`, which writes `groups` (the student's team), `groupSettings` (marks the team lock as queued) and `groupPoints` (when a student checked in again moves off an empty team: `convex/live/README.md`).

| Function | Who | What it does |
|---|---|---|
| `amHost()` | anyone | Whether the caller is a professor or admin. |
| `canScan({ device? })` | anyone | Whether this device can scan: a paired iPad's token, or any staff role. |
| `mine()` | anyone | The signed-in student's pass (code, name, email, when the code was made), or null. |
| `refresh({ channel? })` | student | Makes the pass, and a new code once the current one is 20 s old. |
| `scan({ channel, code, device? })` | scanner | Checks the pass's owner in to this class (opens one when none is open). Refused more than 45 minutes before a saved start. Returns the name, the email for professors only, and whether they were checked in already. |

## read.ts

Writes nothing.

| Function | Who | What it does |
|---|---|---|
| `count({ channel })` | anyone | How many checked in to this class. |
| `me({ channel })` | anyone | Whether the caller checked in to this class (false signed out). |
| `names({ channel })` | professor | Who checked in, newest first, with the time and the check-in's id. |

## attendance.ts

Writes `lectures`, `classStarts`, `checkins` (remove), `pollAnswers` and `polls` (remove recounts ended ones), and `passes` (hideLate).

| Function | Who | What it does |
|---|---|---|
| `classStart({ channel })` | anyone | This class's start time and grace minutes, or null. |
| `setClassStart({ channel, startsAt, graceMin, sameClass? })` | professor | Saves the start (within 12 hours of now) and grace (0 to 60), opening a class when none is open, and queues the team lock for 5 minutes after the start. Refuses a start more than 45 minutes after the open class's first check-in unless `sameClass` is true. |
| `sheet({ channel, lecture? })` | professor | One class's check-ins with name, email, time and minutes late: this class, a past class by id, or "earlier". |
| `lectures({ channel })` | professor | The classes with check-ins, plus the one running now, newest first, then "earlier". |
| `removeCheckin({ checkin })` | professor | Removes a check-in from this class and that student's quiz and vote answers in it. |
| `lateFeed({ channel })` | anyone | The newest 5 late arrivals in this class, first names only, skipping students who turned the banner off. |
| `myHideLate()` | anyone | Whether the signed-in student turned the late banner off (false signed out). |
| `setHideLate({ hide })` | student | Turns the late banner off or on for the caller. |
| `clock()` | anyone | The server's time in ms, for the late banner. Writes nothing. |

## quiz.ts

Writes `polls`, `pollAnswers` and `lectures` (asking opens a class).

| Function | Who | What it does |
|---|---|---|
| `current({ channel })` | anyone | The newest quiz or vote in this class, or null. Counts and the right answer come back only once it ended. |
| `mine({ poll })` | anyone | The caller's pick, or null. |
| `answer({ poll, choice })` | student | Answers, if checked in to this class. A quiz answer locks; a vote pick changes until it ends. |
| `ask({ channel, kind, question, choices, correct?, index?, aiDraft? })` | professor | Opens a quiz or vote and ends the open one. Refused more than 45 minutes before a saved start. |
| `end({ poll })` | professor | Ends it and saves its final counts. |
| `stats({ poll })` | professor | Counts, answered of checked in, % right, median seconds to answer. |
| `history({ channel })` | professor | This class's quizzes and votes, newest first (up to 50). |
| `missing({ channel })` | professor | "Who got it wrong" on #/host: the newest quiz with a right answer and each wrong answer's name, team and pick. |
| `draftQuestion({ channel })` | professor | Action: Gemini drafts a quiz from the slide the deck is on. |
| `feedback({ channel })` | professor | Action: Gemini writes 2 or 3 sentences on what the room got wrong. No names go to Gemini. |
