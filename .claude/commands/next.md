---
description: Hand the agent the next change to build
argument-hint: <the change, with why and how we'll know it's done>
---
This is the next change to build:

$ARGUMENTS

Before writing any code:

1. Read AGENTS.md (its "Status" section comes first), BLOCKS.md, docs/contracts.md, and the `TEAM.md` of the module the change is in (`src/teams/checkin/`, `live/` or `host/`). For any change to a screen, also read docs/design.md. If you can't tell which module it is, ask me.
2. If the change goes against Sam's decisions in AGENTS.md "Status" or the module's `TEAM.md`, say so in one sentence and stop.

Then:

3. Build it in the smallest step that runs. Keep to the module's files; if another module's file or a shared one has to change, keep that part small and tell me which file and why. Reuse a block from BLOCKS.md or a kit part from docs/design.md before writing new plumbing.
4. Add or change the tests next to the code you changed. Run the gate: `npm run build && npm run lint && npm test && npm run typecheck:convex` (0 lint errors). If any step fails, fix it before you answer.
5. Reply in two or three plain sentences: what changed, and exactly what to open, click, or tap to see it. When it's ready to push, I'll run `/freeze`.
