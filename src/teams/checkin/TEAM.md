# Team: Check-in

The agent reads this before every change to `src/teams/checkin/` or `convex/checkin/`. It describes the code on `main`; when the code changes what a student, professor or door iPad sees or what the server keeps, update this file in the same commit.

**Goal:** the professor knows who is in the room, and who came late, without calling names.

**What it does:** each student's phone shows a QR pass whose code changes every 20 s. The professor's laptop (#/checkin/teacher) or the paired door iPad (#/checkin/kiosk) scans it, and the student is checked in to this class. The professor sets when class starts and how many minutes of grace come before "late", downloads attendance as a CSV, and asks the room a quiz or a vote. The projector page shows the deck with the check-in QR, the count and the newest quiz or vote on top.

## Pages

| Route | Who | What it does |
|---|---|---|
| #/checkin/student (also #/checkin/join and #/checkin) | students | Google sign-in, then the QR pass until a scan checks them in, then "You're checked in." The quiz card and the late banner show here too, and the switch that keeps their name off the late banner. |
| #/checkin/teacher | professors and admins (`StaffGate`) | The laptop camera reads passes, or the professor types the code from a student's phone. Lists who checked in with a Remove for each, the class start and "Late after (minutes)", Download attendance (CSV) for this class and every past one, and End class. |
| #/checkin/kiosk | a paired door iPad, or a scanner signed in (`DoorGate`) | The iPad's front camera reads passes, or a student types the code on their pass. Shows the count and, for 3 s after each scan, that student's name. No list of names. Without a pairing it shows "Pair this iPad" and a pairing code (6 digits, or 8 while open requests hold every 6-digit code), which a professor or admin types on #/admin. |
| #/checkin/quiz | professors and admins (`StaffGate`) | Ask a quiz (optional right answer, answers lock) or a vote (no right answer, picks change until it ends), watch "answered / checked in", end it, and see the bars, % right and median time. |
| #/checkin/stage?deck=…&bridge=… | the projector | The deck full screen with the check-in QR, the count, the newest quiz or vote and the late banner. Hands `DECK_BRIDGE_KEY` only to a deck on the origin the key came with. |

Staff sign in with Google; the server gives a role only to a Google account with a verified email that is on the staff list (convex/checkin/prof.ts). The typed test sign-in exists only in `npm run dev` builds.

**Not doing:** location checks (the pass and the scan replaced them; `checkins.meters` is unused) and a kiosk QR that students scan (the `kiosks` table is unused).

## What it sees

- **Sign-in:** the Google account's name and email. The pass shows the name; the email goes to professors and admins only (attendance list, CSV, the teacher scanner's result card). The door iPad and the scanner role get no emails.
- **Camera:** the laptop camera on #/checkin/teacher and the iPad's front camera on #/checkin/kiosk, through `src/blocks/camera.ts`, started from a button press. Frames stay on the device: the browser's QR reader or jsQR reads each frame there, and only the decoded pass code goes to the server.
- **Late banner:** the first name only (never an email or a name that is an email), on every screen that shows the banner, unless the student turned it off on their pass.
- **Door iPad:** a random device token in the iPad's localStorage. The server keeps only its SHA-256.
- **AI:** the quiz's AI draft and "Ask the AI" note send slide text, the question, its choices, counts and team labels to Gemini, never a name.
- **No location.** Nothing in check-in asks for it. Old prod `checkins` rows may hold a `meters` field that no page reads.

## Data

Writes `passes` (one per student: name, email, the current and previous code, the late-banner switch), `checkins` (one per student per class: name, email, time), `classStarts` and the start and grace on `lectures` (one row per class; a scan, a saved start, a deck press or a quiz opens one), `polls` and `pollAnswers`. Removing a check-in also removes that student's answers in this class. `kiosks` is no longer written. Keeps `convex/checkin/read.ts` working for the other teams: `count`, `me`, `names` (docs/contracts.md). Every function and who may call it: `convex/checkin/README.md`.

## The door iPad on class day

- Pair it: open #/checkin/kiosk on the iPad, and type the pairing code it shows (6 digits, or 8 while open requests hold every 6-digit code) on #/admin (Pair a door iPad) from your own laptop or phone. A pairing lasts until someone unpairs it on #/admin.
- Nobody signs in to Google on the door iPad, not even to pair it. Google keeps its own sign-in in Safari after the app's Sign out, and its account list would sign anyone in line in as that person with one tap. If a staff account did sign in there, sign it out of Google in Safari too.
- Turn on Guided Access (Settings, Accessibility, Guided Access) so nobody in line can leave the kiosk page or type another address.
- A scanner can scan from their own phone instead: sign in on #/admin, then open #/checkin/kiosk. That sign-in ends in under an hour (the kiosk shows the end time), so for a whole class, pair the iPad.

## Where it lives

- Pages: `src/teams/checkin/Page.tsx` routes each #/checkin/<part> to its file (Student, Teacher, Kiosk, Quiz, Stage). The gates are in `prof.tsx`.
- Server: `convex/checkin/` (pass, read, attendance, quiz, prof). Functions are called as `api.checkin.<file>.<function>`. `pass.scan` also calls Live's `ensureGroup`, and the iOS app decodes `lateFeed` (docs/contracts.md).
- Tests: `convex/checkin/*.test.ts` (every function, each staff-only one in `authMatrix`) and `src/teams/checkin/*.test.ts`.
- Channel: `CHANNEL` from `src/blocks/deck.ts` (`"gdg"`).
