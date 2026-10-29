// Block: deck bridge, the reading side. useDeckSlide("gdg-10-29") gives the slide a deck
// is on right now, live, or null before the deck sends anything. The sending side is
// public/deck-bridge.js (BLOCKS.md, "Deck bridge").
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

// The lecture everyone builds against. One lecture is one deck channel; the 10-29 GDG deck
// sends on "gdg". Check-ins, lost taps, and the kiosk are all keyed by it.
export const CHANNEL = "gdg";

export function useDeckSlide(channel: string | null) {
  return useQuery(api.deck.current, channel ? { channel } : "skip");
}
