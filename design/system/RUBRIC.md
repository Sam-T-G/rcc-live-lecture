# Rubric (frozen 2026-10-31; dimension 8, bespoke, added by Sam's session in round 3)

Every comp and screen in this run is judged on this file. Only Sam's session changes it. Builders get the judges'
fix lists, never this file (research/agent-design-docs.md finding 11). Grounding: research/SYNTHESIS.md, BRIEF.md,
GDG bright-lines.md.

## Judge brief

- **Inputs:** each comp's renders at every size in light and dark (from `render.mjs`), its `manifest.json`, the
  comp's HTML and CSS, its area, and the viewing table below. Nothing about who built it or how many rounds.
- **Score what is on the screen.** Don't reward element count, length or extra decoration; a comp that removes an
  element and gets clearer scores higher. Score each dimension 1 to 5 using the anchors; when torn, take the lower.
- **Motion and states:** `render.mjs` shoots with reduced motion on, so screenshots show the reduced form. Judge
  motion from the CSS against SYNTHESIS 24 to 28. A state not rendered counts as missing.
- **Don't redo machine checks.** Read the manifest for everything listed under "render.mjs checks".
- **Output per comp:** `dimension, score, evidence (one sentence naming the element), fix (one sentence)` for each
  of the eight, then `blockers: none | list`. Cap: 120 words per comp beyond the table.
- **Pass:** no blocker; every dimension 3 or more; hierarchy, legibility, fit and states 4 or more; mean of the eight
  4.0 or more. Whole-app taste and coherence each 4 or more. Judges do not decide "pretty"; Sam picks among comps
  that pass.

| Area | Device | Distance and moment |
|---|---|---|
| phone | iPhone Safari 390 x 844 (and 320) | 30 to 40cm, one hand, a glance between slides |
| host | laptop 1440 x 900 (and 1280) | arm's length at the lectern, read mid-sentence |
| staff | laptop | seated or standing at a table, often in a hurry before class |
| projector | 1920 x 1080 projected | back row of A-210 (distance `[TBD]`), read without help |
| kiosk | iPad 820 x 1180 portrait, maybe iPadOS 16 | about 1m, walking past, about 3 seconds |

## 1. hierarchy (hierarchy and focus)

**Question:** In one glance at the device's distance, is there exactly one first thing, and does the eye then go
where the person's next decision is?

- **1:** Several elements tie for largest or greenest; the primary action is hidden among equals or below the fold.
- **2:** A first thing exists but competes (two filled green buttons, a heading louder than the live number).
- **3:** Template default: a page title on top, then even cards in reading order. Nothing wrong, nothing chosen.
- **4:** One focal element by size, weight and the raised rung; secondary items clearly quieter; primary action one
  size step above its neighbours.
- **5:** Every element's size and position follows the moment (the live count the professor checks, the code the
  back row types); removing anything would lose information.

**render.mjs checks:** none for hierarchy; `belowFold` in the manifest says how much is hidden on first view.
**Area notes:** phone: the state word or the question sits above the choices; choices in the thumb band. Host: the
counts and the one live action top left. Staff: the summary row before the table. Projector: one object several
times larger than everything else. Kiosk: status word largest, name in a fixed place.

## 2. depth (depth and surfaces)

**Question:** Do surfaces stack in named rungs, so grouping and importance show without reading a word?

- **1:** One flat plane; cards are the page color with a pale hairline, or random shadows on everything.
- **2:** Two rungs only (page and card), or a shadow on every card so none stands out.
- **3:** Template default: white cards with one soft grey shadow, all equal.
- **4:** Three rungs used by role (sunken wells, base page, raised content); one focal raised surface; dark mode
  steps lighter with a top highlight; sticky bars solid and one rung up.
- **5:** Depth carries meaning everywhere: wells group, the focal card is the only shadow, overlays sit clearly
  above with a scrim, and every edge is a fill step or a deliberate ring, never a stray stroke.

**render.mjs checks:** none. Judges compare the light and dark shots side by side.
**Area notes:** phone and kiosk: shadows at most 2 layers. Projector: no shadows; tone plus 4 to 6px rules, no
hairlines. Host and staff: tables in a sunken well with a raised head; drawers and confirms at overlay.

## 3. brand (brand and character, GDG)

