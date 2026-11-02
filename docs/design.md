# Design

How every screen looks: the tokens, the surfaces, the kit, the layout and states for each area, and the rules each place the app shows up follows (student phone, professor laptop, staff laptop, projector, door iPad, iOS app). The look is the GDG on Campus RCC design system ([github.com/Sam-T-G/rcc-gdg](https://github.com/Sam-T-G/rcc-gdg), `docs/04-brand/design-system/`): green leads, Google Sans, depth from tone before shadow, and nothing moves unless its state changed. Read its `README.md`, `foundations.md`, `components.md`, `motion.md` and `bright-lines.md` before a design change; this file says how the app applies them.

Open **#/ui** to see every color, every contrast pair with the ratio the browser draws, and every kit part in every state, light and dark side by side, with the door iPad's parts at 0.7 scale and the projector's at 0.42. **#/ui/projector** shows the projector layout at the window's size, and **#/ui/projector/dark** the same layout dark.

## Files

| File | What's in it |
|---|---|
| `src/styles/tokens.css` | Colors per theme, the state triples, team colors, type roles, numerals, space, radius, motion, layers, the kiosk and projector sizes, GDG's own `--rcc-*` tokens, and the short names pages used before as aliases |
| `src/index.css` | Bare elements (page, headings, links, buttons, fields, tables, lists, focus), the helpers, and the parts in `src/blocks/ui.tsx` (`Screen`, `Card`, `Big`, `Status`, `Todo`) |
| `src/styles/kit.css`, `src/blocks/kit.tsx` | The kit: every shared part, one treatment each, and its React parts |
| `src/blocks/qr.tsx` | `QR`: black on white with a 4-module quiet zone, `role="img"` and a name |
| `src/styles/contrast.ts`, `src/styles/contrast.test.ts` | Every color pair the app draws and the test that measures them in light and dark |
| `src/pages/UIKit.tsx`, `src/styles/uikit.css` | #/ui and #/ui/projector |
| `index.html` | The Google Fonts link (Google Sans and Google Sans Code, OFL; GDG `foundations.md` §3.1) |
| `ios/RCCLivePortal/Palette.swift` | The iOS app's copy of the hex values; `src/styles/ios.test.ts` fails when one differs from `tokens.css` |
| `design/system/` | The design run's reference: `kit.html` (every part, as plain HTML), `RUBRIC.md` (how screens are judged), `LESSONS.md` (what each judging round found, with evidence), `INVENTORY.md` (every screen state) |
| `design/comps/<area>/` | The target picture for each key screen (phone, host, staff, projector, kiosk). Where a comp and this file differ, this file wins |
| `design/lab/` | The screen lab: the real app from fixture data, shot in light and dark at each area's sizes (`design/lab/README.md`) |
| `design/tools/` | `render.mjs` (shoots a comp and runs the checks), `contact.mjs` (contact sheets) |

## How the stylesheets stack

`tokens.css` declares three cascade layers in order: `tokens`, `base` (`index.css`), `kit` (`kit.css`). Team stylesheets have no layer, so **a team rule beats every base and kit rule, whatever its selector**. Two things follow:

- A page restyles a kit part with one plain class rule, no `!important` and no long selectors.
- A broad team rule such as `.host-root button { background: transparent }` also restyles every kit `Button` inside `.host-root`. Scope team rules to the team's own classes, or skip the kit's with `:where(:not(.btn, .tabs__tab))` as host.css does. `src/styles/contrast.test.ts` fails when an element rule under a page's `-root` class reaches a kit button or tab.

A team stylesheet never redraws a kit part's radius, shadow, ring or stroke: a needed difference is a change to the kit. Two base rules use `!important` on purpose, in a layer that beats every team rule: `[hidden]` always hides, and reduced motion cuts every animation and transition to 1ms.

Cascade layers need Safari 15.4, Chrome 99 or Firefox 97. Everything else in the kit works on iPadOS 16.2; newer CSS (`color-mix()`, `linear()`, `:has()`, `last baseline`, `lh`) sits in `@supports` with a fallback, or degrades to a plain look.

### Names the app kept

The kit's comps (`design/system/kit.html`, `design/comps/`) use a few class names the app already gave another meaning. In the app:

| Comp name | App name | Why |
|---|---|---|
| `.field` (the green color field) | `.color-field` | `.field` is `<Field>`'s label, hint, error and control. `.fld` is the same Field part under its kit name |
| `.row` (a list row) | `.rows > .row`, or `Rows` / `Row` (`.ruled__row`) | `.row` is the base flex row every page uses |
| `.page` (the laptop page) | `<Screen wide>` (`.page page--wide`) | `.page` is the narrow phone page; `.page--wide` is 1344 at 1440 |
| `.stack` (a grid column) | `.stack` with `--gap` | `.stack` stays a flex column, 12 apart unless `--gap` says otherwise |
| `.ledger` (the stage leaderboard) | `.pledger` | `.ledger` is GDG's ledger line (code face, caps); the 13px caption is `.t-ledger` |
| `.stage` (a 1920 x 1080 preview frame) | the stage page's own `.stage` | `#/checkin/stage` fills the screen; #/ui previews with `[data-surface="projector"]` and `--stage-u` |
| `.late` (the late strip) | `.late__item` | `.late` is LateBanner's stack, which each page places |
| `.board`, `.leader`, `.rank` | `.lbgrid`, `.first`, `.pledger` | `.board` is the leaderboard's phone and stage rows (`live.css`, `stageboard.css`) |
| `.qr` (the plate) | `.qrcode` | `.qr` is `<QR>`'s figure; inside `.pass` and `.stage-card` it gets the plate too |
| `.points` (the host teams table) | `Rows` (`.ruled--well`) with its own `cols` | `.points` is the host Points tab's layout (`points.css`) |
| a bare `.btn` (no fill) | `.btn` is the primary | A bare `<button>` and a bare `.btn` are the one filled green button; every other look is a variant class |

## Tokens

Pages use the names below. `tokens.css` declares each color on every theme scope, so `data-theme="light"` or `"dark"` on any element themes it and everything inside, whatever the system setting.

### Colors

The rungs, low to high. Light fills are GDG v1.0. In dark the well sits one small step under the page (1.07:1) and every rung above the page steps 1.15:1 or more, so cards stay louder than wells; a well never reads as a black hole.

| Name | Light | Dark | Job |
|---|---|---|---|
| `--well` | `#e4e9e5` | `#111512` | Sunken: holds rows, tables, readouts, result bars |
| `--page` (`--bg`) | `#eef2ee` | `#181c19` | The ground |
| `--raised` (`--surface`) | `#ffffff` | `#222823` | Content: cards, fields, a table head inside a well |
| `--bar` (`--fill`) | `#dce3dd` | `#2d332e` | Neutral badges, letter tiles off the field, bar tracks in dark |
| `--overlay` | `#ffffff` | `#383f39` | Sheets and confirms, always with `--shadow-2` and the scrim |
| `--chrome` | `#ffffff` | `#2d332e` | The sticky bars (app bar, phone action bar, kiosk bar): one rung above the page |
| `--on-raised` | `#dce3dd` | `#383f39` | A part inside a raised card: letter tiles, bar tracks, a selected row (1.39:1 over `--raised` in dark) |
| `--focal-fill` | `#ffffff` | `#2a302c` | The one focal card: in dark one rung over `--raised` so it reads up without its shadow |
| `--hl` | none | inset 1px white 6% | The top highlight on every raised thing in dark |
| `--text` / `--muted` | `#1e201e` / `#575a58` | `#e6e9e6` / `#b9bcba` | Words / hints, labels, times |
| `--line` | `#ccd4cd` | `#424943` | Decoration only (1.44:1). Never the only edge of anything |
| `--line-strong` | `#727873` | `#919791` | Field and outline-button edges, the ledger head's rule |
| `--accent` / `--on-accent` | `#00732d` / `#ffffff` | `#96d6a0` / `#003410` | The one filled button, the current tab rule, the live number, a link in a sentence |
| `--accent-soft` / `--on-accent-soft` | `#cff1d3` / `#003a13` | `#26402c` / `#c6eccb` | A tonal fill; dark is a green-tinted neutral one step over `--raised`, so it never reads as a second filled primary |
| `--tonal` / `--on-tonal` | `#cff1d3` / `#003a13` | `#81c995` / `#0d3b1e` | `.btn--tonal` |
| `--field` / `--on-field` / `--on-field-muted` | `#00732d` / `#ffffff` / `#cff1d3` | `#025620` / `#ffffff` / `#b5e8bd` | The color field: a live or done state, filled edge to edge. Words on it are `--on-field`, labels included; `--on-field-muted` is for marks (the perforation, a question number) |
| `--field-tile` / `--on-field-tile` | `#ffffff` / `#1e201e` | `#22773f` / `#ffffff` | A tile, button or inset card on the field: one step up in the field's hue (1.60:1 over the dark field), with `--hl`. A grey tile on green reads as disabled; a page-colored one as a hole |
| `--field-letter` | `#e4e9e5` | `#0e4420` | The letter well inside a tile on the field: one step darker than the tile in every state |
| `--tile-out` / `--on-tile-out` | `#ffffff` / `#575a58` | `#0e4420` / `#e6e9e6` | An unpicked tile after sending. Light keeps the white tile with muted words (the letter on `--bar`); dark is a solid fill one step down. Never opacity |
| `--warn` / `--on-warn` | `#ffe5c0` / `#4f3400` | `#624000` / `#fcdeb5` | The late banner |
| `--error` / `--on-error` | `#c5150f` / `#ffffff` | `#ffb3a8` / `#660604` | Error words; the danger button inside a confirm |
| `--st-stop-fill` / `--on-st-stop-fill` | `#b3261e` / `#ffffff` | `#8c1d18` / `#ffffff` | The door's refused and camera-blocked flood, the same weight as the green Checked in flood |
| `--bar-rest` | `#575a58` | `#8a918c` | Every poll bar that is not the lead or the right answer |
| `--track` | `#e4e9e5` | `#2d332e` | A bar chart's track, never below the page |
| `--neutral-btn` | `#dce3dd` | `#383f39` | `.btn--neutral` and every disabled button |
| `--skel-fill` | `#d2d9d3` | `#383f39` | A skeleton block: in light darker than the page (1.27:1), a white card (1.44:1) and a well (1.17:1), the projector's well tone, since a 1.09 step vanished on the stage and the phone; in dark always lighter than its ground |
| `--cam`, `--cam-mark`, `--cam-mark-ok` | `#1e201e`, `#ffffff`, `#96d6a0` | `#0b0e0c`, same | The camera's ground and corner marks (green on a read) |
| `--qr-tile`, `--qr-ink` | `#ffffff`, `#000000` | same | A QR is always black on white, on its own white plate |
| `--scrim` | `rgb(16 20 18 / .48)` | `rgb(0 0 0 / .64)` | Under a confirm or sheet: the page behind reads clearly dimmed |
| `--live` / `--on-live` | `#00732d` / `#ffffff` | `#96d6a0` / `#003410` | Retired from screens: there is no Live badge. Kept for old markup |

Light rung steps: raised over page 1.13, page over well 1.09, page over bar 1.19. A card needs a 1.12 to 1.16 step over the page to read at 30 to 40cm; whether 1.13 holds on an iPhone in glare is `[TBD]` (if it vanishes, move the page to `#ebefeb`, 1.16). `--bar` is `#dce3dd` rather than the `#d9e0da` the design run picked: on `#d9e0da` green and red words measure 4.48:1, under the 4.5 floor.

**State triples:** each state has a fill, the words on it, and a mark (a glyph, rule or ring, 3:1 or more on its fill). Every state also has a word and a glyph, never color alone.

| State | Fill / words / mark, light | Dark | Used for | Glyph |
|---|---|---|---|---|
| `st-in` | `#cff1d3` / `#003a13` / `#00732d` | `#00531e` / `#c6eccb` / `#96d6a0` | right answer, sent, paired, added, shared with students | check |
| `st-open` | `#ffe5c0` / `#4f3400` / `#8a5a00` | `#624000` / `#fcdeb5` / `#e7ae58` | private, sign-in ending, presenter notes, needs you | lock, clock, warning |
| `st-stop` | `#ffeae6` / `#6f0604` / `#c5150f` | `#43302d` / `#ffdbd4` / `#ffb3a8` | refused, failed, field error | x, warning |
| `st-wait` | `#e3eae3` / `#1e201e` / `#575a58` | `#383f39` / `#e6e9e6` / `#b9bcba` | ended, already checked in, dismissed, waiting | repeat, inbox |

"Checked in" on phone and kiosk is the stronger form of `st-in`: the full `--field`. Dark `st-stop` is a quiet red-tinted step one rung over `--raised` (1.22:1), so a one-line error, a red badge or a field error never outranks the pass, the question list or the Pair card; its words and glyph carry the state. The door's Already checked in floods `--accent-soft`, the same mint as `st-in` in light and in dark a green-tinted neutral 1.27:1 off the field, so a repeat scan never reads as a second Checked in.

**Teams** are data: always a chip plus the written name ("You’re on Teal"), 3:1 or more as a chip on page, well and card in both themes. `.group--<color>` (the name `live.groups` gives) sets `--c` for the chip and `--group` / `--group-text` for older parts; words on a team color use `--on-team` (`--on-team-yellow` on yellow), 4.5:1 or more.

| Team | Light | Dark | Team | Light | Dark |
|---|---|---|---|---|---|
| Red | `#c5221f` | `#ff8a80` | Teal | `#0e7c8a` | `#4cc9d8` |
| Yellow | `#a66f00` | `#f2c14e` | Brown | `#8a5a2b` | `#d8a673` |
| Green | `#188038` | `#7fd492` | Gray | `#646b76` | `#aeb4be` |
| Orange | `#c25400` | `#ff9a4d` | Navy | `#1e3a8a` | `#a9b8ff` |
| Purple | `#8430ce` | `#c39bff` | Lime | `#4d7c0f` | `#b5e06b` |
| Pink | `#c2185b` | `#ff8abf` | Blue | `#2a5bd7` | `#6fc3ff` |

Yellow and Blue sit off the licensed GDG yellow and Google's product blue, and Lime is a hex that passes 3:1.

**Color rules:**

- Green marks one job per screen: the color field, or one filled button plus the current tab rule plus one number. Row actions, links in rows, counts that aren't the live one and `+0` stay neutral. Green never decorates and never repeats on every row: extra credit is neutral text, only "Shared with students" (what students see) is green on a row, and a new row tints `st-in`, never `--accent`.
- One green per object: a right-answer row on a laptop is the green bar and the words "Right answer" in `--st-in-mark` 500, with no row tint, ring or chip.
- One full-strength green mass per screen: the color field, or one filled green button, or the one green numeral, never two side by side. With the field on screen (phone checked-in, phone quiz, the stage poll) there is no filled green button: the main action is `.btn--raised` (or `.btn--neutral` in an action bar). On host quiz-ended the green 62% is the mass, so Draft with AI and Write my own are both outline. After results the one green is the right answer.
- Green stays off secondary actions and navigation: bar links that aren't the current tab are `--muted` 500; a secondary action is `.btn--outline`, never a green tint, and never tonal beside a primary. In-row controls (+1 / −1) are 32 outline icon buttons, never filled.
- Red means failed or can't be undone, filled only inside a confirm. The late banner is `--warn`, not red.
- Hex first. `color-mix()` only inside `@supports`, for hover fills.

### Type

Google Sans for words, Google Sans Code for codes. Weights 400 (sentences), 500 (headings, labels, buttons), 700 (the one thing to read first in a card, and numerals). Ligatures off everywhere (Google Sans turns a few typed strings into the Google logo). `text-wrap: balance` on headings only.

| Role | Token | Size | Use |
|---|---|---|---|
| Display | `--t-display`, `.headline` | 32 / 700 | The phone's state headline ("You’re checked in.") |
| Title | `--t-h1`, `.title` | 28 / 500 | Page title, the slide title on the phone's slide card |
| Question | `--t-h2`, `.question` | 24 / 700 | The poll question, phone and host |
| Card title | `--t-h3`, `.card-title` | 18 / 500 | Card and section heads |
| Choice | `--t-choice` | 19 / 500 | Answer tile words |
| Body | `--t-body` | 17 / 400 | Sentences |
| Small | `--t-small`, `.small` | 15 | Hints, meta, table cells; on laptops also readout labels, table heads, row meta and the whoami line (15 / 500) |
| Label | `--t-label`, `.label` | 15 / 500 | Buttons, field names |
| Ledger | `--t-ledger`, `.t-ledger` | 13 / 500 | Badges and chips only (laptop) |

The older roles (`--fs-h1` to `--fs-ledger`, `.text-h1` to `.text-label`, `.ledger`) keep working; new screens use the table above.

**Numerals:** one role, `.num`: 700, `tabular-nums lining-nums`, line-height 1, right-aligned in columns.

| Token | Size | Use |
|---|---|---|
| `--n-hero`, `.n-hero` | 96 | The one live number on a laptop screen ("14 of 38" answered); "of 38" at `--t-h1` in `--muted` |
| `--n-lg`, `.n-lg` | 48 | The one lead readout when no live number is on screen (Got it right 62% after a quiz ends; Checked in 38 on attendance) |
| `--n-md`, `.n-md` | 32 | Readouts beside a lead one, the room count on the slide track |
| `--n-sm`, `.n-sm` | 20 | Bar values, upvotes, table numbers |

- One display-size number per screen; every other number sits at least one step under it. Times of day ("Class started 2:28 PM") are never at a display size: `--n-md` at most. Check it in the shot, not only the CSS.
- No stat-tile openers. A row of equal boxes, each a small label over a big number, is the default dashboard opener. The one lead number sits in its card's hero slot, which holds its size and position across states (host quiz-open shows Answered 14 there, quiz-ended Got it right 62%, both at `--n-hero`), and the other counts join one line under it at `--t-body` `--muted` (`.tally`: "21 of 38 answered · median 18 s"). Counts never repeat on one screen.
- Where readouts still share a row (`.readouts`: the kiosk bar, the stage leader): at most two numeral sizes (the lead `.readout--lead` in slot 1, the rest `--n-md`); one baseline (every cell the same two-row grid, the label line 20 tall); a readout keeps its size in every state; the row's numbers outrank its words; the row stretches to the part under it.
- A unit after a numeral at `--n-lg` or larger ("%", "PM") is `.num__unit`: 0.55em, 500, on the numeral's baseline. Display numerals take `letter-spacing: -0.02em` (-0.03em at 160 stage px and up).
- Codes ("482 913"): `.code` in Google Sans Code 500, two groups of 3 with `.code__gap`, `user-select: all`. A shot of a code waits for `document.fonts.load('700 40px "Google Sans Code"')`, or the code draws in a fallback face.

### Space, size and shape

- Space: `--s1` to `--s24` in 4px steps (4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 96). Nothing off the ladder.
- Page margin: phone 16 (8 around a field, 16 inside it); laptop 48 at 1366 and up, 32 from 1024 to 1365 (`--page-margin`); kiosk 24 (`--k-gutter`); projector 96 stage px.
- Targets: phone and iPad 44 x 44 (`--tap`), answer tiles 72 tall 12 apart, kiosk buttons 56 to 72; laptop `.btn--sm` 32 with 8px gaps.
- Laptop: bar 56 (`--bar-h`), rows 44 (`--row-h`), the right column 400 (`--aside-w`, 360 under 1366), content max 1344.
- Radius: GDG's scale 4 / 8 / 12 / 16 / 24 / full (`--r-xs` to `--r-full`), nested (inner = outer minus padding). Wells, fields, focal cards and sheets 24; cards and tiles 16; a table well 12 with an 8 head; inputs 8; badges, chips and letter tiles 4; buttons, tabs and switches full.
- Lines: select ring 3px; focus 3px; failed-tile ring 3px; projector rules 6 stage px (between ledger rows, never down an edge). No colored stripe or rail down the edge of anything: a state is carried by its fill step, its glyph and its words; a selected row by its rung. Never an inset `box-shadow` or `border-top` on a radius, which tapers into a crescent.

### Alignment and space

- **One text edge per column.** The bar title, section heads outside cards and the text inside cards start at one x. Phone: page margin 16 and card padding 16, so text sits at 32 and heads outside cards indent to 32. A card in the same slot keeps the same padding on every tab (host: every focal card `var(--s6) var(--s8)`).
- **Slots hold their size across states.** A part's box never changes between states of one screen: the host slide track has a fixed height and columns, the stage card one height, the pass's QR slot keeps the old QR at 0.35 opacity while a new code loads, the door panel one geometry.
- **No dead space.** No `1fr` spacer rows and no vertical centering inside tall cards; a card's height comes from its content. Grep for the causes before shooting: `margin-top: auto` or `margin-block: auto` on a content block, `justify-content: center | flex-end | space-between` on a page or body column, a `1fr` row holding a card, `height: 100%` or `align-self: stretch` on a card, a footer pinned with `margin-top: auto`.
  - A two-column laptop grid uses `align-items: start`, so each card ends at its content. Only a list that scrolls inside its card stretches.
  - A phone object is top-anchored `--s4` under the bar, never centered and never pushed to the bottom; its footer rows follow it (gap `--s6`), and the action bar holds only the screen's action. Empty page under the last row is fine; empty page above the object never is. No empty band over 25% of a phone viewport. The one exception is the open quiz: its green field fills the body (phone layout).
  - The scroll area ends above the action bar, so the last row ends whole.
  - On a screen whose states follow each other in front of the professor (host Now), the main card and the aside keep one split in every state, so nothing jumps sideways when a question ends. A side well that waits for data ends at its content (`min-height` 96, its line top-aligned at `--s4`), never stretched to its neighbour's height. Screens that never switch state in place drop an empty column.
  - A laptop page with little content (the staff gate) is top-aligned at 96, never centered in the window.
- **Lists never cut a row in half.** A list that scrolls inside a card ends on a whole row or a raised `.rows__more` ("N more") row.
- **Grid tracks shrink.** Laptop grids use `minmax(0, …)` tracks and `min-width: 0` on cards, and a table in a fixed aside uses `table-layout: fixed`.
- **Paired values share one grid** (`.pairs`, `.stub__times`): labels in row 1, values in row 2, one type role per row, `align-items: last baseline` on the values. Emphasis is color, never a size or weight change inside the set. A rank beside a two-line name sits on the name's first baseline.
- **A text link beside a label-over-title block sits on the title's last baseline** (`.sec-head`), with a `flex-end` fallback for iOS under 16.2; it takes its 44 target from symmetric `padding-block`; icon-only buttons center on the block; at 320 the link wraps under the title.
- **A glyph before a heading or sentence hangs** (`.hang`): the glyph in a 24 column on the first line, every wrapped line starting at the text column. No `max-width` or `text-wrap: balance` on a sentence or error heading that has room.
- **One part keeps its geometry across states.** The results `.barrow` keeps `.choice`'s padding and gap, so the letter keeps its x from open to results; a slide card keeps its padding and title role when a question opens; an in-row confirm keeps the row's columns.
- **An action keeps one form and one slot across states.** The card's main action lives in the card's header-row right edge in draft, open and ended; Cancel is `.btn--plain` right of the primary; the phone quiz field's footer is one inline glyph-and-words line in Sending, Sent and retry. A loading state draws the loaded layout's every slot at its loaded size, with its controls in the disabled look.
- **One part, one size.** The team swatch is `.team__chip` 16 x 16 at radius 4 with an inset ink edge, everywhere but the stage (which scales it by font-size) and the host leader lockup (a bar 16 wide and the word's cap height tall, on its baseline). The letter tile is 44 x 44 at radius 4 at the same x in quiz, sent and results. Card padding is one value per surface.

### Motion tokens

| Token | Value | Track |
|---|---|---|
| `--fx-fast`, `--fx`, `--fx-slow` | 90, 140, 220ms | Effects: color and opacity, never overshoot |
| `--sp-fast`, `--sp`, `--sp-slow` | 200, 320, 480ms | Spatial: transform, may overshoot mildly; 0 under reduced motion |
| `--ease` | `cubic-bezier(0.2, 0, 0, 1)` | Standard |
| `--ease-sp` | `cubic-bezier(0.34, 1.28, 0.64, 1)`; GDG's sampled spring with `linear()` where the browser has it (Safari 17.2+) | Spatial: the phone's answer tap and the switch knob only |
| `--ease-exit` | `cubic-bezier(0.4, 0, 1, 1)` | Leaving |
| `--ease-arrive` | `cubic-bezier(0.16, 1, 0.3, 1)` | A word or name rising through its mask (the door's result, the staff scan result, the phone's checked-in lockup, the late lower third). Words only: on a bar it ends 90% of the growth by 120ms and hides it |
| `--ease-sheet` | `cubic-bezier(0.32, 0.72, 0, 1)` | The phone's bottom sheet only |
| `--hold-result`, `--hold-new` | 3000, 4000ms | A kiosk result before idle; a new row's tint |

Scripted motion (a FLIP, a WAAPI animation) asks `calm()` (`src/blocks/kit.tsx`) each time it is about to move something: it reads `prefers-reduced-motion: reduce` then, so a setting changed while the page is open counts on the next move. When it says true, jump to the end state, with the words and fills still changing. `onCalmChange(fn)` hears the setting change and returns the function that stops it. CSS moves need neither: the `--sp*` tokens are already 0 under reduced motion.

### Projector sizes

`--stage-u` is one stage px at 1920 x 1080 (`min(100vw / 1920, 100vh / 1080)`), so a 1280 x 720 window shows the same layout at 2/3. The `--p-*` sizes are declared again on `[data-surface]`, so a preview that sets its own `--stage-u` gets its own sizes.

| Token | Stage px | Use |
|---|---|---|
| `--p-count` | 240 | The stage count, the one number |
| `--p-rank` | 160 | Anything read alone (1st place) |
| `--p-head` | 92 | Titles, the leader's team name |
| `--p-q` | 64 | The stage question and the leaderboard title |
| `--p-body` | 48 | Body, leaderboard rows |
| `--p-small` | 40 | The floor for a sentence |
| `--p-ledger` | 32 | The floor for any text: column heads, readout labels |
| `--p-margin`, `--p-rule`, `--p-radius`, `--p-ring` | 96, 6, 24, 4 | Frame, rules, corners, the poll card's ring |
| `--p-card` | 600 | The check-in card's width |

The older `--proj-*` sizes (`Projector`, the stage and board stylesheets) keep working.

### Kiosk sizes

`--k-u` is 1px on the iPad (#/ui sets 0.7 to preview), and the `--k-*` sizes are declared again on `[data-surface]`.

| Token | px | Use |
|---|---|---|
| `--k-status` | 96 | The status word ("Checked in") |
| `--k-name` | 80 | The student's name, in a fixed slot under the word |
| `--k-prompt` | 48 | "Hold your pass up to the camera" |
| `--k-code` | 144 | The pairing code in Google Sans Code |
| `--k-label` | 18 | Labels; the iPad's floor is 16 |
| `--k-door` | 432 | The door panel's status band, the same in every state |
| `--k-btn`, `--k-gutter` | 72, 24 | Start check-in; the one gutter on every kiosk screen |

## Surfaces and elevation

Depth comes from tone: four rungs, one focal shadow, one overlay. Shadows are tinted with `--ink`, two layers at most, never animated, never on the projector.

| Rung | Class | Light | Dark | Use |
|---|---|---|---|---|
| Sunken | `.well` | `--well` | darker than the page | Groups rows, tables, readouts. Radius 24, padding 12 |
| Page | `body` | `--page` | `--page` | The ground |
| Raised | `.card`, `.panel` (`Card`), a table head | `--raised`, an 8% ink ring | `--raised` + `--hl` | Content. A non-focal card keeps its edge with the ring, never a `--line` hairline |
| Focal | `.focal`, `.hcard` | `--focal-fill` + `--shadow-1`, radius 24 | the same, + `--hl` | The one thing per screen: Ask the room, Questions from students, Pair a door iPad, the door's idle panel |
| Bar | `.bar`, `.k-bar`, `.phone-actions` | `--chrome` + `--shadow-bar` | `--chrome` + `--hl` | The sticky bars: one rung above the page in both themes. Solid, no blur |
| Overlay | `.sheet` on `.scrim` | `--overlay` + `--shadow-2` | the same | Confirms, menus, the sign-in card |
| Field | `.color-field` | `--field` solid, no shadow | `#025620` | A live or done state for a student or the room |

- One `.focal` per screen. If two things want it, the screen has two first things; pick one. The focal card is marked by its rung and by what it holds, never by a green rule.
- **One raised object per screen; everything else sits flat.** On the phone, other groups are ruled rows on the page under a `--t-h3` heading (no fill, no radius, a 1px rule between rows, text on the 32 edge), or a `--well` inset for a single checkbox row. On host and staff, side panels are `--well` panels with no shadow. The focal object is never on a lower rung than its neighbour.
- **At most one level of nesting inside a card.** Count rounded surfaces from the page in: more than two (card, then a plate or a row fill) is a fault. Answer tiles are tiles only where a thumb taps them; results and host bars are rows.
- **Tables sit in a well, everything else on its card.** Every host and staff table (Points teams, Who got it wrong, This class, Past classes, People, Changes) sits in a `--well` inset 4 on all sides (radius 12) with a `--raised` head (radius 8, 40 tall), inside a card or on the page; rows sit flat on the well under it, so the head is always ringed by the well's grey. A chart (the A to D bars), the QR, the phone's lists and the host Questions list sit straight on their card or page, no well.
- Every edge is a fill step or a deliberate ring (`--line-strong`, a state mark, the 3px select ring), never `--line` alone. A standalone card on the page is the focal rung, never a white card with a hairline.
- In dark, the focal card still reads one rung up without its words: dark `--shadow-1` is deep, and `--focal-fill` steps one rung over `--raised`.
- Things on the field step up in the field's hue, never down: a tile, button or inset card is `--field-tile` with `--hl`.
- Hover and press swap the fill one rung. Nothing lifts.
- The farther the reader, the bigger the field: phone and projector get full fields, the door a flooded panel, host and staff no field at all.
- Projector: no shadows. Separate by tone and 6 stage px rules.
- `prefers-contrast: more` turns every raised and sunken edge into a 2px `--line-strong` ring.

## Base elements

What bare HTML and the helpers get (`src/index.css`):

- **Focus:** a 3px `--focus` outline, 2px clear (3px on the kiosk and projector, set by `[data-surface]`). On the green field the ring turns `--on-field`. Never removed.
- **Links:** `--accent`, underlined 3px below. A text action outside a sentence is `.link` instead (The kit).
- **Headings:** 500, balanced. The page's h1 is often the bar title; the loudest thing on a screen is the state or the live number, never the page title.
- **Buttons:** a bare `<button>` and a bare `.btn` are the primary, 44 tall, full radius; the kit adds every other look and the disabled and busy states.
- **Fields:** 44 tall, 16px or more (iOS Safari zooms smaller ones), a 1px `--line-strong` edge; a label around a checkbox or radio is the 44 target with its words beside the box.
- **Helpers:** `.stack` (a column, `--gap`, 12 by default), `.cluster` (a wrapping row, `--gap`, 8 by default), `.spread`, `.row` (a wrapping row, 12 apart), `.page` and `.page--wide`, `.desk` (main plus a 400 aside, in the kit), `.muted`, `.small`, `.nowrap`, `.measure` (62ch), `.sr-only`, `.ledger`.
- **Icons:** `.icon`, inline SVG, Phosphor Bold geometry (a 256 grid, stroke 24, round caps and joins, no fills), `currentColor`, `aria-hidden`. The kit's `Icon` draws them by hand to that construction. One meaning per glyph: the lock means "can't change" only; Sent is the check; signed out has no glyph. No Material Symbols.
- **Overflow:** `overflow-wrap: break-word` on the page (never `anywhere` on the body, which shrinks grid cells to one letter); `.trunc` for emails in tables (with a `title`); dates `nowrap`.

## The kit

Each part: its class, its React part (`src/blocks/kit.tsx` unless named), its states. Every older export keeps its props; the parts and props below marked **new** came with the design system.

### Button (`.btn`, `Button`)

```tsx
<Button onClick={checkIn}>Check in</Button>
<Button variant="secondary" size="sm" onClick={download}>Download CSV</Button>
<Button busy={saving} onClick={save}>Save</Button>
```

Looks (`variant`, typed `ButtonLook`; `ButtonVariant` is the first four): `primary` (one per screen), `secondary` / `outline` (the same outlined look), `quiet` (green words), `plain` (neutral words: Cancel, Sign out), `tonal` (a quiet action with no primary nearby), **new** `neutral` (a fill one rung off its bar: I'm lost where the field or the right answer holds the green), **new** `raised` (the main action when the green field is on screen: `--raised`, `--shadow-1`, `--text` 500 words), `danger` (inside a confirm only), `danger-quiet` (red words: Delete in a row), `on-field` (the white button on a field), `ghost` (laptop row actions: Keep, Dismiss, Delete, Remove, Unpair). Sizes: base 44; **new** `size="lg"` 56 (the phone's main action, End the quiz); `size="sm"` or `small` 32 (laptop only); `block`; `className="btn--icon"` for an icon button (give it an `aria-label`).

- Every button is full radius. One outline per surface: 2px `--line-strong` on phone and iPad, 1px on laptop, never paler.
- **Disabled keeps its footprint as a fill step:** every look draws disabled the same way, on the neutral fill (`--neutral-btn`; `--tile-out` on a field), no ring, `--muted` words (4.5:1 or more), the same size, radius and slot, `aria-disabled`, and the reason line (`.btn-why`) where one exists. Never a paler ring, never opacity, never bare text.
- **Busy** (`aria-busy`): the words keep their place, a spinner in the button's own word color shows over them after 0.4s, the width holds, presses are ignored. It is the only spinner in the app; under reduced motion it is a still clock glyph.
- Ghost row actions: `--muted` words at 32, 8 apart, no ring at rest; the `--line-strong` ring shows on hover and keyboard focus. A destructive one keeps red words and sits 16 after the others.
- Hover swaps the fill one rung.

### Text link (`.link`)

Every text action outside a sentence (Show slide, See all teams, "5 more", Ask the AI after a quiz, Sign out): `--text` at 500, a full target (44 tall on phone and iPad; `.link--sm` 32 on laptop), a chevron only when it opens something, underlined on hover and focus. Never green: green stays on the field, the one primary and the right answer. `.link--plain` is underlined at rest. Links inside a sentence keep `--accent`. Page links in a bar that aren't the current page are `--muted`.

### Field (`.field` / `.fld`, `Field`)

```tsx
<Field label="Email" hint="The one you check in with" error={emailError}>
  {(f) => <input {...f} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />}
</Field>
```

Label, then hint, then error, then the control, 4 apart: the error sits above a phone's keyboard, and a screen reader hears both with the field (`aria-describedby`, `aria-invalid`). The error is the `st-stop` fill with its warning glyph hanging before the words; an invalid control gets a 2px `--st-stop-mark` edge. Disabled steps down to the `--well` fill with muted words and no edge. `.input`, `.textarea`, `.select` (its chevron on `.select-wrap`, so the fill stays plain), `.input--code` for codes, `.counter-hint` for "51/280", `.select--sm` for table cells, `.join` for a field and its button joined into one pill.

### Check row, radio, switch, role picker (`.checkrow`, `.radio`, `.switch`, `Switch`, `.rolepick`)

The whole 48 row is a check row's target; the box is 24 with a drawn check. **new** `Switch` is a `<button role="switch">` with its knob on the spatial track, for one setting that applies at once; where it picks between options, use `Segmented`. A choice that needs a sentence per option (a staff role) is `.rolepick`: ruled radio rows, a 16 square tick box in `--accent` when picked, the word, the sentence (`.rolepick__say`), 44 tall, the focus ring on the row.

### Tabs (`.tabs__list`, `.tabs__tab`, `Tabs`)

```tsx
<Tabs label="Attendance" value={tab} onChange={setTab} tabs={[
  { id: "today", label: "This class", panel: <ThisClass /> },
  { id: "past", label: "Past classes", panel: <PastClasses /> },
]} />
```

Page sections: words plus a 3px green rule under the chosen tab (`aria-selected`; a page link in a bar marks its page with `aria-current="page"`), the chosen tab's words in `--text`. In a bar the row is the bar's height. A tab's count is a plain numeral after its label (`.tabs__n`, "Questions 12"). Left and right arrows, Home and End move between tabs. Only the open panel is rendered, so a half-typed form in a closed tab is lost: #/host keeps its own tab bar with the same classes for that reason (Professor laptop, below). Leave out `value` and `onChange` and the first tab starts open. Panels switch instantly. The whoami line in a bar is the name only (`--muted`, the email in its `title`), and Sign out is a `.link`, so the current tab rule is the one marked thing in the bar.

### Segmented (`.seg`, `Segmented`)

```tsx
<Segmented label="Team size" value={size} onChange={setSize}
  options={[{ value: "3", label: "3" }, { value: "4", label: "4" }]} />
```

A 2 or 3 option switch (Quiz / Vote, Teams of 3 / 4, Most upvoted / Group by topic) is text options on the line: the chosen one `--text` 700 over a 2px `--text` underline, the others `--muted` 500, 20 apart. No track, no fill, no check glyph, no pill. Real radio buttons, so arrow keys and screen readers work; 44 tall by default, `.seg--sm` 32 on a laptop card head. `block` spreads the options; `hideLabel` keeps the label for screen readers only. `.seg__item` is the same look on a `<button role="radio">`.

### Badge and state chips (`.badge`, `Badge`, `StateChip`)

`<Badge tone="warn">5 min late</Badge>`, **new** `<StateChip tone="in" glyph="check">Paired</StateChip>`. A chip only for a state that differs between items in one list and that the reader acts on (Kept or Shared with students, Paired, Late, Permanent). Radius 4, sized to its content, never pressed, one per row. `Badge` keeps its tones (`neutral`, `accent`, `live`, `warn`, `error`; `accent`, `warn` and `error` draw as the `in`, `open` and `stop` states). `StateChip` takes the state tones, `in` (Shared with students, Paired, Added, This class), `open` (Private, 4 min late), `stop` (Refused), `wait` (Ended, Dismissed) and `quiet` (AI draft), and a `glyph` that repeats the meaning: check (Kept, Paired), eye (Shared with students), lock (Private, Permanent), clock (late), x (Refused), repeat (Ended). Everything else is words:

- No Live badge anywhere: the student is always on the live slide. Show the state only when it is false ("Slide 2 of 12 · Professor is on 4" in `--muted`). The `live` tone draws as a green word.
- Open or Ended is one state word beside the heading (`.stateword--open` in `--st-in-mark`, `--ended` in `--muted`), no fill, no dot.
- Type and source facts (Quiz, AI draft) are one `--t-small` `--muted` meta line under the heading (`.facts`).
- "Right answer" and "Your answer" are plain words on the row's label line, never a chip.
- Place and rank are bare tabular numerals in a fixed column ("2nd", then "tied" in `--muted`), never a pill. A place that a page already draws with `Badge` takes **new** `tone="place"`: no fill and no chip edge, `--t-body` 700, tabular, the drawing of `.ln--place` and the Students table's place cell.

### Team (`.team`, `.team__chip`, `.teamline`, `.credit`, `TeamChip`)

**new** `<TeamChip color={g.color} label={g.label} />`: the chip and the written name, always together. `.teamline` is the one treatment for "You’re on Purple" (the chip and the words, no pill, no stroke); `.credit` for extra credit ("+5", 700); `+0` is plain neutral words.

### Banner (`.banner`, `Banner`, `BannerStack`)

```tsx
<Banner tone="error" title="The quiz didn't load." action={<Button variant="secondary" onClick={retry}>Try again</Button>}>
  Check the connection.
</Banner>
```

Tones `info`, `success`, `warn`, `error`: the state's fill, a 20 glyph in its mark color, the title, one line and one action at the end; no strip, no border. An error banner is announced at once (`role="alert"`), the others when they change (`role="status"`). **new** `bar` pins it full width under the app bar (the sign-in ending, Google's button at its end). **new** `inset` is the card for an error on the green field or the stage card: a solid `--field-tile` card, the warning glyph its only red, never a red fill on green. Inside a banner, links, `.muted` words and outlined or quiet buttons take the banner's ink; a filled `<a className="btn">` keeps its own words. `BannerStack` pins banners to the bottom of the screen above the iPhone home bar (the sign-in warning, `SignInEnding`); while it shows, the page pads its bottom by the stack's height so the last button scrolls up above it, and the late banner sits above it (`src/blocks/stackSpace.ts`).

### Notice (`.notice`, `Notice`)

**new** `<Notice>The server didn’t accept that sign-in.</Notice>`: an error or warning with no part of its own to sit in. The `st-stop` (or `--warn`: `st-open`, `--plain`: `--well`) fill, no border or ring, radius 12, a 20 glyph hanging in a 24 column, words at `--t-body`, `text-wrap: pretty`, an optional action under the words. Never on the green field (there the footer line says it). `Status kind="error"` draws the same notice. Where the message stands in for a region's content, it takes that content's slot instead (States).

### Readouts and numbers (`.readout`, `.readouts`, `.tally`, `.num`, `.roomn`, `Stat`, `Big`)

Label above, numeral below, the one way a number is labeled on host, staff and kiosk; labels at `--t-small` 500. `Stat` keeps its props and draws a readout (`accent` is the lead, at `--n-lg`). `.tally` is the count sentence (one lead numeral, the rest in one line on its baseline). `.roomn` is the room count ("38 checked in") on every surface. `Big` keeps its props: the one number read from across a room; inside `Projector` it is the 240 stage count. Loading: a fixed-width `.skel--num` 1em of its role tall, so nothing jumps when data lands.

### Slide track (`.track`, `SlideTrack`)

**new** `<SlideTrack counts={lost} at={slide} where={...} label="Lost" end={<Room />} />`: the host's lecture timeline. One fixed-height row (88): where the lecture is ("Slide 4 of 12" over the title at `--t-h3`), then a lane of equal segments (8 tall, radius 4, gap 4), the current one filled `--text` and the others `--line-strong`; every count is one size (24, 700, tabular) centered over its segment on one baseline; a past slide with no taps prints a `--muted` "0" and a slide not reached prints nothing, so "no taps" and "not reached" differ; the current slide is its filled segment and bold slide number, never a bigger count; the label once at the left on the counts' baseline; the room count at the right end, on the page margin.

### Empty, error and loading in place (`.state`, `.state--inline`, `.state--error`, `.loading-line`, `EmptyState`, `Status`)

An empty or error state draws the part it stands in for, empty: its frame, heading and action slot stay. Empty, loading and error of one region look different at a glance: the empty one is a sentence with its action, the loading one still blocks, the error one a glyph with Try again.

- `EmptyState` is the heading, the sentence and the one action, top-aligned in its region, never an icon in a circle over a centered line:

  `<EmptyState title="No questions yet" action={...}>Students ask from the Live slides page on their phones.</EmptyState>`

  Say what will show up and how it gets there, naming the page people see (its title), never a #/ route.
- A side panel or a table with nothing yet is one `.state--inline` line on the well (a `--t-small` sentence), the same in every waiting state, error included. No ghost rows under a message; a table whose rows are known but whose values aren't keeps its rows with still blocks in the value cells.
- An error never shows a placeholder for the value it failed to load: the warning glyph at 24 in `--st-stop-mark` and the app's sentence ("The question didn't load.") take the failed content's slot in its type role in `--text`, and Try again takes the action slot (`.state--error`). No filled pink box, no red heading. A message with no slot of its own is a `Notice`.
- `ErrorBoundary`'s line for a part that didn't load (`.row > .status--error + .btn--quiet`, markup pinned by `src/blocks/ui.test.ts`) follows the same rule on every surface: no fill, the red glyph hanging at the row's edge, the sentence in `--text`, and Try again drawn as the outline button (1px ring on a laptop, 2px on phone and iPad, `--p-ring` on the projector). Each area's stylesheet puts the line in the frame of the part it stands in for (the host's focal card or aside well, the stage's presenter note).
- No seal disc (a glyph in a circle) on phone, host or staff: the state glyph sits inline before its headline at 24 to 32. The door's result row is the only place a glyph stands alone.

### Skeleton (`.skel`, `.skel-lines`, `Skeleton`)

The real layout's shape, still, with the step named ("Loading the scores…") and `aria-busy`. Each value that will arrive is a still solid block: `--skel-fill`, radius 4, the cap height of the line it stands for (12 for body text, 1em of its `--n-*` role for numbers), the typical value's width. Known parts render for real: labels, column heads, ranks, letter tiles. A body the loaded part fills with lines gets three 12-tall blocks at 90 / 78 / 64% (`.skel-lines`, `Skeleton`) inside the loaded card's `min-height`. Never a shimmer, never en dashes standing in for values. Actions in a loading state take the disabled look. AI drafting: a 2px `--accent` rule across the top of the rows (`.loadrule`), grown once.

### Confirm (`.confirm`, `.sheet`, `.scrim`, `ConfirmButton`)

```tsx
<ConfirmButton question="End class for today?" confirm="End class" onConfirm={() => endClass({ channel })}>
  End class
</ConfirmButton>
```

The first press asks the question with two buttons; Cancel or Escape goes back and focus returns to the first button. The box rises to the overlay rung in place (`--overlay`, `--shadow-2`, radius 12); its question starts with the warning glyph in `--st-stop-mark`; the confirming button is the only red fill. **new** `overlay` opens it as a sheet centered on the scrim instead, for a confirm that ends something for everyone (End class, Delete a question from every phone). The box closes when `onConfirm` finishes. When it throws, the box stays open and shows the error under the question: a `ConvexError`'s words ("That class already ended."), or "Something went wrong. Try again." Pass `onError` to show it on the page instead. Don't catch and rethrow inside `onConfirm`. `variant` is `danger` (default) or `primary`. **new** `openerVariant` draws the first button in another look while the confirming button keeps `variant`, so red fills only inside the confirm: End class beside Download extra credit is `openerVariant="outline"`, a row's Remove or Unpair `openerVariant="ghost"`. Left out, the first button takes `variant`, as before. In a table, the in-row confirm is a `Row confirm` that keeps the row's columns.

### Rows and tables (`.ruled`, `.ruled__head`, `.ruled__row`, `.rows`, `.table`, `Rows`, `Row`)

**new** `Rows` and `Row`:

```tsx
<Rows head={["Name", "Checked in", <span className="end">Late</span>]} cols="minmax(0, 1fr) 96px 64px">
  <Row><span>Ana</span><span>2:27 PM</span><span className="end">0</span></Row>
</Rows>
```

A laptop table sits in a `--well` inset 4 (radius 12) with a `--raised` head (radius 8, 40 tall, `--t-small` 500 `--muted`); rows sit flat on the well, `--row-h` 44, a 1px `--line` rule between them, every cell on its head's column edges, numbers right-aligned under right-aligned heads (`.end`). `well={false}` puts the list straight on its card (a chart): a transparent head over a 2px `--line-strong` rule. Every body row has the same fill (no zebra). The selected row (`selected`) is a fill step in the same columns (`--raised` in a well, `--on-raised` on a card), no shadow, no ring, no overhang; a row just added (`fresh`) tints `st-in` for `--hold-new`; the in-row confirm (`confirm`) rises to the overlay. A place cell is one line ("2nd" then "tied", `nowrap`), every cell on the row's first baseline. `.rows > .row` is the same part for a list of items (questions, people) with `.row__main`, `.row__text`, `.row__meta`, `.row__time` and `.row__actions` in one fixed right column; `.answer` is the professor's answer under a question ("Answer:" then the words, on `--well`; inside a raised card it steps up on `--on-raised`, so in dark it never reads as a hole in the card). `.table` draws a real `<table>` the same way.

- Row actions with one or two per row (−1 / +1, Remove, Unpair) show on every row. In a list where each row carries three or more (host Questions), the full set shows on the selected row and appears on hover and keyboard focus in the same fixed column without changing the row's height (`.rows--reveal`); other rows show their state mark in the first slot. Undo is a 32 `.btn--plain`, never bare text.
- Delete is a ghost with `--error` words 16 after the others and opens the in-row confirm; dismissed rows are muted with Bring back.

### Answer choices (`.choice`, `.letter`, `.lockline`, `Choice`)

**new** `<Choice letter="B" state="sent" word={<><Icon name="check" />Sent</>}>Current</Choice>`: A to D tiles: the tile, its letter tile and the full words, 72 tall, the same letter on phone, host and stage. On the field by default (`--field-tile`, no border or ring in either theme, open state included); `onPage` draws it on the page.

- The letter tile is one drawing, 44 x 44, radius 4: `--bar` off the field, `--field-letter` on it, `--on-raised` inside a card, `--raised` on a well. It never inverts; only the right answer fills it `--accent` with the check.
- Picked and sent: the tile keeps its fill and letter; a 3px ring inset 2px from the edge (`--text`) and the state word ("Picked", "Sending", "Sent", "Try again" at `--t-body` 500 with an 18 glyph) mark it. Failed: the same inset ring in `--st-stop-mark`, so red never meets the green and the ring never moves between picked, sent and failed. Sending: a 3px `--accent` bar grows once along the tile's bottom inside edge (the clock glyph under reduced motion); never a ring spinner on a tile.
- Out after sending: a solid `--tile-out` fill with full-strength words, never opacity. Right: the `st-in` fill and ring and the check. A sent pick is a disabled button too, but the field's disabled fill skips it (`.is-picked`, `aria-pressed`), so it keeps `--field-tile`, its words and its letter well under the ring.
- One glyph size inside the field, 20. `.lockline` says the rule ("Answer sent. Results show when the professor ends the quiz."), only after a choice is sent. The open field starts with the question, no "Question" eyebrow.
- The field's height holds from Sending to Sent: the state word sits in one 5.25em column at the tile's end, so the tile's words wrap the same way under "Sending" and "Sent", and while a tile sends the field keeps the footer line's two lines (2 x 24) where the footer lands. At 320 wide the quiz footer takes three lines, so one line still arrives with it.

### Bars (`.bars`, `.barrow`, `.rbars`, `Bars`)

**new** `<Bars bars={[{ letter: "A", label: "Charge", count: 19, right: true, tag: "Right answer" }]} />`: one bar chart for phone results, host and stage. Each row: the letter tile, the words with their tag on the label line, the track on line 2, and the count (`--n-sm` 700) and percent (`--t-small` 500 `--muted`) on the label line in two right-aligned tabular columns, so the counts make one right edge down the chart (on the phone too). Tracks are 12 tall with 2px ends, on `--track` (`--on-raised` inside a card); any value above 0 draws at least 2px. While a poll is open no bar is green: the leading row (`lead`) fills `--text` with its label at 700, the rest `--bar-rest`. After it ends the right answer fills `--accent` with the check on its letter and the words "Right answer"; every other bar is `--bar-rest`. Where the right answer is the screen's first thing (phone results `hero`, the stage) it also takes the `st-in` fill and ring (6 stage px on the stage). "Yours" after results is words: "Your answer" on the label line and a 2px `--line-strong` ring; the right row's green ring always wins. `stage` sizes the part for the projector by font-size. `.rbars` is the same chart as ruled rows (host, staff), columns 44 / the words / 40 + 48.

### QR (`.qrcode`, `QR`)

`QR` (`src/blocks/qr.tsx`) draws black modules on white with a 4-module quiet zone of the same white, in both themes, with `role="img"` and a name ("QR code" unless `alt` names it; `aria-hidden` when `label` captions it). The kit's plate (`.qrcode`, and `.qr` inside `.pass` and `.stage-card`) is the white plate, radius 12, no ring, no well, its padding the quiet zone only. Never a QR light on dark (the door's reader reads dark on light only), never under a filter or dimming overlay while it is meant to scan (the 0.35 faded old code isn't). Phone 280 (240 at 320 wide), stage 536. Waiting: the same square on `--bar` with the step named (`.qr--wait`, "Getting a new code…"). A signed-out pass draws no QR placeholder at all.

### Camera well (`.cam`, `.cam__corners`)

`--cam` ground, still corner marks that turn `--cam-mark-ok` on a read (effects track). The marks' svg draws past its own edge (`overflow: visible`), so a round-capped stroke shows whole, the same drawing as the door's `.target`. Camera errors show inside the well (`.cam__msg`), so the layout holds; `.cam--off` is the idle well on `--well`.

### Late banner (`.late`, `.late__item`)

`LateBanner` (`src/teams/checkin/LateBanner.tsx`) shows each arrival as one `.late__item` strip: `--warn` fill, the app's line ("⏰ Ana walked in 4 min late."), no edge rule. `.late` is the stack each page places (fixed at the bottom of the phone above any `BannerStack`, the bottom-left lane on the stage). It scales by font-size (phone 17, stage 48). `.lower3` is the stage strip's kit form.

### Stage parts (`.stage-card`, `.pnote`, `.ptab`, `.lbtitle`, `.lbgrid`, `.first`, `.pledger`, `Projector`)

See "Layout per area: projector". `Projector` keeps its props:

```tsx
<Projector ledger="A-210 · slide 12 of 30" title="Team board">
  <Big value={42} label="checked in" />
</Projector>
```

Light unless you pass `theme="dark"` or `theme="system"`: decks run light in A-210, and a dark ground washes out on a projector.

### Door parts (`.k-bar`, `.door`, `.door__panel`, `.target`, `.camstart`, `.codein`, `.pair__*`)

See "Layout per area: kiosk".

### Sign-in (`.signin`, `.gsi-box`)

Google's button is the one control the app doesn't style: `src/blocks/auth.tsx` renders it with `google.accounts.id.renderButton` (`googleButtonOptions`: size `large`, shape `pill`, text `continue_with`), so only its box is ours, with no fill, border or shadow. The theme is `outline` on a light page and `filled_black` on a dark one, by the nearest `data-theme` or else the device's setting, so it is never a white slab on a dark screen. Its width is its box's, up to Google's 400 (358 in the phone's action bar, 400 on the staff gate); a box narrower than 200 or not laid out yet (a banner's action slot) keeps Google's own width. Never a green fill, a recolored G, or a frame, tint or glow on it. It is the screen's first action where it appears, so no filled green button sits beside it. The screen lab draws a stand-in, so the real button's dark form and the box's `min-height` (Google prints no height) still wait on a check on a real page `[TBD]`. The staff sign-in screen's GDG logo and independence line come with the COPY pass.

## Not the default look

Before drawing a part, ask what the app's job makes it (a lecture console, a door station read in 3 seconds, a student's in-class tool, stage graphics for the back row), and draw that instead of a stock card, stat tile, pill, eyebrow label or edge stripe. Distinct never means decoration: each part does a job and is finished down to its numerals, edges and color steps.

| Area | The part each screen leans on |
|---|---|
| phone | The pass as the student's ticket: the QR, then the name and the code on one axis; checked in as its stub with a perforation and In at / Late after; the A to D thumb tiles on the green field, one drawing in every state |
| host | The slide track; one hero slot that holds Answered while open and Got it right when ended |
| staff | The scan result beside the live list; the counts in one line in the page head |
| projector | The 240 count beside the QR; the 1st place block over a plain ranked table |
| kiosk | One status panel with the word at 96, the only flood on the screen |

The ban list, for checking a screen: no edge stripe; no stat-tile row; no seal disc off the door; no chip that doesn't mark a differing state; no Live dot; no card in a well in a card; one icon construction; nothing centered on a phone; no pile of equal white cards; no dashed placeholder box; no ring spinner on a tile; no chip floating over a QR; no stacked count-over-percent bars with pill caps; no iOS switch where a radio or segmented control fits; no floating info-glyph helper line; no empty square standing in for a missing image; no pill segmented control with a check glyph; no pink alert box standing in for content; no ghost rows under an empty-table message; no hollow outlined squares or white plate standing in for a QR; no hairline ring around a QR plate; no card stretched to the window or pushed down by `margin-top: auto`; no well inside a raised card except a table's; no row lifted into a shadowed card inside a list; no toolbar repeated on every row of a long list; no paler ring for disabled; no value set larger than its pair to mark it; no disabled button drawn as bare text; no placeholder bigger than the thing it waits for; no waiting well stretched to its neighbour's height; no green text link beside a green field or primary; no swatch at body size floating beside a display word.

## Layout per area

### phone (390 x 844, also 320)

One column, page margin 16 (`max(16px, env(safe-area-inset-*))`, on the bars too), 16 inside cards, so every text line starts at 32. The shell (`.phone`) is a `100svh` flex column (`100vh` fallback) with `overflow: hidden`; the body (`.phone__body`) scrolls between the bars; the top bar, a bar banner and the action bar sit in the flow, so nothing ends under the action bar. The thumb band (the lower two thirds, about y 400 to 800 at 844) holds the choices and every main action. Both bars are one rung above the page.

- **The action bar** (`.phone-actions`) is one 56 row: Back and Next as 56 x 56 `.btn--neutral` icon buttons with no stroke at the two ends (`aria-label`; enabled glyph `--text`, disabled `--muted`, so the two arrows are always a pair), the screen's main action (I'm lost, Check in) `flex: 1` between them; padding 16 on every side plus the home indicator, about 90 tall. The why-line ("You can't go past the professor's slide.") shows only after a tap on the disabled Next, as one `--t-small` line above the row (`.phone-actions__why`, the button's `aria-describedby`). Loading draws the same three slots, disabled.
- **I'm lost** keeps one shape and slot in every state: the filled `--accent` button on the live slide (no field, no other green), `.btn--neutral` on quiz and results screens where green belongs to the field or the right answer.
- **The open quiz field fills the body:** it starts `--s4` under the collapsed rows and ends `--s4` above the action bar (`.qfield`, `flex: 1 0 auto`), the question block at its top and the tiles at its bottom, so the tiles sit in the thumb band and the field's edges hold still in open, sending, sent and retry. The slide card collapses to one row while a poll is open: "Slide 4" `--t-small` `--muted` over the title at 18 / 500, which wraps to two lines (min-height 56, no ellipsis), Show slide (`.link`) on the title's last baseline.
- **Signed-out pass:** no QR placeholder. The pass card is top-anchored `--s4` under the bar and holds the sentence ("Sign in to get your pass.") as its first line at `--t-h3`; a failed sign-in puts the warning glyph and "The server didn’t accept that sign-in." in that line's slot, hanging, at full card width. Continue with Google is the screen's main action in the action bar row (no Back or Next there).
- **New code:** the old QR stays at 0.35 with nothing over it, and the code row shows "Getting a new code…" in `--muted` at the row's height; nothing changes size.
- **Leaderboard rows** are ruled rows flat on the page, two lines each, `min-height` 64: the swatch, the name (16 / 500, "(you)" in 700 on the student's row) on line 1 and the meta ("6 right, 3 students") at `--t-small` `--muted` on line 2, both on the name's x; rank (28 column, right-aligned) and "+5" on line 1's baseline, tabular, the credit right-aligned; "Extra credit" once in the head. At 320 every row keeps the same shape. The footnote is one line or sits behind a toggle, and the scroll padding clears the action bar. While a question is open the leaderboard folds to one 44 row ("Team leaderboard: Purple is 2nd"). Folded rows are ruled rows on the page: no fill, no radius, a 1px `--line-strong` rule above, text on the 32 edge.
- **Not checked in:** one `st-open` notice under the app bar, at most 72 tall, the warning glyph and the app's sentence at 15 / 500, sharing the card text column, no button: Check in is the action bar's main action.
- At 320 nothing shares a row with the letter tile except its words.

| Key screen | First thing | Layout |
|---|---|---|
| `phone-pass` | The QR | The pass, top-anchored `--s4` under the bar: the QR on its white plate (280), then on the same axis the name at 20 / 500 and the code at 40 / 700 in Google Sans Code with 0.08em tracking (what a professor reads when the QR fails), then the 20-second line. HideLate, then the signed-in row (`--s6` before it as its own group). Sign out is `.link--plain`, never green |
| `phone-checked-in` | "You’re checked in." | The field drawn as the pass stub (`.stub`), top-anchored `--s3` under the bar: a 24 check glyph before the headline (the only display-size line), the name, a 2px dashed `--on-field-muted` perforation, In at and Late after as one paired grid (values 24 / 500, labels `--t-small`, all `--on-field`), then "You’re on <team>" with the 16 swatch. No action bar: Follow the slides follows the stub in the flow (gap `--s4`, full width, 56, `.btn--raised` with a green arrow glyph); HideLate and the signed-in row follow it (gap `--s6`) |
| `phone-live-slide` | The slide title | The slide card (`.livestate`: `--raised`, the screen's one raised object, no shadow; title `--t-h1`; bullets; "Slide 4 of 12"; when paged back "Slide 2 of 12 · Professor is on 4" in `--muted` and Next reads "Back to slide 4"). Questions, team and past cards below as ruled sections. Loading: the real frame with three 12 blocks at 90 / 78 / 64% for the bullets, the caption slots naming the step, every action in the disabled look |
| `phone-quiz-open` | The question | The collapsed slide row, the folded leaderboard, then the field filling the body: the question, then four tiles; no lock line until a choice is sent |
| `phone-quiz-sent` | The picked tile | Sending (the tile's bar, "Sending your answer." in the footer), Sent (the check), retry (the red inset ring and Try again on the tile; the footer the same inline line with the warning glyph, no banner). Tiles stay 72 and the footer keeps one shape |
| `phone-quiz-results` | "You got it right." / "Not this time." | The raised results card: the question, the result headline with its glyph inline (no Ended word), the bars with the right answer marked and "Your answer" in words. The slide card below is its collapsed row, ending whole above the action bar |

### host (1440 x 900, also 1280)

The app bar holds the tabs (Now, Points, Questions 12, #/host's own kept-mounted bar with the kit's tab classes) and the whoami line; under it the slide track across the full width, the same on every tab so it never moves; then the main column (the one focal card, `.hcard`) and a 400 aside that holds its slot in every Now state, as a `--well` panel with no shadow. Bar links that are not tabs (Attendance) are `--muted` 500. Offline is the warning glyph and "Offline" at `--t-small` 700 in `--st-stop-mark`, no fill, in a reserved fixed-width slot in the bar (`.offline-slot`), so the links never move when it appears; the card that failed says what failed. The live view fits 1280 x 800 with no scroll.

The slide track sits on a band on the page under the bar (`.band`): its text starts on the card text line (x 80 at 1440), the bar title on the same line, and "38 checked in" ends on the page margin, where Sign out and the aside end. Lost counts are one paired set: 24 / 700, zeros `--muted`, one baseline. The track replaces separate "Lost on this slide" and "Lost by slide" cells, so no count shows twice.

| Key screen | First thing | Layout |
|---|---|---|
| `host-now-start` | Draft with AI | Ask the room keeps the Now split. The card: "Slide 4, Capacitors in a circuit", one sentence at `--t-h3` in `--text` 500, Draft with AI (primary) and Write my own (outline) as 56 buttons in the header row's action slot; `min-height` 280; no A to D rows until a draft or Write my own fills them; when a question already ended this class, its one-line result from the app's real data. The aside's waiting well ends at its content: the Who got it wrong table's head over one row with the waiting sentence. Loading: both actions in the disabled look. Error: the heading and action slot stay; the warning glyph and "The question didn't load." take the question's slot; Try again is the primary in the action slot |
| `host-quiz-draft` | The question field | Quiz / Vote segmented, the meta line under the heading (no chips), Question, A to D rows with one "Right answer" column head over the radios and "No right answer" as a fifth radio row in that column; the chosen right row's letter tile `st-in-mark` with a check; the vote sentence only when Vote is chosen; Open question (primary) in the action slot with Cancel `.btn--plain` right of it in draft and drafting alike |
| `host-quiz-open` | "14 of 38 answered" | The header row: the "Open" state word, the meta line, End the question (`size="lg"`, the only filled green) in the action slot. The hero slot: Answered 14 at `--n-hero`, "of 38" at `--t-h1` `--muted`. The question; the bars on the card, neutral fills, the lead in ink. The aside: the same well it is when ended, "Who got it wrong" at the same x, one `.state--inline` line ("Shows after you end the question."), so the right answer never shows early |
| `host-quiz-ended` | Got it right 62% | The same card and slots: "Ended"; the hero slot holds Got it right 62% at `--n-hero` in `--accent` (the screen's one green mass) with one `--t-body` `--muted` line under it ("21 of 38 answered · median 18 s"); the bars with the right one marked; Draft with AI and Write my own both outline. The aside: the table of who got it wrong (Name, Team chip, Picked as a 24 letter tile) in its well, and Ask the AI as a 44 outline button. Vote-ended has no right answer, so its hero slot holds Answered |
| `host-questions` | The top upvoted question | The focal card "Questions from students" with Most upvoted / Group by topic as text options in its head; rows on the card with the upvote count on the title's baseline (`--n-sm`, larger than the meta, under its own right-aligned head), the words, the time; the state mark (Kept neutral, Shared with students the one green chip, with the eye) in the first action slot; Keep, Dismiss and Delete on hover, focus and the selected row (a fill step); Delete 16 after the others with `--error` words, opening the in-row confirm; dismissed rows muted with Bring back. A shared answer is one `--t-small` line with an ellipsis in the list; the full answer shows once, in the aside. The list caps at the rows that fit 1280 x 800 and ends on the "N more" row |

Points: teams as ruled rows in a well with a raised head; the place a bare numeral in a fixed 72 column ("2nd" then "tied" muted, one line); the 16 swatch with the name; numbers right-aligned; −1 / +1 as 32 outline icon buttons 8 apart in a fixed right column on every row; Undo a 32 `.btn--plain` as a row action; the selected row a fill step in the same columns; one row height. End class and Download extra credit (CSV) in one row, both 44 outline, the reason beside a disabled Download at `--t-small`; End class opens the overlay confirm. Empty: the same table, one row per team, `--muted` dashes. The leader's swatch is sized to its word (16 wide, the word's cap height tall, on its baseline). The Point changes list uses the same waiting-well part as the Now aside.

### staff (laptop)

The same bar and margins as host. Each page: the page title in the bar, then one count line in the page head (`.tally`: the lead numeral at `--n-lg`, the rest `--n-sm` in the sentence, one green only when the lead is a live count, a zero muted), then `.desk`: the main column with tables in wells, the aside with the focal card for the page's one task. Every staff table (This class, Past classes, People, Changes) sits in the inset well with the raised head. The page tabs (Attendance, Ask a question or start a vote, Admin) are the kit tabs with `aria-current="page"` on the current page.

| Key screen | First thing | Layout |
|---|---|---|
| `staff-gate` | The sign-in action | No bar while signed out. One block top-aligned at 96, never centered: the door column (560 on the page: the `--t-h1` title, the gate sentence, the action slot 48 tall holding Google's button) and a "Staff pages" card listing the locked pages as ruled rows with the lock glyph, all drawn the same, the page asked for marked by 500 words and a leading arrow, never lifted. Loading: the action slot keeps its 48 height as a `--well` slot with the clock glyph and "Checking who is signed in…" in `--text`. Refused: the lock glyph before the heading, the app's sentence naming the email, Sign out as a `.link` in the action slot |
| `staff-signin-ending` | The ending time | `Banner bar` warn, sticky under the app bar, Google's button at its end in the outline theme, so the page's one filled button and lead number stay first; the page below holds still |
| `staff-attendance-scan` | The scan result | The count line ("38 checked in · 4 late · class started 2:28 PM"); the focal card: one camera well (idle: `.cam--off` with the scan glyph, one sentence and Start scanning in one column), the result beside it (`.scanres`: the `st-in` fill, the check inline, "Checked in" and the name, no disc), the code field under. Camera errors show in the well |
| `staff-attendance-list` | The newest arrival | "This class" rows in the well with the raised head (Name, Checked in, Late), times right-aligned, Late chips sized to content, a ghost Remove on every row that opens the in-row confirm |
| `staff-admin-pair` | Pair a door iPad | No stat tiles: the counts sit in their section heads ("People 7", "Door iPads 2"). The aside: the focal "Pair a door iPad" (the code in `.input--code`, Name, Pair) and the Door iPads rows with Paired chips. The main column: Add someone (Role as a fieldset on `.rolepick` or text options, Add as outline so Pair is the one filled green; the new row tints in place with an Added chip), People with Permanent lock chips, Changes |

### projector (1920 x 1080)

The frame: 96 stage px inside every edge, no shadows, light by default with dark designed. One object several times larger than the rest. Nothing under 32 stage px; sentences 40 or more; body 48; the one number 240; anything read alone 160.

| Key screen | First thing | Layout |
|---|---|---|
| `projector-stage-checkin` | The count "38" at 240 | The deck full screen; the check-in card (`.stage-card`, 600 wide, the field) fixed at the right on the frame: the top row "Scan to check in" and the hide control, the QR at full width (536), the count with "checked in" on its baseline. Loading puts the step word at `--p-head` 700 in `--on-field-muted` in the numeral slot (`.stage-card__step`); an error keeps the last count with "checked in" muted (`.stage-card__count--stale`) and the presenter note says what failed. The card never grows and nothing red fills the field |
| `projector-stage-quiz-open` | "14 answered" | The QR keeps its size and spot. The poll panel bottom left, above the late lane: the question at `--p-body` 700, the answered count at 240, the screen's one green mass with no Open badge; the check-in card steps to `.stage-card--poll` (`--well`, `--text`) and its count to 160; the card keeps one box in every state |
| `projector-stage-quiz-ended` | The right answer bar | The same panel with the bars at `--p-small`, the right answer marked with its check, its words and a 6 stage px ring. The result panel is the field or `--raised`, never sunken beside the card. Loading and error follow the card's forms; zero answers shows "0 answered" at 240 with the bars at 0 |
| `projector-stage-late` | The late line | One late strip bottom left at 48 (the amber fill, no edge rule), rising once |
| `projector-leaderboard` | 1st place | The title and lock line on top (`.lbtitle`); the 1st place block left (`.first`: the rank at 160 with its ordinal, the team at 92, the credit, the numbers line); the ranked ledger right (`.pledger`: labeled heads Place, Team, Right, Per student, Extra credit, numbers right-aligned, 6 stage px rules between rows); the footer at 40. The row that just moved holds a 6 stage px green ring for 2s |
| `projector-stage-setup` | The deck | A presenter note (`.pnote`) in the bottom-left lane: `--well`, `--muted` words at 40, the clock or warning glyph in `--st-open-mark`, its action at its end (`.pnote--row`); one strip, never a card the size of the stage card |

### kiosk (iPad 820 x 1180 portrait)

One door geometry on every screen, so nothing moves between states and only fills, glyphs and words change:

- One gutter, 24 (`--k-gutter`), on every kiosk screen: every headline, the bar, the strip label and the pairing code start at x 24.
- The bar (`.k-bar`) is 88 tall and keeps its rung (`--shadow-bar`; no area stylesheet removes it): the room count (`.roomn`, 64 / 700 in a 2ch tabular slot, "checked in" 28 on its baseline), the door's name at 28, Staff as a labeled 56 pill (`.k-staffbtn`).
- The panel (`.door__panel`) is one grid of two rows in every state: the status band at 432 (`--k-door`) and the camera window in the rest, inset 24 on three sides, so the window never changes box. The target corners are a fixed 320 square drawn with `vector-effect: non-scaling-stroke`. Idle, the panel sits on `--page` like the typed-code strip under it, so the white bar keeps a rung over it in light (a white panel under a white bar left only a 1px shadow line).
- A result floods the whole panel, so the flood frames the window: Checked in on `--field`, Already checked in on `--accent-soft` with its glyph (`st-in`'s mint in light; in dark a green-tinted neutral, since dark `st-in` was 1.04:1 off the field), Refused and Camera blocked on `--st-stop-fill` with the x, white words. The flood's fill fades and its words snap with it, never fading through grey. The result words sit on three bottom-set rows at the band's foot (the word slot 200, two lines at 96; the name 100 at 80 / 500; the fact 56); the status word is 96 in every result, and a long word wraps rather than stepping down. A refusal's or a blocked camera's sentence spans the name and fact rows at 40.
- Idle Start check-in is the camera window itself (`.camstart`: `--cam`, a 4px `--cam-mark-ok` inset ring, the 128 glyph over the 64 / 700 words), never the green flood, which made idle look like Checked in. Inside a result's flood the window drops the green ring and draws its glyph and words in `--cam-mark`, so the flood's word stays the one green mass. The waiting step is a `--bar` window with the step named and no progress rule. A busy door button (Start check-in while the camera starts, Check in while a typed code sends) shows the still clock after 0.4s, never a spinning ring.
- The typed code is a field plus a separate 64 Check in button in the bottom strip (`.codein`), padded `calc(24px + env(safe-area-inset-bottom))`.
- Every button 56 or more; Start check-in 72. No back button for students. No blur, filter, loops or ambient motion. Text 16 or more.

| Key screen | First thing | Layout |
|---|---|---|
| `kiosk-start` | Start check-in | The band holds the prompt ("Type the code on your pass") at `--k-prompt` 48, so the camera-window Start check-in leads |
| `kiosk-scan` | "Hold your pass up to the camera" | The band's prompt (at most two lines), the camera running with white still corners |
| `kiosk-checked-in` | "Checked in" | The panel floods `--field`: the check, "Checked in" at 96, the name at 80; the corners turn green; back to idle after 3s |
| `kiosk-refused` | "Try again" | The panel floods `--st-stop-fill`: the x, "Try again" at 96 in the word slot, the app's sentence at 40 across the name and fact rows |
| `kiosk-already` | "Already checked in" | The panel floods `--accent-soft`: its glyph in `--st-in-mark`, the word and the name in the same slots as Checked in |
| `kiosk-pair-code` | "482 913" at 144 | The bar with the page's name; the code at 144 in Google Sans Code in the middle band with its label over it (`.pair__group`) and "The code works until 2:51 PM." under it |

## States

Every screen designs these, inside the region they belong to, never as a stray line on an empty page. A state counts only when it is rendered: every key screen ships its loading, error and every wait step (Sending, drafting) as lab scenarios, and controls render disabled with `aria-disabled` while loading.

| State | How it looks | Where |
|---|---|---|
| Loading | The real layout with still solid blocks; one line naming the step ("Loading the questions…", "Checking this iPad…"); `aria-busy`; numbers as fixed-width `.skel--num`; actions in the disabled look until data lands | All. Kiosk and projector: no spinner at all |
| Empty | The part it stands in for, drawn empty: the composer as its heading, sentence and two actions; the team table with still blocks or dashes in the value cells; the app's sentence and one action when there is one; a side panel with nothing yet is one `.state--inline` line; no ghost rows | Lists, charts (an empty chart shows its frame) |
| Error | The region keeps its frame, heading and action slot; the red warning glyph and the app's sentence ("<Label> didn’t load.", in `--text`) take the failed content's slot and Try again takes the action slot, no filled box. A message with no slot of its own is a `Notice`. Page errors: "Something went wrong." with Reload as the primary. Errors on the green field or the stage card: `Banner inset`. Field errors: above the field | All |
| Signed out | Phone: the pass card with its sentence and no QR placeholder, Google's button in the action bar row, the largest control on the screen. Staff: the gate. Door: the pairing code | phone, staff, kiosk |
| Gate refused | The lock glyph, the app's sentence naming the email, Sign out | staff |
| Success | The thing tapped becomes the confirmation: the picked tile says Sent; the new row tints `st-in` with an Added chip; the door panel floods; the stage count swaps value. No toasts | All |
| Waiting | A still card with one status line ("Waiting for the slides to start.") | phone, iOS |
| Ending | `Banner bar` warn with the action at its end | staff, host |

## Motion

Only state changes move; transform and opacity (and color on the effects track); nothing loops except the busy spinner inside a pressed button. Reduced motion keeps every change visible: spatial durations go to 0, color and opacity stay.

| Name | What moves | Duration, easing | Reduced motion |
|---|---|---|---|
| field-fill | A field or door panel's fill and words when a state starts or ends | `--fx-slow`, `--ease` | Same (it is color) |
| choice-press | The tapped tile scales 0.98 to 1 | `--sp-fast`, `--ease-sp`; phone only | No scale; the fill change still shows |
| choice-select | Picked ring | `--fx`, `--ease` | Same |
| choice-sending | A 3px bar along the sending tile's bottom inside edge grows once | `--sp-slow`, `--ease` | The clock glyph before "Sending", no bar |
| choice-send | "Sending" to "Sent" | an instant word swap, the fill on `--fx` | Same |
| kiosk-result | The panel's fill and the corners to green; the glyph and words change with it in one frame (fills fade, ink snaps) | `--fx`; holds `--hold-result` 3s, then back to idle on `--fx-slow` | Same |
| bar-fill | A results bar grows from the left when a poll ends | `--sp`, `--ease` | Appears at its value |
| count-swap | Live counts change value in place, tabular, no count-up | instant | Same |
| board-reorder | Leaderboard rows reorder instantly; the moved row holds a 6px green ring | the ring fades on `--fx-slow` after 2s | Same |
| banner-rise | The late banner rises once; leaves faster | in `--sp-slow` `--ease`, out `--sp` `--ease-exit` | Fades in on `--fx-slow` |
| sheet-open | The scrim and the sheet fade in | `--fx` | Same |
| switch-knob | The knob slides | `--sp-fast`, `--ease-sp` | Jumps; the track color still changes |
| row-new | A new row's tint fades to its rung | `--fx-slow` after `--hold-new` 4s | Same |
| tab-switch | Panels swap | instant | Same |
| busy | The spinner in a pressed button after 0.4s, phone and laptop only; the door iPad and the projector show the still clock instead | an 800ms linear loop | The clock glyph, still |

Never: shadow, filter, width or height animation; shimmer; pulse; ambient background; confetti; count-ups per vote. No `@starting-style` or view transitions as the only signal (iPadOS 16).

## Rules for each surface

### Student phone

iPhone Safari at 390 x 844, and 320 wide. One hand, a glance between slides. Routes: #/checkin/student (also #/checkin/join), #/live, #/portal.

- The state word or the question sits above the choices; choices full width in the thumb band, 72 tall, 12 apart.
- One main action per screen, at 56. No `.btn--sm`. Anything tapped is 44 x 44; a link on its own line is `className="btn btn--quiet btn--flush"` or `.link`, so its words line up with the line under it.
- No sideways scroll at 320 wide: no fixed widths over 288px, and long names and emails break.
- Inputs 16px or more.
- Loading, empty, error and signed-out states on every screen.
- Safe areas: `env()` padding on the bars and the page bottom. They read 0 until `index.html` has `viewport-fit=cover` (Not done yet).

### Professor laptop

1280 to 1440 wide, at the lectern, read mid-sentence. Routes: #/host, #/checkin/quiz.

- `Screen wide`. The slide track across the top on every tab; the one live action in the focal card's header-row action slot; sections as `Tabs`, except on #/host, which keeps its own tabs because its three panels stay mounted (a half-written quiz and the AI note survive a tab switch) and kit `Tabs` renders only the open one.
- One filled green button. Row actions are neutral ghosts on every row.
- Anything that can't be undone is a `ConfirmButton`; End class uses `overlay`.
- Counts don't move when data lands: tabular numerals, fixed slots.

### Staff laptop

#/admin, #/checkin/teacher, #/checkin/quiz, #/lab, the staff sign-in screens. Often in a hurry before class.

- The count line before the tables; tables in a `--well` with a `--raised` head, rows 44, emails truncated, dates `nowrap`, numbers right.
- Remove and Unpair are ghost row actions on every row (no ring at rest) that open an in-row confirm.
- The page title sits in the bar; the first thing in the content is the count line or the task's focal card.

### Projector

#/checkin/stage, #/live/leaderboard, and the late banner on them. The back row of A-210.

- Inside the 96 frame. Nothing under 32 stage px, sentences 40 or more, body 48. The one number 240; anything read alone 160. `Projector` (or `[data-surface="projector"]`) gives the stage sizes.
- The QR is the same size in the same spot in every state; it never shrinks for a poll.
- No shadows, no hairlines: tone and 6 stage px rules.
- Setup problems are presenter notes at 40 in the bottom-left lane. Nothing private on the projector: no emails, keys or addresses.

### Door iPad

820 x 1180 portrait, front camera, students walking past at about 1m, read in about 3 seconds. Route: #/checkin/kiosk (the pairing screen and the scanner).

- One layout: the bar, the panel (status band and camera window), the typed-code strip. The status word largest, the name in a fixed slot.
- Every button 56 or more; Start check-in 72. Staff controls behind the Staff pill. No back button for students.
- No blur, filter, loops or ambient motion. Text 16 or more.

## iOS

The SwiftUI app (`ios/RCCLivePortal`) doesn't read these stylesheets. It keeps the system font: GDG `foundations.md` §3.1 says not to bundle Google Sans (the club has no license it can point to for handing out the font file); if the app ever needs a bundled face, use Inter (OFL, `foundations.md` §3.8). Its colors are in `Palette.swift`, one line per token; `src/styles/ios.test.ts` fails when one differs from `tokens.css`, or when a screen uses a system color (SwiftUI's `.red` or `.gray`, UIKit's `.systemBackground` or `.label`, or the unset AccentColor). Map the tokens into an asset catalog with light and dark appearances:

| Token | SwiftUI | Light | Dark | Replaces |
|---|---|---|---|---|
| `--page` | `Color("Page")` | `#eef2ee` | `#181c19` | the system background |
| `--raised` | `Color("Raised")` | `#ffffff` | `#222823` | the slide card |
| `--text`, `--muted` | `Color("Text")`, `Color("Muted")` | `#1e201e`, `#575a58` | `#e6e9e6`, `#b9bcba` | `.secondary` |
| `--accent` | `Color("Accent")`, the app tint | `#00732d` | `#96d6a0` | the red "Back to live" tint |
| `--live` / `--on-live` | the Live badge capsule | `#00732d` / `#ffffff` | `#96d6a0` / `#003410` | the red Live badge; whether the iOS badge goes like the web's is Sam's call (Not done yet) |
| `st-open` triple | NoticeBar fill, text, icon | `#ffe5c0`, `#4f3400`, `#8a5a00` | `#624000`, `#fcdeb5`, `#e7ae58` | an orange tint |
| `--warn` / `--on-warn`, mark `--st-open-mark` | LateBanner fill, text, leading glyph | `#ffe5c0` / `#4f3400` | `#624000` / `#fcdeb5` | red fills |

Type: `.largeTitle` bold for the slide title, `.title3` for bullets, `.title2` semibold for waits, `.footnote` with `.monospacedDigit()` for "Slide 4 of 12". Spacing on 4pt steps; corner radius 16 on cards and 12 on banners (`RoundedRectangle(cornerRadius:style: .continuous)`). Motion: `.animation(.easeOut(duration: 0.22))` for color changes, `.spring(duration: 0.32, bounce: 0)` for the late banner entering, and `@Environment(\.accessibilityReduceMotion)` swaps it for an opacity fade. The live slide, the paged-back slide, the connection notice and the late banner follow the phone's `phone-live-slide` look.

## Contrast

`src/styles/contrast.ts` lists each pair the app draws (words, edges or rings on a fill) with its minimum: 4.5:1 for words, 3:1 for large words (24px, or 19px bold) and for edges, focus rings, marks and bars. `contrast.test.ts` reads `tokens.css` and fails when any pair is under its minimum in light or dark. It also measures every rule in `src/**/*.css` that sets both `color` and `background` from tokens, checks that the dark colors are the same from the system setting and from `data-theme="dark"` and that a `data-theme` scope gets its theme's colors inside a page of the other theme, and checks that every `var()` in the app's stylesheets names a property some stylesheet sets. When a page puts words or an edge on a fill that isn't in `PAIRS`, add the pair. #/ui shows every pair with the ratio the browser draws.

A tile on the field is identified by its 4.5:1 words, not its fill: no tonal fill reaches 3:1 against the dark field, so the dark tile reads as a layer through its fill step and `--hl`, without a stroke. Team chips are 3:1 or more on page, well and card in both themes. The #/ui gallery passes axe (WCAG 2.0, 2.1 and 2.2 A and AA) in both themes at 1440 and 1280.

## Check the work

Shoot the real screens with the screen lab (fixture data, no backend), from the repo root, on a port nobody else uses:

```sh
node_modules/.bin/tsc --noEmit -p design/lab/tsconfig.<area>.json
node design/lab/shoot.mjs --port <port> --out <dir> --only <area or id prefix> --strict
node design/tools/contact.mjs --out <dir>/sheets <dir>/manifest.json
```

`--strict` fails on sideways scroll, an axe serious or critical violation, text under the floor (12px; iPad 16; projector 32), a control under 44 on phone or iPad, or a page error. A green run is necessary, never enough; open the light and dark PNGs and check:

- **Fonts:** the faces a screen uses actually load; a code waits for Google Sans Code before the shot.
- **Bands:** no empty band over 25% of a phone viewport, and no laptop card more than `--s8` taller than its content. Grep the area CSS for the dead-space causes (Alignment and space) first.
- **States:** loading, empty and error of one region look different in the shot, not only in the heading. In every loading state each button shows its full shape; a dock or header row that changes outline between loading and loaded fails.
- **Edges:** in light every raised card shows its step against the page; in dark the focal card still reads one rung up.
- **Nesting:** count rounded surfaces from the page in; more than two is a fault. In light, look for a head or plate the same white as its card.
- **Baselines:** for each paired set and each trailing link, the label and value tops in the 2x shot sit within 1px.
- **Overrides:** grep the area CSS for any rule that redraws a kit part's radius, shadow, ring or stroke (`box-shadow: none` on a bar, a transparent table head, `border-radius` on a kit part). A needed difference is a change to the kit.
- **Geometry:** compare element boxes across a screen's states; nothing should change size or x.
- **Facts:** one value per fact across the shots of one class (the Questions count is the same on every host tab).

## Where the app differs from GDG on purpose

- **Focus ring:** an outline (3px, 2px clear; 3px clear on kiosk and projector), where GDG uses a box-shadow, so a team rule can't hide it.
- **Disabled:** the button keeps its shape on the neutral fill with `--muted` words and no ring, where GDG uses 38% opacity. Answer tiles never use opacity: unpicked tiles after sending take the solid `--tile-out` fill so a locked answer stays readable.
- **Busy button:** the spinner sits over the words, so the width holds. On the door iPad and the projector it is the still clock: no loop on a screen read in passing.
- **Dark error fill:** `st-stop` is `#43302d`, a quiet red-tinted rung over `--raised`, where GDG's dark error container is `#910906`; a saturated red line outranked everything else on dark screens, so red stays on the glyph and the words carry the state.
- **Line heights:** ratios, not px, so a bigger font inside an element never overlaps the next line.
- **Ligatures:** off on everything.
- **Tap floor:** 44px for anything on a phone or iPad.
- **Dark rungs:** `--page` `#181c19`, `--raised` `#222823`, `--bar` `#2d332e`, `--overlay` `#383f39`, `--well` `#111512` are lifted from GDG's dark set so each rung above the page steps 1.15:1 or more and the well sits one small step under the page. Dark `--accent-soft` `#26402c` is a green-tinted neutral, not GDG's container green, and dark `--field-tile` `#22773f` is a step above the field in its own hue.
- **Light `--bar`:** `#dce3dd`, so green and red words on it pass 4.5:1.
- **Live badge:** none on the web. Open on host is a green state word. Amber stays for late only.
- **Dark field:** `#025620` (GDG green ramp tone 30), so white words on the field pass in dark.
- **Projector count:** 240 stage px and the 600 card are above GDG `presentation.md`'s Big number default, for the back row.
- **Team colors:** twelve named team hexes, more than GDG's three-hue chart cap. They are names, not a chart: always a chip plus the written word, never colored bars or a row tinted by team, and Red, Yellow, Blue and Green are shifted off the licensed four. A class with Red, Yellow, Blue and Green teams still puts all four on one leaderboard; that needs Sam's call (Not done yet).
- **Leaderboard reorder:** instant with a held ring, per GDG motion 5.7.

## Not done yet

- Sam's call: whether a leaderboard may show the Red, Yellow, Blue and Green teams together (GDG bright lines 1.3), or the app drops one of those team names.
- Sam's call: light answer tiles on the dark field (`--field-tile` dark `#e6e9e6` with `#1e201e` words, 7.29:1, or `#cfe9d3`, 6.90:1, if it glares in a dim hall), the only tone that clears 3:1 against the field. Until then the dark tile is `#22773f` with white words, identified by its words. Needs a render beside the light theme and a look in a dark room.
- Sam's call: the web has no Live badge; whether the iOS `LiveBadge` goes too, or shows only when the student has paged back like the web's "Professor is on 4" line.
- `index.html` has no `viewport-fit=cover`, so the safe-area insets read 0. Adding it needs the kiosk, stage and portal checked on an iPhone and iPad first.
- The light theme, the dark rungs, the 6 stage px rules and the 240 count haven't been seen on the A-210 projector; the back-row distance is `[TBD]`.
- The stage card was 880 stage px tall with a 2-digit count; a 3-digit count wraps "checked in" under the number and the card grows to about 932. Pick between a 200 count for 3 digits and a smaller QR, and check it at 1920 x 1080. A first stage load that fails has no last count to keep `[TBD]`.
- Phosphor Bold SVGs and their LICENSE vendored into `src/` `[TBD]`; `Icon` draws the glyphs to that construction by hand.
- Words this system needs that the app doesn't have yet ("+2 more" on the late strip, "Picked", "Sent", "For the presenter:", the lock line on the phone, the host's Offline slot, "Reading your pass" and "Hold still" on the door) come with the COPY pass, as does the staff sign-in's GDG logo and independence line. The door's press-and-hold staff corner and "reading" state are new behavior and wait on Sam.
- `ErrorBoundary` marks only its exact markup (`src/blocks/ui.test.ts` and `Student.test.ts` pin it), so the screen lab finds a boundary by that markup until a `data-boundary` attribute lands with those tests.
- Google's button: `filled_black` on dark pages and the box's width are set, but the lab draws a stand-in, so the real button's look in dark and the box's `min-height` wait on a check on a real page.
- `src/index.css` cuts every animation and transition to 1ms under reduced motion, an `!important` inside a layer that no team rule can undo, so MOTION.md's reduced forms that keep an `--fx-slow` fade on the new words show as an instant change until that rule leaves the effects track alone.
- Google Sans `GRAD` stays 0 in both themes until a render comparison. Text shifts a little when Google Sans arrives (GDG `foundations.md` §3.9 leaves `size-adjust` open).
