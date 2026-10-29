# RCC Live Lecture

Students check in to a lecture and follow and interact with the professor's slides from their phones, live. Built by GDG on Campus RCC.

The building blocks (Google sign-in, live data, QR codes, phone location, the slide feed from a deck, AI calls, shared screen parts) are built and tested on the lab page. Three teams build the product on top of them: Check-in, Live slides, and Professor view. Each has its page, `TEAM.md`, and the tables it shares with the others ready. How the 10-29 build runs: [docs/meeting-1029.md](docs/meeting-1029.md).

- Live: <https://sam-t-g.github.io/rcc-live-lecture/> · lab: <https://sam-t-g.github.io/rcc-live-lecture/#/lab>
- Agents: read [AGENTS.md](AGENTS.md), then [BLOCKS.md](BLOCKS.md) and [docs/contracts.md](docs/contracts.md). Where the product is headed: [docs/direction.md](docs/direction.md). Team sheets: `src/teams/<team>/TEAM.md`.

## Set up a laptop (each lead, once)

1. Get invited to the Convex team (Sam) and to this repo.
2. `git clone https://github.com/Sam-T-G/rcc-live-lecture && cd rcc-live-lecture && npm install`
3. `npx convex dev`: log in, pick the existing project `rcc-live-lecture`. This makes your own dev backend and writes `.env.local`. Leave it running.
4. Set your dev backend's env vars: `npx convex env set HOST_EMAILS "you@gmail.com"` and `npx convex env set DECK_BRIDGE_KEY <the value Sam sends you>` (`GEMINI_API_KEY` only if your team adds AI).
5. `scripts/doctor.sh` until it says Ready, and send Sam the dev deployment name it prints.
6. `npm run dev`, open <http://localhost:5173/#/lab>, and check each panel.

## Google sign-in

The OAuth client is the club's deck relay client (`954308885597-…`, Google Cloud project behind `rcc-deck-relay`). Its **Authorized JavaScript origins** must include every address the app runs from:

- `https://sam-t-g.github.io`
- `http://localhost:5173`
- `http://localhost`

Google Cloud Console → APIs & Services → Credentials → that OAuth client → Authorized JavaScript origins.

## Deploy

`scripts/deploy.sh` from a clean `main`: pushes `convex/` to the prod deployment, builds against it, and publishes `dist/` to the `gh-pages` branch. Prod env vars (`HOST_EMAILS`, `DECK_BRIDGE_KEY`, `GEMINI_API_KEY`) are set with `npx convex env set --prod ...`.
