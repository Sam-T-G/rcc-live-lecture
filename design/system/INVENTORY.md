# Screen inventory (phase 1)

Source: W = `.claude/worktrees/design-overhaul` at 759899a (origin/main at launch). Paths below are relative to W.
Read only. Convex reads are `module:function` (`api.checkin.read.count` = `checkin/read:count`). `useConvex()` calls
are marked "(on press)". "…" in words means the code's own ellipsis character. Every page sits inside
`ErrorBoundary page` (src/App.tsx:24, src/main.tsx:15).

Who: **out** = signed out, **stu** = signed-in student (typed or Google, no staff role), **prof** = professor or
admin, **adm** = admin only, **scan** = scanner role, **ipad** = paired door iPad (device token, nobody signed in),
**any** = anyone with the link.

State IDs are used by the screen lab and comps (`PH-` phone, `HO-` host, `ST-` staff, `PR-` projector, `KI-` kiosk,
`IO-` iOS, `SH-` shared).

---

## 0. Shared states (show up inside several areas)

| ID | Where / who | What puts it there | Component | Words on screen |
|---|---|---|---|---|
| SH-01 | any route not in `pages` | `useRoute()[0]` not a key of `pages` | src/App.tsx:15 | h1 "No page at #/<path>", link "Go home" |
| SH-02 | `#/checkin/<x>`, `#/live/<x>`, `#/host/<x>`, `#/portal/<x>` | unknown sub-route | teams/checkin/Page.tsx:35, teams/live/Page.tsx:45, teams/host/Page.tsx:29, portal/Page.tsx:22 | "No page at #/checkin/<x>" + "Go home" |
| SH-03 | any page that throws | ErrorBoundary `page` | src/blocks/ui.tsx:97 | h1 "Something went wrong.", buttons "Reload", "Go home" |
| SH-04 | any card that throws | ErrorBoundary with `label` | src/blocks/ui.tsx:106 | "<Label> didn't load." + quiet "Try again" |
| SH-05 | signed out, staff or student sign-in | `useGoogleUser().user == null`; GSI script loading/failed | src/blocks/auth.tsx:378 (GoogleButton), :396 (SignInButton) | Google's own "Continue with Google" box (44px min); failed: "Google sign-in didn’t load. Check the connection, then reload the page." |
| SH-06 | sign-in refused by server | `refused` from AuthProvider | src/blocks/auth.tsx:400 | error "The server didn’t accept that sign-in." |
| SH-07 | dev builds only | `import.meta.env.DEV` | src/blocks/auth.tsx:436-473 | "Test sign-in (dev only)", fields "Your name", "Your email", "Sign in"; errors "Type your name.", "Sign-in failed. Try again.", "Sign-in needs https. Open the live site or localhost." |
| SH-08 | signed in, any page that shows it | `user` set | src/blocks/auth.tsx:421 (SignedInAs) | "Signed in as Jane Doe (jane@example.edu)" + quiet button "Not you? Sign out" |
| SH-09 | prof, last 5 min of Google sign-in | `endsAt` set (AuthProvider) | teams/checkin/prof.tsx:122 (SignInEnding, kit Banner warn in BannerStack) | "Your sign-in ends at 3:41 PM." "Sign in with Google again before then to keep this page open." + Google button |
| SH-10 | late banner: student pass, checked-in, #/live, #/portal, stage, team board | `checkin/attendance:lateFeed` gets a new arrival; shows 8 s | teams/checkin/LateBanner.tsx:42; lines in teams/checkin/late.ts:7 | one of: "🐢 Ana just walked in, 4 min late.", "🚨 Late alert: Ana, 4 min after start.", "⏰ Ana is here. Class started 4 min ago.", "⏰ Ana walked in 4 min late.", "👀 Everyone say hi to Ana, 4 min late." (stacked when several) |

