# Signature parts (before round 4)

The parts that replace the default patterns the round 3 bespoke judges found (all areas scored 2), one set across phone, host, staff, projector and kiosk. Every part is drawn in `system/signature.html` (laptop surface, light and dark; kiosk at `--k-u: .7px`, projector at `--stage-u: .45px` or `.4px`; fake names). Tokens are `system/tokens.css` plus the round 3 values still pending there (dark `--field-tile #1a6a35`, `--field-letter` light `--well` / dark `#0e4420`, dark `--tile-out #0e4420`, dark `--pick` = `--field-tile`; DESIGN-SYSTEM.md "Not done yet"). Where this file and DESIGN-SYSTEM.md differ, this file is newer; the kit owner folds it in. Judge ids are from round 3 (`host-bespoke-3-1` and so on).

## Rules every part follows

- No glyph in a circle anywhere, kiosk included. A state glyph sits inline before its word (State lockup).
- No colored stripe on any edge, no chip unless it marks a state that differs between rows, no Live dot, no eyebrow over a heading.
- Lists are ruled rows on their card; only the outer card is rounded. One nesting level inside a card at most.
- Counts are written as one sentence under one lead number. Separators are commas in plain words, never a middot run (`phone-bespoke-3-8`; frontend-design lists the middot meta string as a template tell).
- Loading keeps the real frame: en dash for numbers, the step named in the title slot, no grey bars.
- Motion only on state changes, from DESIGN-SYSTEM.md "Motion"; nothing loops, nothing animates a shadow, width or filter.

## Area signature parts

### 1. Slide track (`.track`, new `SlideTrack`), host
- **Replaces:** the four stat tiles and the repeated lost count (`host-bespoke-3-1`), Lost on this slide at Checked in's size (`host-visual-3-3`).
- **Job:** the lecture's own ruler. Which slide is up, how many students tapped I'm lost on each slide, and the check-in count, in one row that never moves between tabs.
- **Spec:** directly on `--page` under the bar, no card or well; height 88, padding `--s2 --s6`. Grid `minmax(0,260px) minmax(0,1fr) auto`, column gap `--s8`, `align-items: end`. Left: "Slide 4 of 12" `--t-small` 500 `--muted` tabular, over the title `--t-h3` 18/500, one line, ellipsis. Lane: `grid-template-columns: 44px repeat(<slides>, minmax(0,1fr))`, rows `32px 12px 20px`, gaps `--s1`. Row 1: label "Lost", then each slide's count centered over its segment, `--n-sm` 20/700 tabular, the current slide's at `--n-md` 32, zeros not printed. Row 2: segments 8 tall `--r-xs`: past `--line-strong`, future `--line`, current 12 tall `--text`. Row 3: label "Slide", slide numbers `--t-small` `--muted` tabular, current `--text` 700. Right: Room count numeral at `--n-md`.
- **States:** loading: segments drawn from the deck's length, counts as en dashes, title slot "Loading the slides…". Error: title slot is a lockup (warn, `--st-stop-mark`) with the app's sentence. More than 20 slides: segments keep 4 gaps and numbers show every 5th plus the current.
- **Motion:** slide change swaps segment fills on `--fx` 140 `--ease`; counts swap value in place.
- **Do:** label both rows; keep the current segment ink. **Don't:** fill the current segment green (`host-bespoke-3-1` asked for `--accent`; declined, the screen's green goes to End the question and the tab rule), or repeat the current count anywhere else.

