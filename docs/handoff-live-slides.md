# Handoff: Live slides work (questions, past questions, team leaderboard)

> **History.** This was the Live slides team's handoff after the 10-29 meeting, at commit `6f71729`. Its "Not done" list and its notes on the professor key are out of date: I'm lost, the check-in gate on questions, saved extra credit and ranking by right answers per student were all built since. The full old text is in git: `git show 9717e0b:docs/handoff-live-slides.md`.

Where each part lives now:

| Part | Where |
|---|---|
| The slide with paging back, I'm lost, the quiz card, past quizzes and votes, questions | #/live: `src/teams/live/Page.tsx`; `convex/live/lost.ts`, `past.ts`, `questions.ts` |
| Teams, points, the leaderboard, End class and extra credit | `convex/live/groups.ts` (its header comment is the full spec); #/live/leaderboard; #/host Points sets the team size |
| How Check-in deals teams | `checkin.pass.scan` calls `ensureGroup`; keep that call (docs/contracts.md) |

The spec for the module now is [src/teams/live/TEAM.md](../src/teams/live/TEAM.md); the table and function list is [contracts.md](contracts.md).
