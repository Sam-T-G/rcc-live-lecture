---
description: Freeze: commit this team's work and push it so Sam can deploy it for the demos
---
It's freeze time. Ship what runs; drop what doesn't.

1. Run `npm run build`. If it fails, undo the last change that broke it (`git diff` shows it), and build again. A smaller app that runs beats a bigger one that doesn't.
2. Stage only our team's files: `src/teams/<team>/`, `convex/<team>/`, and our own `// team:` block in `convex/schema.ts` if we changed it. Never stage `.env.local`.
3. Commit with a message that says what the app does now, in one line.
4. `git pull --rebase`, then `git push`. If the rebase stops on a conflict, stop and tell me which file; don't resolve it by deleting the other team's work.
5. Tell me in one sentence that it's pushed, and the page our demo starts on (for example `#/checkin/kiosk`).
