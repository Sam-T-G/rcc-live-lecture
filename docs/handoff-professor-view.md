# Professor view (#/host): handoff

> **History.** This was the Professor view team's handoff from the 10-29 meeting. It described a separate system (functions in `convex/host/`, its own quiz, points and question tables, red/yellow/blue teams, the professor key) that Sam retired on 2026-10-30 (decision 1 in AGENTS.md). The full old text is in git: `git show 9717e0b:docs/handoff-professor-view.md`.

What carried over, and where it lives now:

| Then | Now |
|---|---|
| Ask the room, AI-drafted question, "Who is missing it" note | #/host Now on `polls`/`pollAnswers`: `checkin.quiz.ask`, `end`, `stats`, `missing`, `draftQuestion`, `feedback` (`convex/checkin/quiz.ts`) |
| Teams, points, deductions and bonuses, End day | #/host Points on `groups`, `groupPoints` and `groupResults`: `convex/live/groups.ts` (End class is `endDay`) |
| Student questions, public or private, AI grouping, typed answers, share with students | #/host Questions on `questions`/`questionVotes`: `convex/live/questions.ts` (`forHost`, `answer`, `share`, `organize`) |
| Who may open #/host | professors and admins on the staff list, through `<StaffGate>` and `requireProf(ctx)` |

The spec for the page now is [src/teams/host/TEAM.md](../src/teams/host/TEAM.md); the table and function list is [contracts.md](contracts.md).
