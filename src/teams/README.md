# Team folders

One folder per page group from the 10-29 sprint, each with `Page.tsx` (routed in `src/pages/index.ts`) and `TEAM.md` (what the agent reads before changing it):

- `checkin/`: #/checkin/student, teacher, kiosk, quiz and stage. Server code in `convex/checkin/`.
- `live/`: #/live and #/live/leaderboard. Server code in `convex/live/`.
- `host/`: #/host, the professor view. It has no server folder of its own: it calls `convex/checkin/quiz.ts` and `convex/live/` (see `host/TEAM.md`), and `convex/host/` takes no code.

Outside this folder: `src/portal/` is #/portal (the live slide alone, paging back through slides already shown), and `ios/` is the iOS app that does the same (see `ios/README.md`). What the pages share is in docs/contracts.md.
