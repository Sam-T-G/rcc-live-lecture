# Screen lab

The lab renders the real app (`src/App.tsx` with `src/index.css`) from fixture data, with no backend, so any screen state can be screenshotted on demand. Vite swaps `convex/react` for `lib/convex-mock.tsx`, which answers every query from the scenario's fixtures. Nothing in `src/` changes.

## Files

| File | What it does |
|---|---|
| `vite.config.ts` | The lab's Vite config: root `design/lab`, host 127.0.0.1, strict port from `--port` (or `LAB_PORT`), optimizer cache in the system temp folder (`rcc-live-lecture-lab/<checkout>/<port>`), `convex/react` aliased to the mock, `import.meta.env.DEV` set to false so screens render as on the live site (no typed test sign-in form). |
| `main.tsx`, `index.html` | `?s=<id>` mounts the app with that scenario's role, fixtures, clock and hash route. No `?s` lists every scenario as links. |
| `lib/types.ts` | The `Scenario` type and the helpers `fx`, `fails`, `refuses`, `hangs` and `at`. |
| `lib/convex-mock.tsx` | `useQuery`, `useMutation`, `useAction`, `useConvex`, `useConvexAuth`, `ConvexReactClient`, `ConvexProvider`, `ConvexProviderWithAuth`. |
| `lib/roles.ts` | What each role puts in localStorage, and the `staff:me` (and `staff:deviceStatus`) fixtures it starts with. |
| `lib/browser.ts` | The pinned clock, a stand-in for Google's sign-in script and button, a fake camera, and a stand-in QR reader. |
| `scenarios/<area>.ts` | One file per area: `phone`, `host`, `staff`, `projector`, `kiosk`. |
| `fixtures/<area>/` | Optional: shared fixture data (and, for the kiosk, `setup` helpers) for one area, checked only by that area's tsconfig. |
| `tsconfig.<area>.json` | Type-checks the shared lab files plus that one area's scenarios and fixtures. |
| `public/fake-deck.html` | A local stand-in deck for `#/checkin/stage?deck=`. |
| `shoot.mjs` | Starts Vite, screenshots every scenario, runs the render checks, writes PNGs and `manifest.json`, stops Vite. |

`design/tools/render.mjs` (comps), `design/tools/contact.mjs` (contact sheets) and `design/tools/vendor/axe.min.js` (axe-core 4.10.3, MPL-2.0, see its `LICENSE`) sit beside the lab; `design/system/` and `design/comps/` hold the design system and the round 7 comps.

## The contract

Each `scenarios/<area>.ts` exports `scenarios: Scenario[]`:

```ts
{
  id: "phone-pass-qr",            // starts with "<area>-", unique in the lab
  area: "phone",
  route: "checkin/student",       // the hash route without "#/"; "{origin}" becomes the lab's origin
  role: "student",                // signedout | student | professor | admin | door
  title: "Pass showing a fresh QR code",
  expect?: "error" | "loading" | "empty",
  fixtures: { ...fx(api.checkin.pass.mine, { ... }) },
  now?: "2026-11-05T10:14:00-08:00",
  later?: [{ afterMs: 500, fixtures: { ... } }],
  user?: { name?, email?, endsInMin?: 4, emailVerified?: false },
  clicks?: ['button:has-text("Start check-in")'],
  type?: [{ label: "Code on their phone", text: "RCC-482913", submit: true }],
  scrollTo?: "section.panel:has(.quiz__q)",
  fullPage?: true,
  tickMs?: 26_500,
  camera?: "fake" | "denied",
  qr?: "RCC-482913",
  google?: "failed",
  signIn?: "refused",
  setup?: (w) => { ... },
}
```

- **fixtures**: keys are `"module:function"`, the way `getFunctionName` names them (`"checkin/pass:mine"`, `"live/groups:leaderboard"`). A value is what the query returns, or a function of the call's args that returns it. Write every entry with `fx(api.x.y, value)`: it checks the value against the function's real return type, so `tsc` catches drift when the backend changes. `"skip"` args give `undefined` as Convex does. Mutations and actions resolve to their fixture when there is one, else `null`, and log the call.
  - `fails()`: a query that throws, so its error boundary shows (use with `expect: "error"`).
  - `refuses("words")`: a mutation or action the server refuses with `ConvexError("words")`, so the page shows those words (`why()`, `errorText()`).
  - `hangs()`: a query that stays loading on purpose, or a mutation or action that never answers, so its button stays busy (Sending, Drafting).
  - A query with no fixture at all stays `undefined` and logs `[lab] no fixture for <name>`; `shoot.mjs` lists it under `missingFixtures` and fails the scenario. A loading state names each query it waits on with `hangs()`.
