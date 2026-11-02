# Agent rules: RCC Live Lecture

Students check in to a lecture, follow the professor's slides on their phones, and answer quizzes and ask questions, live. GDG on Campus RCC built it at the 10-29 meeting in three teams (Check-in, Live slides, Professor view), each with its own Claude agent; it is one app on `main` now. This file is the only rule file; `CLAUDE.md` imports it.

Read before any change: this file, [BLOCKS.md](BLOCKS.md) (the building blocks and how to call them), [docs/contracts.md](docs/contracts.md) (every table, who writes and reads it, and the functions modules call across folders), the module's `src/teams/<team>/TEAM.md`, and [docs/design.md](docs/design.md) for any change to a screen. [docs/runbook.md](docs/runbook.md) is how a class day runs; [docs/direction.md](docs/direction.md) says what the product does and how data moves through it.

## Status (2026-10-31)

The 10-29 sprint is over and all three teams' work is merged on `main`. Where BLOCKS.md, docs/contracts.md, a `TEAM.md` or `.claude/commands/` says something different from this section, follow this section.

Sam decided on 2026-10-30:

1. **Quiz, teams and questions:** the professor view (#/host) moves onto the tables students already use: `polls`/`pollAnswers` for quizzes and votes, `groups`/`groupSettings` for teams and the 5/3/1 leaderboard, and `questions`/`questionVotes` for student questions. Its own tables (`quizQuestions`, `answers`, `hostRooms`, `pointEvents`, `studentQuestions`) stop being used, and their definitions stay in `convex/schema.ts` because prod has rows in them.
2. **Pushing:** each verified change goes to `main`. Run the gate below, stage files by name, commit with one line that says what changed, then `git pull --rebase && git push`. Only Sam deploys, so never run `npx convex deploy`, `scripts/deploy.sh`, or `npx convex env set` or `remove`.
3. **Tests:** vitest and convex-test (exact versions in `package.json`) run every Convex function against an in-memory backend. A module's tests are in `<file>.test.ts` next to it, the shared helpers are in `convex/test.helpers.ts`, and `convex/coverage.test.ts` fails when a function has no test, when a host-only function (its handler calls `requireProf`, `requireAdmin`, `requireScanner` or `requireHost`; convex/host/ included) has no `authMatrix` test, when any function takes a `key` arg, or when a Convex test file's code, outside comments, strings and regexes, has the word `skip`, `skipIf`, `runIf`, `todo`, `fails` or `only`, as in `it.skip`, `it.only` or `{ skip: true }`: `vitest run` still exits 0 with those, and coverage would count a function whose only test never ran. Write `await authMatrix(HOST_ONLY, (as) => as.query(api.checkin.read.names, { channel: "gdg" }))`, with `ADMIN_ONLY` for the staff list and `SCANNER` only for `checkin.pass.scan` and `canScan`. authMatrix runs the call as ten callers, each on its own fresh backend (signed out, a Google student, an unverified Google admin, a typed admin on prod, an unpaired iPad, a scanner, a paired iPad, a typed test-email professor on a dev backend, a Google professor, a Google admin), and fails the test when any of them gets a different result from the one the matrix lists. The callback is `(as, t, device)`: it calls only the function it checks, as `as`, passes `device` to a function that takes one, and does any setup on `t`.
4. **Access by email role, no keys:** three roles, one per email in the `staff` table: `admin` (manages access and can do everything a professor can), `professor` (every professor page and function) and `scanner` (scans passes at the door, nothing else). The `ADMIN_EMAILS` env var lists permanent admins, who can't be changed or removed on #/admin. A role counts only for a Google sign-in with a verified email. The checks are `requireProf(ctx)`, `requireAdmin(ctx)`, `requireScanner(ctx, device?)` and `staffRole(ctx)` in `convex/checkin/prof.ts` (`requireHost` in `convex/lib.ts` is `requireProf`); host-only functions take no key and start with `requireProf(ctx)`. Pages wrap in `<StaffGate>` (`src/teams/checkin/prof.tsx`). #/admin lists people, door iPads and the last 50 changes for admins; professors pair and unpair door iPads there. #/checkin/kiosk without a staff sign-in shows a pairing code (6 digits, or 8 while open requests hold every 6-digit code) for 10 minutes; once a professor types it on #/admin, that iPad scans with its device token (kept in localStorage; the server stores only its SHA-256) until someone unpairs it. `PROFESSOR_KEY`, `KIOSK_KEY` and `HOST_EMAILS` open nothing; `DECK_BRIDGE_KEY` stays, as the deck's slide feed. `convex/staff.ts` lists every function the pages call and who may call it.
   **Dev backends:** only on the dev backends listed in `DEV_HOSTS` (Sam's `quaint-swan-637`; to use test roles on your own dev deployment, ask Sam to add its host to `DEV_HOSTS` in both `convex/checkin/prof.ts` and `convex/auth.config.ts`, never prod's; he commits it, since the list decides which backends take typed sign-ins), a typed sign-in holds a role only with an `@test.local` email that `npx convex run staff:devGrant '{"email":"prof1@test.local","role":"professor"}'` or #/admin gave one, for 2 hours. On #/admin a test sign-in can add, change and remove only `@test.local` emails, and an iPad it pairs stops scanning when its role ends. `staff:devRevoke` ends all of that at once; devGrant refuses on any backend not in `DEV_HOSTS`, prod included. The typed signing key is public, so anyone can use a test role while it lasts: keep real student data off dev.
   **Prod:** its staff list starts empty. After Sam deploys this, his session runs `staff:importHostEmails` on prod once, so the professors on prod's `HOST_EMAILS` get the professor role, and removes the `PROFESSOR_KEY` and `KIOSK_KEY` env vars from dev and prod by hand (they open nothing now). Before the next class, it also runs `lectures:endEarlier '{"channel":"gdg"}'` on prod once: prod has no classes yet, so until one opens every 10-29 check-in counts and those students' pass pages say "You’re checked in." with no QR (convex/lectures.ts).
5. **Sign-in:** everyone signs in with Google on the live site. Student screens (`<StudentSignIn />`: #/checkin/student, the questions on #/live) and staff screens (`<SignInButton />`) show Google's button. The typed test form (a name and an email, "Test sign-in (dev only)") shows under it only in `npm run dev` builds: `npm run build` leaves the form and `src/blocks/devLogin.ts` out, and `convex/auth.config.ts` lists the typed issuer only on the dev backends in its `DEV_HOSTS` (the same list as `convex/checkin/prof.ts`; a test fails when they differ), so prod refuses typed tokens. Its signing key is public, and Google and the typed form give the same email two identities on the server (a second pass, a second attendance row), which is why prod takes Google alone. A live build drops a typed sign-in left in a browser, and any sign-in the server refuses is dropped and the form says "The server didn’t accept that sign-in." Google refuses http://localhost:5173 for now, so dev checks use the typed form with a test email; after the deploy that ships this, check one real Google sign-in on #/checkin/student on the live site. **Deploy this between classes:** `scripts/deploy.sh` pushes Convex before GitHub Pages, so prod refuses typed tokens at once, and a student tab opened before the deploy keeps the old typed form (which can't sign in on prod) until it reloads after Pages updates. A student who checked in with the typed form and signs in again with Google counts as a new student (a second pass and attendance row) for that class.

**The gate** must pass before every commit: `npm run build && npm run lint && npm test && npm run typecheck:convex`, with 0 lint errors.

An agent working in a git worktree tests Convex code with convex-test only and never runs `npx convex` against any deployment. The seed command under "How to work" is only for an agent that was told to use the dev backend.

## Pages

| Route | Who | What |
|---|---|---|
| `#/` | anyone | Home: a link to every page |
| `#/checkin/student` (also `#/checkin/join` and `#/checkin`) | students | sign in and show the QR pass the door scans |
| `#/checkin/teacher` | professors | scan passes with the laptop camera, set the class start and grace minutes, attendance CSV, past classes, End class |
| `#/checkin/kiosk` | the door iPad | the pairing code, then the pass scanner |
| `#/checkin/quiz` | professors | ask a quiz question or a vote, end it, see the results |
| `#/checkin/stage` | projector | the deck full screen with the check-in QR, the count, the open quiz and the late banner |
| `#/live` | students | the live slide with paging back, I'm lost, the quiz, the team, past quizzes and questions |
| `#/live/leaderboard` | projector | the team board |
| `#/portal` | students | the slide alone, paging back through slides already shown |
| `#/host` | professors | Now (ask the room, who got it wrong), Points (teams, point changes, End class), Questions |
| `#/admin` | staff | staff roles and door iPads |
| `#/lab` | builders | every building block, one panel each |
| `#/ui` | builders | the design kit, light and dark (`#/ui/projector` at projector size) |

The iOS app in `ios/` shows what #/portal shows. The route list is in `src/pages/index.ts`; a team page routes its own parts with `useRoute()` (BLOCKS.md, "Pages and routes").

## The stack

| Layer | What | Where |
|---|---|---|
| Frontend | Vite + React 19 + TypeScript, hash routes | `src/` |
| Backend | Convex: database, server functions, live queries, HTTP routes | `convex/` |
| Sign-in | Google for students and staff on the live site; the typed test form only in `npm run dev` builds, on the backends in `DEV_HOSTS`. Staff roles by email: the `staff` table and `ADMIN_EMAILS` (status item 4) | `src/blocks/auth.tsx`, `src/blocks/devLogin.ts`, `convex/auth.config.ts`, `convex/checkin/prof.ts`, `convex/staff.ts`, `src/teams/checkin/prof.tsx` |
| AI | Gemini through Convex actions; the key never reaches the browser | `convex/ai.ts` |
| Slides | deck-kit decks send each press through `public/deck-bridge.js` to `POST /deck` | `convex/http.ts`, `convex/deck.ts` |
| Classes | one class at a time per channel, from the first deck press, scan, saved start time or quiz to End class or the 12-hour close | `convex/lib.ts`, `convex/lectures.ts` |
| Vision | MediaPipe Tasks in the browser, on the device | `src/blocks/vision.ts` |
| Look | the GDG tokens and the kit | `src/styles/`, `src/blocks/kit.tsx`, docs/design.md |
| iOS | a SwiftUI app that reads three public queries | `ios/` |
| Hosting | GitHub Pages (`gh-pages` branch) + Convex prod, deployed by Sam | `scripts/deploy.sh` |

No other frameworks, UI kits, routers, or state libraries. Ask Sam before adding any npm package; if he says yes, pin the exact version.

## How to work

1. **Read the module's `TEAM.md` and the status above.** If an ask goes against them, say so in one sentence before writing code.
2. **Small steps that run.** After every change the app still builds and the page still loads. Run the gate before saying a step is done.
3. **Change your own module's files.** When a change needs another module's file or a shared one (table below), keep that part as small as the change needs, and name the file and the reason in your report and the commit message.
4. **Reuse a block or kit part before writing new plumbing.** Sign-in, staff gates, QR codes, the slide feed, classes, AI calls, the camera, buttons, tabs and confirm buttons already exist (BLOCKS.md, docs/design.md). Never write a second version. One exception: #/host keeps its own tab bar, because its three panels stay mounted (a half-written quiz and the AI note survive a tab switch) and kit `Tabs` renders only the open one.
5. **Report in plain words.** After each step, tell the person you work with in two or three sentences what changed and what to open, click or tap to see it.
6. **Test data on a dev backend** (only an agent told to use one): `npx convex run dev/seed:fill '{"channel":"gdg"}'` adds sample check-ins, lost taps, a quiz and questions, and `dev/seed:clear` removes them. fill runs only on the dev backends in `DEV_HOSTS`: to use it on your own deployment, ask Sam to add its host (`<name>.convex.cloud`) to `DEV_HOSTS` in `convex/checkin/prof.ts` and in `convex/auth.config.ts`, which also turns on typed test sign-ins and test roles there.
7. **Never touch prod.** No `npx convex deploy`, no `scripts/deploy.sh`, no env changes; `.claude/settings.json` blocks them. Sam deploys `main` between classes (docs/runbook.md).

## Who owns what

| Path | Owner |
|---|---|
| `src/teams/checkin/`, `convex/checkin/` | Check-in: the pass, the scanners, attendance, the quiz, the stage, the late banner, the staff gates (`prof.ts`, `prof.tsx`) |
| `src/teams/live/`, `convex/live/` | Live slides: #/live, I'm lost, questions, teams, points, End class and extra credit |
| `src/teams/host/` | Professor view (#/host). Its server functions are in `convex/checkin/` and `convex/live/`; `convex/host/` has no code left |
| `src/portal/` | #/portal. Reads `deck.current`, `deck.slides` and `checkin.attendance.lateFeed` |
| `ios/` | the iOS app (`ios/README.md`). Reads the same three queries, so a change to what they return also runs `ios/scripts/test.sh` |
| `src/pages/` | Home, Lab, Admin, the UI kit, and the route list in `index.ts` |
| `src/styles/`, `src/blocks/kit.tsx`, `src/index.css` | the design system (docs/design.md). Ask Sam before adding a token or a kit part |
| `convex/staff.ts` | access: the staff list, #/admin and door iPad pairing. Ask Sam before changing |
| `convex/schema.ts` | shared: each table sits in its module's `// team:` or `// Block:` block. Add fields or tables only inside yours |
| `src/blocks/`, `convex/lib.ts`, `convex/lectures.ts`, `convex/deck.ts`, `convex/http.ts`, `convex/ai.ts`, `convex/dev/`, `public/deck-bridge.js` | shared blocks. Ask Sam before changing |
| `convex/auth.config.ts`, `scripts/`, `.claude/`, `AGENTS.md`, `BLOCKS.md` | Sam only. Sam also adds every host to `DEV_HOSTS` (in `convex/auth.config.ts` and `convex/checkin/prof.ts`). One exception: the module that adds a route adds its row to the Pages table above |

A module's Convex functions live in `convex/<module>/<file>.ts` and are called as `api.<module>.<file>.<function>`.

## Convex rules that bite

- Every function has `args` and `returns` validators.
- Who is calling: `ctx.auth.getUserIdentity()` on the server. Key users by `identity.tokenIdentifier`. Never take a user ID, email, or "isHost" as an argument.
- Professor-only functions start with `requireProf(ctx)` (`convex/checkin/prof.ts`) and take no key; admin-only ones start with `requireAdmin(ctx)`. Pages for them wrap in `<StaffGate>`. Students are anyone signed in; a student's action in class also needs `checkedIn` (BLOCKS.md, "Classes").
- Every per-class read uses the class window: `.gte("_creationTime", start)` after the index's equality fields, and `.first()` for a student's own row, never `.unique()` (BLOCKS.md, "Classes").
- Queries read with indexes (`withIndex`), never `.filter` on a table scan. Name indexes after their fields (`by_channel_and_user`).
- Queries can't call `fetch` or use the current time meaningfully. Time-based rules (a pass code that expires) go in mutations with `Date.now()`; outside calls (Gemini) go in actions.
- Secrets live in Convex env, never in code, `.env.local`, or the repo. Only Sam sets them. Never print one: no `env list`, and an `env get` only into a shell variable.
- **One dev deployment per laptop.** `npx convex dev` gives each person their own dev backend, with its own data. The shared, live version is prod, deployed from `main` by Sam.

## Privacy (the repo is public)

- Never commit student names, emails, locations, or attendance. They live only in Convex.
- Who sees names: shared screens (the projector, the late banner, the team board) show first names at most; the door iPad shows each scanned student's first name and last initial for 3 seconds, never the email; a question posted by name shows the student's first name and last initial ("Ivy S.", `lib.shortName`) to everyone on #/live, signed out too; #/live, the door iPad and the late banner show "Someone" for a name that is the part of an email before the "@"; all emails and full names show only on professor pages; no query returns `user` (the sign-in id, which holds the email). Names never go to Gemini.
- Location: `src/blocks/location.ts` exists and no feature uses it. A feature that does asks from a button press, checks the distance in a mutation with `metersBetween`, and stores the distance, never the coordinates.
- Camera: only through `src/blocks/camera.ts` (`useCamera`); MediaPipe only through `src/blocks/vision.ts`, loaded with `React.lazy`. Start the camera from a button press; frames stay on the device; send counts, labels or a decoded QR code (the scanners send the pass code to `checkin.pass.scan`), never images or face data. Microphone: no block uses it. A module that uses either says so in `TEAM.md` under "What it sees".
- The camera, location and Google sign-in work only over https or on localhost. A scanner and the pass it reads have to be on the same backend: a page on a dev backend can't scan a prod pass.

## Commands

```sh
npm ci                     # once, and after package-lock.json changes
npx convex dev             # your own dev backend; pushes on save (never in a worktree)
npm run dev                # the app at http://localhost:5173
npm run build              # typecheck + build
npm run lint               # eslint; 0 errors
npm test                   # every test once: convex-test for convex/, node for src/
npm run test:watch         # the same, again on every save
npm run typecheck:convex   # tsc on convex/
ios/scripts/test.sh        # the iOS app's tests (npm test and CI don't build Swift)
scripts/deploy.sh          # Sam only: Convex prod + GitHub Pages, from main
```

## Copy on screen

Plain, short, literal, the way a student would say it out loud. Name the thing ("Scan to check in"), never narrate the screen ("This panel shows..."). No idioms or jargon. Numbers over adjectives.