### 2. The pass, the stub and the empty pass (`.pass`, `.stub`, `.perf`), phone
- **Replaces:** lock in a circle on a centered card (`phone-bespoke-3-1`), the check disc over a loose label stack (`phone-bespoke-3-6`), the two-weight lock (`phone-bespoke-3-7`), the team pill's stroke.
- **Job:** the student's ticket. The QR is what the camera reads; under the perforation sit the name and the code the professor reads out when the camera fails.
- **Spec (pass):** `--raised`, `--r-xl`, `--shadow-1` + `--hl`, padding `--s4`, gap `--s3`, top-anchored `--s4` under the bar. Head "Show this to the professor" `--t-h3` 500. QR fills the content width (max 342; 288 at 320 wide), `--r-md`, its own 4-module quiet zone, no inner well. Perforation `.perf`: 2px dashed `--line-strong` across the full card width (margin-inline `-var(--s4)`). Name 20/500. Code: Google Sans Code 40/700, tabular, tracking .08em, groups split by `.code__gap` .5em, `user-select: all`. Note `--t-small` `--muted`. Every line starts at the card's text edge.
- **Spec (stub, checked in):** `--field`, `--on-field`, same radius and padding. Lockup "You're checked in." 32/700 with a 32-stroke check. Name 20/500. Perforation in `--on-field-muted`. Two columns: "Checked in at" / "Late after" labels `--t-small` 500 `--on-field`, values 24/500 tabular with "PM" at `--t-body`. Team line: 16 chip with a 2px `--on-field` ring, "You're on Purple" 500, no pill.
- **Spec (empty, signed out):** the pass with head "Your check-in pass", the QR slot as a `--well` square at the QR's size, the perforation, "Sign in to get your pass." `--t-h3` 500 and Google's button 56 tall at full width where name and code go. No bars for name and code.
- **Motion:** pass to stub is field-fill (`--fx-slow` 220); a new code swaps in place, the old QR at .35 opacity while it loads.
- **Do:** keep the perforation at the same y in pass and stub. **Don't:** center the head, add notches or a second frame around the QR.

### 3. The register (`.reg` on Ruled list, `.tally--head`), staff
- **Replaces:** the three summary tiles (`staff-bespoke-3-1`), the admin role tiles (`staff-bespoke-3-2`), the late chips and every pill in the column (`staff-bespoke-3-6`), rows in a well in the page (`staff-bespoke-3-5`), the red confirm stripe (`staff-bespoke-3-4`).
- **Job:** the attendance sheet for this class, read in a hurry before class.
- **Spec:** page head is a Count sentence: "38" `--n-lg` 48/700 `--accent` (`--muted` at 0), "checked in" `--t-h3` 500, then "4 late, class started 2:28 PM" `--t-body` `--muted` with numerals `--text` 700, all on one baseline. The table is one card (`--raised`, `--r-xl`, `--shadow-1`, padding `--s4 --s5`) holding a Ruled list with columns `minmax(0,1fr) 120px 120px 96px`: Name, Late (Ledger numerals "+13 min", blank when on time), Checked in ("2:41" tabular with "PM" `--t-small`), actions (ghost Remove on the selected row only). Rows `--t-body`. Newest arrival: `--st-in` fill, `--r-sm`, for `--hold-new` 4s. Empty: the head plus one row "Names show up here as students check in." in `--muted`.
- **Scan result (scanner page):** `--st-in` fill, 1px inset `--st-in-mark` ring, `--r-lg`, padding `--s4 --s5`; lockup "Checked in" `--t-h2` 700 and the name. Already and refused take `--st-wait` and `--st-stop` the same way.
- **Do:** right-align Late and Checked in, heads included. **Don't:** chip the late minutes or put a glyph in the Late column.

### 4. Stage count card (`.stage-card`), projector
- **Replaces:** the Open pill with a dot and the "Question" eyebrow (`projector-bespoke-3-3`), the mint error bar (`projector-bespoke-3-7`), skeleton blocks (`projector-bespoke-3-8`), the grey hidden chip (`projector-bespoke-3-11`).
- **Job:** the one number the room reads, beside the QR, in the same corner in every state.
- **Spec:** kit geometry stands (600 wide, padding 32, `--p-radius`, QR 536 white tile r16, fixed bottom right inside the 96 frame). Count: Room count numeral at `--p-count` 240/700, tracking -0.03em, line-height .8, "checked in" `--p-small` 500 on its baseline. Hide control 56 with a 3px `--on-field-muted` ring and the x glyph at the display stroke.
- **States:** error: the warn glyph at 160 (stroke 28) in the numeral's slot, "count didn't load" `--p-small` 500 `--on-field` `[TBD copy]`. Loading: "Loading" `--p-body` 500 in the numeral's slot. Hidden: a tab sized to its words, "Check-in hidden" `--p-small` 500 `--muted`, eye glyph, 4px inset `--line-strong` ring, radius 16 stage px, no fill, at the card's bottom-right anchor. Poll open: `--well` fill, count at `--p-rank` 160. A poll panel heads with one line "Question open" (`--on-field-muted`) or "Question ended" (`--muted`) at `--p-small` 500.
- **Motion:** count-swap instant; hide and show cross-fade `--fx-slow`.

