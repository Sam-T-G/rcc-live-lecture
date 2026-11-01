# Contracts between modules

The app is one Convex backend shared by three modules: Check-in (`convex/checkin/`, `src/teams/checkin/`), Live slides (`convex/live/`, `src/teams/live/`) and Professor view (`src/teams/host/`, which reads and writes through the other two and has no tables or server code of its own). The shared blocks (deck, access, classes, lab) own the rest. This file lists every table in `convex/schema.ts`, who writes and reads it, the functions one module calls in another, and the answers other clients decode. Each function's full spec (args, what it returns, its refusals) is in the header comment of its file.

Every class runs on one deck channel, `"gdg"`: use `CHANNEL` from `src/blocks/deck.ts`. A row belongs to the class whose window holds its `_creationTime`, so every per-class read starts at `lectureWindow`'s `start` (BLOCKS.md, "Classes"). The exception is `deckChannels` and `deckSlides`: their rows keep the first press's `_creationTime`, so a read keeps a row whose `at` is at or after `lib.deckFrom(ctx, channel)` (or `lib.slidesFrom(lecture)` in a mutation), the cutoff `deck.current`, `deck.slides` and `shownThisClass` in `live/lost.ts` and `live/questions.ts` use (BLOCKS.md, "Deck bridge").

## Tables

