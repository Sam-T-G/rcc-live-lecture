# Class day

What the professor and Sam do on a day the app runs in class, on the live site <https://sam-t-g.github.io/rcc-live-lecture/> and the prod backend. Every class runs on channel `gdg`. What each screen does: [direction.md](direction.md).

## Before class (once per term, or when something changes)

- **Staff.** An admin adds each professor's Google account as `professor` on #/admin (and a TA as `scanner` if they'll scan at the door). Admins in `ADMIN_EMAILS` are there already.
- **Door iPad.** Open #/checkin/kiosk on the iPad, signed out: it shows a 6-digit code for 10 minutes. A professor types it on #/admin under "Pair a door iPad" with a label like "A-210 door". The iPad stays paired until someone presses Unpair on #/admin. Set the iPad's Auto-Lock to Never if the kiosk page says it can't keep the screen on.
- **Deploys.** Sam deploys only between classes, never while one is running: `scripts/deploy.sh` pushes Convex first and GitHub Pages about a minute later, and a tab opened before the deploy keeps the old page until it reloads. After a deploy, reload #/host, #/checkin/teacher, #/checkin/stage and the door iPad. The first deploy with classes also needs Sam's one-time prod runs from AGENTS.md status item 4 (`staff:importHostEmails`, `lectures:endEarlier`) before the next class.

## Setting up the room (10 minutes before)

1. **Laptop at the lectern:** sign in with Google and open #/checkin/teacher. Set when class starts and the grace minutes (5 unless you change it), then Save. Saving the start opens the class, and the teams lock 5 minutes after the start. Scanning opens 45 minutes before the saved start.
2. **Projector:** open the stage link in its own tab:

   ```
   https://sam-t-g.github.io/rcc-live-lecture/#/checkin/stage?deck=<the deck's address>&bridge=gdg.<DECK_BRIDGE_KEY>
   ```

   Sam sends the bridge key privately. Paste the link in a tab the room can't see: the stage saves the key in that tab and the address bar shows `?bridge=saved` from then on. A new tab needs the full link with the key again: a link that says `?bridge=saved`, opened in a new tab, shows "Phones aren't getting these slides.", and a link with no `?bridge=` at all sends the phones nothing and shows no warning. Use the browser's own full screen. Anyone with the key can send slide text to every phone, so never show it, the link or a terminal with it on the projector.
3. **Door iPad:** open #/checkin/kiosk and tap Start check-in.
4. **Students:** the QR on the stage opens #/checkin/student. They sign in with Google and hold up the pass at the door or the lectern.

## During class

- **Slides:** the arrow keys in the stage move the deck and every phone. Students on #/live or #/portal can page back without moving the projector.
- **Scanning:** the door iPad scans passes; the laptop on #/checkin/teacher scans too (Start scanning), or the professor types the code from a student's phone. A wrong check-in has a Remove button on the teacher page.
- **#/host** has three tabs. **Now:** ask the room (write a question or let the AI draft one from the slide), end it to show the results, then "Who got it wrong" with an AI note. **Points:** teams of 3 or 4, +1 and −1 for a team or a student (a student's can carry an optional reason), Undo. **Questions:** students' questions, newest first, each with its upvotes; type an answer, share it, or group them by topic with AI.
- **What stays private:** emails show only on the professor's laptop (#/host, #/checkin/teacher), and so do full names, except in two places: a question a student posts by name shows their full check-in name to everyone who opens #/live, signed out too, and the door iPad shows each scanned name. The projector shows first names at most (the late banner) and team colors, never emails. The door iPad shows each scanned student's name (the name they signed in with) for 3 seconds after the scan, never the email, so everyone at the door can read it. Keep #/host and the teacher page off the projector.

## Ending class

- **End class**, on #/host Points or next to the status line on #/checkin/teacher, saves each student's extra credit for this class and ends the class. End any open quiz first; End class refuses while one is open. The next class starts with nobody checked in and new teams. A class nobody ends closes itself 12 hours after it opened or after its saved start.
- **Attendance:** "Download attendance (CSV)" on #/checkin/teacher gives this class's list; Past classes has every earlier one. "Download extra credit (CSV)" on #/host Points gives the saved extra credit.
- **Sign out before you leave the lectern:** press "Not you? Sign out" at the top of #/host, #/checkin/teacher or #/checkin/quiz. Closing the tab keeps you signed in on that computer, so the next person there would open those pages as you and see every student's name and email.

## When something breaks

| Problem | Do this |
|---|---|
| Phones show no slide | Is the stage tab the one opened with the key? Press an arrow key once. "Phones aren't getting these slides." means the tab has no key: open the stage link again. |
| A page says "Something went wrong." | Reload it. A tab open from before a deploy needs a reload. |
| The door iPad shows a pairing code again | Someone unpaired it, or its storage was cleared: pair it again on #/admin. |
| The door iPad or the teacher page says "That code is old." | The student's phone slept: they wait for the pass to show a new code, then scan again. |
| A professor sees "isn't on the staff list" | An admin adds that Google account on #/admin. |
| Scanning says it opens 45 minutes before class | The saved start is later than now plus 45 minutes: fix the start on #/checkin/teacher. |
