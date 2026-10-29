# Team: Professor view

The PM keeps this current; the agent reads it before every change. Copied from the team's Google Doc (the doc is the source during the meeting; paste the sheet here when it changes).

**The product, in one line (the whole room's):** When students check in and follow the slides on their phones, the professor sees who's here and who's lost. (Starting point; the room can rewrite it.)

| | |
|---|---|
| For | [one real person, from the doc] |
| Problem | [what goes wrong for them today] |
| Must do | The professor sees how many people checked in and how many are lost, on the slide it's about. (starting point; the team may change it) |
| Not doing | [what we cut] |
| On screen | [the exact words, from the designer] |
| What it sees | Reads counts and, for hosts only, the names of who checked in. Stores nothing new. |
| Tests | 1. [real-input check] 2. [ ] 3. [ ] |
| Next ask | [the top Waiting row in the doc's queue] |

## Where it lives

- Pages: #/host (hosts only: the Google accounts in HOST_EMAILS). Already registered; build in `src/teams/host/Page.tsx` and files next to it.
- Server: `convex/host/`. Functions are called as `api.host.<file>.<function>`.
- Data: Writes nothing to start. Reads `deck:current`, `checkin/read:count` and `names`, `live/read:lostCount` and `lostBySlide`. On your own laptop those tables are empty: fill them with `npx convex run dev/seed:fill '{"channel":"gdg"}'`. See docs/contracts.md.
- Channel: `CHANNEL` from `src/blocks/deck.ts` (`"gdg"`).
- Only two teams? This team doesn't run; Check-in and Live slides each take one number.

## Seats

Lead · PM · Designer · QA + Trust · Launch (names stay in the Google Doc, never in the repo)
