---
description: Commit the finished change and push it to main (Sam deploys main between classes)
---
Commit and push the change we just finished.

1. Run the gate: `npm run build && npm run lint && npm test && npm run typecheck:convex` (0 lint errors). If it fails, fix the cause, or undo the change that broke it (`git diff` shows it), and run the gate again. Never push a failing gate.
2. Stage every file the change touched, by name (`git add <path> <path>`), never `git add -A` or `git add .`. Include `convex/_generated/` when `npx convex dev` regenerated it (a new or renamed Convex function or module changes `api.d.ts`; without it the build fails on `main`), and `package.json` and `package-lock.json` when they changed. Never stage `.env.local`.
3. Commit with one line that says what changed, for example `Add a Remove button to the teacher page's check-in list`. No Co-Authored-By line, and no "Generated with" line.
4. `git pull --rebase`, run the gate again if the pull brought in commits, then `git push`. If the rebase stops on a conflict, stop and tell me which file; never resolve it by deleting someone else's work.
5. Tell me in one sentence that it's pushed, and the page to open to see the change (for example `#/checkin/teacher`).