### 5. 1st-place panel and ledger (`.first`, `.ledger`), projector
- **Replaces:** the readout trio (`projector-bespoke-3-4`), rows as tiles in a well (`projector-bespoke-3-5`), rank squares and credit chips (`projector-bespoke-3-6`), the dull dark credit chip (`projector-bespoke-3-10`), the centered empty well (`projector-bespoke-3-9`).
- **Job:** a scoreboard: the leader read alone from the back row, the rest as a plain ranked table.
- **Spec:** grid `640 stage px, 1fr`, gap 48, top 216. Panel: `--field`, padding 40, gap 20, `--p-radius`. "1st" at `--p-rank` 160/700, tracking -0.03em, the ordinal suffix at .42em raised to cap height (`vertical-align: 1em`; suffixes are raised only at 96 and up). Team: 64 chip with a 4px `--on-field` ring, name `--p-head` 92/700. "+5 extra credit" `--p-body` 700, no chip. Line `--p-body`: "2.0 per student" then "6 right, 3 students", numerals 700, two lines on purpose. Ledger: heads `--p-ledger` 32/500 `--muted`; rows 104 stage px, flat, 6px `--line` rule on top, no fill or radius; columns `104, 1fr, 150, 230, 250`; place a bare numeral 700 right-aligned; team chip 32 + name `--p-body` 500; numbers tabular right; credit "+3" 700 `--text`, zero `--muted` 400.
- **Empty:** same grid; hero slot on `--well` with "No teams yet." `--p-head` and the reason `--p-body` `--muted`; the ledger shows its heads and six empty rows numbered 1 to 6 in `--muted`.
- **Motion:** board-reorder (instant, the moved row holds a 6px `--accent` ring 2s, fades `--fx-slow`).

### 6. Door panel (`.door`, `.door__panel`, `.door__status`, `.door__cam`, `.door__strip`), kiosk
- **Replaces:** three stacked shadowed cards (`kiosk-bespoke-3-1`), seals at 112 (`kiosk-bespoke-3-2`), the camera-off placeholder and the separate Start pill (`kiosk-bespoke-3-5`), the action parked by the seal (`kiosk-bespoke-3-10`), the repeat glyph and ringed grey panel for already (`kiosk-bespoke-3-8`), skeletons (`kiosk-bespoke-3-7`).
- **Job:** one surface read in 3 seconds; a result recolors the whole panel around the camera.
- **Spec:** column: `.k-bar` 72, the panel (`flex: 1`, radius 0, no shadow, flush under the bar), the strip. Panel fill: idle `--raised`, checked in `--field`, already `--st-wait`, refused `--st-stop`, words in the matching ink. Status zone: 320 tall (was `--k-panel` 440, which held the seal row), padding `64 40 0`, left-aligned, gap 8. Lockup at `--k-status` 96/700 (long words at 72, nowrap), name `--k-name` 56/500, reason or prompt `--k-prompt` 48/500. Already: the check glyph in `--st-in-mark` on `--st-wait`, no ring. Camera window: inset 24 on three sides, radius 16, `--cam`, so the panel's color frames it. Strip: `--bar`, 1px `--line` on top, no radius, padding `16 24 20`; "Code on your pass" `--k-label` 500, input 56, Check in outline 56.
- **Start and camera blocked:** the camera window is the button: `--field`, camera glyph 96 (stroke 20 on the 256 grid), "Start check-in" 40/500 centered on `--on-field`. Blocked: panel `--st-stop` with "Camera blocked" at 72 and "Allow it in the browser's address bar." at 48; the window keeps "Start check-in" on `--raised` with `--text` words.
- **Loading:** count slot shows an en dash in `--muted` at the numeral size, the prompt slot "Checking this iPad…" at 48, the start surface and the code field disabled at .45 opacity with `aria-disabled`.
- **Motion:** kiosk-result: fill and words on `--fx` 140, hold `--hold-result` 3s, back on `--fx-slow`; corners to `--cam-mark-ok` on `--fx`.

