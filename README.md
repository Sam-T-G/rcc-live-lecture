# RCC Live Lecture

Students check in to a lecture and follow and interact with the professor's slides from their phones, live. Built by GDG on Campus RCC.

Right now the repo holds only the building blocks: Google sign-in, live data, QR codes, phone location, the slide feed from a deck, and AI calls, each tested on the lab page. The product gets built on top of them in team sprints.

- Live: <https://sam-t-g.github.io/rcc-live-lecture/> · lab: <https://sam-t-g.github.io/rcc-live-lecture/#/lab>
- Agents: read [AGENTS.md](AGENTS.md), then [BLOCKS.md](BLOCKS.md). Where the product is headed: [docs/direction.md](docs/direction.md). Team sheet: [templates/TEAM.md](templates/TEAM.md).

## Set up a laptop (each lead, once)

1. Get invited to the Convex team (Sam) and to this repo.
2. `git clone https://github.com/Sam-T-G/rcc-live-lecture && cd rcc-live-lecture && npm install`
3. `npx convex dev`: log in, pick the existing project `rcc-live-lecture`. This makes your own dev backend and writes `.env.local`. Leave it running.
4. Set your dev backend's env vars (ask Sam for the values): `npx convex env set HOST_EMAILS "you@gmail.com"`, `DECK_BRIDGE_KEY`, `GEMINI_API_KEY`.
5. `npm run dev`, open <http://localhost:5173/#/lab>, and check each panel.

## Google sign-in

The OAuth client is the club's deck relay client (`954308885597-…`, Google Cloud project behind `rcc-deck-relay`). Its **Authorized JavaScript origins** must include every address the app runs from:

- `https://sam-t-g.github.io`
- `http://localhost:5173`
- `http://localhost`

Google Cloud Console → APIs & Services → Credentials → that OAuth client → Authorized JavaScript origins.

## Deploy

`scripts/deploy.sh` from a clean `main`: pushes `convex/` to the prod deployment, builds against it, and publishes `dist/` to the `gh-pages` branch. Prod env vars (`HOST_EMAILS`, `DECK_BRIDGE_KEY`, `GEMINI_API_KEY`) are set with `npx convex env set --prod ...`.
