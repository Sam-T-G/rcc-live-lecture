// Block: deck bridge, the reading side. useDeckSlide("gdg-10-29") gives the slide a deck
// is on right now, live, or null before the deck sends anything. The sending side is
// public/deck-bridge.js (BLOCKS.md, "Deck bridge").
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

export function useDeckSlide(channel: string | null) {
  return useQuery(api.deck.current, channel ? { channel } : "skip");
}
