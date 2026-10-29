# Contracts between teams

Three teams build one app at the same time, each on its own laptop and its own Convex dev backend. These are the tables and read functions they agreed on before the meeting, so nobody waits on another team. The tables are in `convex/schema.ts`; the read functions are already written and tested.

Every lecture is one **deck channel**. The 10-29 deck sends on `"gdg"`; use `CHANNEL` from `src/blocks/deck.ts`.

## Who writes, who reads

| Table | Written by | Read by |
|---|---|---|
| `deckChannels` | the deck bridge (`public/deck-bridge.js`) | everyone, through `useDeckSlide(CHANNEL)` |
| `kiosks` | Check-in | Check-in |
| `checkins` | Check-in | Live slides (`me`), Professor view (`count`, `names`) |
| `lost` | Live slides | Professor view (`lostCount`, `lostBySlide`) |

## Read functions (ready now)

| Function | Returns | Who can call it |
|---|---|---|
| `api.deck.current({ channel })` | the slide the deck is on: `{ index, beat, count, title, lines, at }` or `null` | anyone |
| `api.checkin.read.count({ channel })` | how many people checked in | anyone |
| `api.checkin.read.me({ channel })` | whether the signed-in person checked in | anyone (false if signed out) |
| `api.checkin.read.names({ channel })` | `[{ name, at }]`, newest first | hosts only |
| `api.live.read.lostCount({ channel, index })` | how many are lost on that slide | anyone |
| `api.live.read.lostBySlide({ channel })` | `[{ index, count }]` for every slide anyone is lost on | anyone |
| `api.live.read.mine({ channel, index })` | whether the signed-in person is lost on that slide | anyone (false if signed out) |

The writing side is each team's job: Check-in writes the kiosk code and the check-in mutation (code fresh, phone in the room, one row per person), Live slides writes the "I'm lost" mutation (one row per person per slide, a second tap can take it back).

## Rules

- **Keep the read functions working.** The team that owns a table owns its read file. Add fields freely; before renaming or removing one, tell the team that reads it.
- **Keys:** a person is `identity.tokenIdentifier`, a slide is its 0-based `index` from `deckChannels`.
- **Privacy:** store the distance from the room, never a phone's coordinates. Names go to hosts only.

## Building before the other team's part exists

Your dev backend starts empty. To see real-looking numbers before another team merges:

```sh
npx convex run dev/seed:fill '{"channel":"gdg"}'    # 8 sample check-ins, some lost taps on the current slide
npx convex run dev/seed:clear '{"channel":"gdg"}'   # removes only the sample rows
```

The slide feed reaches every lead's backend during the meeting (`&bridge-site=`, BLOCKS.md). To move it yourself, open the deck in a tab with `?bridge=gdg.<key>&bridge-site=<your deployment>` and press the arrow keys.