Staff gate (used by #/host, #/checkin/teacher, #/checkin/quiz; #/admin has its own copy):

| ID | Who | What puts it there | Component | Words |
|---|---|---|---|---|
| SH-11 | any | `staff:me` loading (or Convex auth loading) | teams/checkin/prof.tsx:113 | page title (e.g. "Professor view") + loading "Checking who is signed in…" |
| SH-12 | out | `staff:me` = null | prof.tsx:61 | "Sign in with the Google account your admin added." + SH-05 |
| SH-13 | stu, Google email unverified | `!canHoldRole` and token `email_verified` false | prof.tsx:68 | "Google hasn't verified <email>, so the app can't check that it's yours. Verify the email in your Google account, then sign out and sign in again." + secondary "Sign out" |
| SH-14 | stu, typed sign-in | `!canHoldRole` | prof.tsx:77 | "Staff sign in with Google, so the app can check that <email> is yours. Sign out, then sign in with Google." + "Sign out" |
| SH-15 | scan | role scanner | prof.tsx:89 | "<email> is on the staff list as a scanner, so you can scan passes at the door but can't open this page. Ask an admin to make you a professor on #/admin." + "Sign out" |
| SH-16 | stu (Google, not staff) | role null | prof.tsx:91 | "<email> isn't on the staff list. Ask an admin to add you on #/admin." + "Sign out" |

---

## 1. phone (iPhone Safari 390 x 844, also 320)

### #/ Home (any; used by everyone, laid out for phone)
| ID | What puts it there | Component | Words |
|---|---|---|---|
| PH-01 | always | src/pages/Home.tsx:46 | h1 "RCC Live Lecture", "Check in to class, follow the professor’s slides on your phone, and answer the quiz." Groups "Students", "Professors" (note "Sign in with the Google account an admin added on #/admin."), "Projector and door", "Building the app"; each link a quiet flush button ("Check in", "Follow the slides", "Slides only", "Scan passes", "Quiz and vote", "Professor view", "Staff and door iPads", "Projector", "Team board", "iPad at the door", "Lab", "UI kit") with a muted line under it |

### #/checkin/student (also #/checkin/join, #/checkin)
| ID | Who | What puts it there | Component | Words |
|---|---|---|---|---|
| PH-10 | out | `user` null | teams/checkin/Student.tsx:22 | h1 "Your check-in pass", "Sign in to get your pass." + SH-05/SH-07 |
| PH-11 | stu | `checkin/pass:mine` undefined/null, no error | Student.tsx:78 | h1 "Your check-in pass", loading "Making your pass…", SH-08 |
| PH-12 | stu | `checkin/pass:refresh` failed (not "Sign in first.") before any pass | Student.tsx:81 | error with server words, SH-08 |
| PH-13 | stu | pass present, `checkin/read:me` not true, code fresh | Student.tsx:87 | h1 "Show this to the professor", QR 280px ("RCC-<code>"), name (`.pass__name`), code in mono spaced (`.pass__code`), muted "The code changes every 20 seconds. A screenshot stops working within a minute.", HideLate checkbox, SH-08, SH-10 |
| PH-14 | stu | code on screen over 25 s old (`codeIsOld`) | Student.tsx:91 | QR replaced in the same square by loading "Getting a new code…"; code text hidden |
| PH-15 | stu | refresh error while pass shows | Student.tsx:98 | error line under the pass |
| PH-16 | stu | `checkin/read:me` true | Student.tsx:68 | h1 "You’re checked in.", QuizCard (PH-40..47 or nothing), link "Follow the slides", HideLate, SH-08, SH-10 |
| PH-17 | stu | HideLate: `checkin/attendance:myHideLate` loaded; `setHideLate` | Student.tsx:126 | checkbox "Don’t show my first name on the class screens when I’m late"; error under it on failure |
| PH-18 | stu | refresh says "Sign in first." | Student.tsx:50 | signs out: back to PH-10 |

### #/live (student phone during class)
Reads: `deck:current` (useDeckSlide), `deck:slides`; cards each in ErrorBoundary (SH-04).

| ID | Who | What puts it there | Component | Words |
|---|---|---|---|---|
| PH-20 | any | `deck:current` undefined | teams/live/Page.tsx:89 | h1 "Live slides"; slide card loading "Loading the slides…"; side cards still render |
| PH-21 | any | `deck:current` null | Page.tsx:91 | empty "Waiting for the slides to start." |
| PH-22 | any | live slide | Page.tsx:94 | slide title (h2), bullet lines, muted "Slide 4 of 12", "← Back" (secondary), "Next →" (disabled when live) |
| PH-23 | any | `pinned` slide (paged back) | Page.tsx:103-107 | "Back to live" (primary) appears, muted "The professor is on slide 6 now." |
| PH-24 | out | no user | Page.tsx:181 | under slide: secondary block "Sign in to tap I’m lost" (scrolls to Questions sign-in) |
| PH-25 | stu, not checked in | `checkin/read:me` false | Page.tsx:157 (CheckInFirst) | under title: "Check in to answer, ask and join a team." + secondary block link "Check in"; no I'm lost button |
| PH-26 | stu, checked in | `live/read:mine` false | Page.tsx:204 | secondary block "I’m lost", muted "The professor sees how many people are lost on each slide. Your name isn’t shown." |
| PH-27 | stu, checked in | `live/read:mine` true (`live/lost:toggle`) | Page.tsx:206 | pressed look "✓ I’m lost", "You’re counted as lost on slide 4. Tap again to undo." |
| PH-28 | stu | toggle failed | Page.tsx:214 | error, e.g. "Check in first." / "Something went wrong. Try again." |
| PH-29 | stu, on a team | `live/groups:mine` (auto `live/groups:join`) | teams/live/Leaderboard.tsx:22 (GroupBadge) | pill in team color "You’re on Green" |
| PH-30 | stu | signed in | Page.tsx:80 | SH-08 at top of page |

Quiz card (also on PH-16). Reads `checkin/quiz:current`, `checkin/quiz:mine`, `checkin/read:me`; writes `checkin/quiz:answer`.

| ID | Who | What puts it there | Component | Words |
|---|---|---|---|---|
| PH-40 | any | no poll (`current` null/undefined) | teams/checkin/Quiz.tsx:250 | nothing |
| PH-41 | out | open poll | Quiz.tsx:294 | card "Question" (vote: "Vote now"), question (`.quiz__q`), list "A …" to "D …", "Sign in and check in to answer." (vote: "to vote."), quiet link "Check in" |
| PH-42 | stu not checked in | open poll, `here` false | Quiz.tsx:307 | same with "Check in to answer." |
| PH-43 | stu checked in | open quiz, no answer | Quiz.tsx:297 | four quiet pick buttons "A choice" … |
| PH-44 | stu | quiz answered (`mine` set, locked) | Quiz.tsx:313 | picked button outlined, all disabled, muted "Answer sent. Results show when the professor ends the question." |
| PH-45 | stu | vote picked | Quiz.tsx:314 | "You picked B. Tap another to change it." |
| PH-46 | any | ended quiz with results | Quiz.tsx:255 | card "Results", question, "You got it right." / "Not this time." (if answered), bars "A choice ✓ right answer (you)" + "12 · 40%" |
| PH-47 | any | ended vote | Quiz.tsx:255 | card "The room voted", bars, top pick highlighted |
| PH-48 | stu | answer failed | Quiz.tsx:315 | error with server words |

Leaderboard card (`live/groups:leaderboard`, `live/groups:mine`, `live/groups:status`):

| ID | What | Component | Words |
|---|---|---|---|
| PH-50 | loading | Leaderboard.tsx:91 | card "Team leaderboard", loading "Loading the scores…" |
| PH-51 | no teams with members | Leaderboard.tsx:93 | empty "No teams yet. Each student joins a team when they check in." |
| PH-52 | teams, top 3 + mine | Leaderboard.tsx:96 | rows: rank, "Green (you)", "+5 extra credit", muted "6 right · 2.0 per student · 3 students"; colored left edge; footer "After 2 quizzes. Teams rank by points per student: 1st place gets 5 extra credit, 2nd gets 3, 3rd gets 1." / "No quiz has ended yet." |
| PH-53 | more than 3 teams | Leaderboard.tsx:104 | `<details>` "All 7 teams" |
| PH-54 | lock line | Leaderboard.tsx:49 (LockNote) | "Teams are final." / "Teams lock 5 minutes after the first check-in." / "Teams are still forming. They lock at 2:41 PM." |

Past quizzes and votes (`live/past:past`): PH-55 loading "Loading past quizzes and votes…" (teams/live/PastQuestions.tsx:33); PH-56 empty "No quiz or vote has ended yet." (:35); PH-57 list of `<details>`: question, muted "Quiz 3 · You got it right" / "You got it wrong" / "You picked B" / "No answer"; open: choices with "✓ right answer", "(your pick)", "· 12" (:37).

Questions card (`live/questions:list`, writes `ask`, `vote`, `remove`):

| ID | Who | What | Component | Words |
|---|---|---|---|---|
| PH-60 | any | always | teams/live/Questions.tsx:81 | card "Questions", Segmented block "This slide" / "All slides" |
| PH-61 | out | no user | Questions.tsx:85 | muted "Sign in to post and upvote." + SH-05 |
| PH-62 | stu | before slides (`index` null) | Questions.tsx:89 | muted "You can ask once the slides start." |
| PH-63 | stu | form | Questions.tsx:91 | textarea placeholder "Ask a question or leave a comment", checkboxes "Post anonymously" (on), "Only the professor can see it", "0/280", primary "Post" (disabled while empty) |
| PH-64 | stu | post failed | Questions.tsx:115 | error with server words (e.g. check-in needed) |
| PH-65 | any | list loading | Questions.tsx:120 | loading "Loading questions…" |
| PH-66 | any | list empty | Questions.tsx:122 | empty "No questions yet." |
| PH-67 | any | list | Questions.tsx:124 | each row: upvote box "▲ 3" (pressed = filled green), text, meta "[Private] Anonymous · slide 4 · 2:41 PM", "Professor's answer: …" with green rule, quiet "Delete" on own |
| PH-68 | stu | row action failed | Questions.tsx:156 | error under that row |

### #/portal (slides only; also `?channel=`)
Reads `deck:current`, `deck:slides`.

| ID | What | Component | Words |
|---|---|---|---|
| PH-70 | loading | portal/Page.tsx:165 | plain page, loading "Loading the slides…", two secondary links "Check in", "Quiz and questions" |
| PH-71 | waiting | Page.tsx:173 | empty "Waiting for the slides to start." + the two links |
| PH-72 | live slide | Page.tsx:184 | bar "Slide 4 of 12" + green pill "● Live"; slide card (h1 title, bullets); "← Back" / "Next →" (52px, primary green), the two links; swipe and arrow keys page |
| PH-73 | paged back, professor still there | Page.tsx:193 | outlined "Back to live" in the bar |
| PH-74 | paged back, professor moved on | Page.tsx:199 | notice box with green edge: "The professor is on slide 6 now." + "Back to live" |
| PH-75 | late banner showing | Page.tsx:68 | SH-10 fixed at bottom; page bottom padding grows by its height (`--late-room`) |

---

## 2. host (#/host, professor laptop 1440 x 900 / 1280)

Gate: SH-09, SH-11..SH-16 (title "Professor view", teams/host/Page.tsx:36). All three tab panels stay mounted.

Header card (`deck:current`, `checkin/read:count`, `live/read:lostCount`, `live/read:lostBySlide`):

| ID | What | Component | Words |
|---|---|---|---|
| HO-01 | slide loading | teams/host/Page.tsx:56 | loading "Loading..." (three dots, not "…") |
| HO-02 | no slide yet | Page.tsx:57 | empty "The deck hasn't sent a slide yet." |
| HO-03 | slide up | Page.tsx:58 | muted "Slide 4 of 12", h2 slide title (1.9rem), link "Attendance"; right: Big "38" "checked in", Big "3" "lost on this slide" ("-" while loading) |
| HO-04 | lost by slide | Page.tsx:119 | "Lost by slide" + "Loading..." / "Nobody has tapped I’m lost yet." / "Slide 3: 4  Slide 5: 1" |
| HO-05 | tabs | Page.tsx:76 | hand-built pill tabs "Now" "Points" "Questions" |

Now tab, "Ask the room" (`checkin/quiz:current`, `checkin/quiz:stats`, action `checkin/quiz:draftQuestion`, `ask`, `end`):

| ID | What | Component | Words |
|---|---|---|---|
| HO-10 | loading | teams/host/AskRoom.tsx:88 | "Loading the question..." |
| HO-11 | no question this class | AskRoom.tsx:89 | empty "No question in this class yet." + primary "Draft with AI", secondary "Write my own" |
| HO-12 | AI drafting | AskRoom.tsx:107 | "Draft with AI" busy spinner |
| HO-13 | form, AI draft quiz | AskRoom.tsx:209 | Segmented "Quiz" / "Vote", badges "AI draft", "Slide 4"; muted "Students can't change their answer."; field "Question"; grid heads "Choices", "Right answer"; rows A-D with placeholder "Choice (needed)" / "Choice (optional)" and a radio; "Open question", quiet "No right answer", quiet "Cancel" |
| HO-14 | form, vote | AskRoom.tsx:226 | "No right answer. Students can change their pick until you end it."; no Right column; "Start the vote" |
| HO-15 | form while a poll is open | AskRoom.tsx:262 | muted "Opening this ends the question that's open now."; End button drops to secondary |
| HO-16 | poll open | AskRoom.tsx:148 | badges "Open" (live yellow) "Quiz" "Slide 4" "AI draft"; h3 question; bars with letter, text, count, grey fill; Stat "14 of 38" "answered" (green); primary "End the question" / "End the vote" |
| HO-17 | poll ended | AskRoom.tsx:150-174 | badge "Ended"; right bar green with "· right answer"; Stats "answered", "62%" "got it right", "18 s" "median time to answer"; buttons "Draft with AI" (primary again) / "Write my own" |
| HO-18 | error | AskRoom.tsx:115, :181 | error: server words, or "Type the right answer's choice." |

Now tab, "Who got it wrong" (`checkin/quiz:missing`, `checkin/quiz:current`, action `checkin/quiz:feedback`):

| ID | What | Component | Words |
|---|---|---|---|
| HO-20 | loading | teams/host/Missing.tsx:41 | "Loading the answers..." |
| HO-21 | no quiz with right answer | Missing.tsx:42 | empty "No quiz with a right answer yet." |
| HO-22 | newest is a vote | Missing.tsx:43 | empty "“What should we cover next?” is a vote, so it has no right answer." |
| HO-23 | quiz, nobody wrong | Missing.tsx:53 | h3 question + badge Open/Ended, muted "14 answered. Right answer: Charge.", empty "Nobody got it wrong yet.", secondary small "Ask the AI" |
| HO-24 | quiz with wrong answers | Missing.tsx:56 | table Name / Team (dot chip) / Picked; "14 answered, 5 wrong. Right answer: Charge." |
| HO-25 | AI note | Missing.tsx:82 | tinted note box with 2 or 3 sentences; or error |

Points tab (`live/groups:leaderboard`, `status`, `roster`, `pointLog`; writes `setSize`, `adjust`, `removePoints`, `endDay`; `live/groups:results` on press via useConvex):

| ID | What | Component | Words |
|---|---|---|---|
| HO-30 | Teams loading / empty | teams/host/Boards.tsx:97-100 | "Loading the teams…" / "No teams yet. Each student joins a team when they check in." |
| HO-31 | Teams list | Boards.tsx:102 | Segmented "Teams of 3" / "Teams of 4", lock line ("Teams lock at 2:41 PM."); each team: color chip "Green", badge "1st" or "2nd, tied" (green when it earns credit), muted "3 students · 6 right · 2.0 per student · +5 extra credit", small "+1" "−1" |
| HO-32 | Students | Boards.tsx:157 | filter buttons "Everyone" + team chips; field "Reason (optional)" hint "Saved with the next +1 or −1 you give a student."; table Place / Name / Team / Right / Points / Extra credit saved / +1 −1 |
| HO-33 | Students loading / empty | Boards.tsx:172-174 | "Loading the students…" / "No students checked in to this class yet." / "Nobody on this team is checked in." |
| HO-34 | Point changes | Boards.tsx:227 | "Loading the point changes…" / "No point changes in this class yet." / rows "+1 Jane Doe [Green] reason · 2:41 PM" + quiet "Undo" |
| HO-35 | End of class | Boards.tsx:265 | ConfirmButton "End day" → "End the day? Each student gets their team's extra credit now, and points start again from 0. This can't be undone." "End day" / "Cancel"; secondary "Download extra credit (CSV)"; info Banner with the server's message; "No extra credit saved yet. End day saves it." |
| HO-36 | error | Boards.tsx:130, :216, :255 | error under the card |

Questions tab (`live/questions:forHost`, action `live/questions:organize`, writes `setStatus`, `answer`, `share`, `remove`):

| ID | What | Component | Words |
|---|---|---|---|
| HO-40 | loading | teams/host/QA.tsx:247 | card "Questions from students", switch "Group by topic with AI", "Loading questions…" |
| HO-41 | empty | QA.tsx:249 | EmptyState "No questions yet." "Students ask from the Live slides page on their phones." |
| HO-42 | list | QA.tsx:251, row :70 | bold text; meta badges "Slide 4", "Private" (warn), "Kept", "Dismissed", "Shared with students" (green), "3 upvotes", name or "Anonymous"; quiet small "Keep", "Type answer"/"Edit answer", "Share the answer"/"Stop sharing", "Dismiss", "Delete" |
| HO-43 | answer editor | QA.tsx:86 | field "Your answer" hint "Students see it only after you share it." / "This question is private, so only you see this answer." / "Students see your changes as soon as you save."; "Save answer", "Cancel" |
| HO-44 | answered | QA.tsx:81 | "Your answer: …" with green rule |
| HO-45 | delete confirm | QA.tsx:160 | "Delete this question from every phone?" danger "Delete", "Cancel" |
| HO-46 | dismissed | QA.tsx:70 | text grey, badge "Dismissed", only "Bring back" and "Delete" |
| HO-47 | grouping | QA.tsx:243, :257 | muted "Grouping…"; then topic h3 + count badge, clusters "<label> · asked 3 times", "No topic yet" first, "Dismissed" last |
| HO-48 | Shared card | QA.tsx:284 | card "Shared with students": "Loading…" / empty "No answers shared yet." / question + answer list |

---

## 3. staff (laptop)

### #/checkin/teacher (Attendance)
Gate title "Attendance" (teams/checkin/Teacher.tsx:27) with SH-09, SH-11..16.

| ID | What puts it there | Component | Words |
|---|---|---|---|
| ST-01 | page | Teacher.tsx:37 | h1 "Attendance"; status "Loading…" / "Class started Thu Nov 5, 2:28 PM" / "No class running." (`checkin/attendance:lectures`); link "End the class: Professor view, Points" |
| ST-02 | counts (`checkin/read:names`, `checkin/attendance:sheet`) | Teacher.tsx:72 | Stat "38" "checked in" (green), Stat "4" "late" ("…" while loading) |
| ST-03 | camera off | Teacher.tsx:148 | black 16:9 box, primary "Start scanning"; field "Code on their phone" + secondary "Check in" |
| ST-04 | camera on | Teacher.tsx:150 | mirrored video, secondary "Stop camera" |
| ST-05 | camera error | Teacher.tsx:158 | "Camera blocked. Allow it in the browser's address bar." / "Couldn't start the camera." / "The camera needs https. Open the live site or localhost." (src/blocks/camera.ts:54, :89) |
| ST-06 | scan result (`checkin/pass:scan`) | Teacher.tsx:169 | Card "Checked in" or "Already checked in" with name and muted email; or error with server words ("That code isn't a pass. …", "That code is old. …") |
| ST-07 | class start (`checkin/attendance:classStart`, `lectures`; `setClassStart`) | Teacher.tsx:226 | card "Class start": "Class starts" time field (hint with day when not today), "Late after (minutes)", secondary "Save"; muted "Late after 2:35 PM" / "No start time yet, so nobody is late."; errors "Pick the time class starts.", "Grace has to be 0 to 60 minutes." |
| ST-08 | this class (`sheet`, `names`, `removeCheckin`) | Teacher.tsx:251, :274 | card "This class": small secondary "Download attendance (CSV)" + "4 late"; list "Jane Doe 2:31 PM" + "Remove" (ConfirmButton "Remove Jane Doe from this class? Their phone shows their pass again."); "Loading…" / empty "No one yet." |
| ST-09 | past classes (`lectures`; `sheet` on press via useConvex) | Teacher.tsx:302 | card "Past classes": label + badge "This class" + "38 checked in" + small "Download CSV"; "Loading…" / "No classes with check-ins yet." |
| ST-10 | link | Teacher.tsx:63 | "Ask a question or start a vote" |

### #/checkin/quiz (Live quiz)
Gate title "Live quiz" (teams/checkin/Quiz.tsx:74).

| ID | What puts it there | Component | Words |
|---|---|---|---|
| ST-20 | `checkin/quiz:current` undefined | Quiz.tsx:85 | h1 "Live quiz", "Loading…" |
| ST-21 | no poll or "Ask another" | Quiz.tsx:134 | toggle buttons "Quiz" / "Vote" (bare buttons, chosen solid, other `.quiet`); muted "Quiz: mark the right answer if there is one. Students can't change their answer." / "Vote: no right answer. Students can change their pick until you end it."; label "Question" placeholder "What does a capacitor store?" / "What should we cover next?"; A-D inputs + "Right" radios; "Ask the room" / "Start the vote"; quiet "No right answer"; errors "Type a question.", "Type the right answer’s choice." |
| ST-22 | poll open (`checkin/quiz:stats`) | Quiz.tsx:195 | muted "Quiz · open", h2 question, Big "14 / 38" "checked-in students answered", choice list, "End the question" / "End the vote" |
| ST-23 | poll ended | Quiz.tsx:202 | Bars, Stats "answered", "got it right", "median time to answer", bare button "Ask another" |
| ST-24 | stats loading after end | Quiz.tsx:212 | "Counting…" |
| ST-25 | history (`checkin/quiz:history`) | Quiz.tsx:217 | h2 "This class"; "Loading…" / empty "No questions yet." / rows "question  quiz · 14 answered · 62% right" |

### #/admin
Reads `staff:me` (useStaff).

| ID | Who | What | Component | Words |
|---|---|---|---|---|
| ST-30 | any | loading | src/pages/Admin.tsx:40 | h1 "Admin", "Checking who is signed in…" |
| ST-31 | out / stu / scan | AdminsOnly | Admin.tsx:46 | "Admins only." + SH-08 (role-capable) or SH-12..16 |
| ST-32 | adm | AdminView | Admin.tsx:55 | h1 "Admin", SH-08, two columns (3fr / 2fr from 1024px) |
| ST-33 | prof | ProfessorView | Admin.tsx:84 | "Only admins can add people." + Pair and Door iPads cards |
| ST-34 | adm | Add someone (`staff:add`) | Admin.tsx:133 | field "Email" hint "The Google account they sign in with.", Segmented "Professor" / "Scanner" / "Admin", muted role explainer, primary "Add", status "jane@example.edu is a professor now.", field error with server words |
| ST-35 | adm | People (`staff:people`, `setRole`, `remove`) | Admin.tsx:162 | "Loading the staff list…" / EmptyState "No one has a role yet" "Add someone above." / table Email, Role (select or "Admin [Permanent]"), Added by, Added ("Oct 31, 2:41 PM"), "Remove" confirm; footnote "You can't change or remove a permanent admin here: they're set in the server settings (ADMIN_EMAILS)." |
| ST-36 | adm | Changes (`staff:changes`) | Admin.tsx:254 | "Loading the changes…" / EmptyState "No changes yet" / "The last 50, newest first." + rows |
| ST-37 | prof | Pair a door iPad (`staff:approvePairing`) | Admin.tsx:304 | muted "Open the Kiosk page on the iPad at the door to get a 6-digit code. Each code works for 10 minutes."; fields "Code on the iPad", "Name" hint "Where the iPad is, like A-210 door."; "Pair"; "A-210 door is paired. That iPad shows the pass scanner now."; error |
| ST-38 | prof | Door iPads (`staff:devices`, `unpair`) | Admin.tsx:334 | "Loading the door iPads…" / EmptyState "No door iPads yet" "Pair one with the code on its Kiosk page." / rows label + "Paired by …, Oct 31, 2:41 PM. No scans yet." + "Unpair" confirm "Unpair A-210 door? That iPad stops scanning right away and shows a new pairing code." |

### #/lab (builders; any, some cards prof-only)
| ID | What | Component | Words |
|---|---|---|---|
| ST-40 | page | src/pages/Lab.tsx:27 | h1 "Lab", panels in one column |
| ST-41 | Sign in (`lab:whoami`) | Lab.tsx:61 | SH-05 or "Signed in as <b>Jane</b>. Checking with the server…" / "The server says you're a professor." / "The server didn't accept the sign-in." + "Sign out" |
| ST-42 | Live sync (`lab:lastPing`, `lab:ping`) | Lab.tsx:116 | "Loading the last ping…" / "No pings yet." / time; prof: "Open #/lab on two devices and press Ping on one. The time changes on both." + Ping; else "Only professors and admins can press Ping, since each press saves a row on the server." |
| ST-43 | QR, Location | Lab.tsx:140, :153 | QR sample; "Share my location", "34.12345, -117.12345 · within about 20 m", error |
| ST-44 | Deck bridge (`deck:current` for a typed channel) | Lab.tsx:171 | "Type a channel." / "Loading…" / "No deck has sent this channel anything yet." / slide title + lines |
| ST-45 | AI (action `lab:aiPing`) | Lab.tsx:217 | prof-only line "Only professors and admins can ask the AI, since each question uses the app's Gemini key." |
| ST-46 | Vision (lazy) | src/pages/LabVision.tsx:53 | h2 "Vision (on the device)", "Use the camera"/"Stop the camera", select "Or try a sample picture…", "Saw: …", "Loading the model…", errors "The model didn't load. Check the connection." |

### #/ui (design gallery, builders)
ST-50 src/pages/UIKit.tsx:27: h1 "UI kit", "When to use each part: docs/design.md in the repo.", links "Projector layout", "Projector layout, dark"; light and dark columns with sections Colors, Contrast, Type, Buttons, Fields, Tabs and choices, Badges and banners, Status lines, Numbers, Cards lists and tables, Empty loading and confirm. (#/ui/projector is PR-30.)

---

## 4. projector (1920 x 1080, read from the back of A-210)

### #/checkin/stage (`?deck=…&bridge=…&bridge-site=…`)
Reads `checkin/read:count`, `checkin/quiz:current`, late feed. Black page, deck iframe full screen, card light-themed.

| ID | What puts it there | Component | Words |
|---|---|---|---|
| PR-01 | no `?deck=` | teams/checkin/Stage.tsx:78 | Projector h1 "Add `?deck=<your deck's address>` to this page's link." (on black stage) |
| PR-02 | `?deck=` that can't be made into an address | Stage.tsx:74 | h1 "That deck link didn't work." + "Put your deck's address after `?deck=` in this page's link." |
| PR-03 | deck + card, count loading, no poll | Stage.tsx:91, :128, :135 | card bottom-right 440 stage px: "×" (aria "Hide check-in"), QR full card width (`pageUrl("checkin/student")`), "… checked in", "Scan to check in", rule, "No question open." |
| PR-04 | count loaded | Stage.tsx:128 | "<b>38</b> checked in" (count at 92 stage px) |
| PR-05 | poll open | Stage.tsx:141 | QR shrinks to 60%; question (clamped 4 lines), "<b>14</b> answered" |
| PR-06 | poll ended | Stage.tsx:145 | QR 40%; bars "A choice  12" with grey fill, right bar green-tinted fill + 4px green edge + "✓ right answer" |
| PR-07 | card hidden | Stage.tsx:103 | small green "Show check-in" button bottom-right, 85% opacity |
| PR-08 | `?bridge=saved` in a tab with no key | Stage.tsx:85 | top-left warn strip "Phones aren't getting these slides. Open this page from the full link again." |
| PR-09 | late arrival | Stage.tsx:80; stage.css:28 | SH-10 bottom-left, red fill, 48 stage px words |
| PR-10 | a card part failed | stage.css:54 | SH-04 at projector size ("The check-in count didn't load." + "Try again") |

### #/live/leaderboard
Reads `live/groups:leaderboard`, `live/groups:mine`, `live/groups:status`, late feed. `<Projector title="Team leaderboard">` light.

| ID | What | Component | Words |
|---|---|---|---|
| PR-20 | loading | teams/live/Leaderboard.tsx:91 | h1 "Team leaderboard", lock line, "Loading the scores…" |
| PR-21 | empty | Leaderboard.tsx:93 | "No teams yet. Each student joins a team when they check in." |
| PR-22 | up to 6 teams | Leaderboard.tsx:96; live.css:67 | two columns of two-line rows: rank (92px), name, "+5 extra credit", "6 right · 2.0 per student"; colored left edge; footer explainer line |
| PR-23 | 7 to 10 teams | `.board--many` live.css:76 | one-line rows, no numbers line |
| PR-24 | over 10 teams | Leaderboard.tsx:100 | top 10 + "Plus 3 more teams. Your phone shows your team’s place." |
| PR-25 | late arrival | teams/live/Page.tsx:40; live.css:113 | SH-10 at projector size, bottom |
| PR-30 | #/ui/projector(/dark) sample | src/pages/UIKit.tsx:577 | ledger "A-210 · Thu 2:30 PM · slide 12 of 30 · Back to the UI kit", h1 "Team board", sample rows, Big "42" "checked in" |

---

## 5. kiosk (#/checkin/kiosk, door iPad 820 x 1180 portrait)

DoorGate (teams/checkin/prof.tsx:182) reads `staff:me`, `staff:deviceStatus` (by device token in localStorage), writes `staff:requestPairing`; scanner writes `checkin/pass:scan`, reads `checkin/read:count`.

| ID | Who | What puts it there | Component | Words |
|---|---|---|---|---|
| KI-01 | any | token or `staff:me` or status loading | prof.tsx:212 | h1 "Check-in kiosk", loading "Checking this iPad…" |
| KI-02 | out / stu | unpaired, asking | prof.tsx:324 | h1 "Pair this iPad", loading "Getting a code…", card "Or sign in" |
| KI-03 | out / stu | code waiting (`status` waiting) | prof.tsx:303 | Big "482 913" "pairing code", "A professor or admin types this code on #/admin, under Pair a door iPad. Then this iPad scans passes.", muted "The code works until 2:51 PM."; card "Or sign in": "Scanners can sign in here instead of pairing." + SH-05 |
| KI-04 | out / stu | code ran out | prof.tsx:316 | "The code expired." + primary "Get a new code" |
| KI-05 | any | request failed | prof.tsx:309 | error + "Try again" |
| KI-06 | prof on an unpaired iPad | role prof/admin | prof.tsx:326 | card "Signed in on this iPad": "<email> is signed in as a professor. The door iPad opens the scanner only once it's paired or a scanner signs in, so nobody in line can open #/admin or the attendance list on your account." "Sign out here, then type the code above on #/admin, under Pair a door iPad, from your own laptop or phone." + "Sign out" |
| KI-07 | stu with non-staff sign-in | role null etc. | prof.tsx:345 | card "Or sign in" with SH-13..16 |
| KI-08 | prof on a paired iPad | paired + prof role | prof.tsx:199 | h1 "Check-in kiosk", loading "Signing out <email>…", "This iPad is paired, so it scans passes with nobody signed in." + "Sign out" |
| KI-10 | ipad / scan | scanner, camera off | teams/checkin/Kiosk.tsx:234 | black 4:3 box with big centered primary "Start check-in" (72px); right column: result box prompt "Type the code on your pass"; count; field "Code on your pass" + secondary "Check in" (disabled while empty) |
| KI-11 | ipad / scan | starting | Kiosk.tsx:239 | "Start check-in" busy |
| KI-12 | ipad / scan | camera on, idle | Kiosk.tsx:252 | mirrored video, secondary "Stop camera"; prompt "Hold your pass up to the camera" (2.2rem) |
| KI-13 | ipad / scan | scan ok (3 s) | Kiosk.tsx:255 | result box green edge + tint: "Checked in" / "Jane Doe" (3.2rem) |
| KI-14 | ipad / scan | already (3 s) | Kiosk.tsx:255 | grey edge: "Already checked in" / name |
| KI-15 | ipad / scan | refusal (3 s) | Kiosk.tsx:260 | red edge: "That code isn't a pass. Open your pass again and hold it up." / "That code is old. Open your pass again and hold it up." / typed: "… Check the code on your pass and type it again." / "That code is old. Type the code your pass shows now." / other server words |
| KI-16 | ipad / scan | camera error / stopped | Kiosk.tsx:242-243 | camera error (ST-05 words) / "The camera stopped. Tap Start check-in." |
| KI-17 | ipad / scan | no wake lock | Kiosk.tsx:246 | muted "This browser can't keep the screen on. Set Auto-Lock to Never in Settings, under Display & Brightness." |
| KI-18 | ipad / scan | count | Kiosk.tsx:121 | loading "Loading the check-in count…" then Big "38" "checked in" |
| KI-19 | scan (signed in) | WhoIsSignedIn | prof.tsx:224 | SH-08 strip above the scanner (inline padding 8px 24px) |

---

## 6. ios (ios/RCCLivePortal, SwiftUI; no comps, token mapping only)

| ID | What | Component | Words |
|---|---|---|---|
| IO-01 | loading | ios/RCCLivePortal/DeckView.swift:96 | ProgressView + "Loading the slides…" (title2 semibold, secondary) |
| IO-02 | loaded, no live slide | DeckView.swift:92 (CenterMessage :303) | "Waiting for the slides to start." |
| IO-03 | problem before any slide | DeckView.swift:94 | "Can't load the slides." / "No connection. Check your Wi-Fi or cell data." |
| IO-04 | problem with a slide up | DeckView.swift:87 (NoticeBar :287) | top bar orange 25% with triangle or wifi.slash icon + same words |
| IO-05 | live slide | DeckView.swift:128, SlidePage :242, LiveBadge :271 | "Slide 4 of 12" + red capsule "Live"; largeTitle bold heading, "•" bullets title3; paging TabView |
| IO-06 | paged back / professor moved | DeckView.swift:160-181 | "The professor is on slide 6 now.", "Back to live" (tint red when the notice shows) |
| IO-07 | late banner | ios/RCCLivePortal/LateBanner.swift:190 | same five lines as SH-10; fill #C5150F / white (dark #FFB3A8 / #1B211C), radius 12, title3 bold |

---

## Today's visual system

### Tokens (src/styles/tokens.css, `@layer tokens`)
- Copied from rcc-gdg tokens.css v1.0. Font "Google Sans" → Inter → system (:31); weights 400/500/700.
- Type scale (:39-47, aliases :112-130): h1 = display-sm clamp 28-40, h2 = headline-sm 20-24, h3 = 18, body 17/28,
  small 15/24, label 15, ledger and badge 13, Stat 24-32, Big clamp(64px, 14vw, 160px).
- Space 2-64 on a 4px base (:60-70); page margin 16 / 32 (600px) / 48 (1024px), card pad 16 / 24 (:73-74, :319-330).
- Targets: 48px default, 36px small (laptop only), `--tap` 44 (:78-80). Radius 4/8/12/16/24/full (:83-90).
- Motion: 90/140ms effects, 200/320ms spatial, standard and spatial easing (:95-101); spatial durations go to 0 under
  reduced motion (:334).
- Light colors (:153-186): page #f7faf8, cards #ffffff, five tinted containers, text #1e201e, muted #575a58,
  outline #727873, divider #ccd4cd, primary green #00732d, primary container #cff1d3, error #c5150f, highlight
  (yellow) #e09f2e used for the Live badge and warn banners. Dark set (:194-240) under the prefers-color-scheme guard
  and `[data-theme="dark"]`.
- App names (:287-311): --bg, --surface, --fill, --text, --muted, --line, --line-strong, --accent, --accent-soft,
  --error(-soft), --live, --warn, --focus. Elevation 0/1/2 shadows are defined (:308-310); **only `.stage__card` uses
  one** (checkin.css:72). Every other card is a flat white box with a 1px divider-colored edge (index.css:290).
- Projector sizes (:137-143): `--stage-u` = 1/1920 of the stage; head 92, body 48, small 40, ledger 32, digits 240.

### Base (src/index.css, `@layer base`)
Buttons (.btn primary/secondary/quiet/danger/small/block/flush, :99-162, pill, 48px), fields 16px+ (:181-203),
checkbox labels as 48px targets (:213), `.list` rows with dividers (:228), tables with filled head (:233-243),
`.row` (:248), `.page` 688px narrow / 1248px wide (:281-287), `.panel` card (:290), `.big` (:313), `.status`
loading spinner / empty grey / error boxed (:325-355), reduced-motion cut to 1ms (:373), forced-colors (:384).

### Kit (src/blocks/kit.tsx + src/styles/kit.css, `@layer kit`)
Button (:15), Field (:52), Tabs (:91, **unused by any screen**), Segmented (:149), Badge neutral/accent/live/warn/error
(:186), Banner info/success/warn/error (:192), BannerStack (:215), Stat (:221), EmptyState (:233), Skeleton (:245,
**unused by any screen**), ConfirmButton (:264), Projector (:356). Older parts in src/blocks/ui.tsx: Screen (:7), Todo,
Big (:27), Status (:38), Card (:47), ErrorBoundary (:71).

Kit use by area: host and admin use Button/Badge/Stat/Segmented/Field/EmptyState/ConfirmButton widely. Phone uses
Button and Segmented in #/live, but the student pass, quiz card and portal are mostly hand-styled. #/checkin/quiz
uses bare `<button>`s and its own `.ask__*` styles instead of Field/Segmented (Quiz.tsx:134-162) while the host's
AskRoom does the same job with the kit (AskRoom.tsx:209). Nothing uses Skeleton: every loading state is a one-line
spinner Status, so cards jump when data lands.

### What each area's CSS adds (all unlayered, so they beat base and kit)
- **checkin.css** (teams/checkin/checkin.css) loads on every route (LateBanner and Quiz import it; all pages are
  imported statically). It redefines **`.row` globally** with `gap: 12px; margin: 12px 0` (:2) and `button.quiet` as
  an outlined pill (:3), overriding base `.row` and the kit's quiet look on every page. It holds pass, scanner,
  late banner, kiosk, quiz, bars and stage rules (:4-99) in px and rem, not tokens.
- **stage.css**: stage-unit sizes, bar right-answer edge, late banner and warn positions. Token colors.
- **kiosk.css / teacher.css / ask.css / points.css / qa.css / lost.css / admin.css / questions.css**: tokens only,
  layout grids. These are the newest sheets and follow the kit.
- **live.css**: phone layout (`.live` 3fr/2fr from 900px), the 12 team colors (:27-38), leaderboard rows, past
  questions, question rows, slide nav. Mostly px (10px radii, 12px gaps) and rem font sizes (0.85rem, 1.15rem,
  1.6rem) outside the scale.
- **leaderboard.css**: three-column subgrid fixes over live.css.
- **portal.css**: its own page shell (max 720px, 16px padding), Live pill, notice box, slide card (h1 1.6rem, list
  1.1rem), 52px nav buttons, entry animation `portal-in` on every slide change.
- **host.css**: a second design language under `.host-root`: uppercase 0.8rem grey card titles (:11), its own pill
  buttons for bare `<button>` (:17-25), its own tab pills (:38-41), its own reduced-motion rule, `host-in` fade on
  each tab (:44). About 60 of its lines style classes no component renders any more (`host-bar`, `host-teamrow`,
  `host-table`, `host-filter`, `host-pill`, `host-q`, `host-topic`, `host-cluster`, `host-note`, `host-main`,
  `host-small`, `host-quiet`, `host-draft`, `host-choices`, `.team`).

### Where screens bypass the kit (file:line)
Hard-coded colors:
- teams/host/host.css:4-6 `--red #d93025`, `--yellow #e8a400`, `--blue #1a73e8`; :41 `rgba(0,0,0,0.12)` tab shadow;
  :107 switch knob `#fff`.
- teams/checkin/checkin.css:13, :27 video ground `#000`; :68 stage ground `#000`; :19 late banner shadow
  `rgb(0 0 0 / 0.25)`; :31, :36 kiosk success `#137333` and `rgba(19,115,51,0.12)`; :44 dark kiosk `#81c995` under
  a bare `prefers-color-scheme` query that ignores `data-theme`.
- teams/live/live.css:27-38 twelve team colors as raw hex (not in tokens, no dark variants).
- ios/RCCLivePortal/LateBanner.swift:160-163 hex fills; DeckView.swift:281 `Color.red` Live badge, :298
  `Color.orange.opacity(0.25)` notice; web Live pill is green (portal.css:15) and the kit Live badge is yellow.
Semantic misuse: the late banner fills with `--error` red (checkin.css:19), which tokens.css:169 reserves for failure
and destruction.
One-off sizes and spacing (outside the scale):
- checkin.css:6-7 pass name 1.5rem/700, code 2rem; :34-40 kiosk 2.2rem, 1.6rem, 3.2rem, 5rem; :50-55 quiz 1.6rem,
  1.3rem, 1.15rem; :60 bar 18px/9px radius; gaps 10px, 12px, 48px.
- live.css:8 0.9rem, :15/:22/:47/:87 0.85rem, :41-43 1.6rem/1.15rem, radii 10px and 8px, gaps 10px/14px.
- portal.css:6-55 16px/12px/20px paddings, 1.6rem/1.1rem/0.85rem type, 52px buttons.
- host.css:10-12 card padding 20px 22px, 0.8rem uppercase h2, 1.05rem h3; :32 1.9rem slide title; :36 3.2rem Big.
Inline styles: teams/host/Page.tsx:60 `margin: 0`; teams/live/Leaderboard.tsx:106 `marginTop: 10`;
teams/checkin/prof.tsx:229 `padding: "8px 24px 0"`; src/blocks/auth.tsx:445, :466 test sign-in layout.
Hand-built parts the kit already has: host tabs (teams/host/Page.tsx:76) instead of kit Tabs; Quiz/Vote toggle with
bare buttons (Quiz.tsx:136) instead of Segmented; "Group by topic" switch (QA.tsx:238, host.css:104) with no kit
equivalent; three different bar charts (Quiz.tsx `.bars`, AskRoom `.ask-bar`, Stage `.stage__bar`); four "big number"
looks (Big, Stat, `.stage__count b`, host's resized Big at host.css:36).
Words in "…" vs "...": host and AskRoom/Missing use three dots ("Loading...", Page.tsx:56, AskRoom.tsx:88,
Missing.tsx:41); everything else uses "…".

Depth today: one plane. Page #f7faf8 → white card with a 1px #ccd4cd edge → content. No elevation on cards,
banners or the kiosk result; the only shadows are the stage card and the late banner.

---

## Key states (the ones that matter most during a lecture)

Run of show (docs/meeting-1029.md): the deck feeds slides from 2:25; students scan the stage QR or the door iPad,
follow on #/live, answer quizzes; the professor watches #/host; the room sees the stage and the team board.

**phone**
1. PH-13 pass with QR: the first screen every student sees at the door; it has to scan at arm's length and say whose pass it is.
2. PH-16 checked in: the payoff after the scan; it's where the quiz lands for students who stay on this page.
3. PH-22 live slide (#/live): the screen students hold for most of the hour; slide words, "I'm lost" and the side cards compete for the first look.
4. PH-43 / PH-44 open quiz, then answer sent: the one moment the whole room acts at once; the tap target and "sent" confirmation have to be unmistakable.
5. PH-46 results: right or wrong, glanced at as the professor ends the question.
6. PH-25 not checked in on #/live: the most common stuck state; it has to send students to check in without hiding the slide.

**host**
1. HO-03 header with slide and counts: the professor's glance at the lectern; checked-in and lost counts must read in one look.
2. HO-11 / HO-12 no question yet, drafting with AI: the start of every quiz.
3. HO-13 AI draft form: the professor edits under time pressure with the room waiting.
4. HO-16 poll open: answers counting up live; "End the question" is the only action that matters.
5. HO-17 + HO-24 ended with who got it wrong: what the professor teaches from next.
6. HO-42 questions list: checked between slides; private and upvoted questions must stand out.

**staff**
1. SH-11..SH-16 staff gate: the first thing a professor sees on any laptop page, and the screen that blocks them when the sign-in is wrong.
2. SH-09 sign-in ending banner: appears mid-lecture after an hour; it must be noticed without breaking the page.
3. ST-03 / ST-06 attendance scanner and its result: the backup to the door iPad when a line forms.
4. ST-08 this class list with Remove: fixing a wrong check-in while class runs.
5. ST-37 pair a door iPad: done once before class, in a hurry, with the iPad's code in view.

**projector**
1. PR-03 / PR-04 stage card with QR and count: the room scans it in the first minutes; QR size and the count must read from the back row.
2. PR-05 quiz open on the card: "N answered" climbing is what the room watches.
3. PR-06 quiz ended bars: the reveal, with the right answer marked.
4. PR-09 late banner: a name on the big screen; needs to be friendly, readable, and clear of the card.
5. PR-22 team board (up to 6 teams): shown after quizzes; ranks and extra credit from the back.
6. PR-01 / PR-08 setup problems: only the presenter should notice these, but they show on the big screen.

**kiosk**
1. KI-10 camera off, Start check-in: what the iPad shows before class and after any interruption.
2. KI-12 camera on, "Hold your pass up to the camera": the idle state students walk past.
3. KI-13 Checked in + name: three seconds to confirm from about a metre away.
4. KI-15 refusal: the student must see what to do next before the next person steps up.
5. KI-03 pairing code: set up once per room; the code must read across the room to the laptop.
6. KI-14 Already checked in: common when students rescan; must look different from a fresh check-in and from an error.

**ios** (no comps): IO-05 live slide, IO-06 paged back, IO-04 connection notice, IO-07 late banner. Map them to the
web tokens (Live badge color, notice color, late colors) in DESIGN-SYSTEM.md.

---

Coverage check: pages in src/pages/index.ts ("", lab, checkin, live, host, portal, ui, admin) all covered; checkin
parts student/join/teacher/kiosk/quiz/stage and unknown (SH-02); live parts (none)/leaderboard and unknown; host
(none) and unknown with tabs Now/Points/Questions; portal and unknown; admin admin/professor/others; ui and
ui/projector(/dark).
