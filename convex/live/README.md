# convex/live

Live slides' server code, called as `api.live.<file>.<function>`. Each file's header comment has the full rules; this is the map. "Professors" means professors and admins on the staff list (`requireProf`).

| File | Functions (who may call) | Tables it writes |
|---|---|---|
| `groups.ts` | `status`, `leaderboard`, `mine` (anyone); `join` (checked-in students); `setSize`, `roster`, `adjust`, `removePoints`, `pointLog`, `endDay`, `results` (professors); `lock` (internal, queued) | `groups`, `groupSettings`, `groupPoints`, `groupResults`, `lectures` (End day ends the class) |
| `questions.ts` | `list` (anyone, signed out too); `ask`, `vote` (checked-in students); `remove` (the author or a professor); `forHost`, `setStatus`, `answer`, `share`, `organize` (professors; `organize` is an action that calls Gemini); `applyTopics` (internal) | `questions`, `questionVotes` |
| `lost.ts` | `toggle` ("I'm lost", checked-in students) | `lost` |
| `read.ts` | `lostCount`, `lostBySlide`, `mine` (anyone; no read returns who tapped). What the other pages read from Live slides | none |
| `past.ts` | `past` (anyone: this class's ended quizzes and votes, with the caller's own pick) | none |

#/host's Points tab calls `groups.ts`, its Questions tab `questions.ts`, and its header `read.ts`; see `src/teams/host/TEAM.md`. Shared tables and who reads them: docs/contracts.md.
