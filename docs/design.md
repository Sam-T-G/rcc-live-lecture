# Design

How every screen looks: the tokens, the base elements, the kit, and a short rule list for each place the app shows up (student phone, professor laptop, projector, door iPad). The look is the GDG on Campus RCC design system ([github.com/Sam-T-G/rcc-gdg](https://github.com/Sam-T-G/rcc-gdg), `docs/04-brand/design-system/`): green leads, Google Sans, depth from tone before shadow, and nothing moves unless it's the thing the screen is about. Read its `README.md`, `foundations.md`, `components.md`, `motion.md` and `bright-lines.md` before a design change; this file says how the app applies them.

Open **#/ui** to see every color with its contrast ratio and every part in every state, light and dark side by side. **#/ui/projector** shows the projector layout at the window's size, and **#/ui/projector/dark** the same layout dark.

## Files

| File | What's in it |
|---|---|
| `src/styles/tokens.css` | Colors in light and dark, type sizes, space, radius, motion and projector sizes. Copied from GDG's `tokens.css`; its header lists what was left out and why |
| `src/index.css` | Bare elements (page, headings, links, buttons, fields, tables, lists) and the parts in `src/blocks/ui.tsx` |
| `src/blocks/kit.tsx`, `src/styles/kit.css` | The kit: `Button`, `Field`, `Tabs`, `Segmented`, `Badge`, `Banner`, `BannerStack`, `Stat`, `EmptyState`, `Skeleton`, `ConfirmButton`, `Projector` |
| `src/styles/contrast.ts`, `src/styles/contrast.test.ts` | Every color pair the app uses, and the test that measures them in light and dark |
| `src/pages/UIKit.tsx`, `src/styles/uikit.css` | #/ui and #/ui/projector |
| `index.html` | The Google Fonts link (Google Sans and Google Sans Code, both OFL; GDG `foundations.md` §3.1) |

## How the stylesheets stack

`tokens.css` declares three cascade layers in order: `tokens`, `base` (`index.css`), `kit` (`kit.css`). Team stylesheets have no layer, so **a team rule beats every base and kit rule, whatever its selector**. Two things follow:

- A page can restyle a kit part with one plain class rule, no `!important` and no long selectors.
- A broad team rule such as `.host-root button { background: transparent }` also restyles every kit `Button` inside `.host-root`. Scope team rules to the team's own classes, or skip the kit's with `:where(:not(.btn, .tabs__tab))` as host.css does. `src/styles/contrast.test.ts` fails when an element rule under a page's `-root` class reaches a kit button or tab.

Two base rules use `!important` on purpose, and in a layer that beats every team rule: `[hidden]` always hides, and reduced motion cuts every animation and transition to 1ms.

Cascade layers need Safari 15.4, Chrome 99 or Firefox 97 or later. An older browser gets the page without the shared styles.

## Tokens

Pages use the short names below; the `--rcc-*` names behind them are GDG's. Change a value in `tokens.css` and run `npm test`.

### Colors

| Name | Light | Dark | Job |
|---|---|---|---|
| `--bg` | `#f7faf8` | `#121412` | The page |
| `--surface` | `#ffffff` | `#1b211c` | Cards and fields: white on the tinted page in light, one step lighter than the page in dark |
| `--fill` | `#e3eae3` | `#262b27` | Table heads, grey badges and banners, skeletons, the confirm box |
| `--text` | `#1e201e` | `#e6e9e6` | Words |
| `--muted` | `#575a58` | `#b9bcba` | Hints, times, labels under numbers |
| `--line` | `#ccd4cd` | `#424943` | Dividers only (1.44:1): never the only edge of a control |
| `--line-strong` | `#727873` | `#919791` | Field and outline-button edges, badge and banner edges |
| `--accent` | `#00732d` | `#96d6a0` | Links, the main button, the chosen tab, big numbers |
| `--accent-text` | `#ffffff` | `#003410` | Words on `--accent` |
| `--accent-soft` | `#cff1d3` | `#00531e` | A chosen option, a success banner, a green badge |
| `--accent-soft-text` | `#003a13` | `#c6eccb` | Words on `--accent-soft` |
| `--error` | `#c5150f` | `#ffb3a8` | Error words and the danger button |
| `--error-text` | `#ffffff` | `#660604` | Words on `--error` |
| `--error-soft` | `#ffeae6` | `#910906` | An error line or banner |
| `--error-soft-text` | `#6f0604` | `#ffdbd4` | Words on `--error-soft` |
| `--live` | `#e09f2e` | `#e7ae58` | The Live badge's fill |
| `--live-text` | `#392300` | `#392300` | Words on `--live` |
| `--warn` | `#ffe5c0` | `#624000` | A warning banner or badge |
| `--warn-text` | `#4f3400` | `#fcdeb5` | Words on `--warn` |
| `--code-bg`, `--code-text` | `#eef6ef`, `#2f312f` | `#1b211c`, `#dadedb` | Code |
| `--focus` | `#00732d` | `#96d6a0` | The keyboard focus ring |

Rules:

- Put words only on the fill `contrast.ts` measured them against. A new pair goes into `PAIRS` first.
- A tinted fill (`--accent-soft`, `--warn`, `--error-soft`, `--fill`) that marks a state comes with a 1px `--line-strong` edge: the fill alone is under 3:1 against the page.
- `--live` is a fill under `--live-text`, never a color for words or a bare dot (2.18:1 on the light page).
- Red means something failed or can't be undone. It never decorates.
- No blue, and never the four Google colors together in one part (GDG `bright-lines.md` §1.3). The app leaves out GDG's blue and its two bright fills.
- `data-theme="light"` or `data-theme="dark"` on any element themes it and everything inside, whatever the system setting (#/ui and `Projector` use it).

### Type

Google Sans for words, Google Sans Code for code and the ledger line. Weights: 400 for sentences, 500 for headings, labels and buttons, 700 kept for rare emphasis. Ligatures are off everywhere, because Google Sans turns a few typed strings into the Google logo and students type names and questions (GDG `foundations.md` §2.8).

| Name | Size | Use |
|---|---|---|
| `--fs-h1` (`h1`, `.text-h1`) | 28 to 40px, grows with the window | Page title |
| `--fs-h2` (`h2`, `.text-h2`) | 20 to 24px | Card title |
| `--fs-h3` (`h3`, `.text-h3`) | 18px | A section inside a card |
| `--fs-body` | 17px | Sentences |
| `--fs-small` (`.text-small`, `small`) | 15px | Hints, times, table cells |
| `--fs-label` (`.text-label`) | 15px, weight 500 | Buttons and field names |
| `--fs-ledger` (`.ledger`) | 13px, code face, uppercase | Dates, rooms, counts: tokens, never a sentence |
| `--fs-stat` | 24 to 32px | A `Stat` number |
| `--fs-big` | 64 to 160px | The `Big` number |

The `.text-*` classes give a role's look without its heading level, so the heading order stays right for screen readers. Line heights are plain ratios, so a big number inside a paragraph gets a line that fits it.

### Space, size and shape

- `--rcc-space-N` is N x 4px (`--rcc-space-4` is 16px).
- Page margin: 16px under 600px wide, 32px from 600px, 48px from 1024px. Card padding: 16px, then 24px from 600px.
- Hit areas: buttons are 48px tall (`--rcc-target-min`); anything tapped on a phone is at least 44 x 44 (`--tap`); `.btn--small` (36px) is for laptop pages only.
- Radius: 4px badges, 8px fields and pressed buttons, 16px cards and banners (`--radius`), 24px page-level panels, fully round only for things you press.

### Motion

- Position, size and corner changes run on the spatial track (200 to 320ms, may overshoot); color and opacity on the effects track (90 to 140ms, never overshoot).
- Nothing moves unless it's the thing the screen is about, such as a count arriving or a bar filling. No background motion, no shimmer or pulse on loading blocks.
- A loading spinner shows only when the wait passes 0.4 seconds, so a quick load doesn't flash it.
- With reduced motion on, spatial times go to 0 and `index.css` cuts every animation and transition in the app to 1ms, team stylesheets included.

### Projector sizes

`Projector` sets these from GDG `presentation.md` §13.3, at 1920 x 1080: heading 92px, body 48px, small 40px, ledger and badges 32px, the `Big` number 240px, margins 96px. They scale with the window (`--stage-u`), so a 1280 x 720 preview shows the same layout at 2/3 size. GDG's floors are 72px for titles, 40px for body and 32px for the ledger; nothing on the projector goes under them.

## Base elements

What bare HTML gets with no class:

- **Buttons:** a bare `<button>` is the main button (green, 48px, fully round; pressed, it squares its corners to 8px). One class makes the others: `.btn--secondary` (outlined), `.btn--quiet` (green words only), `.btn--danger` (red, for what can't be undone), `.btn--small` (laptop pages only), `.btn--block` (full width), `.btn--quiet.btn--flush` (a quiet button whose words line up with the text under it). `<a class="btn btn--secondary">` is a link that looks like a button. Disabled is 50% opacity.
- **Fields:** text inputs and textareas fill their width, stand 48px tall with 17px words (16px or more, or iOS Safari zooms in), and have a `--line-strong` edge. `aria-invalid="true"` turns the edge red. A `<select>` keeps its own width in a row and fills a `<label>` it sits in. A label around a checkbox or radio is a 48px row, so the whole row is the tap target.
- **Focus:** a 3px `--focus` outline, 2px clear of the control, on `:focus-visible`. Never remove it.
- **Links:** green and underlined, because green beside body words is under 3:1.
- **Lists and tables:** `.list` is rows with dividers and no bullets. Tables have rules between rows, a `--fill` head and fixed-width numbers; wrap a wide one in `.table-scroll`.
- **Helpers:** `.row` (wrapping flex row, 12px gap), `.stack` (column, 12px gap, no child margins), `.muted`, `.error`, `.ledger`, `.sr-only`.
- **The parts in `ui.tsx`:** `Screen` keeps content at 688px (1248px with `wide`) and grows the margins; `Card` is a white panel with a 1px divider edge; `Big` is one green number; `Status` loading shows a delayed spinner, empty is muted words, and error is a tinted box with an edge.

## The kit

`import { Button, Field, ... } from "../../blocks/kit";` (the path from a team folder). Each part is typed. `Button` passes any other prop to its `<button>`. The other parts take only the props listed below and drop anything else: TypeScript still accepts an `aria-*` or `data-*` attribute on them, but it never reaches the page, so put those on your own element around the part.

### Button

```tsx
<Button onClick={checkIn}>Check in</Button>
<Button variant="secondary" small onClick={download}>Download CSV</Button>
<Button busy={saving} onClick={save}>Save</Button>
```

`variant` is `primary` (one per screen), `secondary`, `quiet` or `danger`. `busy` keeps the width, shows a spinner over the words (still read by screen readers) and ignores presses. `type` is `"button"` unless you pass `"submit"`.

### Field

```tsx
<Field label="Email" hint="The one you check in with" error={emailError}>
  {(f) => <input {...f} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />}
</Field>
```

The label, then the hint and the error, then the field: the error sits above a phone's keyboard, and a screen reader reads both with the field (`aria-describedby`, `aria-invalid`).

### Tabs

```tsx
<Tabs label="Professor view" value={tab} onChange={setTab} tabs={[
  { id: "now", label: "Now", panel: <Now /> },
  { id: "questions", label: "Questions", panel: <Questions /> },
]} />
```

Left and right arrows, Home and End move between tabs. Only the open panel is rendered. Leave out `value` and `onChange` and the first tab starts open.

### Segmented

```tsx
<Segmented label="Team size" value={size} onChange={setSize}
  options={[{ value: "3", label: "3" }, { value: "4", label: "4" }]} />
```

Pick one of 2 to 5 short options. Real radio buttons, so arrow keys and screen readers work. `block` shares the full width (phones); `hideLabel` keeps the label for screen readers only. The chosen option changes fill, ring and words together.

### Badge

`<Badge tone="live">Live</Badge>`: tones `neutral`, `accent`, `live`, `warn`, `error`. A short label on something ("5 min late", "Slide 12 of 30"). The words carry the meaning; the color repeats it. Square corners, because a badge is never pressed.

### Banner and BannerStack

```tsx
<Banner tone="error" title="The quiz didn't load." action={<Button variant="secondary" onClick={retry}>Try again</Button>}>
  Check the connection.
</Banner>
```

Tones `info`, `success`, `warn`, `error`. An error banner is announced at once (`role="alert"`); the others when they change (`role="status"`). `BannerStack` pins banners to the bottom of the screen above the iPhone home bar (the late banner). Inside a banner, links, `.muted` words and outlined or quiet buttons take the banner's ink; a filled `<a className="btn">` keeps its own words.

### Stat

`<Stat value={42} label="Checked in" accent />`: a number with what it counts, for a row of counts on a laptop page. `Big` (in `ui.tsx`) is the one number read from across a room.

### EmptyState

`<EmptyState title="No questions yet" action={...}>Students ask from the Live slides page on their phones.</EmptyState>`: what a list shows before it has anything. Say what will show up and how it gets there, naming the page people see (its title), never a #/ route.

### Skeleton

`<Skeleton />` (three grey lines) or `<Skeleton height="12rem" />` (one block): where content will land, so nothing jumps when it arrives. It holds still. Screen readers hear "Loading".

### ConfirmButton

```tsx
<ConfirmButton question="End class for today?" confirm="End class" onConfirm={() => endClass({ channel })}>
  End class
</ConfirmButton>
```

The first press asks the question with two buttons; Cancel or Escape goes back, and focus returns to the first button. The box closes when `onConfirm` finishes. When it throws, the box stays open so the person can try again, and shows the error under the question: a `ConvexError`'s words ("That class already ended."), or "Something went wrong. Try again." for anything else. Pass `onError={(e) => ...}` to show it on the page instead; then the box shows nothing. Don't catch and rethrow inside `onConfirm`: the box catches the error, so it never shows up as an uncaught error in the console. `variant` is `danger` (default) or `primary`.

### Projector

```tsx
<Projector ledger="A-210 · slide 12 of 30" title="Team board">
  <Big value={42} label="checked in" />
</Projector>
```

The room's screen at the sizes above. Light unless you pass `theme="dark"` or `theme="system"`: decks run light in A-210, and a dark ground washes out on a projector.

## Rules for each surface

### Student phone

iPhone Safari at 390 x 844, and 320 wide. One hand, a glance during a lecture. Routes: #/checkin/student, #/live, #/portal, the quiz card.

- One main action per screen, as the primary button. The state shows without scrolling: checked in or not, quiz open or ended, which team.
- Nothing smaller than 44 x 44 to tap: no `.btn--small`; a link on its own line gets `className="btn btn--quiet btn--flush"`, so its words line up with the line under it.
- No sideways scroll at 320 wide: no fixed widths over 288px, and long names and emails break (`overflow-wrap: break-word` on the page; add `anywhere` only on an element that must shrink below its longest word, like `.kiosk__name`).
- Every screen has a loading state (`Status` or `Skeleton`), an empty state, an error state with a way to try again, and a signed-out state.
- `.page` keeps words clear of the iPhone's corners and home bar once the viewport tag has `viewport-fit=cover` (see "Not done yet").

### Professor laptop

1280 to 1440 wide, at the lectern, mid-lecture. Routes: #/host, #/checkin/teacher, #/checkin/quiz, #/admin.

- `Screen wide`. Counts as a row of `Stat`s at the top; sections as `Tabs`.
- `.btn--small` is fine here. Anything that can't be undone (End class, End day, Remove) is a `ConfirmButton`.
- Tables go in `.table-scroll`, with numbers in their own column.
- Keep the page readable at a glance between slides: the counts don't move when new data lands (tabular numbers, fixed slots).

### Projector

1920 x 1080, read from the back of a lecture hall. Routes: #/checkin/stage, #/live/leaderboard, and the late banner on them.

- Wrap the page in `Projector`. Nothing under 32px; body words at 48px.
- One thing the room reads first: a `Big` number or the heading. Light theme.
- Motion only for the subject (a count arriving, a bar filling), and never a loop under 4 seconds.
- Nothing private on the projector: no emails, no keys, no addresses in the page.

### Door iPad

820 x 1180 portrait, front camera, students walking past at about 1 meter. Route: #/checkin/kiosk (the pairing screen and the scanner).

- The result is words at heading size or bigger ("Checked in", "Try again"), and its color only repeats the words.
- The count of people checked in is a `Big` number.
- Every button is at least 48px tall; no `.btn--small`.

### iOS app

The SwiftUI app in `ios/` doesn't read these stylesheets. Use the hex values in the color table, the system font, and the same phone rules. Never bundle Google Sans in the app: GDG `foundations.md` §3.1 says not to self-host it, because the club has no license it can point to for handing out the font file. If the app needs a bundled font, use Inter (OFL, in `google/fonts`, `foundations.md` §3.8).

## Contrast

`src/styles/contrast.ts` lists each pair the app draws (words, edges or rings on a fill) with its minimum: 4.5:1 for words, 3:1 for large words (24px, or 19px bold) and for edges, focus rings and bars. `contrast.test.ts` reads `tokens.css` and fails when any pair is under its minimum in light or dark. It also:

- measures every rule in `src/**/*.css` that sets both `color` and `background` from tokens, so a team rule with a weak pair fails without a list entry;
- checks that the dark colors are the same from the system setting and from `data-theme="dark"`, and that a `data-theme` scope gets its theme's colors inside a page of the other theme;
- checks that every `var()` in the app's stylesheets names a property some stylesheet sets.

When a page puts words or an edge on a fill that isn't in `PAIRS`, add the pair. #/ui shows every pair with the ratio the browser draws.

## Where the app differs from GDG on purpose

- **Focus ring:** an outline, where GDG uses a box-shadow, so a team rule that sets `box-shadow` on a button can't hide it.
- **Disabled:** 50% opacity, where GDG uses 38%, so a locked quiz answer stays readable on a phone.
- **Busy button:** the spinner sits over the words (opacity 0), where GDG puts it in a leading slot, so the button never changes width.
- **Line heights:** ratios, where GDG uses px for fixed sizes, so a bigger font inside an element never overlaps the next line.
- **Ligatures:** off on everything, where GDG turns them off only in code.
- **Tap floor:** 44px for anything on a phone, on top of GDG's 48px buttons.

## Not done yet

- `index.html` has no `viewport-fit=cover`, so the safe-area insets read 0 and Safari keeps pages inside the safe area itself. Adding it needs the kiosk, stage and portal checked on an iPhone first.
- Text shifts a little when Google Sans arrives, because the fallback font's size differs (GDG `foundations.md` §3.9 leaves `size-adjust` open too).
- The light theme, the dark alphas and the 2px projector rules haven't been looked at on the A-210 projector.
