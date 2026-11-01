# convex/checkin

Check-in's server code, called as `api.checkin.<file>.<function>`. Each file's header comment has the full rules; this is the map. "Professors" means professors and admins on the staff list (`requireProf`).

| File | Functions (who may call) | Tables it writes |
|---|---|---|
| `prof.ts` | No Convex functions. The access checks every other file uses: `staffRole`, `requireProf`, `requireAdmin`, `requireScanner(ctx, device?)` | none |
| `pass.ts` | `mine`, `refresh` (the signed-in student's own pass); `scan` (scanner, professor, admin or a paired door iPad); `amHost`, `canScan` (anyone: whether this sign-in or device may open the professor pages or scan) | `passes`, `checkins`, `lectures` (a scan opens a class when none is open), `devices` (last used) |
| `attendance.ts` | `classStart`, `lateFeed`, `clock` (anyone); `myHideLate`, `setHideLate` (the signed-in student); `setClassStart`, `sheet`, `lectures`, `removeCheckin` (professors) | `lectures`, `classStarts`, `checkins` (remove), `passes` (hideLate) |
| `quiz.ts` | `current`, `mine` (anyone); `answer` (checked-in students); `ask`, `end`, `stats`, `history`, `missing`, `draftQuestion`, `feedback` (professors; the last two are actions that call Gemini) | `polls`, `pollAnswers`, `lectures` (asking opens a class) |
| `read.ts` | `count`, `me` (anyone); `names` (professors). What the other pages read from Check-in | none |

#/host's Now tab calls `quiz.ts`; see `src/teams/host/TEAM.md`. Shared tables and who reads them: docs/contracts.md.
