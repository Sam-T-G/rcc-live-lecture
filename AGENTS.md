# Agent rules: RCC Live Lecture

## Status (2026-10-31)

The 10-29 sprint is over and all three teams' work is merged on `main`. Where this file, BLOCKS.md, docs/contracts.md, a `TEAM.md` or `.claude/commands/` says something different from this section, follow this section. That includes the Sign-in row under "The stack" and the host-only bullet under "Convex rules that bite" below, which still describe the professor key.

Sam decided on 2026-10-30:

1. **Quiz, teams and questions:** the professor view (#/host) moves onto the tables students already use: `polls`/`pollAnswers` for quizzes and votes, `groups`/`groupSettings` for teams and the 5/3/1 leaderboard, and `questions`/`questionVotes` for student questions. Its own tables (`quizQuestions`, `answers`, `hostRooms`, `pointEvents`, `studentQuestions`) stop being used, and their definitions stay in `convex/schema.ts` because prod has rows in them.
2. **Pushing:** each verified change goes to `main`. Run the gate below, stage files by name, commit with one line that says what changed, then `git pull --rebase && git push`. Only Sam deploys, so never run `npx convex deploy`, `scripts/deploy.sh`, or `npx convex env set` or `remove`.
3. **Tests:** vitest and convex-test (exact versions in `package.json`) run every Convex function against an in-memory backend. A module's tests are in `<file>.test.ts` next to it, the shared helpers are in `convex/test.helpers.ts`, and `convex/coverage.test.ts` fails when a function has no test, when a host-only function (its handler calls `requireProf`, `requireAdmin`, `requireScanner` or `requireHost`; convex/host/ included) has no `authMatrix` test, when any function takes a `key` arg, or when a Convex test file's code, outside comments, strings and regexes, has the word `skip`, `skipIf`, `runIf`, `todo`, `fails` or `only`, as in `it.skip`, `it.only` or `{ skip: true }`: `vitest run` still exits 0 with those, and coverage would count a function whose only test never ran. Write `await authMatrix(HOST_ONLY, (as) => as.query(api.checkin.read.names, { channel: "gdg" }))`, with `ADMIN_ONLY` for the staff list and `SCANNER` only for `checkin.pass.scan` and `canScan`. authMatrix runs the call as ten callers, each on its own fresh backend (signed out, a Google student, an unverified Google admin, a typed admin on prod, an unpaired iPad, a scanner, a paired iPad, a typed test-email professor on a dev backend, a Google professor, a Google admin), and fails the test when any of them gets a different result from the one the matrix lists. The callback is `(as, t, device)`: it calls only the function it checks, as `as`, passes `device` to a function that takes one, and does any setup on `t`.
4. **Access by email role, no keys:** three roles, one per email in the `staff` table: `admin` (manages access and can do everything a professor can), `professor` (every professor page and function) and `scanner` (scans passes at the door, nothing else). The `ADMIN_EMAILS` env var lists permanent admins, who can't be changed or removed on #/admin. A role counts only for a Google sign-in with a verified email. The checks are `requireProf(ctx)`, `requireAdmin(ctx)`, `requireScanner(ctx, device?)` and `staffRole(ctx)` in `convex/checkin/prof.ts` (`requireHost` in `convex/lib.ts` is `requireProf`); host-only functions take no key and start with `requireProf(ctx)`. Pages wrap in `<StaffGate>` (`src/teams/checkin/prof.tsx`). #/admin lists people, door iPads and the last 50 changes for admins; professors pair and unpair door iPads there. #/checkin/kiosk without a staff sign-in shows a 6-digit pairing code for 10 minutes; once a professor types it on #/admin, that iPad scans with its device token (kept in localStorage; the server stores only its SHA-256) until someone unpairs it. `PROFESSOR_KEY`, `KIOSK_KEY` and `HOST_EMAILS` open nothing; `DECK_BRIDGE_KEY` stays, as the deck's slide feed. `convex/staff.ts` lists every function the pages call and who may call it.
   **Dev backends:** only on the dev backends listed in `DEV_HOSTS` in `convex/checkin/prof.ts` (Sam's `quaint-swan-637`; add your own dev deployment's host there to use test roles on it, never prod's), a typed sign-in holds a role only with an `@test.local` email that `npx convex run staff:devGrant '{"email":"prof1@test.local","role":"professor"}'` or #/admin gave one, for 2 hours. On #/admin a test sign-in can add, change and remove only `@test.local` emails, and an iPad it pairs stops scanning when its role ends. `staff:devRevoke` ends all of that at once; devGrant refuses on any backend not in `DEV_HOSTS`, prod included. The typed signing key is public, so anyone can use a test role while it lasts: keep real student data off dev.
   **Prod:** its staff list starts empty. After Sam deploys this, his session runs `staff:importHostEmails` on prod once, so the professors on prod's `HOST_EMAILS` get the professor role, and removes the `PROFESSOR_KEY` and `KIOSK_KEY` env vars from dev and prod.
5. **Sign-in:** everyone signs in with Google on the live site. Student screens (`<StudentSignIn />`: #/checkin/student, the questions on #/live) and staff screens (`<SignInButton />`) show Google's button. The typed test form (a name and an email, "Test sign-in (dev only)") shows under it only in `npm run dev` builds: `npm run build` leaves the form and `src/blocks/devLogin.ts` out, and `convex/auth.config.ts` lists the typed issuer only on the dev backends in its `DEV_HOSTS` (the same list as `convex/checkin/prof.ts`; a test fails when they differ), so prod refuses typed tokens. Its signing key is public, and Google and the typed form give the same email two identities on the server (a second pass, a second attendance row), which is why prod takes Google alone. A live build drops a typed sign-in left in a browser, and any sign-in the server refuses is dropped so the sign-in shows again. Google refuses http://localhost:5173 for now, so dev checks use the typed form with a test email; after the deploy that ships this, check one real Google sign-in on #/checkin/student on the live site.

**The gate** must pass before every commit: `npm run build && npm run lint && npm test && npm run typecheck:convex`, with 0 lint errors.

An agent working in a git worktree tests Convex code with convex-test only and never runs `npx convex` against any deployment. Step 6's seed command below is only for an agent that was told to use the dev backend.

A platform where students check in to a lecture and follow and interact with the professor's slides from their phones, live. Built by GDG on Campus RCC in timed team sprints, with one Claude Code agent per team lead. This file is the only rule file; `CLAUDE.md` imports it.

Read before any change: this file, [BLOCKS.md](BLOCKS.md) (the building blocks and how to call them), [docs/contracts.md](docs/contracts.md) (what each team reads from the others), and your team's `src/teams/<team>/TEAM.md`. During a meeting, `TEAM.md` beats your own ideas about what to build.

**The teams:** `checkin` (#/checkin/kiosk and #/checkin/join), `live` (#/live), `host` (#/host, hosts only). Their pages, tables, and read functions already exist; each team fills in its own. Asks arrive through `/next` (`.claude/commands/next.md`) and the team ships with `/freeze`. The run of the meeting is [docs/meeting-1029.md](docs/meeting-1029.md).

## The stack

| Layer | What | Where |
|---|---|---|
| Frontend | Vite + React 19 + TypeScript, hash routes | `src/` |
| Backend | Convex: database, server functions, live queries, HTTP routes | `convex/` |
| Sign-in | Students type a name and email (a typed sign-in, accepted on prod since 2026-10-29), and a typed sign-in is never a host. Professors type the professor key (`PROFESSOR_KEY`). Convex also accepts Google ID tokens (a Google account on `HOST_EMAILS` is a host), but no page shows a Google button right now | `src/blocks/auth.tsx`, `src/blocks/devLogin.ts`, `convex/auth.config.ts`, `convex/checkin/prof.ts`, `src/teams/checkin/prof.tsx` |
| AI | Gemini through a Convex action; the key never reaches the browser | `convex/ai.ts` |
| Slides | deck-kit decks send their current slide through `public/deck-bridge.js` | `convex/http.ts`, `convex/deck.ts` |
| Vision | MediaPipe Tasks in the browser (gestures, hands, pose, faces, face mesh, objects, classify), on the device | `src/blocks/vision.ts` |
| Hosting | GitHub Pages (`gh-pages` branch) + Convex prod | `scripts/deploy.sh` |

No other frameworks, UI kits, routers, or state libraries. Ask the lead before adding any npm package; if they say yes, pin the exact version.

## How to work during a sprint

1. **Read `TEAM.md`.** Build only what serves its "For" and "Must do" lines. If the ask doesn't fit them, say so before writing code. When the lead pastes the team sheet from the Google Doc, update `TEAM.md` with it (it already exists).
2. **Small steps that run.** After every change the app still builds and the page still loads. Run the gate (`npm run build && npm run lint && npm test && npm run typecheck:convex`, 0 lint errors) before saying a step is done.
3. **Stay in your lane.** Each team owns its folders (below). Touch shared files only where marked, and say when you do.
4. **Reuse a block before writing new plumbing.** Sign-in, QR codes, location, the slide feed, and AI calls already exist. Never write a second version.
5. **Report in plain words.** After each step, tell the lead in two or three sentences what changed and what to try in the browser. The room hears it read aloud.
6. **Your backend is yours alone.** Every lead's dev deployment has its own data, so another team's tables look empty until the merge at freeze. Build against the read functions in docs/contracts.md and fill them with `npx convex run dev/seed:fill '{"channel":"gdg"}'`.
7. **Never touch prod.** No `npx convex deploy`, no `scripts/deploy.sh`, no env changes; `.claude/settings.json` blocks them. Sam deploys `main` at the review break and at freeze.

## Who owns what

| Path | Owner |
|---|---|
| `src/teams/<team>/`, `convex/<team>/` | That team only |
| `src/pages/index.ts` | Done: the three team pages are registered. Add a route inside your own `Page.tsx` with `useRoute()` instead |
| `convex/schema.ts` | Shared: each team's tables are in its own `// team: <name>` block. Add fields or tables only inside yours |
| `src/blocks/`, `convex/dev/`, `convex/lib.ts`, `convex/ai.ts`, `convex/deck.ts`, `convex/http.ts`, `public/deck-bridge.js`, `src/index.css` | Leads only. Ask before changing |
| `convex/auth.config.ts`, `scripts/`, `AGENTS.md`, `BLOCKS.md` | Sam only |

A team's Convex functions live in `convex/<team>/<file>.ts` and are called as `api.<team>.<file>.<function>`.

## Convex rules that bite

- Every function has `args` validators. Add `returns` validators too.
- Who is calling: `ctx.auth.getUserIdentity()` on the server. Key users by `identity.tokenIdentifier`. Never take a user ID, email, or "isHost" as an argument.
- Host-only functions take `key: v.optional(v.string())` and call `requireProf(ctx, key)` (`convex/checkin/prof.ts`) first, which passes only for the `PROFESSOR_KEY` value or a Google account on `HOST_EMAILS`. `requireHost(ctx)` (`convex/lib.ts`) passes only for a Google account on `HOST_EMAILS`, never for a typed sign-in. Students are anyone signed in.
- Queries read with indexes (`withIndex`), never `.filter` on a table scan. Name indexes after their fields (`by_session_and_user`).
- Queries can't call `fetch` or use the current time meaningfully. Time-based rules (a QR that expires) go in mutations with `Date.now()`; outside calls (Gemini) go in actions.
- Secrets live in Convex env (`npx convex env set NAME value`), never in code, `.env.local`, or the repo.
- **One dev deployment per laptop.** `npx convex dev` gives each person their own dev backend, so two leads never overwrite each other's functions. Data is separate too: the shared, live version is prod, deployed from `main` by Sam.

## Privacy (the repo is public)

- Never commit student names, emails, locations, or attendance. They live only in Convex.
- Location: ask only from a button press, send it to a mutation, check distance there with `metersBetween`, and store only what the feature needs (the distance, not the coordinates, unless a team decides otherwise and says why).
- Camera: only through `src/blocks/camera.ts` (`useCamera`); MediaPipe only through `src/blocks/vision.ts`, loaded with `React.lazy` so it stays out of the phone bundle. Start the camera from a button press; frames stay on the device; send counts or labels, never images or face data. Microphone: no block uses it. A team that uses either says so in `TEAM.md` under "What it sees".

## Commands

```sh
npm install                 # once
npx convex dev              # your own dev backend; leave it running, it pushes on save
npm run dev                 # the app at http://localhost:5173 (and on your LAN IP for phones)
npm run build               # typecheck + build; run before calling a step done
scripts/deploy.sh           # Sam: Convex prod + GitHub Pages, from main
```

Phones on the same Wi-Fi can open the dev server at the LAN address Vite prints, but campus Wi-Fi may block it, and location needs HTTPS. For phone tests, use the deployed site.

## Copy on screen

Plain, short, literal, the way a student would say it out loud. Name the thing ("Scan to check in"), never narrate the screen ("This panel shows..."). No idioms or jargon. Numbers over adjectives.
