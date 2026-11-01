# convex/host

This folder has no code. The old professor view's functions (`api.host.*`) were deleted in UZ, and `convex/retired.test.ts` fails if any code file is added here.

#/host runs on the modules students already use:

- `convex/checkin/quiz.ts`: the Now tab's quiz and vote, "Who got it wrong" and the AI drafts.
- `convex/live/groups.ts`: the Points tab's teams, point changes, End class and the extra credit CSV.
- `convex/live/questions.ts`: the Questions tab.
- `convex/live/read.ts` and `convex/checkin/read.ts`: the header's lost and checked-in counts.

The old tables (`quizQuestions`, `answers`, `hostRooms`, `pointEvents`, `studentQuestions`) stay defined in `convex/schema.ts` because prod has rows in them; nothing reads or writes them. A new #/host feature goes in the module that owns its table. See `src/teams/host/TEAM.md`.
