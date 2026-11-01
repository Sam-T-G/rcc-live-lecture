# Lessons

What each judging round taught, with evidence, and the change it made to `DESIGN-SYSTEM.md`. Each entry: id, the change (added, changed or removed rule), the judges' evidence (dimension, area, score, comp), and the section it lives in. Scores are the round's judge scores out of 5; "before" is the previous round's score for the same dimension and area.

## Round 1 (2026-10-31)

Round 1 is the first scored round of comps, so every "before" is none. Scores: phone 4/4/3/4/3/3/2, host 3/4/3/3/3/3/3, staff 3/4/3/3/3/3/2, projector 3/3/3/3/3/3/3, kiosk 3/4/4/4/3/4/3 (hierarchy, depth, brand, legibility, fit, states, craft); taste 3.5, coherence 4. Craft is the weakest dimension (2 on phone and staff). Rules below were changed where the same issue showed in two or more areas, or where research answered a judge's question.

### R1-01 Removed: the focal card's 3px green top rule
- Rule removed: `.focal` = raised + shadow + 3px `--accent` top rule. Now: the focal card is marked by its rung only; any straight accent mark on a rounded part is a clipped `::before` strip, never an inset shadow or `border-top`.
- Evidence: phone craft 2 (`phone-live-slide.html`, `phone-pass.html`: "the green rule thins out at both corners and reads as a crescent", same artifact on the amber and red banners); phone brand 3 (issue phone-visual-1-3); host brand 3 ("spent on a decorative 3px top rule on every .focal card", issues host-visual-1-3, host-craft-1-3, `host-now-start.html`); staff brand 3 (staff-visual-1-4, `staff-admin-pair.html`); kiosk asked to add the rule to `.k-status--idle`, declined by this change.
- Where: "Space, size and shape" (Lines), "Surfaces and elevation" (Focal row, rules), "The kit: Banner".

### R1-02 Changed: one "yours" marker, and selection is not an ink ring
- Rule changed: picked tile, the student's team row and the student's result bar all use the 3px `--text` ring plus the inverted letter plus a word chip; a selected laptop row uses a raised rung plus a 4px accent left strip, no ink ring.
- Evidence: phone craft 2 (phone-craft-1-2, `phone-live-slide.html`, `phone-quiz-sent.html`, `phone-quiz-results--wrong.html`: three treatments of "yours"); phone use (phone-use-1-4, "(you)" wraps and rows go uneven); host craft 3 and use (host-visual-1-2, host-use-1-4, host-craft-1-11, `host-questions.html`: "reads as a focus ring rather than a raised row").
- Where: "The kit: Bars" ("Yours" has one marker), "The kit: Rows and table".

### R1-03 Changed: one display-size number per screen; times are never display numerals
- Rule changed: `--n-hero` 72 to 96; `.readout__n` from `--n-lg` 48 to `--n-md` 32; `--n-lg` is the single lead readout when no live number shows; times of day at `--t-h3` or `--n-md` at most.
- Evidence: host hierarchy 3 and legibility 3 (`host-quiz-open.html`: strip 38 and 3 at 48 tie with each other just under the 64 live count; host-use-1-1 asks 96); host craft 3 (host-craft-1-1: three big-number styles); staff hierarchy 3 (`staff-signin-ending.html`: Answered, Got it right, Median at one size; `staff-attendance-list.html`: "Class started 2:28 PM" as large as the green 38; staff-visual-1-2, 1-3, staff-use-1-6); phone hierarchy 4 but phone-visual-1-1 major (`phone-checked-in.html`: 2:31 PM at about 76px over a 58px headline).
- Where: "Tokens: Type" (Numerals), "The kit: Readout", host and staff layout rows.

### R1-04 Changed: dark `--well` from `#0b0e0c` to `#111512`
- Rule changed: the dark well sits 1.07:1 under the page (was 1.13), raised/well 1.22, so the well stays a quiet rung.
- Evidence: phone depth 4 with phone-visual-1-7 (dark hide-late row, leaderboard and results wells "read as holes" and flip the quiet-well, loud-card order); host depth 4 with host-visual-1-4 and host-use-1-9 (`host-now-start.html`, `host-quiz-open.html` dark: "near-black ... heavy dark blocks"). Ratios computed with the WCAG formula this round: text on the new well 15.06:1, muted 9.62:1.
- Where: "Tokens: Colors", "Surfaces and elevation" rules, "Contrast", "Where the app differs from GDG".

### R1-05 Added: "Alignment and space": one text edge, fixed slots, no dead space
- Rule added: text in a column shares one left edge; a part's box keeps its size and x across states; no `1fr` spacer rows, no vertically centered tall cards, empty states top-aligned, cards sized by content.
- Evidence (one text edge): phone craft 2 (phone-craft-1-4: two left edges at 16 and 28); host craft 3 (host-craft-1-4: title at x 72 vs 80 between tabs); staff (staff-visual-1-7: logo 18px right of the title).
- Evidence (fixed slots): host craft 3 (host-craft-1-2: Lost by slide at x 1044 / 1030 / 1110); projector craft 3 and fit 3 (check-in card 888 tall in checkin, 768 in poll states); phone craft (phone-craft-1-7, phone-visual-1-9: QR slot changes edge and goes blank in `phone-pass--new-code.html`). Kiosk craft 3 kept its 4-row grid fixed and is the model.
- Evidence (dead space): phone (phone-craft-1-5, phone-visual-1-1/1-2, `phone-checked-in.html`, `phone-pass--signed-out.html`); host fit 3 (host-use-1-3, host-visual-1-6, host-craft-1-10, `host-now-start.html`); staff (staff-visual-1-8, staff-use-1-2: two wells for one idle scan panel); kiosk fit 3 (`kiosk-scan.html`: 570px of dead black camera).
- Where: "Space, size and shape: Alignment and space", per-area layout rows.

