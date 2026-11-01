---
name: rcc-design
description: Use before building, restyling or reviewing any screen in rcc-live-lecture (student phone, professor host, staff pages, projector stage and team board, door iPad kiosk, iOS app). Carries the rules every screen follows, each tied to its docs/design.md section and the evidence behind it, plus the screen-lab and render commands that check the work.
---

# Building a screen in rcc-live-lecture

Read `docs/design.md` for the section each rule names; it states each rule once, in its final form, and wins over the comps in `design/comps/` and the reference kit in `design/system/kit.html` where they differ. If a rule blocks a fix, say so instead of working around it. Never redraw a kit part's radius, shadow, ring or stroke in an area stylesheet: change the kit (L:R6). Use the kit (`src/blocks/kit.tsx`, `src/styles/kit.css`) before writing CSS; add to the kit when a part is missing, and keep every existing export and prop working. The app kept a few class names the comps use for something else (`.color-field`, `.rows > .row`, `.pledger`, `.qrcode`, `.late__item`, a bare `.btn` as the primary): docs/design.md "Names the app kept". Words on screen follow `~/.claude/skills/prose-voice/SKILL.md` and the app's real strings; never rewrite copy while restyling.

Evidence tags: `L:R1-nn` to `L:R7-nn` = an entry in `design/system/LESSONS.md` (what a judging round caught, with scores and comps); `R:dim` = a dimension of `design/system/RUBRIC.md`; `SYN-n` = item n of the design run's research synthesis (kept outside the repo); `graft:lens/dir` = a judge graft in that run; `BL` = GDG `bright-lines.md`; `baseline/<area> Pn` = a baseline critic problem.

## Before you start

1. Find the screen's area and its key screen in docs/design.md "Layout per area" (phone, host, staff, projector, kiosk): the grid and the first thing to look at.
2. List the screen's states from `design/system/INVENTORY.md` (loading, empty, error, signed out, success). Each one gets a designed form ("States").
3. Name the one focal surface and the one green job before writing markup.

## Rules

### Not the default look (RUBRIC 8)
- Before drawing a part, ask what the app's job makes it: the pass as a ticket, the slide track, the 240 stage count, the door's status panel. Check the screen against the ban list in "Not the default look": no edge stripe, stat-tile row, seal disc off the door, decorative chip, Live dot, card in well in card, mixed icons, centered phone card, pile of equal white cards, dashed placeholder box, ring spinner on a tile, chip over a QR, stacked count-over-percent bars, iOS switch where a radio fits, floating info line, blank square for a missing image, pill segmented control with a check, pink alert box standing in for content, ghost rows, QR placeholder, hairline ring on a QR plate, card stretched to the window, well inside a raised card (tables excepted), row lifted into a shadowed card, toolbar repeated on every row, paler ring for disabled, value set larger than its pair, disabled button drawn as bare text, placeholder bigger than what it waits for, waiting well stretched to a neighbour, green text link beside a green field or primary, body-size swatch beside a display word. L:R3 to L:R7.

