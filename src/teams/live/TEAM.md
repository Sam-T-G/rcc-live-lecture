# Team: Live slides

The PM keeps this current; the agent reads it before every change. Copied from the team's Google Doc (the doc is the source during the meeting; paste the sheet here when it changes).

**The product, in one line (the whole room's):** When students check in and follow the slides on their phones, the professor sees who's here and who's lost. (Starting point; the room can rewrite it.)

| | |
|---|---|
| For | [one real person, from the doc] |
| Problem | [what goes wrong for them today] |
| Must do | A student in the room sees the slide the professor is on, on their phone, and can tap "I'm lost" on it. (starting point; the team may change it) |
| Not doing | [what we cut] |
| On screen | [the exact words, from the designer] |
| What it sees | Sign-in, and the slide text the deck sends (headings and visible lines, never notes). Keeps one row per lost tap: who and which slide. Questions: the text, the slide, and the sign-in name only if the student didn't choose anonymous; the account key is kept to stop self-upvotes and allow delete, and is never sent to any screen. One row per upvote. Groups: a small team (3 or 4 students, named by color) per checked-in student, no names shown; the board shows only totals. |
| Tests | 1. [real-input check] 2. [ ] 3. [ ] |
| Next ask | [the top Waiting row in the doc's queue] |

## Where it lives

- Pages: #/live (phone). Already registered; build in `src/teams/live/Page.tsx` and files next to it.
- Server: `convex/live/`. Functions are called as `api.live.<file>.<function>`.
- Data: Writes `lost`, `questions`, `questionVotes` (`convex/live/questions.ts`: `list`, `ask`, `vote`, `remove`), and `groups` and `groupSettings` (`convex/live/groups.ts`: `leaderboard`, `mine`, `join`, `size`, `setSize`). Reads `polls` and `pollAnswers` from Check-in's quiz to score the groups and to show students past questions (`convex/live/past.ts`: `past`, ended questions only). Keeps `convex/live/read.ts` working: `lostCount`, `lostBySlide`, `mine`. Reads `checkin/read:me` to let only checked-in people in (optional until Check-in has merged). See docs/contracts.md.
- Channel: `CHANNEL` from `src/blocks/deck.ts` (`"gdg"`).
- Only two teams? Also show how many are lost under the slide on the professor's laptop.

## Seats

Lead · PM · Designer · QA + Trust · Launch (names stay in the Google Doc, never in the repo)