### R1-06 Sharpened: green never decorates or repeats on every row
- Rule added under Color rules, with fixes per area.
- Evidence: phone brand 3 (phone-visual-1-5, `phone-live-slide.html`: green +5/+3/+1 chips on every row while the student's own row was grey); host brand 3 (host-visual-1-8 Kept and Shared both green, host-use-1-6 and host-visual-1-5 filled Draft with AI beside the right-answer row in `host-quiz-ended.html`); staff brand 3 (staff-visual-1-6, dark just-added row "five greens on one screen").
- Where: "Tokens: Colors" (Color rules), host layout rows.

### R1-07 Changed: Live / Open badge from amber to solid green with a dot
- Rule changed: `--live` `#e09f2e`/`#e7ae58` to `#00732d`/`#96d6a0` with `--on-live` white / `#003410`; amber is warn and late only.
- Evidence: research `research/round1-1.md` (amber edge 2.29:1 on white, same hue as the late banner, iOS badge is red so "match iOS" did not hold; green 6.02 / 8.29); host-use-1-11 (`host-quiz-open.html`: amber Open chip is the only live signal while the page's live accent is green); phone brand 3 (`phone-live-slide.html` evidence names the amber Live pill).
- Knock-on: the late banner and the projector late lane drew their 6px rule from `--live`; they now use `--st-open-mark` so late stays amber.
- Where: "Tokens: Colors", "The kit: Badge", "The kit: Late banner", "Contrast", "Where the app differs from GDG", "iOS", "Not done yet" (iOS follow-up is Sam's call).

### R1-08 Changed: one part, one treatment (table head, badges, Write my own, letter tiles)
- Rule changed: every list with column labels uses `.rows__head`; every badge radius 4 sized to content; a state badge and a type label differ by treatment; Write my own is outline in every state; table letter tiles use `.letter--sm`.
- Evidence: staff craft 2 (staff-visual-1-5: People head filled, This class head bare; staff-visual-1-10: Late chips square at fixed 132 while others are pills; staff-visual-1-9: Ended and Quiz same grey chip); host craft 3 (host-craft-1-5, 1-8, host-visual-1-7: two empty-state layouts on one screen); coherence 4 overall.
- Where: "The kit: Badge", "The kit: Rows and table", host layout rows.

### R1-09 Changed: laptop labels and meta at 15 / 500, ledger 13 for badges only
- Evidence: host legibility 3 (host-use-1-7: strip labels, Slide 5 chips, timestamps and the whoami line at 13px); staff legibility 3 ("stat labels (Professors, Late, Checked in) and table heads" at 13 in `staff-attendance-list.html`, `staff-admin-pair.html`).
- Where: "Tokens: Type", "The kit: Readout".

### R1-10 Added: errors on a green field or the stage card are a neutral inset card
- Rule added: `.banner--inset`, `--raised` card, 2px `--line-strong` edge, 4px `st-stop-mark` strip, glyph, words in `--text`; never red or pink on green.
- Evidence: phone-visual-1-4 (major, `phone-quiz-sent--retry.html` dark: saturated red block louder than the question); projector states 3 (`projector-stage-checkin--error.html`: "a loud red box"). Research `research/round1-2.md`: error container vs green field is 1.06:1 light and 1.0:1 dark, so hue is the only edge, and red on green is the colour-blind failure pair (WCAG 1.4.1, 1.4.11).
- Where: "The kit: Banner", "States" (Error), projector check-in row.

### R1-11 Added: a state counts only when a comp renders it; loading controls render disabled
- Rule added: every key screen ships `<id>--<state>.html` for loading, error and any in-between wait step; host's owed state comps listed.
- Evidence: phone states 3 (phone-use-1-2: no Sending state; phone-use-1-9: Back / Next look tappable while loading); host states 3 (host-use-1-10: no drafting, vote, error, signed-out); staff states 3 (staff-use-1-1: `staff-gate-loading.html` blank pill; builder not_fixed staff-baseline-7, -11); kiosk states 4 but builder not_fixed kiosk-baseline-7, -11, -12 (camera blocked, page failed, loading). Four builders gave "not in my assigned list" as the reason.
- Where: "States" intro, host and phone layout rows.

### R1-12 Changed: projector quiz-open card is no longer "unchanged"
- Rule changed: during a poll the answered count takes `--p-count` 240 and the card's check-in count steps to `--p-head` (`.stage-card--poll`); the QR keeps its size and spot; the card anchors to the top of the frame with one height in every state.
- Evidence: projector builder flagged the conflict (DESIGN-SYSTEM said both "card unchanged, count 240" and "14 answered is the first thing"); projector hierarchy 3 and craft 3 (the card changed height and count style between `projector-stage-checkin.html` and the poll comps).
- Where: "Layout per area: projector".

### Also recorded this round
- Kiosk refused word: decided at `--k-status` 96 with the reason sentence at 30 in the name slot (builder request; kiosk states 4 with that comp). Long words at 80 (`.k-status__word--long`).
- Phone layout: tiles move into the thumb band by collapsing the slide card while a poll is open or results show (phone fit 3, phone-use-1-1, 1-5); phone margin 16 on `.bar` too (builder kit request).
- Staff bar: page links are kit `Tabs` with `aria-selected` (staff-visual-1-1, staff brand 3); whoami muted (host-visual-1-9).
- Bars: token geometry and a fixed 56px count column, neutral fills while open (phone-craft-1-9, host-craft-1-7, host-use-1-2).
- Kit and tools gaps the doc keeper can't fix (kit.css and tokens.css still carry the old values; the render harness's `file://` errors) are listed in "Not done yet".

## Round 2 (2026-10-31)

Scores, round 1 to round 2 (hierarchy, depth, brand, legibility, fit, states, craft): phone 4/4/3/4/3/3/2 to 4/3/4/4/3/4/3; host 3/4/3/3/3/3/3 to 4/4/3/3/4/4/3; staff 3/4/3/3/3/3/2 to 3/4/4/4/4/4/3; projector 3/3/3/3/3/3/3 to 3/4/4/4/4/3/3; kiosk 3/4/4/4/3/4/3 to 3/4/4/4/3/4/3; taste 3.5 to 3.5, coherence 4 to 3.5. States rose in phone, host and staff (R1-11 worked); craft rose on phone and staff but sits at 3 everywhere; phone depth fell. The render run stopped after phone and part of host, so the host open states were not judged (host-craft-2-11) and `rounds/2/snapshot/` was not written; issue ids below are from the judges' round 2 list.

### R2-01 Changed: dead space has two causes, stretched laptop grids and top-pinned phone actions
- Rule changed: laptop two-column grids use `align-items: start` (only an inside-scrolling list stretches); a one-card phone screen anchors its card low; the phone's main actions live in a sticky bottom action bar with safe-area padding. Removed: phone signed-out card "top-aligned 16 under the bar", "Back / Next along the card's bottom", "Follow the slides as a field tile 32 under the pill", and the `margin-top: auto` under-32 clause.
- Evidence: phone fit 3 to 3 (phone-visual-2-2, phone-use-2-3, phone-craft-2-11 `phone-pass--signed-out.html`: card ends at y 305 of 844; phone-use-2-2 `phone-live-slide.html`: Back / Next at y 350, 1251px below the fold; phone-use-2-4 `phone-checked-in.html`); host fit 3 to 4 with host-visual-2-1 major, host-use-2-6, host-craft-2-9 (`host-quiz-ended--vote.html`, `host-quiz-draft--drafting.html`: 500 to 520px empty aside); staff fit 3 to 4 with staff-use-2-7 (`staff-admin-pair--empty.html`: 80px band); kiosk fit 3 to 3 (status card's right third empty, `kiosk-scan.html`).
- Declined: host-use-2-2 asked cards stretched to 60vh, which contradicts host-visual-2-1 and host-craft-2-9.
- Where: "Alignment and space" (No dead space), "Layout per area: phone", "States" (Signed out).

### R2-02 Changed: a readout row has at most two sizes, one baseline, and fixed sizes per slot
- Rule changed: lead (`.readout--lead`) in slot 1 only, the rest `--n-md`; every cell on one two-row grid; a readout keeps its size across states (vote-ended has no lead); times are `--n-md` values with a `--t-body` unit (replaces R1-03's "Class started as a `--t-h3` line", which made a third size); the host strip's slide title drops to `--t-h3` so its counts outrank it; summary wells stretch to the part below.
- Evidence: host craft 3 to 3 (host-craft-2-3 `host-quiz-ended.html` vs `--vote`: Answered at 32 then 48; host-craft-2-4 strip label baselines at y 110 / 113 / 115; host-craft-2-2 summary well shrink-wrapped to 540 and 452px); host legibility 3 to 3 (host-use-2-1 `host-now-start.html`: counts at 32 tie the slide title, Lost by slide at 14; host-use-2-8 three sizes in one well); staff legibility 3 to 4 but staff-use-2-1, staff-use-2-9 (`staff-attendance-list.html`, `staff-signin-ending.html`: 48 / 32 / smaller on three baselines); phone-visual-2-3 major (`phone-checked-in.html`: 2:31 PM still at headline size; the rule existed, the comp missed it).
- Declined: staff-use-2-8 asked the admin counts at 40+; staff-visual-2-7 asked them quieter so the Pair card leads. Kept at `--n-md` with no lead.
- Where: "Tokens: Type" (A readout row), "The kit: Readout", host and staff layout rows.

### R2-03 Added: one green per object; Draft with AI is the primary after a quiz ends
- Rule added: a row or card carries green one way. On a laptop the right-answer row keeps the green bar, green letter and a `badge--in` chip, no tint or ring; host answer blocks go to `--well` with a `--line-strong` strip. Changed R1-06's "Draft with AI drops to outline": with the right row no longer filled, Draft with AI is the ended state's one filled button and Ask the AI a text link.
- Evidence: host brand 3 to 3 (host-visual-2-5 `host-quiz-ended.html`: tint + ring + bar + filled chip outweigh the 62%; host-visual-2-4 `host-questions.html`: green answer blocks twice over; host-visual-2-9: three equal outlines leave no next step); staff brand 3 to 4 with staff-visual-2-5 (`staff-signin-ending.html`: the same four-way green row).
- Where: "Tokens: Colors" (Color rules), "The kit: Bars", host and staff layout rows.

### R2-04 Changed: dark tokens for things on the field and for tonal buttons; one filled green in both themes
- Rule changed: dark `--field-tile` `#181c19` to `#383f39` with `--hl` (tiles, team pill, inset error card); dark `--accent-soft` `#00531e` to `#26402c` (words `#c6eccb`, 8.78:1); staff Add from tonal to outline; `.banner--inset` loses its 2px `--line-strong` ring and takes the `--field-tile` pair and `--r-lg`. Ratios computed this round with the WCAG formula.
- Evidence: phone depth 4 to 3 (phone-visual-2-1 major and phone-use-2-5, `phone-quiz-open.html` dark: tiles the page color read as holes in the field); phone-visual-2-9 and phone-use-2-1 (`phone-live-slide.html`: I'm lost a deep green pill in dark, pale mint in light); staff hierarchy 3 to 3 with staff-visual-2-1, staff-visual-2-2, staff-use-2-6 (`staff-admin-pair.html`: tonal Add and primary Pair swap rank between themes); phone-visual-2-4, phone-craft-2-2 (`phone-quiz-sent--retry.html`: grey ring on green, three edges in 60px).
- Research: `research/round2-2.md` (Apple and Material separate layers by fill step, not stroke; white on the light field is already 6.02:1) supports dropping the ring. Its dark proposal, a card darker than the field (`#181c19`, 1.93:1), is not used: the judges read exactly that fill as a hole (phone-visual-2-1). `research/round2-1.md` (WCAG 1.4.11 Understanding: a control's words can identify it, so a boundary is optional) supports the 4.5:1 words as the identifier; its 1.5px outline tile edge is not used (Sam's thin-stroke reject). The new dark tile is only 1.21:1 against the field, so round 3 must look at the dark render before anyone changes it again.
- Declined: phone-use-2-1's solid green I'm lost (would be a second filled green on the live slide).
- Where: "Tokens: Colors", "Surfaces and elevation", "The kit: Banner", "Contrast", "Where the app differs from GDG".

### R2-05 Changed: unpicked tiles after sending use a solid fill, never opacity
- Rule changed: `.is-out` = `--tile-out` (`#d5e8da` light, `#2a3a2e` dark), words at full opacity (12.79 / 9.85:1), letter on `--well`. Removed: "unpicked tiles dim to 0.55" and the 55% tile opacity in "Where the app differs".
- Evidence: phone craft 2 to 3 with phone-visual-2-6, phone-use-2-6, phone-craft-2-4 (`phone-quiz-sending.html`, `phone-quiz-sent.html`: muddy mint wash, weak text contrast). Three judges, one area; changed because the evidence contradicts the rule.
- Where: "Tokens: Colors", "The kit: Answer choices".

### R2-06 Added: a scrolling list never cuts a row in half
- Evidence: host-visual-2-2 and host-use-2-3 (both major), host-craft-2-5 (`host-questions.html`, `--kept`, `--delete`: the fourth row's answer clipped at the well edge, read as a rendering fault). One area, three judges, two majors.
- Where: "Alignment and space", host-questions row.

### R2-07 Added: a part keeps its geometry across states; laptop grid tracks shrink
- Rule added: `.barrow` takes `.choice`'s radius, padding and gap; the phone slide card keeps padding and title role when a question opens; an inline confirm keeps the row's columns; `minmax(0, …)` tracks, `min-width: 0` and `table-layout: fixed` in a fixed aside.
- Evidence: phone craft 2 to 3 with phone-craft-2-1 major (`phone-quiz-results.html` vs `phone-quiz-open.html`: letter jumps from x 48 to 44, label 108 to 100) and phone-craft-2-8 (Live badge moves 4px); host craft 3 to 3 with host-craft-2-7 (`host-questions--delete.html`: text jumps from x 188 to 112), host-craft-2-8 (focal card 460 / 508 / 452 across states), host-craft-2-1 major (`host-quiz-ended.html` at 1280: aside 17px into the margin).
- Where: "Alignment and space", "The kit: Bars", "The kit: Confirm", phone and host rows.

### R2-08 Changed: row actions are ghost buttons; one `.link` style for text actions
- Rule changed: Keep, Dismiss, Delete, Remove, Unpair share one ghost style with no resting ring (replaces "`.btn--plain` at 32 with a `--line-strong` ring"). Added `.link` for Sign out, Show slide, See all teams, Ask the AI.
- Evidence: staff craft 2 to 3 with staff-visual-2-6 and staff-use-2-2 (`staff-attendance-list.html`: 12 ringed Remove pills are the loudest column); host-use-2-4 (`host-questions.html`: two treatments for equal actions); links: phone-craft-2-6, phone-use-2-9 (`phone-pass.html`: Sign out with no target), host-visual-2-10, host-use-2-12, staff-use-2-5.
- Where: "The kit: Tabs", "The kit: Text link", "The kit: Rows and table", "Rules for each surface: Staff laptop".

### R2-09 Changed: "yours" is the inverted letter plus "(you)"; the right answer's green always wins
- Rule changed (R1-02): the 3px `--text` ring is for a tile being chosen now; after results a right row that is yours keeps the `st-in` ring and inverts only the letter; a wrong pick gets a 2px `--line-strong` ring; a team row that is yours gets no ring.
- Evidence: phone-visual-2-5, phone-craft-2-5 (`phone-quiz-results.html`: ink ring erases the green on a right pick); phone-visual-2-7 (`phone-quiz-results--wrong.html` dark: white ring on the wrong pick is the brightest edge); phone-use-2-7, phone-use-2-8 (`phone-live-slide.html`: the black team-row outline reads as a focus ring or the winner). Phone craft 2 to 3, coherence 4 to 3.5.
- Declined: phone-use-2-8's green fill for the own team row (green would repeat beside the Live badge).
- Where: "The kit: Bars" ("Yours" has one marker), phone rows.

### R2-10 Changed: table heads raised; a type label is text, not a chip; every label radius 4
- Evidence: host-visual-2-6 (`host-questions.html`, `host-quiz-ended.html`: `--bar` head darker than rows reads as a gap; RUBRIC asks a raised head); staff-visual-2-8 (`staff-signin-ending.html`: Ended and a ringed Quiz chip), phone-craft-2-9 (`phone-quiz-results.html`: Ended beside a grey Results label), phone-craft-2-10 (team pill 8 vs badge 4); host-visual-2-3 (`host-questions--delete.html`: confirm fills the row red).
- Where: "The kit: Badge", "The kit: Rows and table", "The kit: Confirm".

### R2-11 Changed: kiosk panel 440 in a stacked form, long word 72, staff control behind a hold; projector notes at 40
- Rule changed from builder measurements: `--k-panel` 320 to 440; `.k-status--stack`; `.k-status__word--long` 80 to 72 nowrap ("Already checked in" measured 9.12em in Google Sans 700, 656px at 72, wraps at 80); Stop camera moves into a staff sheet behind a 56px press-and-hold corner control; the camera well spans the column. Projector `.presenter-note` moves from 32 top left to 40 in the bottom-left lane (40 is the sentence floor; top left ran into the slide title).
- Evidence: kiosk hierarchy 3 to 3, fit 3 to 3 (`kiosk-scan.html`: right third empty, viewfinder inset 121 to 699); kiosk builder kit requests and not_fixed kiosk-use-1-1; projector states 3 to 3 (setup and error as loud as room content), projector builder kit request.
- Where: "Kiosk sizes", "Layout per area: kiosk", "Layout per area: projector", "Rules for each surface".

### R2-12 Sharpened: a standalone card is the focal rung; dark focal needs a stronger shadow
- Evidence: staff-visual-2-3 and staff-use-2-4 (`staff-gate.html` light: white card with only an `inset 1px --line` edge, 1.44:1); host-visual-2-7 (all host comps dark: focal and side cards both `#222823`, shadow invisible).
- Where: "Surfaces and elevation" rules, staff-gate row.

### Also recorded this round
- Declined staff-use-2-4's filled green Continue with Google: Google's sign-in branding allows its dark or white themes only (phone builder note).
- Host owes `host-points` comps and renders of the open states; noted under the host layout.
- "Not done yet" now lists the round 2 token and kit changes and the kit parts kit.css still lacks, checked against the files on 2026-10-31. The render runner stopping early is outside the doc keeper's files.

## Round 3 (2026-10-31)

Scores, round 2 to round 3 (hierarchy, depth, brand, legibility, fit, states, craft; bespoke is new, so it has no before): phone 4/3/4/4/3/4/3 to 3/4/3/4/4/4/3, bespoke 2; host 4/4/3/3/4/4/3 to 3/4/3/4/4/4/3, bespoke 2; staff 3/4/4/4/4/4/3 to 3/3/4/4/4/4/3, bespoke 2; projector 3/4/4/4/4/3/3 to 4/3/3/3/4/4/3, bespoke 2; kiosk 3/4/4/4/3/4/3 to 4/4/4/3/3/3/3, bespoke 2; taste 3.5 to 3, coherence 3.5 to 3.5. Bespoke at 2 everywhere is the main finding, and much of it traces to rules this file prescribed (strips, stat-tile strip and summary, seal empty states, Live badge, tiles in wells in cards). Craft holds at 3 in every area. The judges' issue list covers phone and host only; staff, projector and kiosk evidence comes from the score evidence lines. `rounds/2/snapshot/` was never written, so changes below were checked against the round 3 snapshot and the builders' reports, not a file diff.

### R3-01 Removed: every left-edge strip (banners, inset card, selected row, confirm row, new row, answers, field error, presenter note, late strip)
- Rule removed: "a straight accent mark on a rounded part is a clipped `::before` strip" and each part's 3 to 6px strip. Now: a state is its fill step, glyph and words; a selected row lifts one rung; the phone retry state has no banner (the tile's ring and the footer line carry it).
- Evidence: phone bespoke 2 with phone-bespoke-3-2, phone-visual-3-10, phone-use-3-5, phone-use-3-6 (`phone-pass--sign-in-failed.html`, `phone-quiz-sent--retry.html`); host bespoke 2 with host-bespoke-3-4, host-visual-3-4 (major), host-use-3-6, host-craft-3-4, host-craft-3-5 (`host-points.html`, `host-questions.html`: stripes three ways on one screen, floating short of the row ends). RUBRIC dimension 8 lists the pattern.
- Where: "Space, size and shape", "Color rules", "The kit": Banner, Confirm, Rows and table, Late banner; host and projector rows.

### R3-02 Changed: no stat-tile openers; the host strip becomes the slide track, the staff summary a count line, quiz-ended a hero slot
- Rule changed: replaces the room strip (`168px 168px minmax(0,1fr) 360px` tiles), the staff summary well and the host quiz-ended three-tile summary. One lead number per card in a hero slot that holds its size and place across states; other counts in one line; counts never repeat.
- Evidence: host bespoke 2 (host-bespoke-3-1 major: the strip repeats "Lost on this slide 3" as "Slide 4: 3"); host hierarchy 4 to 3 (host-visual-3-3: Lost on this slide same size as Checked in; host-visual-3-2 and host-bespoke-3-6: second tile row in `host-quiz-ended.html`); host craft 3 to 3 (host-craft-3-1: Answered is an 80px hero in open and a 32 tile in ended); staff bespoke 2 and staff hierarchy 3 to 3 (`staff-admin-pair.html`: four equal tiles tie for largest; `staff-attendance-list.html` stat-tile opener); staff craft 3 (summary numbers in four sizes and colors).
- Where: "Tokens: Type" (No stat-tile openers), "The kit: Readout", "Not the default look", host and staff layout.

### R3-03 Changed: empty and error states draw the real part empty; seal discs only on the kiosk
- Rule changed: the `.state` "glyph disc, sentence, action" pattern and the phone medal. Empty Ask the room is the composer with empty letter slots, empty teams the color squares with 0, signed-out phone the empty pass; checked-in the pass stub with a 24 glyph; side panels one `.state--inline` line in every waiting state; skeletons keep the real frame and the loading line sits in the caption slot.
- Evidence: phone bespoke 2 with phone-bespoke-3-1 (major, `phone-pass--signed-out.html`), phone-bespoke-3-6 (major, `phone-checked-in.html`: stock success screen), phone-use-3-6, phone-craft-3-2, phone-bespoke-3-11 (`phone-live-slide--loading.html`); host bespoke 2 with host-bespoke-3-3 (major), host-visual-3-6, host-use-3-8 (`host-now-start.html`: inbox glyph reused for three empties), host-craft-3-2 (three forms of one waiting panel), host-use-3-2, host-craft-3-8 (dark skeletons invisible, strip shifts on load).
- Where: "The kit": Empty, error and loading; Skeleton; Medal and seals; "States"; phone and host rows.

### R3-04 Changed: chips only for a state that differs between items; no Live badge; Open/Ended a word; answer tags and ranks plain
- Rule changed: R1-07's "Live / Open badge solid green with a still dot" is retired; the `--live` token stays as an alias. Type facts go in one muted meta line; "Right answer" and "Your answer" are words; place and rank are bare numerals, never a pill or the 44 letter tile.
- Evidence: phone bespoke 2 with phone-bespoke-3-3 (major: Live on every phone screen), phone-bespoke-3-4 (major: Ended, Right answer (you), (you) chips), phone-use-3-2 (major: Ended next to Live), phone-bespoke-3-8; host brand 3 to 3 and bespoke 2 with host-bespoke-3-2, host-visual-3-5, host-use-3-7 (four pills by Ask the room), host-bespoke-3-8, host-visual-3-9, host-use-3-12 (place pills); projector brand 4 to 3 (`projector-stage-quiz-open.html`: dotted Open badge on the green panel).
- Where: "The kit: Badge", Bars, host, staff and projector rows, "Where the app differs from GDG", "Not done yet" (iOS question reworded).

### R3-05 Added: one full-strength green mass per screen; words on the field use `--on-field`
- Rule added: the field, a filled green button or the green numeral, never two side by side. With the field on screen the action is `.btn--raised`; on host quiz-ended both actions are outline. Changes R2-03's "Draft with AI is the one filled button after a quiz ends".
- Evidence: phone brand 4 to 3 (phone-visual-3-3 major: green field plus filled green CTA tie in `phone-checked-in.html`; phone-visual-3-7: pale green label); host brand 3 to 3 (host-visual-3-1 major: filled Draft with AI and the green 62% tie; host brand evidence "green on six things at once"); projector brand 4 to 3 (green-flooded panel plus badge).
- Research: `research/round3-1.md` findings 1 and 4 (a Wallet pass has no filled action on its colored face; two equally strong greens read as a fight). Its proposal to make the state surface `--accent-soft` and never fill `--accent` full-bleed on phone is declined: judges named the green quiz field as one of the few app-specific parts (phone bespoke evidence). Its Duolingo-style 3px button edge is declined as decoration nobody asked for.
- Where: "Color rules", phone, host and projector rows.

### R3-06 Changed: phone cards are top-anchored; never centered or floated low
- Rule changed: R2-01's "a one-card phone screen anchors its card low". Now the card sits `--s4` under the bar, actions in the sticky bottom bar, the scroll area padded by the bar's height, and a thin state draws the real part empty; no empty band over 25% of the viewport. Laptop: a column with nothing to show doesn't render (answers the host builder's taste-2-1 question).
- Evidence: phone hierarchy 4 to 3 and fit 3 to 4 with phone-visual-3-2 and phone-craft-3-2 (major: `phone-pass--signed-out.html` centered with about 260px empty above and below), phone-visual-3-3, phone-craft-3-1 (major: `phone-checked-in.html` 145px band), phone-visual-3-4 and phone-use-3-2 (bar cuts the slide card), phone-use-3-4; host fit 4 to 4 with host-craft-3-6, host-visual-3-6, host-bespoke-3-7 (400px empty under start and error cards).
- Research: `research/round3-2.md` findings 1, 5 (Wallet pass at the top with actions under it) and "Apply here" 1, 4, 7; its sheet detents are not adopted (our phone screens have no parent page under them).
- Where: "Alignment and space" (No dead space), phone and host rows, "States" (Signed out), Do and don't.

### R3-07 Changed: dark field tiles tinted from the field
- Rule changed: dark `--field-tile` `#383f39` to `#1a6a35` (1.34:1 over the field, words 5.44:1); new `--field-letter` `#0e4420`; dark `--tile-out` to `#0e4420` (words 9.2:1). Ratios computed this round with the WCAG formula. Picked keeps the tile fill and letter; only the ring and word mark it.
- Evidence: phone depth 3 to 4 but phone-use-3-1 (major: dark open tiles look disabled) and phone-bespoke-3-9 (grey muddy against green, letter inverts between states); projector depth 4 to 3 (`projector-stage-quiz-open.html` dark: neutral grey rows on the field). Answers R2-04's open question ("look at the dark render before changing it again").
- Where: "Tokens: Colors", "Surfaces and elevation", "The kit: Answer choices", "Contrast", "Where the app differs from GDG".

### R3-08 Changed: "yours" is words, not a chip or an inverted letter
- Rule changed (R2-09): "Your answer" on the label line, team row name in 700 with "(you)"; the right row keeps its green ring.
- Evidence: phone-use-3-10 (small grey "(you)" chip missed), phone-bespoke-3-4, phone-bespoke-3-8 (rank tile reads as an answer letter), phone-bespoke-3-9 (letter has no fixed drawing). One area, but the evidence contradicts the rule.
- Where: "The kit: Bars" ("Yours" is words), phone rows.

### R3-09 Added: surfaces by role; at most one nesting level inside a card; only the focal card has a shadow
- Rule added; removed "Card in well in card is fine". Results and host bars become one well list with flat rows; the kiosk has one card.
- Evidence: phone-bespoke-3-5 (`phone-quiz-results.html` rows in a card in the page), phone-visual-3-5 (slide card shadow on in some states); host-bespoke-3-5 (major: choice tile in well in card, three radii); kiosk bespoke 2 (every kiosk comp is three stacked `--r-xl` shadowed cards).
- Where: "Surfaces and elevation", "The kit: Bars", kiosk layout.

### R3-10 Changed: table head on the `--page` tone
- Rule changed (R2-10's `--raised` head): the head is one rung over the well and one under the rows.
- Evidence: staff depth 4 to 3 (`.rows__head` the same white as every row in light). Contrast computed: page on well 1.05 light, 1.07 dark.
- Where: "The kit: Rows and table", "Contrast".

### R3-11 Sharpened: an action keeps one form and one slot across states
- Evidence: host-craft-3-3 (major: Ask the AI pill then link; End and Draft move), host-craft-3-9 (Cancel two treatments); phone-craft-3-10 (retry footer changes container); kiosk craft (`kiosk-start--loading.html` drops the code field).
- Where: "Alignment and space".

### R3-12 Sharpened: one icon construction, one meaning per glyph
- Evidence: phone-bespoke-3-7 (three locks, three weights, three meanings); host-use-3-9 (thin Keep and Dismiss glyphs).
- Where: "Base elements" (Icons).

### R3-13 Changed: kiosk and stage sizes back on their tokens
- Rule changed: kiosk word 96 (long 72), name 56, reason 48; the builder's 72 / 64 / 36 stack is declined. Projector check-in count during a poll at `--p-rank` 160 (was `--p-head` 92).
- Evidence: kiosk legibility 4 to 3 (`kiosk-checked-in.html`, `kiosk-refused.html`: word about 70, name or reason about 40); projector legibility 4 to 3 (`projector-stage-quiz-open.html`: check-in count about 96, under the 160 floor for anything read alone).
- Where: kiosk and projector layout.

### Also recorded this round
- Phone rows rewritten with the judges' exact fixes: the collapsed 56 slide row (rendered uncollapsed in four comps, phone-visual-3-1 major), the 40px pass code (phone-use-3-3 major), the leaderboard row and edge alignment (phone-craft-3-3, 3-4, phone-use-3-8), the one-line not-checked-in bar, neutral Back / Next with I'm lost the only accent (phone-visual-3-6).
- Host rows: offline bar (host-use-3-3), Download disabled with its reason (host-use-3-4, host-visual-3-8, host-craft-3-7), draft form Right answer column (host-use-3-10), wrong-bar fills (host-use-3-5), upvotes on the title baseline (host-craft-3-10).
- Staff: recorded the Google button exception and the gate loading rule the staff builder asked for (no disabled button, card hangs from a fixed top).
- Added "Not the default look" with each area's signature part and a ban list to check comps against.
- "Not done yet" now lists round 3's token and kit changes and the kit parts still missing, checked against kit.css and tokens.css on 2026-10-31.

## Round 4 (2026-10-31)

Scores, round 3 to round 4 (hierarchy, depth, brand, legibility, fit, states, craft, bespoke): phone 3/4/3/4/4/4/3/2 to 4/3/4/4/4/4/3/3; host 3/4/3/4/4/4/3/2 to 4/3/3/4/4/3/3/3; staff 3/3/4/4/4/4/3/2 to 3/3/4/4/3/4/3/3; projector 4/3/3/3/4/4/3/2 to 4/3/4/4/4/3/3/3; kiosk 4/4/4/3/3/3/3/2 to 3/3/4/4/4/4/3/3; taste 3 to 3.5, coherence 3.5 to 4. Bespoke rose 2 to 3 in every area (the round 3 bans and SIGNATURE.md worked). Depth fell on phone, host and kiosk and sits at 3 everywhere; craft holds at 3 everywhere; host and projector states fell to 3. The issue list covers phone, host and one staff issue; projector, kiosk and the rest of staff come from the score evidence lines. Builders followed `system/SIGNATURE.md` ("before round 4"), so several changes below overrule a SIGNATURE part; DESIGN-SYSTEM.md now says it wins where they differ.

### R4-01 Changed: light rungs: page `#eef2ee`, well `#e4e9e5` (neutral), bar `#d9e0da`
- Rule changed: the light page darkens so a white card is a 1.13 step (was 1.05); the well moves under the page and loses its mint tint; the bar steps 1.19 under the page; a non-focal raised card keeps an 8% ink ring in light. Ratios computed this round with the WCAG formula (muted on well 5.68, accent on well 4.90, line-strong on well 3.68, muted on bar 5.19).
- Evidence: phone depth 4 to 3 (phone-visual-4-4 major: `phone-live-slide.html` slide card, leaderboard and page merge at 1.05); host depth 4 to 3 (host-visual-4-9: side cards look like the page); staff depth 3 to 3 ("flat white cards"); the mint well read as green spent on a background (host-visual-4-4, `host-questions.html`) and as a "pale-green square" (phone-visual-4-3, `phone-pass--signed-out.html`).
- Research: `research/round4-1.md` (iOS grouped step 1.12; 1.12 to 1.16 needed at 30 to 40cm; a step beats a 6% ring; 8% ring as finish). Its `--page-sunk` per-screen token is not used (one page color for all screens keeps coherence); the glare check on a real iPhone is `[TBD]`.
- Where: "Tokens: Colors" (table and Light rung steps), "Surfaces and elevation", "Contrast", "iOS", "Not done yet".

### R4-02 Added: one raised object per screen; the focal object never sits on a lower rung than its neighbour
- Rule added: phone lists are ruled rows flat on the page; host and staff side panels are `--well` with no shadow; the focal object is the field or `--raised`.
- Evidence: phone bespoke 2 to 3 but phone-bespoke-4-1 major (every phone screen a stack of equal `--r-xl` cards), phone-use-4-2 (leaderboard card competes with the open quiz), phone-use-4-10; host-bespoke-4-2 major and host-visual-4-9 (every host block the same raised card); projector depth 3 to 3 (`projector-stage-quiz-ended.html`: result panel on `--bar` reads sunken beside the check-in card).
- Where: "Surfaces and elevation", phone and host layout, projector quiz-ended row, ban list.

### R4-03 Changed: laptop tables in a well with a raised head; the selected row is a fill step
- Rule changed: replaces R3-10's `--page` head and the lifted, shadowed, overhanging selected row (also SIGNATURE 13). Rows sit flat on the well; head `--raised`; selected `--raised` inside the columns.
- Evidence: host-visual-4-1 major (`host-points.html`: table straight on the card, the RUBRIC's sunken-well rule missing), host-use-4-11 (`host-quiz-ended.html`), host-visual-4-2 major and host-bespoke-4-7 (selected row pokes 8px past the rules, grey slab in dark), host-craft-4-9 (Right column off its header edge).
- Where: "The kit: Rows and table", host and staff rows, "Contrast".

### R4-04 Changed: row actions show on every row
- Rule changed: replaces "row actions only on the selected row" (graft:craft/3). Ghost buttons, no ring at rest, one fixed right column; Undo a 32 `.btn--plain`; Delete stays a red-worded ghost that opens the confirm.
- Evidence: host-use-4-7 major (`host-points.html`: five of six rows have no way to change points), host-use-4-10 (`host-questions.html`: other rows look read-only). Host only, two issues, but the evidence contradicts the rule, and staff already shows Remove on every row. Declined: host-craft-4-10's red outlined Delete (host-use-4-10 asks the opposite; the ghost is the kit's one row-action style).
- Where: "The kit: Rows and table", host-points and host-questions rows, "Rules for each surface".

### R4-05 Changed: poll bars: count and percent on one line, 2px ends, non-right fills `--muted`, stage ring 6
- Rule changed: replaces "numeral right with the percent under it" and "fills `--line-strong` while open".
- Evidence: phone-use-4-5 and phone-bespoke-4-8 (`phone-quiz-results.html`, `--wrong`: pale bars, stacked count and percent, pill caps, "any survey widget"); host-use-4-4 and host-bespoke-4-5 (`host-quiz-open.html`: percent 100px from the bar, generic grey progress bars); projector craft 3 (`projector-stage-quiz-ended.html`: right row gets the kit's thin 3px ring). Declined: host-use-4-4's green leader while open.
- Where: "The kit: Bars".

### R4-06 Changed: slide track counts at one size on one baseline; zeros shown for past slides
- Rule changed: replaces the current count at `--n-md` (also SIGNATURE 1) and unprinted zeros; the track gets its own `--raised` band.
- Evidence: host-visual-4-3 major (lost counts float with no band), host-use-4-6 major (the big 3 reads as a slide number), host-craft-4-4 (two sizes, no shared baseline), host-bespoke-4-4 major (zero looks like not reached). Host hierarchy 3 to 4 with the track, craft 3 to 3. Declined: host-use-4-6's "3 lost" label on the current count (it brings back a second size).
- Where: "Layout per area: host" (Slide track).

### R4-07 Changed: empty, loading and error look different; no dashed slots; empty tables keep the table
- Rule changed: the empty composer is drawn as its bar rows (no dashed `.slot`, the host builder's kit request declined); loading uses en dashes in the same rows; error replaces the rows with one `st-stop` filled well. Empty teams are the table with dashes, not a tile grid.
- Evidence: host states 4 to 3 with host-use-4-1 major (`host-now-start--error.html` reads as "no question yet"), host-use-4-2 (`--loading` same as empty); dashed slots 490px short of the rules in host-visual-4-7, host-craft-4-3 major, host-bespoke-4-1 major (wireframe skeleton); host-bespoke-4-8 and host-use-4-8 (`host-points--empty.html` tile grid). Projector states 4 to 3 (quiz open and ended have no loading, error or zero-answer comps), so those are now owed.
- Where: "The kit: Empty, error and loading", "States", host rows, projector quiz-ended row.

### R4-08 Changed: host Now keeps the main + aside split in every state
- Rule changed: reverses R3-06's laptop clause ("a column with nothing to show doesn't render") for screens that switch state in front of the professor. The empty aside is the same `--well` panel with one line.
- Evidence: host-craft-4-11 (card 920 then 1344, bars jump 420px), host-craft-4-1 major (open aside bare text, ended aside a card 16px over), host-use-4-3 major (open aside is dead space). The host builder already kept it in the open state for this reason (not_fixed host-bespoke-3-7).
- Where: "Alignment and space" (Laptop empty states), host layout.

### R4-09 Changed: the phone's main action is a full-width filled button in the action bar; footers join the bar
- Rule changed: Check in leaves the banner for the bar; Follow the slides is filled `--accent` (an exception to R3-05's one green mass, because the field and the bar are apart); I'm lost filled on the live slide (was `--accent-soft`, declined in R2-04 while a Live badge existed); the I'm lost line moves into the bar; loading keeps the three-slot bar; bar padding 16 on all sides plus safe area.
- Evidence: phone-visual-4-1 major (`phone-live-slide--not-checked-in.html`: Check in pill out of thumb reach); phone-visual-4-2 major, phone-use-4-6, phone-craft-4-2 major, phone-bespoke-4-10 (`phone-checked-in.html`: about 300px empty, Follow the slides the weakest control); phone-use-4-3 (I'm lost looks disabled); phone-use-4-7, phone-bespoke-4-9 (floating info line); phone-visual-4-8, phone-craft-4-9 (loading bar jumps); phone-craft-4-8 (12 bottom vs 16 sides). Phone fit 4 to 4, hierarchy 3 to 4.
- Where: "Color rules", "Alignment and space", "Layout per area: phone".

### R4-10 Changed: the QR always sits on a white plate; the empty pass slot is 160 with finder squares; no chip over a loading QR
- Rule changed: replaces SIGNATURE 2's "no inner well" and the signed-out 280 well square.
- Evidence: four judges on the empty square: phone-visual-4-3, phone-use-4-1, phone-craft-4-3, phone-bespoke-4-4 (all major, `phone-pass--signed-out.html`, `--sign-in-failed`); three on the plate: phone-visual-4-7, phone-use-4-10, phone-bespoke-4-6 (`phone-pass.html`: plate in dark only); phone-bespoke-4-5 (`phone-pass--new-code.html`: floating chip). Declined: phone-bespoke-4-6's ticket notches (SIGNATURE 2 "don't add notches"; no other judge asked).
- Research: `research/round4-2.md` (ISO/IEC 18004 4-module quiet zone of module-white; jsQR with `dontInvert` reads dark-on-light only, so never invert; plate radius under the margin; `marginSize` 2 to 4 in phase 2; dimmed-phone scanning `[TBD]` on device).
- Where: "The kit: QR frame", phone rows, "States" (Signed out).

### R4-11 Added: one team swatch size
- Evidence: phone-craft-4-4 (`phone-live-slide.html`, `phone-checked-in.html`, `phone-quiz-open.html`: 12, 16 and 18 with three radii and a white ring), host-craft-4-2 major (`host-points.html`, `host-quiz-ended.html`, `host-points--empty.html`: 12, 16 and 24). Two areas.
- Where: "Alignment and space" (One part, one size), phone-checked-in row.

### R4-12 Changed: phone leaderboard rows are one 56 line with a 28 rank column; it collapses while a question is open
- Rule changed: replaces the 32 rank column and "+5" over "credit".
- Evidence: phone-visual-4-6 (rank 40px from its team), phone-use-4-9 (credit repeated, 36px gap), phone-bespoke-4-7 (stock list, stat-tile credit), phone-use-4-2 major (leaderboard competes with the open quiz).
- Where: "Layout per area: phone".

### R4-13 Changed: host draft "No right answer" is a fifth radio row; no switches on host
- Evidence: host-bespoke-4-3 major (stock iOS switch apart from the radios), host-use-4-5 (header floats between toggle and radios), host-craft-4-8 (three controls on two vertical lines). Three judges, one area.
- Where: host-quiz-draft and host-questions rows.

### R4-14 Changed: green off secondary actions and nav; neutral answer blocks shown once; GSI outline in light
- Rule changed: Attendance link `--muted`; End day and Download both outline (replaces round 3's `--well`-filled disabled Download); shared answers one line in the list, full once in the aside on neutral `--well`; the staff banner's Google button uses GSI `outline` in light.
- Evidence: host brand 3 to 3 with host-visual-4-5 (green Attendance link), host-visual-4-6, host-use-4-7, host-craft-4-6 (tinted Download reads as disabled; three judges), host-visual-4-4 major and host-bespoke-4-9 (green answer blocks twice); staff-visual-4-1 major (`staff-signin-ending.html`: black filled GSI pill outranks the 61%).
- Where: "Color rules", host and staff rows.

### R4-15 Changed: scrim .48 light, .64 dark; confirm sheet centered
- Evidence: host-visual-4-8 and host-use-4-9 major (`host-questions--delete.html`: scrim barely dims, dialog off center over the row in dark).
- Where: "Tokens: Colors", "The kit: Confirm".

### R4-16 Added: "Check the work": fonts loaded, one fixture value per fact, band and state checks
- Evidence: phone-craft-4-1 major (`phone-pass.html`: Google Sans Code never loaded; the code drew in Menlo); host-use-4-12 (Questions count 6 on Now, 8 on Questions).
- Where: "Check the work" (new section), "Tokens: Type" (Codes).

### R4-17 Changed: no ring spinner on a sending tile; reduced motion shows the clock glyph
- Rule changed: replaces the busy row's "a still dotted ring" and the tile spinner.
- Evidence: phone-bespoke-4-3 major (`phone-quiz-sending.html`: stock border spinner; reduced-motion dotted circle looks broken in dark). One judge, but the evidence contradicts the Motion table directly.
- Where: "Motion".

### R4-18 Added: units on display numerals at 0.55em; display tracking -0.02em
- Evidence: host-bespoke-4-6 (`host-quiz-ended.html`: "%" reads as a third digit). One judge; matches SIGNATURE 5's raised ordinal and SIGNATURE 10's tracking, so it writes down what other parts already do.
- Where: "Tokens: Type".

### R4-19 Changed: staff gate centered with no tabs; kiosk start prompt 48; kiosk refused on `--error`; stage quiz states owed
- Evidence: staff fit 4 to 3 (`staff-gate.html`: card top left with about 870px empty beside it, tabs shown with no user; reverses SIGNATURE 17's left edge and disabled tabs); kiosk hierarchy 4 to 3 (`kiosk-start.html`: the 72 prompt competes with Start); kiosk brand evidence (`kiosk-refused.html`: raw red outside the tokens; the builder's `--st-stop-fill` request is answered with the existing `--error` pair); projector states 4 to 3.
- Where: staff-gate, kiosk-start, kiosk-refused and projector quiz-ended rows.

### Also recorded this round
- Stale examples fixed in "Do and don't" (the sunken strip, "yours" as a ring and inverted letter, the `#383f39` dark tile, the right-answer chip all contradicted current rules) and four round 4 rows added. "Rules for each surface: Staff" no longer says "summary well".
- Builder requests decided: host `.slot` dashed slot declined (R4-07); host `.btn--danger-outline` declined (R4-04); staff ink right-answer `.rbars` variant declined (one green per object keeps the green bar, and staff brand held at 4); kiosk `--st-stop-fill` answered by `--error` (R4-19); kiosk "prompt alone is 72" kept for `kiosk-scan` only. The kit's generic `.qr` class name clash goes to "Not done yet".
- Not changed: kiosk already on `--st-in` (builder change for kiosk-use-3-4) was not flagged by round 4 judges; the doc row still says `st-wait` and the kit owner should pick one after comparing the renders.

## Round 5 (2026-10-31)

Scores, round 4 to round 5 (hierarchy, depth, brand, legibility, fit, states, craft, bespoke): phone 4/3/4/4/4/4/3/3 to 3/4/3/4/3/4/3/3.5; host 4/3/3/4/4/3/3/3 to 4/3/4/4/4/4/3/3; staff 3/3/4/4/3/4/3/3 to 3/3/4/4/4/3/3/3; projector 4/3/4/4/4/3/3/3 to 4/3/4/3/4/4/4/3.5; kiosk 3/3/4/4/4/4/3/3 to 3/3/4/4/3/4/3/3; taste 3.5 to 4, coherence 4 to 4. Gains: phone depth, host brand and states, staff fit, projector states, craft and bespoke, taste. Losses: phone hierarchy, brand and fit; staff states; projector legibility; kiosk fit. Most round 5 issues were dead space and parts that still look like a stock library; several came from builders following SIGNATURE.md or their own kit requests over this file. Research this round: `research/round5-1.md` (Google's button), `research/round5-2.md` (picked tile: ring or fill).

### R5-01 Sharpened: dead space names its CSS causes; phone footer rows follow the object
- Rule changed: the phone single-object clause (R4-09) no longer moves footer rows into the action bar: the object is top-anchored and its footer follows it, gap `--s6`. Added a list of the CSS that makes dead space and a "Check the work" grep for it.
- Evidence: phone fit 4 to 3 and hierarchy 4 to 3: `phone-pass--signed-out.html` and `--sign-in-failed` pushed to the bottom by `.phone__body--mid > .pass { margin-top: auto }` with about 900px empty above (phone-visual-5-1, phone-use-5-1, phone-craft-5-4, phone-bespoke-5-2, all major); `phone-checked-in.html` centered with 270 to 300px above and below (phone-visual-5-2, phone-use-5-2 major, phone-craft-5-5). Host (fit 4 to 4, but four judges): the focal card stretched to the window with `.ask__foot { margin-top: auto }`, 150 to 460px of empty card in `host-now-start.html`, `--error`, `host-quiz-open.html`, `host-points.html` (host-visual-5-1, host-use-5-2, host-craft-5-4, host-bespoke-5-1). Kiosk fit 4 to 3 (`kiosk-checked-in.html`: result band fills 320 of 1180 over an empty viewfinder). Staff admin evidence: Changes cut off under three equal cards. Three areas.
- Where: "Alignment and space" (No dead space), phone-checked-in row, "Check the work".

### R5-02 Changed: the signed-out pass slot is the real plate's square with solid finder patterns
- Rule changed: replaces R4-10's 160 slot with hollow outlined finder squares. Slot = the QR plate box at its real size and position; finders are solid real geometry; the card is top-anchored.
- Evidence: phone-bespoke-5-1 major (`parts/ghost-qr.html`: outlined rounded rects read as three unchecked checkboxes, and the 160 slot put the finders in no QR layout), phone-craft-5-4 major (thin outlines at the wrong positions; the slot is half the real well, so the card changes shape when the pass arrives), phone-visual-5-1 major (reads as a broken QR), phone-use-5-1 major. Four judges. Declined: phone-use-5-1's lock glyph (lock means "answers can't change" only, R3-12) and phone-visual-5-1's empty plate with no squares (two judges asked real finder geometry).
- Where: phone round rules, `phone-pass` row, "States" (Signed out), Do and don't.

### R5-03 Changed: the QR plate's edge is a `--well` inset, never a ring
- Rule changed: removes R4-10's `inset 0 0 0 1px rgb(ink / .08)` ring in light. The white plate sits in a `--well` inset in both themes, so the pass keeps one shape and the edge is a fill step.
- Evidence: four judges on `phone-pass.html` and `phone-pass--new-code.html` (light): phone-visual-5-9, phone-use-5-6, phone-craft-5-6, phone-bespoke-5-8 ("a pale thin stroke that does nothing"). Declined: phone-bespoke-5-8's ticket notches (SIGNATURE 2, declined in R4 too) and phone-visual-5-9's tinted pass card (it would change the screen's one raised rung).
- Where: "The kit: QR frame".

### R5-04 Changed: no pill segmented control; a switch is text options with an underline
- Rule changed: `.seg` was raised pill + ring + check glyph. Now text options on the card-head line, the chosen one `--text` 700 over a 2px `--text` underline, no track, fill or check; `.rolepick` ruled radio rows where each option needs a sentence (the staff builder's round 5 part, accepted).
- Evidence: phone-bespoke-5-3 major (`phone-quiz-open.html` and every quiz state: "the Material 3 segmented button drawn as-is", near the Material bright line), host-bespoke-5-4 (`host-points.html`, `host-questions.html`, `host-quiz-draft.html`: the most library-looking part on host), phone-craft-5-7 (doubled concentric strokes). Two areas. Green stays off it (one green job; the judges split on `--accent` vs `--text` underline, and Color rules decide).
- Where: "The kit: Segmented", ban list, Do and don't.

### R5-05 Changed: errors take the failed content's slot; one `.notice` part where there is no slot; no panel on the field
- Rule changed: replaces R4-07's "error is one `st-stop` filled well". A region's error puts the red glyph and the sentence (in `--text`) where the content was and Try again in the action slot. New `.notice` (one fill, no border, `--r-md`, 24 glyph column, `text-wrap: pretty`) only where the message has no slot (phone sign-in failed). The builder's `.qfield__foot--err` panel is declined; the failed tile's ring is inset 2px so red never meets green.
- Evidence: host-visual-5-10 (`host-now-start--error.html`: pink banner with red heading and green Try again, the loudest object), host-bespoke-5-5 (the stock alert banner); phone-craft-5-2 major (three error treatments, "again." orphaned), phone-visual-5-6, phone-use-5-3, phone-bespoke-5-4 major (`phone-quiz-sent--retry.html`: the error said twice, a pink panel inside the green field, red ring touching green). Two areas, six issues.
- Where: "The kit: Notice" (new), "Empty, error and loading", "Answer choices", "States", host-now-start row.

### R5-06 Changed: loading is still solid blocks; the empty composer has no rows; no ghost rows
- Rule changed: replaces SIGNATURE 14's "en dash for numbers, no grey bars" and R4-07's empty composer drawn as bar rows. Loading: still `--well` blocks at cap height, the loading card at the loaded `min-height`. Empty composer: heading, one sentence, two actions. An empty table: heading plus one inline line, never blank ruled rows. Drafting: letter tiles plus a 2px progress rule.
- Evidence: builders declined still bars in round 4 and 5 because SIGNATURE 14 banned them (phone not_fixed phone-craft-4-2 and 4-9; projector not_fixed projector-use-4-4), and judges asked again: phone-use-5-7 (`phone-live-slide--loading.html`: bare text on a blank card), phone-craft-5-9 (card height jumps on load, rank weight changes), host-use-5-5 (dashes read as data), host-bespoke-5-3 major (empty, loading and drafting all four dashed boxes). Empty composer: host-use-5-11, host-bespoke-5-3. Ghost rows: host-visual-5-2, host-use-5-1, host-craft-5-1, host-bespoke-5-2 (all major; seven blank rows under "Who got it wrong" in four states, though R4 already said "shrinks the well to its one message row"). Host states rose 3 to 4 and phone states held 4; the ghost rows and the dash placeholders are what judges still named.
- Where: "The kit: Empty, error and loading", "The kit: Skeleton", "States", host-now-start row, Files table note on SIGNATURE 14.

### R5-07 Changed: one green after results; checked-in's main action is a raised button on a `--bar` action bar; I'm lost keeps one shape
- Rule changed: removes R4-09's phone exception (filled Follow the slides beside the field). Follow the slides is `.btn--raised` with `--shadow-1` on an action bar that moves from `--raised` to `--bar`, so the button stands one rung up (round 4's raised button vanished on a raised bar). Results: the result head neutral with a green glyph only; the is-mine team row has no fill (the builder's `--accent-soft` row and `.result__band` green fills declined). I'm lost: one shape and slot in every state, filled green on the live slide, a `--raised` fill where the field or right answer holds the green.
- Evidence: phone brand 4 to 3. phone-visual-5-2 major and phone-bespoke-5-10 (`phone-checked-in.html`: two green slabs tie; in dark a deep green stub beside a pale mint button; the CSS comment and the render disagree); phone-visual-5-3 major (`phone-quiz-results.html`: green on six things); phone-visual-5-8 and phone-use-5-4 major (I'm lost tonal on live, outline on loading; dark tonal reads disabled). Host evidence that the rule is right but unapplied: Attendance still green on every host comp (host-visual-5-8, host-use-5-12; R4-14 already said `--muted`). The `--bar` action bar is a reasoned fix for round 4's phone-use-4-6, not a judge's ask: check it in the round 6 shots.
- Where: "Color rules", phone layout (shell, I'm lost), phone-checked-in row.

### R5-08 Changed: the host slide track band is on the bar's rung
- Rule changed: round 4's "own full-width `--raised` band" is now the `--bar` rung shared with the app bar.
- Evidence: host-visual-5-3 major (`host-now-start.html` and all host comps: the band's white tied with the focal card for the raised rung and made the bar read sunken). Host depth held at 3. One judge, but it contradicts a round 4 rule directly.
- Where: host layout (Slide track).

### R5-09 Sharpened: one letter tile drawing; picked is ring plus word at body size; no border on field tiles
- Rule changed: `.letter` is 44, `--r-xs`, `--well`, one x in quiz and results; the state word moves from `--t-small` to `--t-body`; tiles on the field lose their border; the failed ring is inset.
- Evidence: phone-craft-5-3 major and phone-bespoke-5-7 (`phone-quiz-open.html` vs `phone-quiz-results.html`: two radii, letter column jumps 32px); phone-visual-5-7 and 5-4 (stray 1px hairline on field tiles, light and dark); phone-use-5-8 (Sent word at 16 easy to miss). Research `research/round5-2.md` answered phone-visual-5-5 and phone-use-5-8's fill proposals: no study compares; WCAG 1.4.11 asks 3:1 for selected state; dark fill steps are 1.15 to 1.16:1, the ring 5.44:1; small words suffer most in dark at night. So the ring stays, the word grows, and both fill proposals are declined. Real-device dim-room check `[TBD]` for Sam.
- Where: "Alignment and space" (One part, one size), "The kit: Answer choices".

### R5-10 Sharpened: one body-row fill; phone folded rows are ruled rows on the page
- Rule changed: no zebra or odd-filled row in a table; the phone leaderboard fold and collapsed slide row are ruled rows, not `--well` blocks (builder `.fold` request declined).
- Evidence: host-visual-5-4 major and host-craft-5-2 major (`host-points.html`: Orange row white among grey rows); phone-bespoke-5-9 (`phone-quiz-open.html`, `-sent`, `-results`: three same-radius blocks read as accordion widgets), phone-craft-5-1 major (`Show slide` ends 62px short of the card edge inside the nested details). Two areas. Declined: host-bespoke-5-8's rows straight on the card (two other judges kept the R4-03 well with a raised head).
- Where: "The kit: Rows and table", phone round rules.

### R5-11 Added: Google's button is the one control we don't style
- Rule added from `research/round5-1.md`: the GSI options we may set (theme `outline` light, `outline_dark` or `filled_black` dark, `pill`, `continue_with`, width up to 400), no change to the button itself, a plain box at the measured iframe height `[TBD]`, no filled green beside it, and the colors comps draw it in.
- Evidence: staff-visual-5-1 major (`staff-signin-ending.html`: a near-black filled Google pill in the banner competes with the green Ask another; "a color the system has no role for"); R4-14 already said outline in light and the builder still drew black. The research answered the judges' question of what we may change: only the surroundings.
- Where: "The kit: Sign-in".

### R5-12 Changed: the staff gate is the locked console; its loading keeps the action slot
- Rule changed: accepts the staff builder's two-column console (door column plus a Staff pages card of locked tabs, no bar) in place of round 4's centered card; loading draws the 48 action slot as a `--well` slot with the clock glyph and line.
- Evidence: staff fit 3 to 4 after the console landed; staff states 4 to 3 with `staff-gate-loading.laptop.dark.png` "a clock icon and one grey line with no container while the full staff-pages card keeps showing".
- Where: staff-gate row.

### R5-13 Added: the phone shell is a flex column with the bars in the flow
- Rule added: the phone builder's kit request (`100svh` flex column, body scrolls between the bars, bars `position: relative`), which fixed the axe failure behind `#slide-why` (phone-use-4-8). phone-use-5-5 still found the bottom bar cutting a leaderboard line and `.slide-row__show` obscured at 320, so the rule says the body scrolls between the bars, never under them.
- Where: phone layout.

### Also recorded this round
- Declined with reasons: host-visual-5-7 (Draft with AI filled after a quiz ends; the 62% is the green mass, R3-05); phone-visual-5-4 (neutral `#2a302c` dark tiles on the field; R3-07 found grey tiles read as disabled, one judge); host-use-5-3 (24 lost counts; R4-06 one size at `--n-sm`, one judge; the builder already noted it); host-bespoke-5-7 (`--r-md` buttons on host only; one judge, and it would split the button shape between areas); phone-bespoke-5-11 (class name in the app bar; one judge, new words belong to the COPY package); phone-visual-5-2's 4px top band on the stub (a top rule on a radius tapers, R1-01).
- Existing rules builders missed (no rule change, named in "Check the work"): Attendance in green (R4-14), ghost rows (R4-03), past-slide zeros (host-bespoke-5-9, R4-06), the dark focal card's `--hl` plus shadow (host-visual-5-9), one outline button style (host-craft-5-8), one raised object on staff admin (staff-visual-5-2, R4-02), kiosk name at one y in every result (kiosk craft: y330 vs y278) and the already word at its token size (kiosk hierarchy: "Already" at 40).
- Projector and kiosk builder kit requests (field rule tokens, `.pnote` top rule, lower third, `.roomn`, `.door__status`, `.k-menu`, `checks` glyph, pairing card) are layout-local and scored well (projector craft 3 to 4, bespoke 3 to 3.5); the kit owner folds them in. SIGNATURE 8 (kiosk pairing) is out of date against the pairing card; this file's kiosk-pair-code row still says "raised card centered", which matches.
- A pattern across rounds: three builders declined judge fixes because SIGNATURE.md forbade them (grey bars) or kept a round 4 form judges then rejected (the 160 slot, the plate ring). "Check the work" now says this file decides those conflicts.

## Round 6 (2026-10-31)

Scores, round 5 to round 6 (hierarchy, depth, brand, legibility, fit, states, craft, bespoke): phone 3/4/3/4/3/4/3/3.5 to 4/3/4/4/3/4/3/3; host 4/3/4/4/4/4/3/3 to 4/3/4/4/4/4/3/3; staff 3/3/4/4/4/3/3/3 to 4/3/3/4/4/4/3/3; projector 4/3/4/3/4/4/4/3.5 to 4/4/4/4/4/3/3/3; kiosk 3/3/4/4/3/4/3/3 to 4/3/3/4/3/4/3/3; taste 4 to 4, coherence 4 to 4. Gains: phone hierarchy and brand, staff hierarchy and states, projector depth and legibility, kiosk hierarchy. Losses: phone depth and bespoke, staff brand, projector states, craft and bespoke, kiosk brand. Depth sits at 3 in four areas and craft at 3 in all five: the round's issues are nested surfaces, bars on the wrong rung, and jitter inside paired values. Research this round: `research/round6-1.md` (dark tiles on the field), `research/round6-2.md` (a link beside a two-line header).

### R6-01 Changed: no well inside a raised card; the well with a raised head is for tables on the page
- Rule changed: R4-03 put every laptop table in a `--well` with a `--raised` head, including inside the focal card. Now a list, table or chart inside a raised card sits on the card (1px `--line` rules, a transparent head over a 2px `--line-strong` rule, a `--bar` selected row with radius 0 and no shadow). A page-level table (staff) keeps the well with the raised head. host.css's lifted selected row is deleted; the host "lifted row in a well" and staff `.lsec` page-plane kit requests are declined.
- Evidence: host depth 3 to 3 and craft 3 to 3. host-visual-6-1 major, host-craft-6-1 major, host-bespoke-6-6 (`host-points.html` light: the white head merges with the white card and leaves well-colored corner slivers); host-bespoke-6-1 major (`host-quiz-open.html`, `host-quiz-ended.html`, `host-points.html`, `host-questions.html`: three nested surfaces, "template dashboard"); host-visual-6-3 major (`host-questions.html`: host.css:140 lifts the selected row into a shadowed card inside the well); host-craft-6-9 (two head treatments). Staff depth 3 to 3: staff-visual-6-1 major (`staff-attendance-list.html`: tables stripped to bare rows on `--page`, the flattest thing on the screen). Phone depth 4 to 3: phone-bespoke-6-1 major (`phone-pass.html`: plate in a well in a card). Three areas.
- Where: "Surfaces and elevation" (No well inside a raised card), "Rows and table", "Bars", staff layout, ban list, Do and don't, "Check the work" (Nesting).

### R6-02 Changed: the QR plate sits straight on the pass; no white plate without a code
- Rule changed: R5-03's `--well` inset around the plate is removed (light: the plate's white is the pass's white; dark: the white plate on `--raised` is a fill step). The signed-out slot keeps the real square but fills it `--well` with `--line-strong` finders. Sign in failed puts the glyph and the sentence in the heading line's slot, with no banner box inside the pass (applies R5-05).
- Evidence: phone depth 4 to 3, bespoke 3.5 to 3. phone-bespoke-6-1 major (nested rounded rectangles); phone-visual-6-1 major, phone-craft-6-7, phone-use-6-4 major (`phone-pass--signed-out.html`, `--sign-in-failed`: the empty white plate is the brightest object and outweighs Continue with Google, a white slab in dark); phone-bespoke-6-3 major (the error as a stock alert box inside the pass, pushing it down 150px). Four judges. Declined: phone-use-6-4's 160 slot (round 5's judges asked for the real size so the card keeps its shape), phone-bespoke-6-1's ring on the plate and the pass (rings removed in R5-03 after four judges), phone-use-6-5's ringed error container.
- Where: "QR frame", phone signed-out bullet, "States" (Signed out).

### R6-03 Changed: sticky bars sit one rung above the page in both themes
- Rule changed: the `.bar` rung was light `--bar` `#d9e0da`, darker than the page (1.19 under it). Now light bars are `--raised` with a new `--shadow-bar` (`0 1px 3px rgb(ink / .12)`), dark bars `--bar` with `--hl`; the phone top bar and action bar share it, and the kiosk bar gets it. The host track band moves off `--bar` onto the page (replaces R5-08).
- Evidence: phone depth 4 to 3: phone-visual-6-2 major (`phone-live-slide.html`, `phone-quiz-open.html`: the top bar reads as a sunken well while the bottom bar is white, the two sticky bars on opposite rungs). Host depth 3 to 3: host-visual-6-2 major (light bar reads sunken; dark bar, band and card one tone). Kiosk depth 3 to 3 (`kiosk.css:24/152` set the bar to `box-shadow: none`, so bar, page and code dock are "tone bands on one plane"). Three areas.
- Where: Colors (`--bar` job), Surfaces table (Bar row), phone shell paragraph, host Slide track.

### R6-04 Changed: the phone action bar is one 56 row
- Rule changed: replaces R4-09's stacked bar (main action as a full-width first row, Back / Next under it, the why-line under them). Now Back and Next are 56 x 56 icon buttons at the ends, the main action `flex: 1` between them, about 90 tall with padding and the safe area; the why-line shows only after a tap on disabled Next.
- Evidence: phone fit 3 to 3. phone-use-6-2 major (`phone-quiz-results--wrong.html`: the bar is about 210 tall, 25% of the viewport, and clips the leaderboard mid-row), phone-use-6-10 major (`phone-live-slide--not-checked-in.html`: about 330 tall with Check in stacked over the note and Back / Next), phone-visual-6-8 and phone-bespoke-6-4 major (three button treatments in one row). One area, four judges, and the bar is a kit part.
- Where: phone shell paragraph, phone round 4 bullet note.

### R6-05 Changed: checked-in has no action bar; Follow the slides follows the stub
- Rule changed: R5-07 put Follow the slides as `.btn--raised` on the `--bar` action bar. Now it follows the stub in the flow (gap `--s4`, 56, full width), the footer rows after it; the page ends at its content.
- Evidence: phone fit 3 to 3. phone-use-6-3 major (`phone-checked-in.html`: about 540px of blank page under the ticket, the next action parked at the bottom), phone-craft-6-9, phone-visual-6-6, phone-bespoke-6-10. Four judges. Declined: phone-visual-6-6's filled green Follow the slides (it ties with the green stub, R5-07).
- Where: phone-checked-in row, Color rules (R5-07 paragraph).

### R6-06 Added: paired values share one grid; a trailing link sits on the title's last baseline
- Rule added: paired fields are one grid (labels row 1, values row 2, one role per row, emphasis by color only); a rank beside a two-line name sits on the first baseline; a text link beside a label-over-title block uses `align-items: last baseline` with a `flex-end` fallback under `@supports not` (Safari 16.2+), icon buttons center. The host lost numerals are one set: 24, 700, zeros muted (accepts the host builder's 24 override; declines host-use-6-3's chip).
- Evidence: phone craft 3 to 3, host craft 3 to 3. Stub times: phone-visual-6-5, phone-craft-6-1 major, phone-bespoke-6-2 major (`phone-checked-in.html`: labels 7px apart, 2:35 larger than 2:31). Show slide: phone-visual-6-9, phone-craft-6-8, phone-bespoke-6-9 (`phone-quiz-open.html`: centered between two lines). Rank: phone-craft-6-5, phone-bespoke-6-8. Host: host-craft-6-5 (`host-quiz-open.html`: zeros at 20 regular, others 26 bold, baselines y84 vs y82). Research `research/round6-2.md` answered the Show slide question: the only published rule (eBay Playbook section header) puts links on the title's baseline and centers icon buttons; Apple publishes none; Wallet and Transit are unverified `[TBD]`. Two areas.
- Where: "Alignment and space" (two bullets), host Slide track, Do and don't, "Check the work" (Baselines).

### R6-07 Changed: one outline per surface; disabled drops the ring; every button full radius
- Rule changed: outline buttons are 2px `--line-strong` on phone and iPad, 1px on laptop, never paler; disabled shows `--muted` words with no ring or fill, same slot, `aria-disabled`. Full radius is recorded as the app's one button shape, the host −1 / +1 included. New `.btn--neutral` (`--bar` light, `--overlay` dark) from the phone builder's request.
- Evidence: phone-visual-6-8 (`phone-live-slide.html`: disabled Next as a pale thin outline beside a dark-outline Back), host-craft-6-7 (`host-points.html`: End day dark stroke, Download pale stroke), host-bespoke-6-8 (pills, 40px `--r-sm` squares and bare text on one screen). Two areas.
- Where: "The kit: Button".

### R6-08 Changed: letter tiles and tracks step off their ground in the theme's direction; light out tiles stay white
- Rule changed: R5-09's `.letter` `--well` fill becomes `--bar` off the field in both themes (`--field-letter` on the field); letters have two states only (default, right answer). Bar tracks are `--bar` in dark, never below the page. Light `--tile-out` moves from mint `#d5e8da` to the white tile with `--muted` words and the letter on `--bar`; dark is unchanged.
- Evidence: host-craft-6-4 (four letter treatments; the solid ink tile in vote's Top pick reads as a right answer), host-bespoke-6-5 (`host-quiz-draft.html` dark: near-black letters). phone-visual-6-4, phone-use-6-8, phone-craft-6-4, phone-bespoke-6-6 (`phone-quiz-sending.html`, `phone-quiz-sent.html` light: mint tiles on green, a grey letter well left over; craft notes dark is finished). Tracks: phone-use-6-7, phone-bespoke-6-5 (`phone-quiz-results--wrong.html` dark: near-black track reads as an inset slider). Contrast: white over `--bar` 1.34, dark `--bar` over `--raised` 1.16, `--muted` on white 6.98. Declined: phone-use-6-8's `rgba(255,255,255,.12)` dimming (opacity on tiles, R2-05). Two areas.
- Where: Colors (`--tile-out`), "Answer choices", "Bars".

### R6-09 Sharpened: no ring on a field tile, applied; a light dark-theme tile is Sam's call
- Rule sharpened: R5-09 already said tiles on the field have no border; phone.css still drew `inset 0 0 0 1px var(--accent)` in dark and `1px var(--line)` in light (phone.css:191-195), and the builder kept it because no judge raised it in round 5.
- Evidence: phone-visual-6-3 major (`phone-quiz-open.html`, `phone-quiz-sent--retry.html` dark: four pale thin outlines, the stroke Sam called sloppy). Research `research/round6-1.md` answered the judge's fill-step fix: same-hue green steps top out near 2.1:1 on the dark field, only a light tile (`#e6e9e6`, 7.29:1) clears 3:1, and no vendor publishes dark values. So the `color-mix()` step is declined, the tile keeps `#1a6a35` with its 5.44:1 words, and the light tile goes to Sam (Not done yet) with a render and a dark-room look. The research misnames `#00531e` as dark `--accent-soft`; it is the dark `st-in` fill.
- Where: "Answer choices", "Not done yet", "Check the work" (Overrides).

### R6-10 Changed: loading actions take the disabled look; loading bodies get still blocks; errors drop the placeholder
- Rule changed: replaces R5-06's "actions disabled in place, full contrast". Loading actions show no fill, no ring and `--muted` words. A body the loaded part fills with lines gets three 12-tall still blocks at the line pitch (90 / 78 / 64%) inside the loaded `min-height`. In dark a block is always lighter than its ground. An error shows no placeholder where its value would go. SIGNATURE 14 is void, restated in the Files table.
- Evidence: phone states 4 to 4, but all four phone judges on `phone-live-slide--loading.html`: phone-visual-6-7, phone-use-6-9 (the held I'm lost reads as a filled primary), phone-craft-6-2 major (about 480px of blank white card), phone-bespoke-6-7; the builder declined the bars citing SIGNATURE 14 (phone not_fixed phone-use-5-7). Host: host-use-6-1 major (`host-now-start--loading.html`: Draft with AI fully live while loading), host-visual-6-6 (dark `--well` blocks read as holes in the band). Projector states 4 to 3 (`projector-stage-checkin--error`, `projector-stage-quiz-ended--error`: a pale bar and a dash block where the count goes); the projector builder's en-dash placeholder kit request is declined. Three areas.
- Where: "Empty, error and loading", "Skeleton", phone-live-slide row, Files table.

### R6-11 Changed: the host empty Now card is 280 tall with large actions
- Rule changed: R5-06 let the empty Ask the room card end at its sentence. Now `min-height` 280, the sentence at `--t-h3`, both actions `--lg` 56 in the action slot, the aside at the card's height, and the last ended question's one-line result when one exists (`[TBD copy]`, real data only).
- Evidence: host fit 4 to 4. host-visual-6-4, host-use-6-2 major, host-bespoke-6-2 major (`host-now-start.html`, `--loading`, `--error`: a 150 to 313px card over about 590px of bare page, the professor's first screen each class). Three judges. Declined: host-visual-6-4's sunken panel inside the card (R6-01) and its buttons under the sentence (the action keeps its header slot, R3-11).
- Where: host-now-start row.

### R6-12 Sharpened: host edges and the Offline slot
- Rule changed: the band's text starts on x 80 and its right end on the page margin (x 1392), the bar title on x 80, no inline padding on card footnotes. Offline is the glyph and the word in `--st-stop-mark` with no fill, in a reserved bar slot; replaces R3's full-width `st-open` bar, and the host builder's `.offline--chip` is declined.
- Evidence: host craft 3 to 3, bespoke 3 to 3. host-visual-6-7, host-craft-6-2 major, host-bespoke-6-4 (`host-quiz-open.html` and every host comp: titles at x48 and x80, the count ending at 1360 against 1392), host-craft-6-6, host-bespoke-6-9 (`host-points--empty.html` footnote at x92); host-use-6-7, host-bespoke-6-3 (`host-now-start--error.html`: a pink chip shifts the bar's links and repeats the card's error). One area, seven issues.
- Where: host Slide track paragraph.

### R6-13 Changed: in a list with three or more row actions, the full set shows on the selected row
- Rule changed: R4-04 put row actions on every row. For host Questions (Type answer, Keep, Dismiss, more), other rows show their state mark in the first action slot and reveal the actions on hover and focus without changing height. Lists with one or two actions keep them on every row.
- Evidence: host-bespoke-6-10 and host-use-6-8 (`host-questions.html`: three rows, nine identical controls competing with the questions). Two judges against a round 4 rule; R4-04's reason (rows looked read-only) stays met by the state mark and the hover reveal.
- Where: "Rows and table".

### R6-14 Changed: phone quiz open anchors the field low
- Rule changed: the one exception to the phone's top anchor. While a poll is open, the collapsed slide row and the leaderboard fold come first and the field ends `--s4` above the action bar, so the tiles sit in the thumb band.
- Evidence: phone fit 3 to 3 (two rounds at 3). phone-use-6-1 major (`phone-quiz-open.html`: tiles at y 242 to 554 of 844, nothing in the thumb band). One judge, but fit is phone's lowest held score and the thumb band is a standing rule (SYN-33) the top anchor broke.
- Where: phone round rules.

### Also recorded this round
- Declined with reasons: phone-use-6-12's segmented tabs (R5-04 text options); phone-use-6-11's 72 pass code (one judge; the 40 code sits under the QR on one axis and the QR stays first); phone-use-6-5's green Google button (R5-11, Google's button is not restyled); host-use-6-3's filled chip on the current lost count (R6-06); host-use-6-4's lighter non-leading bars while open (R4-05 sets `--muted`, one judge); host-use-6-10's Quiz / Vote segmented control (R5-04); host-use-6-11's 32 leader line (one judge, no rule); host-bespoke-6-7's per-size icon stroke token (the rule is one construction, Phosphor Bold 24 on 256; the fault is host.css's overrides, now in "Check the work").
- Existing rules builders missed (no rule change): lock glyph on a vote that can change (host-craft-6-10, R3-12: lock means answers can't change, so vote has no lock); the staff light logo (staff-visual-6-2, the horizontal lockup in light; the builder used the stacked file in both themes because the dark horizontal file doesn't exist, which the rule already allows: stacked in dark only); bars 12 tall with 2px ends (phone results rendered 24-tall pills, phone-bespoke-6-5); team chip one size 16 (host-craft-6-3 found 12, 16 and 32; the 32 hero swatch is the stage-only exception and has no host use).
- Kiosk: brand 4 to 3 says the same full green flood fills the idle Start window and the Checked in panel, so green stops meaning done; the evidence I received is truncated, so no rule change this round. The field rule ("a live or done state") already argues against the idle flood; the next kiosk builder should check it against the judges' full issue text. Kiosk craft notes the camera window jumping in height between states, against "Slots hold their size across states".
- A repeat pattern: builders keep CSS overrides on kit parts (host.css lifted rows and icon strokes, phone.css's dark tile ring, staff.css's flattened tables, kiosk.css's flat bar). Four of this round's majors came from an area stylesheet redrawing a kit part. "Check the work" now has an Overrides grep.

## Round 7 (2026-10-31)

Scores, round 6 to round 7 (hierarchy, depth, brand, legibility, fit, states, craft, bespoke): phone 4/3/4/4/3/4/3/3 to 4/3/4/4/4/4/3/3; host 4/3/4/4/4/4/3/3 to 4/4/4/4/4/4/4/3.5; staff 4/3/3/4/4/4/3/3 to 4/3/4/4/4/3/3/3; projector 4/4/4/4/4/3/3/3 to 4/4/4/4/4/4/3/3; kiosk 4/3/3/4/3/4/3/3 to 4/3/4/4/4/4/3/3; taste 4 to 3.5, coherence 4 to 4. Gains: phone fit, host depth, craft and bespoke, staff brand, projector states, kiosk brand and fit. Losses: staff states, taste. Depth is still 3 on phone, staff and kiosk, and craft 3 everywhere but host. Two causes ran through several areas: a round 6 rule applied literally (disabled buttons stripped to bare text) and stretched or anchored layouts that left bare page. Three rules have now swung back and forth for three or more rounds (the signed-out QR slot, the checked-in action's position, the host empty card); this round settles the first and records the other two.

### R7-01 Changed: a disabled button keeps its footprint as a neutral fill
- Rule changed: replaces R6-07's "disabled drops its ring and fill". Disabled is the `.btn--neutral` fill (`--bar` light, `--overlay` dark, `--tile-out` on a field), no ring, `--muted` words, same shape and slot, in every variant. The phone dock's Back and Next are `.btn--neutral` 56 circles with no stroke in every state.
- Evidence: kit.css:198 applied R6-07 as `background: transparent; box-shadow: none`. Phone craft held 3: phone-craft-7-1 major (`phone-live-slide.html`, `--loading`: disabled Next a bare full-ink arrow beside the ringed Back; the loading dock lost all three containers), phone-visual-7-4, phone-bespoke-7-7, phone-use-7-4. Host (craft 3 to 4 elsewhere, but): host-visual-7-1 major and host-bespoke-7-4 major (`host-now-start--loading.html`, `host-quiz-draft--drafting.html`: Draft with AI, Write my own and Open question as floating labels; the header jumps on load), host-craft-7-2, host-use-7-6. Two areas, eight issues. Judges offered a `--line` ring; declined because a pale ring for disabled is on the round 6 ban list and is the stroke Sam rejects; the fill keeps the shape without it.
- Where: "The kit: Button" (round 7 paragraph), "Where the app differs from GDG on purpose" (Disabled), ban list, Do and don't, "Check the work", "Not done yet".

### R7-02 Changed: parts inside a dark raised card step up to `--on-raised`; the dark field tile moves up a rung; non-leading bars get `--bar-rest`
- Rule changed: new tokens `--on-raised` (light `--bar`, dark `--overlay` `#383f39`, 1.39:1 over `--raised`, was 1.16) for letter tiles, tracks, selected rows and skeleton blocks inside raised cards; `--bar-rest` (dark `#8a918c`, 3.36:1 on the track) for non-leading poll fills; dark `--field-tile` `#1a6a35` to `#22773f` (1.60:1 over the field, was 1.34) with `--on-field-tile` white (5.56:1).
- Evidence: host-bespoke-7-2 major (`host-quiz-ended.html`, `host-quiz-open.html` dark: B, C, D render as bare letters and tracks vanish), host-use-7-8, host-visual-7-7 (dark lead bar hardly stands out), host-craft-7-4 (dark selected row near the card's tone; the host builder asked for `--overlay`). Phone depth held at 3: phone-visual-7-2 major (`phone-quiz-open.html`, `phone-quiz-sent--retry.html` dark: four choices read as one green slab), phone-use-7-9 (asked one rung lighter plus a top highlight). Two areas. Contrast computed with the WCAG formula this round. Declined: phone-visual-7-2's neutral `#2a2f2b` tile (R3-07: grey tiles on green read as disabled). The light tile on the dark field stays Sam's call (Not done yet).
- Where: Colors table (three new rows, `--field-tile`), "Answer choices" round 7 paragraph, "Bars" round 7 paragraph, "Not done yet".

### R7-03 Changed: host and staff tables sit in a well with a raised head again, the well inset 4
- Rule changed: R6-01 took the well out of tables inside raised cards. RUBRIC's depth note says "Host and staff: tables in a sunken well with a raised head", and three judges cited it. Every host and staff table now sits in a `--well` inset `--s1` (radius 12) with a 40-tall `--raised` head at radius 8, inside a card or on the page. Charts, the QR, phone lists and the host Questions list keep R6-01. staff.css's `.lsec` is declined a second time.
- Evidence: host depth 3 to 4, credited to "the sunken Who got it wrong well with its raised table head" on `host-quiz-ended.laptop.dark.png`; host-visual-7-3 major (`host-points.html`: the teams table as bare ruled rows on the card next to the well table, two treatments, "the rubric's host note asks for the well version"), host-use-7-7. Staff depth held at 3: staff-visual-7-1 major (`staff-attendance-list.html`, `staff-admin-pair.html`: This class, Past classes and People flat on the page, one plane in dark; the builder kept `.lsec` and requested it again). Two areas. Round 6's fault (head flush into the well's corners, meeting the card's white; host-visual-6-1) is answered by the 4px inset, not by removing the well. Declined: host-bespoke-7-5's ruled in-card table (one judge against the rubric note), phone-visual-7-5's phone leaderboard in a well (the rubric note names host and staff; phone lists stay ruled rows, R4-02).
- Where: "Surfaces and elevation" (No well inside a raised card, round 7 note), "Rows and table", staff layout, host Points, Do and don't, "Check the work" (Overrides, Repeat requests).

### R7-04 Changed: the open quiz field fills the body to the action bar
- Rule changed: replaces R6-14's bottom anchor with a page gap. The field starts `--s4` under the collapsed rows and ends `--s4` above the action bar (`flex: 1 0 auto`), question at its top, tiles at its bottom (`space-between` inside the field only). The collapsed slide title wraps to two lines (the phone-quiz-open row still said one line with ellipsis; now it matches the round 4 bullet), Show slide on its last baseline.
- Evidence: phone fit 3 to 4 (the tiles reached the thumb band), but four judges on the band R6-14 left: phone-visual-7-1 major (230px of bare page, "the card looks like it slid down"), phone-use-7-2 major (about 450px), phone-bespoke-7-1 major (the field's top at y 810, 733 and 688 across states, so the band jumps), phone-craft-7-6. Declined: phone-bespoke-7-2's full-bleed bottom sheet with 8-radius tiles (one judge), phone-bespoke-7-1's clipped slide bullets (a clipped list cuts a row).
- Where: phone round rules (quiz open), `phone-quiz-open` row, "No dead space" (round 7 bullet), Do and don't.

### R7-05 Removed: the signed-out QR placeholder
- Rule removed: R5-02 and R6-02's signed-out slot (the plate's real square with finder patterns). The signed-out pass is the card with its sentence; sign in failed puts the glyph and sentence in that line's slot, hanging, full width; Continue with Google moves to the action bar row in the thumb band. Also: the QR plate's padding is the quiet zone only and its radius 12 in both themes.
- Evidence: phone-visual-7-3 major (`phone-pass--signed-out.html`, `--sign-in-failed`: the placeholder is the largest object, 326 x 358, louder than the error in dark; the button lands mid-screen), phone-use-7-5, phone-craft-7-8 (not square, three finders read as a broken QR). This is the fourth round in a row a judge called the placeholder the screen's biggest empty object (R4 160 slot, R5 white plate, R6 well slot, R7 finders), so the slot is cut rather than redrawn again. Plate: phone-use-7-6, phone-bespoke-7-9 (light upper ticket reads as empty), phone-craft-7-11 (radius 16). Declined: the light ring around the plate (R5-03, four judges).
- Where: "QR frame" round 7 paragraph, phone round rules (signed-out bullet), `phone-pass` row, "States" (Signed out).

### R7-06 Changed: phone leaderboard rows are two lines, name over meta
- Rule changed: replaces R4-12's one 56 line. Every row is 64 tall: name on line 1, "6 right, 3 students" `--t-small` `--muted` on line 2 at the name's x, rank and credit on line 1's baseline. The footnote is one line or behind a toggle.
- Evidence: phone-use-7-1 major, phone-visual-7-6, phone-craft-7-4, phone-bespoke-7-6 (`phone-live-slide.html`: only the student's own row wrapped, "students" fell under the rank or swatch, the row grew taller); phone-use-7-8 (footnote clipped behind the dock). One area, four judges, against a standing rule.
- Where: phone round rules (leaderboard bullet).

### R7-07 Changed: text links outside a sentence are ink, not green
- Rule changed: `.link` for Show slide, See all teams, "N more" and Ask the AI is `--text` 500 with a chevron when it opens something. In-sentence links keep `--accent`.
- Evidence: phone-visual-7-7 (`phone-quiz-open.html`, `phone-live-slide--not-checked-in.html`: green Show slide beside the green field or green Check in), host-use-7-5 (`host-questions.html` dark: "5 more" pale green and small). Two areas.
- Where: "The kit: Text link".

### R7-08 Changed: waiting wells end at their content; laptop pages with little content top-align
- Rule changed: replaces R6-11's "the aside ends at the card's height". A waiting side well is `min-height` 96, top-aligned; the Who got it wrong slot shows the table's head over one row with the waiting sentence. The host empty card's sentence is `--text` 500. The staff gate top-aligns at 96 with a fixed 120 logo slot. Added both causes to the dead-space list.
- Evidence: host-visual-7-4 and host-bespoke-7-3 major (`host-now-start.html`, `--error`, `--loading`: one centered line in 220px of grey), host-use-7-1 major (grey sentence in a half-empty card). staff-visual-7-3 (`staff-gate*.html`: about 270px empty above and below; the dark stacked logo moved the title 35px). Two areas. Declined: host-bespoke-7-1's four empty A to D rows in the empty card (round 5's four judges named the same rows ghost rows, R5-06; round 7's use judge asked for the actions to lead instead), host-use-7-1's buttons under the title (R3-11).
- Where: "No dead space" (round 7 bullet), host-now-start row, staff-gate row.

### R7-09 Added: a glyph before a heading hangs
- Rule added: a 24 glyph column (`24px minmax(0,1fr)`, gap `--s2`), wrapped lines on the text column, no `max-width` or `text-wrap: balance` on a sentence with room.
- Evidence: phone-craft-7-5, phone-bespoke-7-8, phone-use-7-5 (`phone-pass--sign-in-failed.html`: the error heading broke at about 200px of a 326px line and wrapped back under its glyph). One area, three judges; `.notice` already drew it this way, so the rule extends one construction.
- Where: "Alignment and space".

### R7-10 Sharpened: the one-line count and percent binds on the phone; the phone row variant is declined
- Rule sharpened: R4-05 stands. Columns `44px minmax(0,1fr) 40px 48px`, count and percent right-aligned on the label line, the track on line 2.
- Evidence: phone-bespoke-7-4 major, phone-craft-7-3, phone-use-7-7 (`phone-quiz-results.html`, `--wrong`: bar end at 254, percent at 302, count at 357 on two lines). The phone builder had asked for the variant in round 6 (phone-use-6-6); judges rejected the result.
- Where: "Bars" round 7 paragraph, "Not done yet".

### R7-11 Changed: the host leader lockup's swatch is sized to the word
- Rule changed: second exception to one swatch size: on the 96 leader word the swatch is a cap-height bar (about 0.7em tall), baseline-aligned, gap `--s3`. "2nd, tied" sits on one line.
- Evidence: host-visual-7-6, host-use-7-4, host-craft-7-7, host-bespoke-7-7 (`host-points.html`: the 16 chip floats at mid-height of "Teal"); host-use-7-4, host-craft-7-5 ("tied" wraps and lifts "2nd" 9px). One area, four judges.
- Where: host Points paragraph, "Rows and table".

### R7-12 Changed: the staff gate's page list has no lifted row
- Rule changed: the requested page is marked by 500 words and an arrow glyph; every row flat in the well. The staff builder's `.gatec` lifted row is declined.
- Evidence: staff-visual-7-2 major (`staff-gate.html`, `-refused`, `-loading`: the locked Attendance row the brightest surface on screen, pulling the eye off Continue with Google). One judge, but it breaks "one raised object per screen" (R4-02).
- Where: staff-gate row.

### R7-13 Changed: the stage count's loading and error forms follow the projector builder
- Rule changed: loading is the step word at `--p-head` in the numeral slot; error keeps the last count muted with the note saying what failed. Replaces the skeleton and the inset card in the count's slot. A failed first load is `[TBD]`.
- Evidence: projector states 3 to 4 with these forms (`projector-stage-checkin--loading.html`, `--error`, `projector-stage-quiz-ended--error.html`); the builder's not_fixed projector-craft-6-1 explains the trade (the "Count didn't load" line ran past 512px at head size).
- Where: projector-stage-checkin and quiz-ended rows, Files table.

### R7-14 Changed: the kiosk section follows the door geometry; the kiosk bar keeps its shadow
- Rule changed: a round 7 paragraph replaces the 440 stacked panel, the 56 name, the 72 long word and the `--error` refused fill with the kiosk builder's door: bar 88, a two-row panel (432 band, camera window), fixed 320 target, result rows 200 / 100 / 56, one 96 word, name 80, the camera-window Start, and new `--st-stop-fill` tokens. kiosk.css's `box-shadow: none` on the bar goes.
- Evidence: kiosk brand 3 to 4 (the idle Start no longer floods green), fit 3 to 4, states 4. Kiosk depth held at 3: `kiosk-scan.ipad.light.png`, `kiosk-start.ipad.light.png` ("the top bar and the panel are both white with no seam or shadow"), the same in kiosk craft. The cause is an override: since R6-03 the light bar is `--raised`, and kiosk.css removed its shadow on the reasoning that the bar is `--bar`.
- Where: kiosk layout (round 7 paragraph), Colors table (`--st-stop-fill`), "Check the work" (Overrides).

### R7-15 Sharpened: picked uses the failed tile's ring geometry; one glyph size in the field
- Rule sharpened: picked and sent draw the ring inset with a 2px tile-colored gap, like failed, so only the color changes; every glyph in `.qfield` is 20.
- Evidence: phone-craft-7-2 (`phone-quiz-sent.html` vs `--retry`: the ring jumps 2px inward), phone-craft-7-7 (16, 20 and 24 glyphs in one field). One judge each; both apply "one part keeps its geometry across states".
- Where: "Answer choices" round 7 paragraph.

### Also recorded this round
- Settled oscillations, kept as is: phone checked-in keeps Follow the slides in the flow under the stub (R6-05). Round 6 had four judges and two majors against the docked form; round 7 has two minors against the flow form (phone-visual-7-8, phone-craft-7-10), so the flow form is the better of the two. phone-bespoke-7-10's raised `--r-lg` row is declined (every button is full radius, R6-07). The host empty card: R4 drew rows, R5 removed them (four judges), R7's bespoke judge asks for them again; kept without rows (R7-08). If either comes back in round 8, it goes to Sam rather than another swing.
- Declined with reasons: host-visual-7-2's track band on the bar's surface (host depth rose 3 to 4 with the band on the page, R6-03; one judge); host-visual-7-8's filled Draft with AI after a quiz ends (R3-05, fourth time); phone-bespoke-7-3's slide drawn as a framed 8-radius slide with no shadow (one judge; the slide card is the screen's one raised object, R4-02); phone-bespoke-7-5's loading without bullet blocks and with en-dash credits (four round 6 judges asked for the blocks, R6-10; dashes read as data, R5-06); phone-use-7-3's error-container fill on the failed tile (pink on green, R1-10); phone-use-7-10's 56 not-checked-in bar (one judge); staff-visual-7-4's transparent role selects (one judge against staff-use-6-7, which asked for a visible field); host-bespoke-7-6's segmented −1 | +1 control (one judge; R6-07's full-radius icon buttons); host-bespoke-7-8's Delete as a fourth text slot (one judge); host-use-7-10's Quiz / Vote segmented control (R5-04).
- Existing rules builders missed (no rule change): staff tables flat (R6-01 already said well; now R7-03); the kiosk bar shadow (R6-03); the phone result row variant (R4-05); a 4px title jump between host tabs (host-craft-7-8, "Slots hold their size across states"); the kept row's two drawings (host-craft-7-4, "One part, one size"); result tile x 92 vs 80 between draft and results (host-craft-7-1, "One part keeps its geometry"); two empty-well classes on host (host-craft-7-3); the light QR plate radius 16 (phone-craft-7-11, R4-10 says 12); the perforation notch's pale arc in light (phone-craft-7-9: draw the cut with a mask, no stroke, which "every edge is a fill step" already requires).
- A pattern: four of this round's majors came from builders repeating a kit request this file had already declined (`.lsec`, the phone result-row variant) or from the kit owner applying a rule's words without its intent (disabled as bare text). "Check the work" now has a "Repeat requests" line, and R7-01 states what disabled must look like rather than what it must drop.
