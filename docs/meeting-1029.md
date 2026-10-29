# 10-29 meeting: how the build runs

GDG on Campus RCC, Thursday 2026-10-29, 2:30 to 3:30 pm, BLCIS A-210. The deck is `rcc-gdg/semesters/2026-fall/decks/2026-10-29-build-with-ai.html`. Three teams (Check-in, Live slides, Professor view) build one app in 45 minutes, each lead running Claude in this repo on their own laptop. By 3:21 it's on the live site and the room uses it from their phones.

## Before 2:30

**Sam, once:**

- [ ] Google Cloud Console → the deck relay OAuth client → Authorized JavaScript origins has `http://localhost:5173` (and `https://sam-t-g.github.io`). Test: `npm run dev`, open `#/lab`, sign in.
- [ ] Invite each lead to the Convex team and to this GitHub repo (write access).
- [ ] Share the four Google Docs as "anyone with the link can edit" (Help board, Check-in, Live slides, Professor view).
- [ ] Add every lead's Gmail to prod `HOST_EMAILS` (`npx convex env set --prod HOST_EMAILS "a@gmail.com,b@gmail.com"`), so whoever demos Professor view is a host.
- [ ] Send each lead the `DECK_BRIDGE_KEY` value privately (`npx convex env get DECK_BRIDGE_KEY`). Dev and prod use the same one.
- [x] Gemini key and model tiers set on Sam's dev and on prod (2026-10-29). A team that adds AI on another lead's laptop needs the same three env vars there.

**Each lead, on their laptop:**

- [ ] `git clone https://github.com/Sam-T-G/rcc-live-lecture && cd rcc-live-lecture && npm install`
- [ ] `npx convex dev` (log in, pick the existing project `rcc-live-lecture`), leave it running in its own terminal.
- [ ] `npx convex env set HOST_EMAILS "<your gmail>"` and `npx convex env set DECK_BRIDGE_KEY "<the value from Sam>"`.
- [ ] `scripts/doctor.sh` until it says Ready. Send Sam the dev deployment name it prints.
- [ ] `npm run dev`, open `http://localhost:5173/#/lab`, sign in with Google, press Ping.
- [ ] Open Claude Code in the repo. Try `/next` with a throwaway ask, then `git checkout .` to drop it.

**Sam, at 2:25:** open the deck with the slide feed on, sending to every lead's backend and to prod:

```
<deck URL>?bridge=gdg.<DECK_BRIDGE_KEY>&bridge-site=quaint-swan-637,utmost-ibis-818,<lead 2>,<lead 3>
```

## During the build

| Time | What happens | Agent side |
|---|---|---|
| 2:42 | Seats. Everyone opens their team's doc. | |
| 2:44 | Sprint 0 (8 min). Lead pastes the doc's "First message", then `/next` with ask 1. | Builds in `src/teams/<team>/`, `convex/<team>/` |
| 2:52 | Sprint 1 (14 min). The queue keeps the agent busy: `/next <ask>` each time. | Professor view runs `dev/seed:fill` to see numbers |
| 3:06 | Review (3 min). Every lead runs `/freeze` once (practice), then Sam runs `scripts/deploy.sh`. | Practice merge: finds conflicts while there's time |
| 3:09 | Sprint 2 (12 min). Top two changes, then stop. | |
| 3:19 | Every lead runs `/freeze`. | Build, commit team files, pull, push |
| 3:21 | Sam: `git pull`, `scripts/deploy.sh` (about a minute). Demos run on the live site. | |

Live site: `https://sam-t-g.github.io/rcc-live-lecture/` · kiosk `#/checkin/kiosk` · phone `#/live` · professor `#/host`. Put the kiosk on one screen and have the room scan it during the first demo; the deck keeps feeding prod, so phones follow it.

## The backup (branch `insurance`)

Working versions of all three parts, tested on dev: a kiosk whose code changes every 20 seconds with the room set from the host laptop's location, check-in with sign-in, location, and fresh-code and distance checks, "I'm lost" per slide, and a hosts-only professor view. Teams still build their own on `main`. At freeze, for a team whose own version isn't ready, Sam takes just that team's backup:

```sh
git fetch origin
git checkout origin/insurance -- src/teams/checkin convex/checkin convex/host/me.ts   # Check-in (needs the host check)
git checkout origin/insurance -- src/teams/live convex/live                          # Live slides
git checkout origin/insurance -- src/teams/host convex/host                          # Professor view
npx convex codegen && npm run build      # refresh the API types for the new functions, then check
git add -A src/teams convex && git commit -m "Use the backup for <team>" && scripts/deploy.sh
```

Tested on a fresh clone 2026-10-29: Check-in alone and all three together both build after `codegen`.

Each team's styles live in its own folder, so taking one team's backup never touches a shared file.

## Two leads instead of three

Professor view doesn't run. Check-in adds the count of who's here to its kiosk (`checkin/read:count`), Live slides adds a lost count under the slide (`live/read:lostCount`). The team docs and the deck notes say the same.

## When something breaks

| Problem | Do this |
|---|---|
| Google sign-in says the origin isn't allowed | The origin is missing from the OAuth client (Sam's checklist). Until it's fixed, build the screens signed out; the deploy uses `https://sam-t-g.github.io`. |
| A team's page shows no slide | Is the deck open with `&bridge-site=` naming that lead's deployment? Is the key the same? Press an arrow key once. |
| Professor view shows zeros | Expected on a lead's own backend before the merge: `npx convex run dev/seed:fill '{"channel":"gdg"}'`. |
| `/freeze` stops on a conflict | Usually `convex/schema.ts` or `src/index.css`. Keep both teams' lines, build, push. |
| `scripts/deploy.sh` fails | Read the first error. If it's one team's code, revert that team's last commit on main and deploy again; demo that team from its laptop. |
| No time to deploy | Demo each team from its lead's laptop. Phones can't reach a laptop, so the phone parts show on the laptop screen. |
