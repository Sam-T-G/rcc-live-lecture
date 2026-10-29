---
description: Send the next ask from your team doc's queue to the agent
argument-hint: <paste the ask, with its Why and Done when lines>
---
This is the next ask from our team's queue:

$ARGUMENTS

Before writing any code:

1. Read AGENTS.md, docs/contracts.md, and our TEAM.md (`src/teams/<team>/TEAM.md`). If you don't know our team yet, ask me which one: checkin, live, or host.
2. If the ask doesn't serve TEAM.md's "For" and "Must do" lines, say so in one sentence and stop.

Then:

3. Build it in the smallest step that runs. Stay in our team's folders. Reuse a block from BLOCKS.md before writing new plumbing.
4. Run `npm run build`. If it fails, fix it before you answer.
5. Reply in two or three plain sentences: what changed, and exactly what to open, click, or tap to see it. The lead reads this out loud to the team.
