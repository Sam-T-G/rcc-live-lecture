# Team: [name]

Copy this to `src/teams/<module>/TEAM.md` when you start a new module, and keep it current with every change. The module's agent reads it before every change. Sam's decisions (AGENTS.md "Status") win over anything here. `src/teams/live/TEAM.md` is a filled-in example.

**Goal:** [who does what in class, and what they get from it, in one or two sentences]

## Must do

- [one line per thing the module's screens and functions do, with the exact words a student or professor sees on screen]

**Not doing:** [what the module leaves out, and why]

## What it sees

- **Sign-in:** [which rows keep the student's sign-in id (`tokenIdentifier`); no function sends it to a screen]
- **Names:** [which screens show a first name, a full name or an email. Shared screens (projector, late banner, team board) show a first name at most; emails and other full names show only on professor pages (AGENTS.md, "Privacy")]
- **AI:** [what goes to Gemini: slide text, question text, counts and team labels, never a name or an email. Or "No AI."]
- **Camera, location, microphone:** [what it uses and what it sends (counts, labels or a decoded QR code, never images or face data), or "No camera, location or microphone."]

## Where it lives

- Pages: `src/teams/<module>/Page.tsx` (routed in `src/pages/index.ts`) and [its other files]. Any other `#/<module>/<part>` shows "No page at #/<module>/<part>".
- Server: `convex/<module>/`, called as `api.<module>.<file>.<function>`. List each file's functions and who may call them (anyone, signed in, checked in, professor or admin), and the cross-module ones in docs/contracts.md.
- Tables: [what it writes and reads; every per-class read uses the class window (BLOCKS.md, "Classes")]. Add each table to docs/contracts.md.
- Channel: `CHANNEL` from `src/blocks/deck.ts` (`"gdg"`).

## Tests

- Server, convex-test: `convex/<module>/*.test.ts`, one test per function, and an `authMatrix` test for each professor-only one (AGENTS.md status item 3).
- Screens, rendered in Node: `src/teams/<module>/*.test.ts`.
- The gate: `npm run build && npm run lint && npm test && npm run typecheck:convex`.