### 7. Viewfinder target (`.target`), kiosk and the staff scanner
- **Replaces:** small L brackets inset 16% 30% at 6px, and the "Camera is on" caption (`kiosk-bespoke-3-6`).
- **Spec:** a square (the QR is square) centered in the window, 64% of its height; corner arms 22% of the side; stroke 10 device px (`vector-effect: non-scaling-stroke`), round caps, `--cam-mark`, `--cam-mark-ok` on a read. No caption, no dashed guide.

### 8. Pairing code with time rule (`.pair`), kiosk
- **Replaces:** a card in a card with the code floating in a 680 well (`kiosk-bespoke-3-4`), the clock seal on the expired screen (`kiosk-bespoke-3-3`).
- **Spec:** the page is the surface. Padding `64 40 40`, left-aligned. "Pairing code" `--k-label` 500 `--muted`; code Google Sans Code `--k-code` 144/700 tabular, two groups with a .5em gap; under it a 4px rule the code's width: track `--line`, time left `--line-strong`, width set by JS once a minute, no transition. "The code works until 2:51 PM." 28/500, then the app's instruction at 28 with 36 above. "Or sign in" is a flat row over a 1px `--line` rule at the bottom.
- **Expired:** "The code expired." 40/700 above the old code, which stays in place in `--muted` with a 6px `--st-stop-mark` line-through; "Get a new code" `.btn--k` primary, full width, 104 tall, repeat glyph.

## Shared parts

### 9. Letter tile and thumb tile (`.letter`, `.choice`), phone, host, staff, projector
- **Replaces:** grey dark tiles and the letter that inverts by state (`phone-bespoke-3-9`), the "Question" eyebrow (`phone-bespoke-3-10`), tiles in a well in a card (`host-bespoke-3-5`), rank tiles that looked like answers (`phone-bespoke-3-8`).
- **Spec:** letter 44 square, `--r-md`, Google Sans 20/700, centered. On a field: `--field-letter` with `--on-field-tile`; on a card `--bar`; empty slot `--well` with `--muted` letter; table cell 24 with `--r-sm`; stage 2.25em. The letter never inverts. Phone tile: 72 tall, `--r-lg`, padding `--s3 --s4`, gap `--s4`, `--field-tile` + `--hl`, words 19/500. Picked: 3px inset `--text` ring and the word "Picked"; Sent: the same plus check + "Sent". Out after sending: `--tile-out` fill, letter on `--out-letter` (light `--well`, dark `--field`), words full strength. Right answer (host, staff): letter `--st-in-mark` with `--st-in` text. The phone field opens on the question at 28/700, no label above it.
- **Motion:** choice-press scale .98 on `--sp-fast` `--ease-sp` (phone only); select and send on `--fx`.

