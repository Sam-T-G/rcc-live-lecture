# Building blocks

Everything the product needs that isn't the product. Each block is tested on the lab page (`#/lab`). Use these; don't rebuild them.

## Google sign-in

**Browser:** the app is already wrapped in `<AuthProvider>` (`src/main.tsx`).

```tsx
import { SignInButton, useGoogleUser } from "../blocks/auth";

const { user, signOut } = useGoogleUser(); // user: { name, email, picture } or null
return user ? <p>Hi {user.name}</p> : <SignInButton />;
```

**Server:**

```ts
import { requireUser, requireHost } from "../lib";

const me = await requireUser(ctx);   // throws if not signed in
me.tokenIdentifier                   // the user key to store
me.name, me.email                    // from Google
await requireHost(ctx);              // throws unless the email is in HOST_EMAILS
```

Tokens last an hour; when one runs out the page shows the button again. Convex calls fail with "Sign in with Google first." until then.

## Live data (Convex)

Any `useQuery` re-renders on its own when the data changes, on every device. That is the whole real-time system; there is nothing else to set up.

```tsx
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";

const count = useQuery(api.lab.pings);   // undefined while loading
const ping = useMutation(api.lab.ping);
```

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

Needs `GEMINI_API_KEY` in Convex env (`GEMINI_MODEL` optional). A room of students asking the same thing should share one answer: save the result in a table keyed by slide and check it first.

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
