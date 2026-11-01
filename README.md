# RCC Live Lecture

Students check in to a lecture by showing a QR pass at the door, follow the professor's slides on their phones, answer quizzes, ask questions and play on small teams for extra credit, live. GDG on Campus RCC built it at the 10-29 meeting.

- Live: <https://sam-t-g.github.io/rcc-live-lecture/>
- Agents: read [AGENTS.md](AGENTS.md), then [BLOCKS.md](BLOCKS.md), [docs/contracts.md](docs/contracts.md) and, for screens, [docs/design.md](docs/design.md).
- What the product does and how data moves through it: [docs/direction.md](docs/direction.md). A class day: [docs/runbook.md](docs/runbook.md).

## Pages

| Page | Who | What it does |
|---|---|---|
| `#/checkin/student` | students | sign in with Google and show the QR pass the door scans |
| `#/live` | students | the slide the professor is on, paging back, I'm lost, the quiz, your team, questions |
| `#/portal` | students | the slide alone, paging back through slides already shown |
| `#/checkin/teacher` | professors | scan passes with the laptop camera, set when class starts, attendance CSV, End class |
| `#/checkin/quiz` | professors | ask a quiz question or a vote and see the results |
| `#/host` | professors | the professor view: AI-drafted quiz questions, who got it wrong, team points, students' questions |
| `#/admin` | staff | admins add professors and scanners; professors pair door iPads |
| `#/checkin/stage` | projector | the deck full screen with the check-in QR, the count and the open quiz |
| `#/live/leaderboard` | projector | the team board |
| `#/checkin/kiosk` | the door iPad | a pairing code, then the pass scanner |
| `#/lab` | builders | every building block, one panel each |
| `#/ui` | builders | the design kit, light and dark |

The iOS app in [ios/](ios/README.md) shows the live slide and pages back, like #/portal. It reads three public queries and has no sign-in.

## Set up a laptop

1. Get invited to the Convex team (Sam) and to this repo.
2. `git clone https://github.com/Sam-T-G/rcc-live-lecture && cd rcc-live-lecture && npm ci`
3. `npx convex dev`: log in, pick the existing project `rcc-live-lecture`. This makes your own dev backend and writes `.env.local`. Leave it running.
4. Add your deployment's host (`<name>.convex.cloud`) to `DEV_HOSTS` in both `convex/auth.config.ts` and `convex/checkin/prof.ts`. That turns on the typed test sign-in (only `npm run dev` builds show it) and test roles on your backend. Then sign in with the typed form as an `@test.local` email and give it a role: `npx convex run staff:devGrant '{"email":"prof1@test.local","role":"professor"}'` (it lasts 2 hours; `staff:devRevoke` ends it). Google refuses http://localhost:5173 for now, so this is how you open the professor pages and #/admin locally.
5. Ask Sam to set `DECK_BRIDGE_KEY` on your dev backend if you need the slide feed, and the Gemini vars if you work on AI features. `ADMIN_EMAILS` only works for a Google sign-in, so it does nothing on localhost.
6. `scripts/doctor.sh` until it says Ready (it still says ADMIN_EMAILS opens the professor pages locally; step 4 is what works). Then `npm run dev`, open <http://localhost:5173/#/lab>, and check each panel.

Before every commit, run the gate: `npm run build && npm run lint && npm test && npm run typecheck:convex`.

## Env vars on a backend

Only Sam sets these (`npx convex env set` is blocked for agents), on dev and prod:

| Name | What it does |
|---|---|
| `ADMIN_EMAILS` | comma-separated Google accounts that are always admins and can't be removed on #/admin |
| `DECK_BRIDGE_KEY` | the key in the deck's `?bridge=` link; `POST /deck` refuses a press without it. Dev and prod have different keys |
| `GEMINI_API_KEY` | the AI buttons on #/host (draft a question, what the room got wrong, group by topic) |
| `GEMINI_MODEL_FAST`, `GEMINI_MODEL_SMART` | the model IDs for the fast and smart tiers (`GEMINI_MODEL` is the fallback for both). With none set, every AI button says "The AI isn't set up on this server." |

`PROFESSOR_KEY`, `KIOSK_KEY` and `HOST_EMAILS` open nothing any more; Sam's session removes them after the deploy (`HOST_EMAILS` is read once by `staff:importHostEmails`).

## Google sign-in

The OAuth client is the club's deck relay client (`954308885597-…`, Google Cloud project behind `rcc-deck-relay`), so a token from this app also works on the relay's backend and the other way round. Its **Authorized JavaScript origins** must include every address the app runs from: `https://sam-t-g.github.io` (works) and `http://localhost:5173` (added, but Google still refuses it). Google Cloud Console → APIs & Services → Credentials → that OAuth client → Authorized JavaScript origins.

## Deploy

Sam only, between classes (AGENTS.md status item 5, docs/runbook.md). `scripts/deploy.sh` from a clean `main`: pushes `convex/` to prod, builds against it, and publishes `dist/` to the `gh-pages` branch.