- **role**: `signedout` has no sign-in and `staff:me` is `null`. `student`, `professor` and `admin` save an unsigned Google-shaped ID token (issuer accounts.google.com, verified email, ends 10 days after `now`) under `rcc-live:google-id-token`, and `staff:me` gives `role` null, `"professor"` or `"admin"`. `door` saves a device token under `rcc-live:door-device` and `staff:deviceStatus` gives `{ status: "paired" }`, so `#/checkin/kiosk` opens the scanner. A scenario's own fixtures win over the role's, so a scanner is `role: "student"` plus `fx(api.staff.me, { email, role: "scanner", canHoldRole: true })`, and an unpaired iPad is `role: "signedout"` plus a `staff:deviceStatus` fixture.
- **user**: the signed-in person in place of the role's lab person; `name` and `email` default to the role's. `endsInMin` ends the Google sign-in that many minutes after the page opens (over 1; 5 or under shows the sign-in ending banner, SH-09). `emailVerified: false` gives a token whose email Google hasn't verified (SH-13); `staff:me` then has no role and `canHoldRole: false`.
- **expect**: `"error"` means the page or a part of it shows its error boundary on purpose. `"loading"` and `"empty"` are notes for reviewers. A blank page always fails. Only ErrorBoundary's own output counts (`src/blocks/ui.tsx`): an element with `data-boundary="page"` or `"part"`, or the boundary's exact markup, never other text that ends in "didn't load.".
- **now**: the page clock starts at this time and runs on from it. Compute fixture times from it with `at(NOW, minutes)`. Shots use the America/Los_Angeles time zone and en-US.
- **later**: fixture changes after the page opens, for states that show only on a change. The late banner shows only arrivals scanned after the page opened (`newArrivals` in `src/teams/checkin/late.ts`), so a late-banner scenario sets `lateFeed` to `[]` and adds the arrival in `later` as a fixture function that stamps it with the page's clock: `() => [{ ..., at: Date.now() }]`. `shoot.mjs` waits for the last step before the screenshot.
- **clicks**: presses `shoot.mjs` makes after the page is ready, as real pointer input, with Playwright selectors. Opening the lab by hand skips them (and `type`, `scrollTo`, `tickMs`).
- **type**: keystrokes after the clicks, one field at a time. Name the field by `label` (a kit Field's label or an aria-label, exact) or by a Playwright `selector`. `submit: true` presses Enter in the field; `submit: "<selector>"` clicks that (a textarea, where Enter starts a new line). `shoot.mjs` checks the field still holds the text a moment later and types it again, up to 3 times, when the page drew its form anew (#/admin draws its forms once the staff check lands).
- **scrollTo**: scrolls this element (a Playwright selector) into view before the shot: centered when it fits the viewport, else its top at the top. Shots are one viewport tall.
- **fullPage**: shoots the whole page instead of one viewport.
- **tickMs**: moves the pinned clock forward this many ms after the clicks and typing, then waits 1.2 s for the page's next 1 s tick (the pass page turns a code old at 25 s). Timers the page already set still fire on real time. A scenario with `tickMs` and no `now` pins the real time.
- **camera**: `"fake"` (the default) gives a still gray frame named "Lab camera"; `"denied"` refuses like a blocked permission prompt. No scenario ever opens a real camera.
- **qr**: a pass in front of the camera. A stand-in BarcodeDetector reads this text off every frame, so the teacher scanner and the door kiosk scan it once the camera is on.
- **google**: `"failed"`: Google's sign-in script fails to load, so the page shows its "didn't load" line in place of the button (SH-05).
- **signIn**: `"refused"`: the server refuses the role's saved sign-in. Convex reports "checking" and then "not signed in", the app drops the sign-in, and the page shows "The server didn’t accept that sign-in." (SH-06). `staff:me` is `null`.
- **setup**: per-scenario browser stand-ins, run before the app mounts: a missing `navigator.wakeLock`, a camera that never finishes starting, a track that ends on its own (`fixtures/kiosk/door.ts`). Put browser stubs here and the scenario's data in its fixtures.

## Add a scenario

1. Find the route's page in `src/pages/index.ts` and the `src/teams/*/Page.tsx` it opens, and list every `useQuery` on that screen (`git grep -n "useQuery(" src/teams/<team>`).
2. Add an entry to `scenarios/<area>.ts` with an `fx` fixture for each query (`hangs()` for the ones still loading). Use fake data only: made-up first names (Pip, Quill, Wren) and example.edu emails.
3. Type-check your area: `node_modules/.bin/tsc --noEmit -p design/lab/tsconfig.<area>.json`.
4. Shoot your area and open the PNGs.

## Shoot

From the checkout's root (it needs `npm ci` there for Vite):

```sh
node design/lab/shoot.mjs --port <port> --out <out> --only <area>
```

- `--only` takes an area or an id prefix, comma separated (`--only phone`, `--only projector-stage`).
- `--themes light,dark` (default both), `--primary-only` (skips phone320 and laptop1280), `--strict`.
- Areas map to surfaces: phone to phone (390 x 844 and 320 x 693, WebKit), host and staff to laptop (1440 x 900 and 1280 x 800, Chromium), projector to projector (1920 x 1080, Chromium), kiosk to ipad (820 x 1180, WebKit). Sizes, text floors, target sizes and the axe run are the same as `design/tools/render.mjs`.
- Playwright comes from `LAB_PLAYWRIGHT`, a `node_modules` folder that has `playwright` (default `~/Documents/repositories/rcc-gdg/node_modules`), and axe-core from `LAB_AXE` (default `design/tools/vendor/axe.min.js`). A missing one stops the run with a line naming the path. `render.mjs` and `contact.mjs` read the same two settings.
- Ports 5173, 5174, 47123 and 47124 belong to the app's own build; the lab refuses them.
- Writes `<out>/<id>.<size>.<theme>.png`, `<out>/manifest.json` (render.mjs's record plus `scenario`, `area`, `title`, `role`, `route`, `expect`, `state`, `missingFixtures`, `blocked`, `fatal`) and, when something failed, `<out>/fatal.json`.
- Every request that leaves 127.0.0.1 is blocked and listed under `blocked`.
- Exit 1 when a scenario fails to load (a broken area file, an `--only` that matches no area or scenario), a click, typing or scroll step fails, it renders a blank page, shows an error boundary without `expect: "error"` or shows none with it, reads a query with no fixture, or sends a request off 127.0.0.1. Render-check hard failures (sideways scroll, axe serious or critical, small text, small targets, page errors) go in the manifest and keep exit 0, since the baseline records today's screens. `--strict` makes them exit 1 too.

To look at the lab in a browser by hand: `node_modules/.bin/vite --config design/lab/vite.config.ts --port <port>`, open `http://127.0.0.1:<port>/`, and stop the server when done.

## Known gaps

- **Fonts**: the app's `index.html` links Google Fonts and the lab makes no outside requests, so Google Sans comes from the copy installed on this Mac (static weights, no GRAD axis). Google Sans Code isn't installed, so code text falls back to the next font in `--rcc-font-code`. `manifest.json` lists only web fonts under `fonts`, so it shows `[]`.
- **Google's button** is a stand-in drawn in a frame of about Google's size (240 x 44, white pill, "Continue with Google"). The real one is Google's own frame and can differ slightly.
- **Development React**: the lab runs Vite's dev server, so React is the development build without StrictMode. Screens match the live build; timing and console warnings can differ.
- **Live updates** happen only through `later`. Fixtures don't react to mutations: pressing a button logs the call and the screen stays as the fixtures say, so a saved state (a kept question, a paired iPad in the list) is a fixture.
- **Deck frames**: `#/checkin/stage` and `#/portal` show decks in a frame. Point `?deck=` at `{origin}/fake-deck.html`; an outside deck is blocked and shows an empty frame.
- **MediaPipe** (`src/blocks/vision.ts`, `#/lab` vision panels) loads its model from the internet, which the lab blocks; Vite warns once that it can't analyze MediaPipe's dynamic import.
- **usePaginatedQuery** isn't mocked: the app doesn't use it. One-off `convex.query` calls (the extra credit CSV) answer from fixtures too.