**Question:** Does it read as GDG on Campus RCC (green leads, Google Sans, tone depth, the club's restraint)
without looking like a Google product or a stock template?

- **1:** Off-brand: blue actions, Roboto or system font, Material Symbols, a gradient, or Google chrome.
- **2:** Right font and green, but green spread on backgrounds and decoration so it marks nothing.
- **3:** Template default: GDG tokens applied, generic layout; could be any club's admin page.
- **4:** Green marks the one action, current tab, live state and big number; tinted neutrals; Google Sans with
  Code for codes; GDG radii nested; 400 / 500 / 700 only.
- **5:** Every brand choice does a job: the type roles, the green spend and the corner scale are what make the
  screen readable; nothing borrowed from Google chrome, nothing decorative.

**render.mjs checks:** `fonts` in the manifest lists loaded families (Google Sans must be there).
**Area notes:** staff sign-in carries the horizontal logo (stacked dark file in dark) on a flat surface with the
independence sentence verbatim under it. Projector: dark and light both on brand; light is the stage default.

## 4. legibility (legibility at the device's distance)

**Question:** Can the person read every word they need from where they stand, in both themes?

- **1:** Key text is small, thin or low contrast at the real distance; numbers jitter or truncate.
- **2:** Readable on a monitor but not at the distance (projector body near 32px, kiosk status under 40px).
- **3:** Template default: passes the floors and AA, sizes not tuned to the distance.
- **4:** Sizes set for the distance (projector body 48, the one number 240 or more; kiosk status word display
  size); changing numbers tabular; codes grouped in Google Sans Code; no weight under 400.
- **5:** The thing read from farthest is the largest and highest contrast; both themes hold up; nothing wraps
  badly at 320 or 1280; labels sit next to every value.

**render.mjs checks:** text floors (12px phone and laptop, 16px iPad, 32px projector) and axe serious or critical
contrast, in light and dark. Not checked by the tool: projector body 40 and the 160px read-alone size; judges check
those in the CSS.
**Area notes:** phone: inputs 16px or more. Host: counts in the Numeral role. Projector: line length about 30ch.
Kiosk: the 6-digit pairing code 140px or more.

## 5. fit (fit to device and moment: thumb, back row, walk-by, a glance at the lectern)

**Question:** Is the layout built for this device, hand and moment, or is it a desktop page resized?

- **1:** Wrong for the device: phone actions top left or flush on the bottom edge, kiosk needs a precise tap,
  projector crowded to the edges.
- **2:** Works but fights the moment (needs scrolling mid-lecture, two hands, or a second look).
- **3:** Template default: a centered column that fits the width.
- **4:** Phone choices full width in the thumb band with safe-area padding; host fits 1280 without scroll for
  the live view; projector inside 96px margins with the QR in a fixed spot; kiosk targets in the middle band.
- **5:** The layout anticipates the moment: the student answers without looking long, the professor reads the
  count mid-sentence, the back row reads the code, the passer-by gets the result in one step.

**render.mjs checks:** sideways scroll at every size (390, 320, 1440, 1280, 1920, 820), tap targets 44px on phone
and iPad, `belowFold`. Not checked: laptop targets (32px with 8px gaps is the floor here), safe-area padding.
**Area notes:** phone at 320: nothing shares a row with the letter tile. Staff: compact rows 40 to 44px. Kiosk:
staff exit in a corner, no back button for students.

## 6. states (states and feedback)

**Question:** Does every state the inventory lists for this screen exist and look designed, and does each action
answer "did that work?" in place?

- **1:** Only the happy path; loading, empty, error or signed-out missing or raw text.
- **2:** States present but bare (a grey line of text, a spinner on a blank page, a toast that vanishes).
- **3:** Template default: kit Status, EmptyState and Banner dropped in unchanged.
- **4:** Each state has a container, one sentence of what, one action of what next; the tapped thing becomes the
  confirmation; waits name the step and hold still; right and wrong carry glyph plus words.
- **5:** States are told apart at a glance (kiosk: checked in, already in, refused, find by name in one layout);
  failures recover in the same spot; reduced motion keeps every change visible.

**render.mjs checks:** page errors and console errors only.
**Area notes:** phone: Sending, locked, retry on the chosen tile. Host: no question yet, poll open, ended with
results. Projector: setup problems readable by the presenter but quiet for the room. Staff: the gate and the
sign-in ending banner.

## 7. craft (craft and consistency)

**Question:** Is every edge, gap and number aligned to the system, so nothing looks accidental?

- **1:** Jittery spacing, mixed radii, pale thin strokes, floating labels, dead space, unlabeled ticks.
- **2:** Mostly aligned but with off-scale gaps, a stray raw hex, or two treatments of the same part.
- **3:** Template default: consistent kit parts, generic spacing, no deliberate rhythm.
- **4:** Spacing on the 4px ladder, radii nested, one treatment per part (one bar chart, one big-number style),
  icons on the 24 grid with one stroke weight.
- **5:** Rhythm is visible and intentional: columns line up across sections, numbers align right, light and dark
  are equally finished.

**render.mjs checks:** axe names and labels (serious or critical), page errors.
**Area notes:** host and staff: the three bar charts and four big-number styles in today's code collapse to one
each. Projector and kiosk: the same layout across states so nothing jumps between them.

## 8. bespoke (made for this app, not the default look)

Added in round 3 at Sam's request: the design must get past the patterns AI-made and template UIs repeat, and be
judged on that at the polish layer, so "different" never passes on its own; distinctive and refined does.

**Question:** Do the screen's type, color, shape, composition and details come from this app's own job (a lecture
console, a door check-in station, a student's in-class tool, a stage readable from the back row), or from the
default patterns AI-made and template UIs repeat?

**Default patterns (each one present pulls the score down; read the CSS as well as the picture):**
- every block in the same rounded card with the same soft shadow, in a uniform grid; cards inside cards
- a row of big-number stat tiles as the opener, each with a small grey label under it
- a colored stripe or rail down the left edge of a rounded card or banner
- small uppercase eyebrow labels over every heading; 01 / 02 / 03 markers on things that aren't a sequence
- pill badges and chips sprinkled for decoration; a "Live" dot on everything that updates
- generic empty states (an icon in a circle, "Nothing here yet", a button), stock spinners
- gradients, glass blur, glows, emoji as icons, generic outline icons dropped in with no shared drawing
- one radius, one shadow, one gap and one type size reused everywhere because they are the defaults
- everything centered, everything the same weight, symmetric layouts the content doesn't ask for

- **1:** Reads as AI-default: four or more of the patterns above carry the screen.
- **2:** A palette swap on default patterns: GDG colors on stock cards, tiles and chips; one specific touch.
- **3:** Template polish: tidy and consistent, but every part could come from a component library and nothing on
  the screen would be remembered.
- **4:** The key parts are specific to this app and do a job (the stage count set like a scoreboard numeral, a pass
  that reads as the student's ticket, a quiz choice shaped for a thumb), at most one default pattern remains, and
  the polish holds up close: numerals, optical sizes and tracking chosen, edges and color steps deliberate, icons
  drawn as one set.
- **5:** Unmistakably this app: a viewer could tell which app it is from any single screen; each screen has one
  signature part that does a job; no default patterns remain; the detail work is at the level of a hand-made
  product; still calm and purposeful (taste rules bind: no gimmicks, no decoration for its own sake).

**render.mjs checks:** none. Judges compare against the list above and the area's moment in the viewing table.
**Area notes:** phone: a class tool, not a form; host: a lecture console, not an admin dashboard; staff: may be the
quietest area but still not stock; projector: built like stage or broadcast graphics, legible first; kiosk: a door
station read in 3 seconds, not a tablet form. A pattern that genuinely does the job best stays (a table for the
attendance list), but its drawing and detail must still be this app's.

## Whole app (taste judge)

### taste (Sam's taste and the bright lines)

**Question:** Would Sam call it named, aligned, solid and purposeful, or cheesy, sloppy and slow?

- **1:** Gimmicks: 3D cards, animated background, confetti, glow, game-show tiles, anything Sam already cut.
- **2:** Restrained but with one of his named rejects (pale thin strokes, floating labels, dead space).
- **3:** Template default: tidy and forgettable.
- **4:** Calm and solid; every visual element names or groups something; companion screens are glance pages.
- **5:** Distinctive through layout, hierarchy and depth alone; nothing to cut; reads as built by someone who
  watched the lecture happen.

### coherence (the five areas read as one app)

**Question:** Do phone, host, staff, projector and kiosk share one language, so a student, professor and room
see the same thing named the same way?

- **1:** Each area looks like a different product.
- **2:** Shared colors and font, but parts differ (three bar styles, two letter treatments).
- **3:** Template default: same tokens, layouts unrelated.
- **4:** The same letter tiles, numeral role, rungs and state patterns on every area, scaled for distance.
- **5:** The same object keeps its shape everywhere (choice A on the phone is choice A on the stage and the host;
  checked in looks the same on phone, kiosk and staff), changing only in size.

## Blockers (fail the comp whatever its scores)

1. **Render hard failure:** `render.mjs` exits 1 for the comp (sideways scroll, axe serious or critical, text under
   the floor, a control under 44px on phone or iPad, a page error).
2. **Color as the only signal:** any state (selected, right, wrong, present, late, paired, team) shown by hue alone,
   with no word, glyph or letter.
3. **Bright-line break (GDG bright-lines.md):** an arrangement of the four Google colors that reads as a mark, or one
   component using more than two of them; the logo altered, tiled, animated or on a photo or gradient; a gradient
   fill; blue as the action color; Material Symbols, Roboto or `#6750a4`; the independence sentence missing or
   reworded where the logo shows.
4. **Ambient or looping motion:** anything that moves while nothing changed (pulse, shimmer, breathing dot,
   animated background, looping loader on a waiting or idle screen). The one exception is a spinner inside a
   button the person just pressed, after 0.4s, on phone or laptop only.
5. **Unreadable from the back row:** projector text under 32px, body under 40px, the stage's code or count under
   160px, a light-on-dark QR, or the QR or count inside the outer 5%.
   (Since round 5, render.mjs fails any projector comp whose `.stage-card__count` or `[data-stage-count]` digits render
   under 160px: the count shrank in quiz states in rounds 1 and 5.)
6. **A real person's data:** any real student, professor, email, class list, production URL or key. Fake first
   names and class names only.
