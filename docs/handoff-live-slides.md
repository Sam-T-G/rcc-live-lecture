# Handoff: Live slides work (questions, past questions, team leaderboard)

For Sam (deploy, merge) and Josh (professor view). Everything here is on `main` (last commit `6f71729`). It builds (`npm run build`). It has not been run end to end on a live backend, and it is not deployed until `scripts/deploy.sh` runs.

## What it does, on `#/live`

1. **Slide, paged on your own phone.** Shows the slide the professor is on. "← Earlier" / "Later →" pages back through slides already shown (`api.deck.slides`); the view stays put when the professor moves on, and "Back to live" rejoins. Never ahead of the professor.
2. **Questions beside the slide.** Post a question or comment on a slide, anonymous (default) or by name. Upvote (not your own; a second tap undoes it). Author or a host can delete. 280 characters, one post per 5 seconds. "This slide" / "All slides" tabs.
3. **Quiz card.** Check-in's `<QuizCard />` sits above the lists so students answer the open question here.
4. **Past questions.** Every ended quiz or vote, newest first: the right answer, the student's pick, and counts per choice. Open questions are never shown.
5. **Team leaderboard.** Students are dealt into teams of 3 or 4 in check-in order: 1st Red, 2nd Blue, 3rd Yellow, around again until each has the team size, then three new teams open with their own colors (Green, Orange, Purple, then Pink, Teal, Brown, and so on; 12 colors, then the list repeats with a number). Teams are ranked on right answers from ended quizzes. Extra credit: 1st 5, 2nd 3, 3rd 1, the rest 0; teams tied on right answers split the points for the places they fill. The professor picks team size 3 or 4 (default 4). **Teams lock 5 minutes after class starts** (the host's start time from Check-in, else 5 minutes after the first check-in): everyone is re-dealt in check-in order so every team has 3 or 4 students, as near the professor's choice as the class size allows (e.g. 10 students: 4, 3, 3). Under 6 students they stay on one team. A student who arrives after the lock joins the smallest team with room (under 4), or starts a new team if every team is full. If the professor changes the size after the lock, everyone is re-dealt to match.
6. **Projector view:** `#/live/leaderboard` (big board). A "You're on Green" badge shows on the phone page.

## Where the code is

| What | Files |
|---|---|
| Page | `src/teams/live/Page.tsx` (+ `live.css`) |
| Questions | `convex/live/questions.ts`, `src/teams/live/Questions.tsx` |
| Past questions | `convex/live/past.ts`, `src/teams/live/PastQuestions.tsx` |
| Teams and leaderboard | `convex/live/groups.ts`, `src/teams/live/Leaderboard.tsx` |
| Tables (`// team: live` blocks in `convex/schema.ts`) | `questions`, `questionVotes`, `groups`, `groupSettings` |

## Functions other people can call

| Function | Returns | Who |
|---|---|---|
| `api.live.groups.leaderboard({ channel })` | `{ questions, teams: [{ team, color, label, members, correct, rank, ec }] }`, best first | anyone |
| `api.live.groups.mine({ channel })` | the signed-in student's `{ team, color, label }` or null | anyone |
| `api.live.groups.status({ channel })` / `setSize({ key?, channel, size })` | `{ size, locked, locksAt }` / set the team size | anyone / host or professor key |
| `api.live.past.past({ channel })` | ended polls with right answer, counts, the student's pick | anyone |
| `api.live.questions.list / ask / vote / remove` | questions per slide, post, upvote, delete | anyone signed in (delete: author or host) |

**Josh:** drop `<Leaderboard big />` from `src/teams/live/Leaderboard.tsx` into the professor view, or link to `#/live/leaderboard`. The team-size buttons already appear there for a host or anyone using the professor key. A per-slide question count or "top question" read function does not exist yet.

## Where it touches other teams' code

- **`convex/checkin/pass.ts`:** one line in `scan` calls `ensureGroup` (from `convex/live/groups.ts`) so a team is dealt when the teacher scans a pass. If Check-in rewrites `scan`, keep that line or teams stop being dealt (a student who opens `#/live` still gets one, via `groups.join`, which deals every team-less check-in in check-in order).
- **`polls` and `pollAnswers` (Check-in's quiz):** the leaderboard and past questions read `correct`, `open`, `kind`, `choices` and the answers. Renaming those breaks both.
- **`convex/checkin/prof.ts` / `amHost`:** `setSize` uses `requireProf`, so it follows the professor key. The demo key is readable in this public repo, so anyone who knows it can change the team size. Check-in plans to remove it after 10-29.
- **`convex/_generated/api.d.ts`:** I added entries by hand. Run `npx convex codegen` after merging.

## Backup branch warning

The runbook's Live slides restore (`git checkout origin/insurance -- src/teams/live convex/live`) replaces both folders. That deletes `convex/live/groups.ts`, and `convex/checkin/pass.ts` imports `ensureGroup` from it, so the build would fail. If Live slides is ever restored from `insurance`, also remove that import and the `ensureGroup` line in `pass.ts`.

## Privacy

- Anonymous questions store no name. The account key is stored (to block self-upvotes and allow delete) and is never returned by any query.
- The leaderboard and past questions show totals and counts only, never who answered what. No coordinates or student names are in the repo.

## Not done

- **"I'm lost" button** (the original Live slides must-do). The `lost` table and its read functions exist; nothing writes to it.
- **Check-in gate for questions.** Anyone signed in can post and upvote, not only checked-in students.
- **Teams are dealt at scan.** A student who is never scanned has no team and their answers do not score.
- **Before the lock** teams are dealt three at a time, so the newest ones can be under-filled; the lock fixes that. Late arrivals after the lock can leave a team under 3 only if every team is already at 4.
- **Re-dealing moves people.** If a quiz ended before the lock, teams change under it; scores follow the current team.
- **Final EC is not locked in or recorded.** The board shows the standing right now; nothing stores a result.
- **Not run end to end.** Try it on a dev backend: scan three passes, end a quiz, check the board, post and upvote a question from two profiles, page back a slide on a phone.
