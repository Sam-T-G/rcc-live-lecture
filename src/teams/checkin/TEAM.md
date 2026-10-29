# Team: Check-in

The PM keeps this current; the agent reads it before every change. Copied from the team's Google Doc (the doc is the source during the meeting; paste the sheet here when it changes).

**The product, in one line (the whole room's):** When students check in and follow the slides on their phones, the professor sees who's here and who's lost. (Starting point; the room can rewrite it.)

| | |
|---|---|
| For | [one real person, from the doc] |
| Problem | [what goes wrong for them today] |
| Must do | A student scans the code at the door, signs in with Google, and shows up on the list for today. (starting point; the team may change it) |
| Not doing | [what we cut] |
| On screen | [the exact words, from the designer] |
| What it sees | Sign-in (name, email), location once from a button press. Keeps the name and the distance from the room, never the coordinates. |
| Tests | 1. [real-input check] 2. [ ] 3. [ ] |
| Next ask | [the top Waiting row in the doc's queue] |

## Where it lives

- Pages: #/checkin/kiosk (laptop or TV at the door), #/checkin/join (the phone after scanning). Already registered; build in `src/teams/checkin/Page.tsx` and files next to it.
- Server: `convex/checkin/`. Functions are called as `api.checkin.<file>.<function>`.
- Data: Writes `kiosks` and `checkins`. Keeps `convex/checkin/read.ts` working: `count`, `me`, `names`. See docs/contracts.md.
- Channel: `CHANNEL` from `src/blocks/deck.ts` (`"gdg"`).
- Only two teams? Also put the number of people checked in on the kiosk, big.

## Seats

Lead · PM · Designer · QA + Trust · Launch (names stay in the Google Doc, never in the repo)