### 10. Room count numeral (`.roomn`), every area
- **Replaces:** the kiosk bar count with no tabular figures on a mismatched baseline (`kiosk-bespoke-3-9`), and four different count drawings.
- **Spec:** Google Sans 700, `tabular-nums lining-nums`, tracking -0.02em (-0.03em at 160 and up), line-height 1 (.8 on the stage), in an inline-block of `min-width: 2ch` (3ch on the kiosk), `text-align: end`; "checked in" 500 on the same baseline, gap .28em. Sizes: kiosk 40 with a 24 label, host track 32, staff head 48 (`--accent`, the page's one green number), stage 240. Ink everywhere else.
- **Don't:** set it in Google Sans Code (asked in `kiosk-bespoke-3-9`; declined: the code face means a code you type).

### 11. State lockup (`.lockup`) and the glyph set (`.icon`), every area
- **Replaces:** every seal and medal disc (`phone-bespoke-3-6`, `host-bespoke-3-3`, `staff-bespoke-3-3`, `staff-bespoke-3-9`, `kiosk-bespoke-3-2`), the three-weight locks (`phone-bespoke-3-7`).
- **Spec:** the glyph inline before the word: .82em square, `vertical-align: -0.08em`, `margin-inline-end: .22em`; words 700 (500 for a heading-slot error). Glyph color is the state's mark on page or card, the words' ink on a filled state. Construction: 256 grid, round caps and joins, no fills; stroke 24 beside 400/500 words, 32 beside 700 words. Meanings: check done (checked in, sent, right, already in); x not accepted (refused, wrong pick, hide); lock a professor's or admin's rule stops this (answers locked, teams final, permanent admin, not on the staff list, the kiosk staff control); clock time (late, sign-in ending, expiry); warn didn't load or needs the presenter; repeat do it again; camera start the camera; eye shown to the room; up upvote.
- **Sizes:** phone result and stub 32, staff scan result 24, host heading error 18, staff refused 17 (20 glyph in `--st-open-mark`), kiosk 96 and 72. A wrong pick's x is `--muted`, never red.

### 12. Count sentence (`.tally`) and heading line (`.hline`, `.stateword`, `.facts`), host, staff, projector
- **Replaces:** the quiz-ended tile row (`host-bespoke-3-6`), the staff signin-ending stats (`staff-bespoke-3-10`), the four header pills and the green dot (`host-bespoke-3-2`).
- **Spec:** heading `--t-h3` 500, then one state word on its baseline: "Open" `--st-in-mark` 500, "Ended" `--muted` 500, no fill. Under it one fact line `--t-small` `--muted` ("Quiz, AI draft"; the slide number only when it isn't the current slide). The card's action sits at the header row's right edge. Hero slot: the lead at `--n-hero` 96/700, tracking -0.03em, line-height .9, then its words at `--t-h1` 500 `--muted` on the same baseline ("14" "of 38 answered"; ended: "62%" in `--accent` "got it right"). Other counts as one line under it, `--t-body` `--muted`, numerals 700 `--text`: "21 of 38 answered, median time 18 s". The slot keeps its size and place from open to ended.

### 13. Ruled list (`.ruled`) with ledger numerals (`.ln`), every area
- **Replaces:** cards in wells in cards (`host-bespoke-3-5`, `staff-bespoke-3-5`, `phone-bespoke-3-5`, `projector-bespoke-3-5`), the selected-row rail (`host-bespoke-3-4`), place pills (`host-bespoke-3-8`), late and credit chips, the filled tab count (`host-bespoke-3-10`).
- **Spec:** rows straight on the card, `grid-template-columns: var(--rcols)`, padding-inline `--s3`; head 36 tall `--t-small` 500 `--muted` with a 2px `--line-strong` rule under it; rows `--row-h` 44 with 1px `--line` between (decoration, the columns carry the structure); only the card has a radius. Selected: lifts one rung (`--raised` + `--shadow-1`, dark `--overlay` + `--hl`), `--r-sm`, extends `--s2` past the rules each side, its controls (32 outline icon buttons, 8 apart) only on it. Confirm in a row: `--st-stop` fill, 1px inset `--st-stop-mark` ring, `--r-sm`, warn glyph inline, Cancel outline and the only red fill. Bars: columns `44 1fr 56`, rows 60, track 12 `--well`, fill `--line-strong` while open, right row fill `--st-in-mark` with "Right answer" words; phone results add "Your answer" in `--text` 500.
- **Ledger numerals:** tabular, right-aligned in fixed columns. Place: the app's ordinal ("1st", "2nd") 700, "tied" after it 400 `--muted` (`host-bespoke-3-8` asked for "=2"; declined, the app's strings stand). Credit "+3" 700; zero 400 `--muted`. Late "+13 min" 500 `--st-open-mark` (5.93 on raised light, 7.59 dark). Tab and section counts: "Questions 6", "People 6", numeral 500 `--muted`, no fill. Offline: warn glyph + "Offline" 500 `--st-open-mark`, no chip.
- **Answer block (`.answer-block`):** set in to the question's text x (60), `--well`, `--r-sm`, padding `--s2 --s3`, `--t-small`, "Your answer:" 500 then the words. No strip.
- **Phone:** the same list on the result card (rows 60, rank a bare `--n-sm` numeral in a 32 column, "(you)" after the team name in 700, "+5" at the right with "credit" under it).
- **Motion:** row-new tint fades on `--fx-slow` after 4s; bar-fill `scaleX` on `--sp` 320 when a poll ends.

### 14. Pending and empty frames (`.pend`, empty parts), every area
- **Replaces:** skeleton bars and circles (`host-bespoke-3-9`, `phone-bespoke-3-11`, `kiosk-bespoke-3-7`, `projector-bespoke-3-8`), inbox glyph empties (`host-bespoke-3-3`, `staff-bespoke-3-3`).
- **Spec:** loading keeps labels and frames; each number is an en dash at its role's size in `--muted` 400; the title slot names the step ("Loading the question…", "Loading the slides…" in the slide title role, "Slide – of 12"); actions disabled with `aria-disabled`. Empty draws the real part: the composer's four empty letter slots under "Slide 4, Capacitors in a circuit" with Draft with AI and Write my own beside them; team squares (24 chip, name 500, "0 students" `--muted`, 3 columns); the register's head plus one muted row; the stage ledger's numbered empty rows; the empty pass. No `.skel` and no `.seal` on any screen. (`phone-bespoke-3-1` and `-3-11` asked for `--well` bars in the name, code and title slots; declined, one rule: no grey bars.)

### 15. Live state written only when false, phone
- **Replaces:** the Live pill on every slide card (`phone-bespoke-3-3`).
- **Spec:** the slide card shows "Slide 4 of 12" `--t-small` `--muted`; paged back it reads "Slide 2 of 12, the professor is on 4" `[TBD copy]` and Next becomes "Back to slide 4" (`.btn--raised`).

### 16. Lower third and presenter note (`.lower3`, `.pnote`), projector
- **Replaces:** the amber pill with an edge stripe (`projector-bespoke-3-1`) and the striped presenter note (`projector-bespoke-3-2`).
- **Lower third:** bottom-left lane on the 96 frame, 104 tall, padding `0 36`, radius 16 stage px, `--warn` with `--on-warn`, `--p-body` 500, name 700, "4" tabular, "+2 more" 400; clock glyph inline at 1em, stroke 32 (the 72 disc asked for is declined). banner-rise on enter, out faster.
- **Presenter note:** same lane, max 880, no fill, 4px inset `--st-open-mark` ring, radius 16, `--p-small` `--muted` with "For the presenter:" 500 `--text`, warn glyph `--st-open-mark`. The filled bar is for the room, the ring for the lectern.

### 17. Locked console (`.gate`), staff
- **Replaces:** the centered auth card on an empty field (`staff-bespoke-3-8`), the amber lock seal (`staff-bespoke-3-9`).
- **Spec:** the staff bar with its tabs shown `aria-disabled` in `--muted`; the card on `--overlay` + `--shadow-1`, `--r-xl`, padding `--s8`, left edge on the console's content x (48), 32 under the bar, max 520. Logo, the independence sentence under it, title `--t-h1` 500, the gate sentence, Google's button at its own width (min 280). Refused: the lock lockup "ivy@example.edu isn't on the staff list." 17/500, glyph 20 `--st-open-mark`, then Sign out as a `.link`.
- **Logo:** light uses `gdg-on-campus-horizontal-light.svg` at 360, offset -18 so the mark meets the text edge. Dark uses `gdg-on-campus-stacked-dark.svg` at 168 tall, and the card grows downward. `staff-bespoke-3-7` asked for a horizontal dark lockup; that file doesn't exist, and bright-lines 1.5 forbids the light file on a dark ground or any recolor, so declined (see outside scope).

## What the kit owner changes

- tokens.css: the pending round 3 dark values above; new `--out-letter` (light `--well`, dark `#025620`).
- kit.css adds `.track`, `.pass`, `.stub`, `.perf`, `.roomn`, `.lockup`, `.icon--d`, `.tally`, `.hline`, `.stateword`, `.facts`, `.ruled` (+ `.is-selected`, `.is-new`, `.is-confirm`), `.ln` family, `.answer-block`, `.letter--empty`, `.pend`, `.door` family, `.target`, `.camstart`, `.pair` family, `.first`, `.ledger`, `.lower3`, `.pnote`, `.ptab`, `.gate`, `.btn--raised`.
- kit.css retires `.strip`, `.summary`, `.seal`, `.medal`, `.skel`, `.badge--live`, `.rank`, `.tabs__n` fill, `.team-pill` fill, every `::before` strip, `.leader__readouts`, `.k-status` rings and the `.k-fallback` card.
- Keep exports and props in phase 2: `Big`, `Projector`, `EmptyState`, `Skeleton` render the new parts.
