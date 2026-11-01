// Block: deck bridge, the reading side. useDeckSlide(CHANNEL) gives the slide the deck on the
// "gdg" channel is on right now, live. It is undefined while the answer loads, and null when the
// deck hasn't sent a slide in this class: before its first press in a class, and after End
// class, even when the deck sent slides an hour earlier (convex/deck.ts `current`). Pass null to
// read nothing. The sending side is public/deck-bridge.js (BLOCKS.md, "Deck bridge").
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

// The channel everyone builds against: the 10-29 GDG deck sends on "gdg", and every class on it
// (one at a time, convex/lectures.ts) uses it. Check-ins, lost taps, and the kiosk are all keyed by it.
export const CHANNEL = "gdg";

export function useDeckSlide(channel: string | null) {
  return useQuery(api.deck.current, channel ? { channel } : "skip");
}
