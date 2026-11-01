# Building blocks

Everything the product needs that isn't the product. Each block is tested on the lab page (`#/lab`). Use these; don't rebuild them.

## Sign-in and staff roles

**Browser:** the app is already wrapped in `<AuthProvider>` (`src/main.tsx`).

```tsx
import { SignInButton, SignedInAs, StudentSignIn, useGoogleUser } from "../blocks/auth";

const { user, signOut } = useGoogleUser(); // user: { name, email, picture } or null
return user ? <SignedInAs /> : <SignInButton />;  // staff screens: Google's button, the typed test form under it in `npm run dev`
return user ? <SignedInAs /> : <StudentSignIn />; // student screens: the same
```

On the live site everyone signs in with Google: the typed test form shows only in `npm run dev` builds, and prod refuses typed tokens (`convex/auth.config.ts` lists them only on the dev backends in `DEV_HOSTS`). Google and the typed form give the same email two identities on the server (`tokenIdentifier` is issuer|subject), so a student who checked in with one and signed back in with the other would have no check-in, a second pass and a second attendance row. `<SignedInAs />` is "Signed in as Jane Doe (jane@example.edu)" with a "Not you? Sign out" button. `<GoogleButton />` is Google's button on its own; Google's script loads only where a page shows it or someone is signed in with Google. Show a sign-in only to someone signed out. Every tab shares the sign-in (signing in or out in one tab does it in the others), and a sign-in the server refuses is dropped so the sign-in shows again.

**Server:**

```ts
import { requireUser } from "../lib";
import { requireAdmin, requireProf, requireScanner, staffRole } from "../checkin/prof"; // from convex/<team>/

const me = await requireUser(ctx);     // throws "Sign in first." when signed out
me.tokenIdentifier                     // the user key to store
me.name, me.email                      // from Google or the typed form
await requireProf(ctx);                // a professor or admin, or it throws; returns { email, role }
await requireAdmin(ctx);               // an admin
await requireScanner(ctx, device);     // a paired door iPad's device token, or anyone with a role
await staffRole(ctx);                  // "admin" | "professor" | "scanner" | null
```

Every host-only function starts with `requireProf(ctx)` (`requireHost` in `convex/lib.ts` is the same check) and takes no key. Roles are one per email in the `staff` table, changed on #/admin; the `ADMIN_EMAILS` env var lists permanent admins, who can't be changed or removed there. A role counts only for a Google sign-in with a verified email, or, on a dev backend, for a typed sign-in with an `@test.local` email that `staff:devGrant` gave one. `convex/staff.ts` lists the functions #/admin and the door iPad call, and who may call each.

**Staff pages** (`src/teams/checkin/prof.tsx`):

```tsx
import { DoorGate, SignInEnding, StaffGate, useStaff } from "../checkin/prof";

<StaffGate title="Live quiz"><ProfessorBoard /></StaffGate>       // professors and admins; anyone else sees the sign-in, or why theirs can't open the page
const me = useStaff();                                           // undefined loading, null signed out, else { email, role, canHoldRole }
<SignInEnding />                                                 // a Google sign-in's end time and Google's button, its last 5 minutes (StaffGate shows it)
<DoorGate>{(device) => <Scanner device={device} />}</DoorGate>   // #/checkin/kiosk: a scanner, a paired iPad (it signs out a professor or admin), or the pairing screen
```

**Testing as staff on a dev backend:** sign in with the typed form as an `@test.local` email, then `npx convex run staff:devGrant '{"email":"prof1@test.local","role":"professor"}'`. The role lasts 2 hours, and `staff:devRevoke` ends every one at once; devGrant refuses on any backend not in `DEV_HOSTS` (prod included) and refuses any other email. To test the door iPad, open #/checkin/kiosk signed out and type its code on #/admin.

