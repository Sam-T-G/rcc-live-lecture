# What the product does

GDG on Campus RCC set the goal at the 10-29 meeting: students take part during a lecture, live, so they're doing something instead of only listening. This doc says what is built on `main` and how data moves from a key press or a scan to every screen. Sam's decisions are in AGENTS.md "Status"; the class-day steps are in [runbook.md](runbook.md).

## The core loop, as built

1. **Check in.** The student signs in with Google on #/checkin/student, and the phone shows a QR pass whose code changes every 20 seconds, so a screenshot sent to a friend stops working within a minute. The professor's laptop (#/checkin/teacher) or the paired door iPad (#/checkin/kiosk) scans it. The professor sets when class starts and how many grace minutes count as on time, sees who checked in, and downloads attendance as a CSV for this class or any past one.
2. **Follow along.** #/live, #/portal and the iOS app show the slide the professor is on, live, and let the student page back through slides already shown without moving the projector. The projector runs #/checkin/stage: the deck full screen with the check-in QR, the count and the open quiz on top.
3. **Interact.** Quiz (a locked answer, with an optional right answer) and vote (no right answer, changeable until it ends); results and metrics after the professor ends it. Students' questions with upvotes, anonymous or by name, and private ones only the professor sees. "I'm lost" on any slide. Small teams of 3 or 4 dealt at check-in, ranked by right answers per student, with 5, 3 and 1 extra credit for the top three when the professor presses End class.
4. **The professor's view.** #/host: the slide, the check-in count and how many are lost on it; Now (ask the room, with an AI-drafted question from the slide, then who got it wrong and an AI note on what to explain again); Points (teams, bonuses and deductions with a reason, End class, the extra credit CSV); Questions (sort, type an answer, share it, group by topic with AI).
5. **Late banner.** When a student checks in after the start plus grace, their first name shows on the projector, #/live, #/portal and the iOS app for 8 seconds, with a line like "⏰ Sam walked in 6 min late." Each student can turn it off on their pass.

Access is by email role (admin, professor, scanner), set on #/admin; a door iPad pairs with a 6-digit code. Every table and who reads it: [contracts.md](contracts.md).

## How the data moves

Every class runs on the deck channel `gdg`. A class is one `lectures` row: it opens with the professor's first deck press, scan, saved start time or quiz, and ends with End class or 12 hours after it opened or after its saved start (`convex/lectures.ts`). Every read below counts only this class's rows (BLOCKS.md, "Classes").

**Slides.**
1. The professor presses an arrow key in a deck-kit deck that loads `public/deck-bridge.js` and was opened with `?bridge=gdg.<key>` (in class, the stage link hands it over).
2. The script sends the slide number, presses shown, slide count, heading and up to 12 lines of visible text to `POST /deck` on the backend (`convex/http.ts`), which checks `DECK_BRIDGE_KEY` and calls `deck.set`.
3. `deck.set` opens a class if none is open, then writes the live slide to `deckChannels` (one row per channel) and the slide to `deckSlides` (one row per slide number, for paging back). A press that arrives after a newer one from the same tab doesn't move the live slide.
4. `deck.current` and `deck.slides` are live queries, so #/live, #/portal, #/host and the iOS app (`ios/RCCLivePortal/DeckStore.swift`) update on their own.

**Check-in.**
1. #/checkin/student calls `checkin.pass.refresh` every 5 seconds, which makes the student's `passes` row and a new code once the current one is 20 seconds old.
2. The laptop camera or the door iPad reads the QR and calls `checkin.pass.scan` with the code (and the iPad's device token). It checks the scanner's role or token, opens a class if none is open, writes a `checkins` row with the student's name and email, and calls `ensureGroup` to put the student on a team (`groups`).
3. `checkin.read.count` updates the stage, the kiosk and #/host; `checkin.read.names` and `checkin.attendance.sheet` give the teacher page its list and the CSV.
4. `checkin.attendance.lateFeed` works out late minutes from the class's start and grace, and returns the newest 5 late arrivals by first name. `LateBanner` on the web and the iOS app show each one.

**Quiz and vote.**
1. The professor asks on #/host Now or #/checkin/quiz (`checkin.quiz.ask`, a `polls` row; `draftQuestion` asks Gemini for one from the slide text).
2. `QuizCard` on #/live and #/checkin/student reads `checkin.quiz.current`; a checked-in student answers with `checkin.quiz.answer` (`pollAnswers`).
3. The professor presses "End the question" or "End the vote" (`checkin.quiz.end`), which saves the final counts. Then every phone shows the result, #/host shows `stats` (answered of checked in, percent right, median seconds) and `missing` (who got it wrong, by team, with `feedback` from Gemini), and `live.past.past` lists it under "Past quizzes and votes" on #/live.
4. `live.groups.leaderboard` adds each team's right answers on ended quizzes and the professor's point changes (`groupPoints`), divides by team size and ranks the teams. #/live, #/live/leaderboard and #/host Points show it.

**Questions and I'm lost.** `live.questions.ask` and `vote` write `questions` and `questionVotes`; #/live lists this class's questions and #/host Questions reads `forHost`, where the professor answers and shares. `live.lost.toggle` writes `lost`; #/host reads `live.read.lostCount` and `lostBySlide`.

**End of class.** End class on #/host Points or #/checkin/teacher calls `live.groups.endDay` (refused while a quiz or vote is open). It saves each team member's place, points and extra credit to `groupResults`, then sets the class's `endedAt`. The next class starts with nobody checked in, new teams and an empty board. A class nobody ends closes itself after 12 hours (`lectures.close`) and saves the same rows first.

## Not built yet

From the first Professor view handoff and the 10-29 team docs: voice answers and recordings, a textbook import that matches the lecture, and a student-facing summary of shared answers. Each needs the microphone or a new store, so each needs Sam's go-ahead and a `TEAM.md` line under "What it sees".