### Hierarchy and layout
- One first thing per screen, one size step above its neighbours; one `.focal` surface per screen. "Surfaces and elevation". SYN-2, SYN-21, R:hierarchy.
- One display-size number per screen; every other number at least one `--n-*` step under it; times of day never at a display numeral size. "Tokens: Type". L:R1-03.
- No stat-tile rows as openers: one lead number in the card's hero slot (same size and place across states), the other counts in one line under it (`.tally`); counts never repeat. Where readouts still share a row: two sizes at most, one baseline. "Tokens: Type". L:R2-02, L:R3-02.
- One text edge per column, slots that keep their size and x across states, no `1fr` spacers or vertically centered tall cards. "Alignment and space". L:R1-05.
- No dead space: laptop grids `align-items: start`; host Now keeps its main + aside split in every state (an empty aside is the same `--well` panel with one line), other screens drop an empty column (L:R4-08); a phone object is top-anchored `--s4` under the bar, never centered, its footer rows following it (gap `--s6`), the action bar holding only the action; no empty band over 25% of the viewport. L:R2-01, L:R3-06, L:R5-01. Phone checked-in has no action bar: Follow the slides follows the stub in the flow (L:R6-05). Phone quiz open: the green field fills the body from `--s4` under the collapsed rows to `--s4` above the action bar, question at its top, tiles at its bottom, edges fixed across states (L:R7-04). Host empty Now card: `min-height` 280, `size="lg"` actions, its sentence in `--text`; waiting side wells end at their content (min 96, top-aligned), never stretched to the card; laptop pages with little content top-align at 96 (L:R6-11, L:R7-08).
- Before shooting, grep the area CSS for the dead-space causes: `margin-top: auto`, `justify-content: center | flex-end | space-between` on a page column, `1fr` card rows, `height: 100%` on a card. L:R5-01.
- An action keeps one form and one slot across states (the card's header-row action slot on host). L:R3-11.
- A glyph before a heading hangs in a 24 column (`.hang`); wrapped lines start at the text; no `max-width` or `balance` on a sentence with room. L:R7-09.
- Paired values are one grid (`.pairs`): labels on one row, values on the next, one type role per row, emphasis by color never size; a rank beside a two-line name sits on its first baseline; a text link beside a label-over-title block sits on the title's last baseline (`.sec-head`), icon buttons center. "Alignment and space". L:R6-06.
- A part keeps its radius, padding and x across states (`.barrow` = `.choice` geometry; confirm rows keep the row's columns); laptop tracks `minmax(0, …)`; a scrolling list ends on a whole row or `.rows__more`. L:R2-06, L:R2-07.
- Host: the slide track (`SlideTrack`: segments, lost taps over each at one size on one baseline, past zeros muted, the room count at the right end; the lane keeps 28px a slide, so the title shrinks first) sits on its own band across the top on every tab; the live action sits in the focal card's header-row slot; Offline is glyph plus word in a reserved bar slot, no chip (the word "Offline" waits for the COPY pass; until then the slot shows the glyph alone). "Layout per area: host". L:R3-02, L:R4-06, L:R6-03, L:R6-12.
- Staff: one count line in the page head comes before any table (no stat tiles); the page's task is the focal card in the aside. "Layout per area: staff". SYN-35, L:R3-02.
- Phone: the state word or question sits above the choices; choices full width, 72 tall, 12 apart, in the thumb band; an open poll's field sits above the slide card. "Layout per area: phone". SYN-33, R:fit.
- Projector: everything inside the 96 stage px frame; the QR keeps one size and spot in every state; the count is 240 stage px. "Layout per area: projector". SYN-36, R blocker 5.
- Kiosk: one door geometry in every state: 24 gutter, bar 88 (count 64), a two-row panel (432 status band, camera window in the rest, fixed 320 target), the typed code as field plus button in the bottom strip; a result floods the panel (`--field`, `st-in`, `--st-stop-fill`) with the word 96, name 80, fact on fixed bottom-set rows; idle Start is the camera window, never the green flood; only fill, glyph and words change. "Layout per area: kiosk". SYN-37, L:R7-14.

### Depth
- Four rungs by role: `.well` groups, page, raised content, `.bar` sticky; `.sheet` with a scrim for confirms. Sticky bars sit one rung above the page (`--chrome`: light `--raised` + `--shadow-bar`, dark `--bar` + `--hl`); no area stylesheet sets `box-shadow: none` on a bar. "Surfaces and elevation". SYN-1, SYN-6, L:R6-03, L:R7-14.
- One raised object per screen: phone lists are ruled rows flat on the page, host and staff side panels are `--well`; the focal object never sits on a lower rung than a neighbour. L:R4-02.
- Shadow only on the focal surface and overlays; never on the projector; never animated. At most one nesting level inside a card. SYN-3, BL 1.3, L:R3-09.
- No focal green rule and no colored stripe down any edge: a state is fill step + glyph + words; a selected row is a fill step. L:R1-01, L:R3-01.
- Host and staff tables sit in a `--well` inset 4 (radius 12) with a 40-tall `--raised` head at radius 8, in a card or on the page (`Rows`). A chart, a QR, a phone list or the host Questions list sits straight on its card or page. Inside a raised card, letter tiles, tracks, selected rows and skeleton blocks use `--on-raised`. With three or more row actions, the full set shows on the selected row and on hover or focus. Every body row has the same fill. L:R6-01, L:R6-13, L:R7-02, L:R7-03.
- Every edge is a fill step or a deliberate ring; `--line` never stands alone as an edge. SYN-5.
- Dark mode steps lighter per rung with the `--hl` top highlight. Light rungs: page `#eef2ee`, well `#e4e9e5`, bar `#dce3dd`, so a white card is a 1.13 step; a non-focal raised card adds an 8% ink ring. "Tokens: Colors". SYN-4, L:R1-04, L:R4-01.
- Things on the green field step up in its hue: dark `--field-tile` `#22773f` with white words + `--hl`, the letter on `--field-letter`; never the page color or a neutral grey. Unpicked tiles use the solid `--tile-out` fill, never opacity. L:R2-04, L:R3-07, L:R7-02.

### Color
- Green marks one job: the color field, or one filled button plus the current tab plus one live number. Row actions, other counts, credit, Kept and `+0` stay neutral. SYN-10, R:brand, L:R1-06.
- One green per object: a right-answer row on a laptop is the green bar + the check on the letter + the words "Right answer", no tint, ring or chip. L:R2-03.
- One full-strength green mass per screen. On the quiz field there is no filled button; with the stub on screen Follow the slides is `.btn--raised` in the flow; after results the right answer is the one green; host quiz-ended's 62% leads, so its buttons are outline. A second action is outline, never a green tint; bar links that aren't tabs are `--muted`. L:R3-05, L:R4-14, L:R5-07.
- No Live badge. A chip only marks a state that differs between items; Open / Ended is a state word; type facts are one muted meta line; place and rank are bare numerals. Text links outside a sentence are `.link` (`--text` 500, a chevron), never green. L:R3-04, L:R7-07.
- Every state is color plus a word plus a glyph, from the state triples. "Tokens: Colors". SYN-11, R blocker 2.
- Red only for failed or can't-be-undone, filled only inside a confirm. The late banner is `--warn`. An error on the stage card or the field is `Banner inset`; never red on green. L:R1-10.
- Teams: `TeamChip` (chip plus written name), colors from `--team-*` only; never colored bars or a row tinted by team. SYN-14, BL 1.3.
- No blue actions, gradients, blur, Material Symbols or Roboto. BL, R blocker 3.
- `color-mix()` and other post-2023 CSS only inside `@supports` with a fallback; check iPadOS 16.2. SYN-15, SYN-39.

### Type and numbers
- Google Sans 400 / 500 / 700 only; one 700 per card besides numerals; ligatures off. "Tokens: Type". SYN-16.
- Every changing number uses `.num` (tabular, 700) at a `--n-*` size, with a label above it (`.readout`). SYN-17, SYN-22.
- Codes in Google Sans Code, two groups of 3; the face must load before a shot. Units after a display numeral at 0.55em 500 (`.num__unit`). SYN-18, L:R4-18.
- Floors: phone and laptop 12, iPad 16, projector 32 (sentences 40, body 48). SYN-19, R:legibility.
- Inputs 16px or more on phones. SYN-20.
- Laptop readout labels, table heads and row meta at 15 / 500; the 13px `.t-ledger` is for badges only. L:R1-09.

### Parts
- One part per job: one bar chart (`Bars`, `.rbars`), one numeral role, one segmented control, one tab style, one badge set. "The kit". R:craft.
- A 2 to 3 option switch is text options, the chosen one `--text` 700 over a 2px underline; options with a sentence each use `.rolepick`. L:R5-04.
- Google's button is the one control we don't style (auth.tsx renders GSI's own); no green button beside it. L:R5-11.
- Answer choices (`Choice`): one letter drawing (44, radius 4), the same letter on phone, host and stage; picked and sent = a 3px ring inset 2px + the word at `--t-body`; failed = the same ring in red; tiles on the field have no border or ring; one 20 glyph size in the field; sending = a 3px bottom bar that fills once. L:R5-09, L:R6-08, L:R7-02.
- Poll bars: count and percent on one tabular line in two right-aligned columns, on phone too; 2px bar ends; non-right fills `--bar-rest`; the right one `--accent` after the end; stage right-row ring 6. L:R4-05, L:R7-10.
- The QR is black on a white plate (`.qrcode`, radius 12, padding = the 4-module quiet zone), no well, no ring. A signed-out pass draws no QR placeholder. L:R6-02, L:R7-05.
- One team swatch: `.team__chip` 16, radius 4, an inset ink edge, everywhere but the stage and the host leader lockup. L:R4-11.
- Phone: the shell is a `100svh` flex column with the bars in the flow; the action bar is one 56 row, Back and Next 56 `.btn--neutral` icon buttons at the ends, the main action between; the why-line only after a tap on disabled Next; leaderboard rows are two lines, 64 tall. L:R5-13, L:R6-04, L:R7-01, L:R7-06.
- "Yours" after results is words: "Your answer" and the team name in 700 + "(you)"; letters and ranks never invert; the right row keeps its green ring even when it's mine. L:R2-09, L:R3-08.
- One icon construction (`Icon`: Phosphor Bold geometry, no fills) and one meaning per glyph. L:R3-12.
- Row actions are ghost buttons (`variant="ghost"`) with no resting ring; text actions use `.link`. L:R2-08, L:R4-04.
- The tapped thing confirms in place: the tile shows the check (its word "Sent" waits for the COPY pass), a new row tints `st-in`, the door panel floods. No toasts. SYN-29.
- Targets: laptop 32 with 8px gaps; phone and iPad 44; door buttons 56 to 72. SYN-38, R:fit.
- Buttons: full radius; outline 2px on phone and iPad, 1px on laptop; disabled keeps its footprint on the neutral fill with `--muted` words, never bare text. L:R6-07, L:R7-01.
- Spacing from the 4px ladder; radii from the GDG scale, nested. SYN-9, SYN-23.

### States
- Loading is the real layout with still solid blocks at each value's cap height (in dark lighter than their ground) plus one line naming the step; actions take the disabled look. An error shows no placeholder where its value goes. The stage count: loading is the step word in the numeral slot, an error keeps the last count muted. No spinner on a waiting screen. "States". SYN-30, L:R5-06, L:R6-10, L:R7-13.
- Empty, loading and error of one region look different at a glance: empty draws the real part empty, loading is still blocks, error puts the red glyph and the sentence in the failed content's slot and Try again in the action slot. A message with no slot is a `Notice`. "States". SYN-31, L:R3-03, L:R5-05.
- A state counts only when it is rendered: shoot loading, error and every wait step in the lab; controls render disabled while loading. L:R1-11.

### Motion
- Only state changes move, on the named transitions in "Motion"; transform, opacity and color only; no loops but the busy spinner in a pressed button. SYN-24, R blocker 4.
- Reduced motion replaces spatial moves with color or opacity; never deletes the change. SYN-26.
- Live counts swap value in place; the leaderboard reorders instantly with a held ring. SYN-27.

### Data and safety
- Fake first names and class names only; no real students, emails or URLs. R blocker 6.
- No emails, keys or addresses on the projector. "Rules for each surface: Projector".

## Check the work

Real screens through the screen lab (fixture data, no backend; from the repo root, on a port nobody else uses; `design/lab/README.md` has the scenario contract):

```sh
node_modules/.bin/tsc --noEmit -p design/lab/tsconfig.<area>.json
node design/lab/shoot.mjs --port <port> --out <dir> --only <area or id prefix> --strict
node design/tools/contact.mjs --out <dir>/sheets <dir>/manifest.json   # one contact sheet per theme
```

A comp (plain HTML in `design/comps/<area>/` with `<meta name="surface" content="phone|laptop|projector|ipad">`; laptop and projector comps link `../../system/tokens.css` and `../../system/kit.css`; phone and iPad comps are written by the area's generator in `design/comps/<area>/src/`, so never hand-edit one):

```sh
node design/tools/render.mjs --out <dir> <comp.html or folder>    # light + dark at every size; exit 1 on a hard failure
```

Then work through docs/design.md "Check the work": fonts load; no empty band over 25% of a phone viewport and no laptop card more than `--s8` taller than its content; loading, empty and error differ in the shot and every loading button shows its full shape; count rounded surfaces from the page in (more than two is a fault); read each paired set's label and value tops in the 2x shot; grep the area CSS for overrides of a kit part's radius, shadow, ring or stroke; compare element boxes across a screen's states. Open the light and dark PNGs for every key screen you touched and read them against the rubric (hierarchy, depth, brand, legibility, fit, states, craft, bespoke). A green run is necessary, never enough: check each rule in the shot and measure it. The lab shoots with reduced motion on, so judge motion from the CSS. Stop any server you started.
