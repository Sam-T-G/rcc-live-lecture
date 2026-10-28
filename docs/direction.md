# Direction (for leads, not for building ahead of time)

Where the room is being guided. Nothing here is built; the club designs it in the meeting. Leads use it to steer questions and to tell an agent what exists.

## The core loop

1. **Check in.** A kiosk (a laptop, iPad, or TV at the door) shows a QR code that changes every few seconds. A student scans it, signs in with Google, and shares their location once. The server checks that the code is fresh and the phone is near the room, then records attendance.
2. **Follow along.** Checked-in students see the professor's current slide on their phone, live, as the professor clicks through.
3. **Interact per slide.** Whatever the room designs: questions, "I'm lost", quick checks, an AI that explains the slide in plain words.
4. **The professor's view.** Attendance and what the room is saying, on the slide it's about.

## Blocks each step uses

| Step | Blocks |
|---|---|
| Check in | QR, sign-in, location, `randomCode`, `metersBetween` |
| Follow along | Deck bridge (`useDeckSlide`) |
| Interact | Live data, AI |
| Professor's view | Live data, `requireHost` |

## Likely tables (a suggestion the teams can change)

- `sessions`: code, title, owner, channel, current QR code and when it changed, room location and radius, open or closed
- `checkins`: session, user, name, time, distance
- one table per interaction feature, keyed by session and slide index

## Splitting into teams

| Team | Owns |
|---|---|
| Check-in | `src/teams/checkin/` (kiosk + join pages), `convex/checkin/` (sessions, check-ins) |
| Follow + interact | `src/teams/live/` (the phone view), `convex/live/` (per-slide features) |
| Professor view (third team or leads) | `src/teams/host/`, `convex/host/` |

The live team can start before check-in exists: it reads a deck channel directly and lets anyone signed in take part. When check-in lands, its pages link into the live view and the live team's functions add one check.