Google's tokens last an hour and a typed sign-in 12 hours; a sign-in ends a minute before its token runs out, and the page shows the sign-in again. For a Google sign-in, 5 minutes before its token runs out, `AuthProvider` asks Google for a new one: Chrome signs the same account back in with no click, while Safari and Firefox show Google's One Tap card, which needs a click (never on #/checkin/kiosk). Professor pages and #/admin show `<SignInEnding />` then, so a professor in any browser can sign in again before the end and keep the page open.

## Live data (Convex)

Any `useQuery` re-renders on its own when the data changes, on every device. That is the whole real-time system; there is nothing else to set up.

```tsx
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";

const last = useQuery(api.lab.lastPing);   // undefined while loading, null before the first ping
const ping = useMutation(api.lab.ping);       // professors and admins only
```

`lab.lastPing` is open to anyone. `lab.ping` refuses everyone but professors and admins ("Only professors can do that."), so never put it on a student page; a student page calls its own team's mutation. `lab.pings` is a count that stops at 500 and stays only for #/lab tabs opened before `lastPing` existed: don't use it.

Errors thrown as `new ConvexError("text")` arrive in the browser as `e.data`; show that text.

## QR code

```tsx
import { QR } from "../blocks/qr";
import { pageUrl } from "../blocks/router";

<QR value={pageUrl("join/ABC123/xyz")} size={360} label="Scan to check in" />
```

SVG, sharp on a TV. To make a code that expires, change the value on a timer from a value the server hands out (a mutation can make a random one with `randomCode()` from `convex/lib.ts` and store when it was made).

## Location

```tsx
import { useLocation } from "../blocks/location";

const { fix, error, busy, request } = useLocation();
<button onClick={() => request().then((f) => checkIn({ lat: f.lat, lng: f.lng, accuracyM: f.accuracyM }))}>Share location</button>
```

Only from a button press, and only over HTTPS or localhost. Check on the server:

```ts
import { metersBetween } from "../lib";
const d = metersBetween(lat, lng, room.lat, room.lng);
if (d > room.radiusM + Math.min(accuracyM, 300)) throw new ConvexError("You look too far from the room.");
```

Indoors a phone is often 20 to 100 m off. Treat location as a soft check; pair it with something only people in the room can see (a QR that changes).

## Deck bridge (which slide the professor is on)

**Sending, from a deck-kit deck.** Add one line after `deck.js`:

```html
<script src="https://sam-t-g.github.io/rcc-live-lecture/deck-bridge.js"
        data-site="https://<deployment>.convex.site" defer></script>
```

Then open the deck with `?bridge=<channel>.<DECK_BRIDGE_KEY>` on its URL (the key is in Convex env: `npx convex env get DECK_BRIDGE_KEY`). Without that parameter the script does nothing. It sends on every press: slide number, presses shown, slide count, the heading, and the slide's visible text in order. Never speaker notes, never beats not shown yet. Presenter, mirror, and remote windows don't send.

**During a meeting, every lead's own backend.** Each lead runs their own dev deployment, so the presenting tab adds `&bridge-site=<name>,<name>` (deployment names, like `quaint-swan-637`) and sends to all of them instead of `data-site`. Each of those deployments needs the same `DECK_BRIDGE_KEY` (`npx convex env set DECK_BRIDGE_KEY <the value Sam gives you>`). The 10-29 deck sends on channel `gdg`.

**Reading, in the app:**

```tsx
import { useDeckSlide } from "../blocks/deck";

const slide = useDeckSlide("gdg-10-29"); // { index, beat, count, title, lines, at } | null | undefined
```

`index` is 0-based. Use `slide.index` as the key for anything per slide (reactions, questions, "I'm lost").

**Reading, on the server:** query the `deckChannels` table by the `by_channel` index, the way `convex/deck.ts` does.

A channel is just a name. A product that has sessions can store its channel on the session row.

## AI (Gemini)

Server only, inside an action:

```ts
import { action } from "../_generated/server";
import { geminiText } from "../ai";

export const explain = action({
  args: { text: v.string() },
  returns: v.string(),
  handler: async (ctx, { text }) => geminiText(`Explain in two plain sentences:\n\n${text}`),
});
```

Pick a model by tier or by exact ID: `geminiText(prompt)` uses the fast tier, `geminiText(prompt, "smart")` the strong one. For images, audio, or PDFs, and for JSON back:

```ts
import { gemini } from "../ai";
// photo: base64 from the browser (FileReader, or a canvas from the camera), a few MB at most
const reply = await gemini({
  model: "fast",
  system: "You read lecture slides for students. Plain words, no jargon.",
  parts: [{ text: "What is on this slide? Return {\"summary\": string, \"terms\": string[]}" }, { inlineData: { mimeType: "image/jpeg", data: photo } }],
  json: true,
});
const { summary, terms } = JSON.parse(reply);
```

Set up on Sam's dev and on prod (2026-10-29): fast is `gemini-3.8-flash`, smart is `gemini-pro-latest`. Another lead's own dev backend needs `GEMINI_API_KEY`, `GEMINI_MODEL_FAST`, and `GEMINI_MODEL_SMART` set the same way (Sam sends the key privately). `npx convex run ai:models` lists every model the key can call (Flash, Pro, image generation, speech, transcription); `npx convex run ai:tryIt '{"model":"smart","prompt":"...","imageUrl":"https://...","json":true}'` tries one before you build on it. A room of students asking the same thing should share one answer: save the result in a table keyed by slide and check it first.

## Vision (camera, on the device)

MediaPipe models that run in the browser: no key, nothing leaves the device, offline once loaded. Seven are ready, each tested on the lab page (`#/lab`, "Vision"):

| Kind | Finds | Good for |
|---|---|---|
| `gestures` | Thumb_Up, Thumb_Down, Open_Palm, Closed_Fist, Pointing_Up, Victory, ILoveYou | A thumbs poll: "got it?" counted by the professor's laptop camera |
| `hands` | 21 points per hand, left or right | Counting hands in the air, pointing at something |
| `pose` | 33 body points per person; `labels` says "hand up" | Counting raised hands across a row |
| `faces` | faces and boxes | How many people are facing the screen |
| `faceMesh` | 478 points per face and expressions (smile, blink) | Reactions, attention |
| `objects` | everyday objects with boxes | Phones out, laptops open, a book on the desk |
| `classify` | what the whole picture is | "What is this?" from a photo |

A page that only needs the camera picture (the teacher scanner, the door kiosk) imports `useCamera` from `src/blocks/camera.ts`, which doesn't load MediaPipe:

```tsx
import { useCamera } from "../../blocks/camera";

const cam = useCamera();                       // { video, on, error, start, stop }
// <button onClick={() => cam.start()}>Start camera</button>
// <video ref={cam.video} playsInline muted />  and show cam.error when it's set
```

A page that runs a model imports from `vision.ts`, which re-exports the same `useCamera`:

```tsx
import { loadVision, useCamera, useVisionLoop, drawSeen, type Runner } from "../../blocks/vision";

const cam = useCamera();                       // cam.video is the <video ref>; start from a button
const [runner, setRunner] = useState<Runner | null>(null);
async function go() { setRunner(await loadVision("gestures")); await cam.start(); }
useVisionLoop(cam.video, runner, cam.on, (seen) => {
  const ups = seen.labels.filter((l) => l === "Thumb_Up").length;   // { count, labels, raw }
  // drawSeen(canvas, "gestures", seen, cam.video.current!.videoWidth, cam.video.current!.videoHeight);
});
// <video ref={cam.video} playsInline muted /> and a <canvas> on top of it for drawSeen
```

- **Load it lazily.** The library is about 160 KB; import the page or component that uses it with `React.lazy` (as `src/pages/Lab.tsx` does), so phones on other pages never download it. Each model is a few MB the first time, then cached.
- **The camera** (`useCamera`, in `src/blocks/camera.ts`) starts only from a button press. On a Mac it skips an iPhone (Continuity Camera) and uses the built-in one. Import it from `camera.ts` unless the page also runs a model, so MediaPipe stays out of that page's bundle.
- **Privacy:** send counts or labels to Convex, never frames or face data. Say what the camera sees in TEAM.md.
- **A still picture:** `loadVision(kind, "IMAGE")`, then `run(img)` on a loaded `<img>`.
- **Gemini** reads pictures too (`gemini()` with an image part, above). Use it when you need words about a picture; use MediaPipe when you need it live, many times a second.

## Pages and routes

Hash URLs, so one GitHub Pages file serves every page.

The team pages are registered already (`src/pages/index.ts`): `#/checkin/...` → `src/teams/checkin/Page.tsx`, `#/live` → `src/teams/live/Page.tsx`, `#/host` → `src/teams/host/Page.tsx`. A team adds its own sub-pages by reading the rest of the URL:

```tsx
// src/teams/checkin/Page.tsx
import { useRoute, go, pageUrl } from "../../blocks/router";
export default function CheckinPage() {
  const [, part, code] = useRoute(); // #/checkin/join/ABC123 → ["checkin", "join", "ABC123"]
  if (part === "kiosk") return <Kiosk />;
  return <Join code={code} />;
}
// pageUrl("checkin/join/" + code) is the full URL to put in the kiosk's QR.
```

## Look

`src/index.css` has the tokens (`--accent`, `--surface`, `--muted`, ...) and base styles for `.page`, `.panel`, `button`, `input`, light and dark. Use the classes and tokens; put team-only styles in your team folder.

Screen parts in `src/blocks/ui.tsx`, so every team's pages look like one app:

```tsx
import { Screen, Big, Status, Card, Todo } from "../../blocks/ui";
<Screen title="Professor view" wide>          {/* wide for a kiosk or projector, narrow for phones */}
  <Big value={count} label="checked in" />    {/* one number, readable across a room */}
  <Status kind="loading">Waiting for the slide…</Status>   {/* or "empty", "error": the designer's words */}
  <Card title="Who's lost">…</Card>
</Screen>
```

`Todo` is the placeholder each team page starts with; delete it when the page is real.

## Shared data between teams

Tables and read functions the teams agreed on before the meeting: [docs/contracts.md](docs/contracts.md). Sample data for your own backend: `npx convex run dev/seed:fill '{"channel":"gdg"}'` (and `dev/seed:clear`). The lecture's channel is `CHANNEL` from `src/blocks/deck.ts`.