| Table | Owner | Written by | Read by |
|---|---|---|---|
| `deckChannels` | deck block | `deck.set` (from `POST /deck`) | `deck.current`; `live/lost.ts` and `live/questions.ts` (was this slide shown?); `checkin.quiz.ask` (the slide a question goes with) |
| `deckSlides` | deck block | `deck.set` | `deck.slides`; `live/lost.ts` and `live/questions.ts` |
| `pings` | lab | `lab.ping` | `lab.lastPing`, `lab.pings` |
| `staff` | access | `staff.add`, `setRole`, `remove`; the CLI's `devGrant`, `dropDevGrant`, `devRevoke`, `importHostEmails` | `staffRole` in `checkin/prof.ts` (every staff check); `staff.people` |
| `staffEvents` | access | `convex/staff.ts`, one row per add, role change, remove, pair and unpair | `staff.changes` |
| `devices` | access | `staff.approvePairing`, `staff.unpair`; `checkin.pass.scan` (last used) | `requireScanner` in `checkin/prof.ts`; `staff.devices` |
| `pairings` | access | `staff.requestPairing`, `approvePairing`, `dropPairing` | `staff.deviceStatus` |
| `kiosks` | Check-in | nothing: unused since the student passes replaced the kiosk QR; kept because prod may hold rows | nothing |
| `checkins` | Check-in | `checkin.pass.scan`; `checkin.attendance.removeCheckin` deletes one | `checkin/read.ts`, `attendance.ts`, `pass.ts`, `quiz.ts`; `lib.checkedIn`; `live/groups.ts` (who is on a team); `live/questions.ts` (the name on a post by name); `live/read.ts` (`lostCount` and `lostBySlide` count only checked-in students) |
| `passes` | Check-in | `checkin.pass.refresh`, `scan`; `checkin.attendance.setHideLate` | `checkin/pass.ts`; `checkin.attendance.lateFeed` (who turned the banner off) |
| `classStarts` | Check-in | `checkin.attendance.setClassStart` | `lib.lectureWindow` only before a channel's first class; `lateFeed` (when the start was saved) |
| `lectures` | classes block | `lib.ensureLecture`, `lib.endLecture`, `lectures.close`, `lectures.endEarlier`; `setClassStart` (start and grace) | `lib.lectureWindow`, so every per-class read; `lib.deckFrom` (the deck's cutoff); `checkin/pass.ts` (the channels of the last 20 classes, so a page that sends another channel can't rename a checked-in student); `checkin.attendance.sheet` and `lectures` (past classes) |
| `polls` | Check-in | `checkin.quiz.ask`, `end`; `checkin.attendance.removeCheckin` recounts an ended one | `checkin/quiz.ts`; `live.past.past`; `live/groups.ts` (scores) |
| `pollAnswers` | Check-in | `checkin.quiz.answer`; `checkin.attendance.removeCheckin` deletes that student's answers in the class | `checkin/quiz.ts` (`stats`, `missing`); `live.past.past` (the caller's own pick); `live/groups.ts` (right answers) |
| `lost` | Live slides | `live.lost.toggle` | `live/read.ts`: `lostCount`, `lostBySlide`, `mine` (#/host header, #/live) |
| `questions` | Live slides | `live.questions.ask`, `remove`, `setStatus`, `answer`, `share`, `applyTopics` | `live.questions.list` (#/live), `forHost` (#/host Questions) |
| `questionVotes` | Live slides | `live.questions.vote`, `remove` | `live/questions.ts` |
| `groups` | Live slides | `ensureGroup` (called by `checkin.pass.scan`), `live.groups.join`, the lock, `setSize` | `live/groups.ts`; `checkin.quiz.missing` (team labels) |
| `groupSettings` | Live slides | `live/groups.ts` (`setSize`, the lock) | `live/groups.ts`; `checkin.attendance.setClassStart` (queues the lock) |
| `groupPoints` | Live slides | `live.groups.adjust`, `removePoints`; the lock's re-deal | `live/groups.ts` (`leaderboard`, `roster`, `pointLog`) |
| `groupResults` | Live slides | `saveExtraCredit` (End class, `lectures.close`, and `ensureLecture` closing a class left open) | `live.groups.results` (#/host Points CSV), `roster` (extra credit so far) |
| `quizQuestions` | retired | nothing | nothing |
| `answers` | retired | nothing | nothing |
| `hostRooms` | retired | nothing | nothing |
| `pointEvents` | retired | nothing | nothing |
| `studentQuestions` | retired | nothing | nothing |

The five retired tables were the first Professor view's (Sam's decision 1, 2026-10-30: #/host moved onto `polls`, `groups` and `questions`). Their definitions stay so prod keeps its documents; remove them only after Sam exports and deletes the data. `checkins.meters` (distance from the room) is unused too: no page reads it and nothing writes it now.

## Functions one module calls in another

Server code (imports between `convex/` folders):

| Function | Args | Called by | What it does |
|---|---|---|---|
| `requireProf(ctx)` (`convex/checkin/prof.ts`) | ctx | every professor-only function, in every module | a professor or admin, or it throws |
| `requireAdmin(ctx)`, `requireScanner(ctx, device?)`, `staffRole(ctx)`, `isProf(role)` | ctx | `convex/staff.ts`, `checkin.pass.scan`, `live.questions.remove` | admins; scanners and paired iPads; the caller's role |
| `requireUser`, `lectureWindow`, `ensureLecture`, `endLecture`, `notOpenYet`, `checkedIn`, `cleanName` (`convex/lib.ts`) | ctx, channel, ... | every module | sign-in, the class window, and names safe to show (BLOCKS.md) |
| `ensureGroup(ctx, channel, user)` (`convex/live/groups.ts`) | ctx, channel, user | `checkin.pass.scan`, right after the check-in | puts the student on a team in this class. Keep this call, or students scanned in have no team and their answers don't score |
| `saveExtraCredit(ctx, channel, endedAt, lecture?)` (`convex/live/groups.ts`) | ctx, channel, endedAt, lecture | `lib.ensureLecture`, `lectures.close` | saves each team member's extra credit to `groupResults` before a class ends without End class |
| `describe(team)`, `teamInfo` (`convex/live/groups.ts`) | team number | `checkin/quiz.ts` | a team's color and label |
| `rightOf(poll)`, `tally(ctx, poll, choices)` (`convex/checkin/quiz.ts`) | a poll | `live/past.ts` | the right answer and the counts per choice |

Queries and mutations pages call across modules (`api.<module>.<file>.<function>`):

| Function | Returns | Who may call | Called from |
|---|---|---|---|
| `api.deck.current({ channel })` | `{ index, beat, count, title, lines, at }` or null | anyone | `useDeckSlide`; #/live, #/portal, #/host, #/lab; iOS (`deck:current`) |
| `api.deck.slides({ channel })` | `[{ index, beat, title, lines, at }]`, slides shown in this class, in slide order | anyone | #/live, #/portal; iOS (`deck:slides`) |
| `api.checkin.attendance.lateFeed({ channel })` | `[{ id, first, lateMin, at }]`, the newest 5 late arrivals in this class, first names only | anyone | `LateBanner` (#/checkin/student, #/checkin/stage, #/live, #/live/leaderboard, #/portal); iOS |
| `api.checkin.read.count({ channel })` | how many checked in to this class | anyone | #/host, #/checkin/stage, #/checkin/kiosk |
| `api.checkin.read.me({ channel })` | whether the caller checked in to this class | anyone (false signed out) | #/checkin/student, #/live |
| `api.checkin.read.names({ channel })` | `[{ id, name, at }]`, newest first | professors and admins | #/checkin/teacher |
| `api.checkin.quiz.current`, `mine`, `answer` | the open quiz or vote, the caller's pick, an answer | anyone; answering needs a check-in | `QuizCard` (#/checkin/student, #/live) |
| `api.checkin.quiz.ask`, `end`, `stats`, `history`, `missing`, `draftQuestion`, `feedback` | asking and ending, results, the AI's draft and note | professors and admins | #/checkin/quiz, #/host Now |
| `api.live.read.lostCount({ channel, index })`, `lostBySlide({ channel })` | how many are lost on a slide; every slide with taps | anyone | #/host header |
| `api.live.groups.status`, `leaderboard`, `mine`, `join` | team size and lock time, the board, the caller's team | anyone (`join`: checked in) | #/live, #/live/leaderboard, #/host Points |
| `api.live.groups.setSize`, `roster`, `adjust`, `removePoints`, `pointLog`, `endDay`, `results` | teams, point changes, End class, saved extra credit | professors and admins | #/host Points, #/checkin/teacher (End class) |
| `api.live.questions.forHost`, `setStatus`, `answer`, `share`, `organize` | the professor's side of students' questions | professors and admins | #/host Questions |
| `api.staff.me()` | null signed out, else `{ email, role, canHoldRole }` | anyone | `StaffGate`, `useStaff` (`api.checkin.pass.amHost` answers the same yes or no; no page calls it now) |

Shared screen code:

| Part | File | Used by |
|---|---|---|
| `StaffGate`, `useStaff`, `DoorGate`, `SignInEnding` | `src/teams/checkin/prof.tsx` | every professor page, #/checkin/kiosk |
| `QuizCard` | `src/teams/checkin/Quiz.tsx` | #/checkin/student, #/live |
| `LateBanner` | `src/teams/checkin/LateBanner.tsx` | #/checkin/student, #/checkin/stage, #/live, #/live/leaderboard, `src/portal/` |
| `Leaderboard` | `src/teams/live/Leaderboard.tsx` | #/live, #/live/leaderboard |

## Rules

- **Keep these working.** The module that owns a table owns the functions above that read it. Add fields freely; before renaming or removing one, change every reader in the same commit.
- **iOS decodes three answers field by field:** `deck.current`, `deck.slides` and `checkin.attendance.lateFeed`. The app in `ios/` reads them the same way `src/portal/` does, and `npm test` and CI don't build Swift. A change to what any of them returns means running `ios/scripts/test.sh` and changing `ios/RCCLivePortal/` in the same commit; until a new app ships, phones with the old one break, so add a new query instead of changing these.
- **Keys:** a person is `identity.tokenIdentifier` (stored as `user`); a slide is its 0-based `index`.
- **Privacy:** no query returns `user`, which holds a typed sign-in's email. Shared screens (the projector, the late banner, the team board) show a first name at most: `lateFeed` returns first names. Emails go only to professors and admins (`checkin.read.names`, `checkin.attendance.sheet`, `live.groups.roster`, `live.groups.results`), and so do full names, except in two places: `checkin.pass.scan` returns the scanned student's sign-in name to every scanner, so the door iPad shows it for 3 seconds (the email comes back as "" to a paired iPad or the scanner role), and `live.questions.list`, which anyone can read (signed out too), returns a question posted by name with the student's full check-in name, so everyone on #/live sees it. Only question text, slide text, choices, counts and team labels go to Gemini, never a name.

## Test data on a dev backend

fill runs only on the dev backends in `DEV_HOSTS`. To use it on your own deployment, add its host (`<name>.convex.cloud`) to `DEV_HOSTS` in `convex/checkin/prof.ts` and in `convex/auth.config.ts` (README step 4); that also turns on typed test sign-ins and test roles there. Then:

```sh
npx convex run dev/seed:fill '{"channel":"gdg"}'    # sample check-ins, lost taps, a quiz and questions
npx convex run dev/seed:clear '{"channel":"gdg"}'   # removes only the sample rows
```

Agents in a worktree never run these; they test with convex-test.
