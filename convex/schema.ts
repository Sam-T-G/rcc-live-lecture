import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// Only the plumbing tables live here before the meeting. Product tables (sessions,
// check-ins, anything a team builds) get added at the bottom, one commented block each.
export default defineSchema({
  // Block: deck bridge. The latest slide a deck is on, per channel (BLOCKS.md, "Deck bridge").
  deckChannels: defineTable({
    channel: v.string(),
    index: v.number(), // 0-based slide number
    beat: v.number(), // presses revealed on that slide
    count: v.number(), // slides in the deck
    title: v.string(),
    lines: v.array(v.string()), // the slide's visible text, in order
    at: v.number(),
  }).index("by_channel", ["channel"]),

  // Block: lab. One row per press of the lab page's "ping" button, to prove live sync.
  pings: defineTable({
    user: v.string(),
    at: v.number(),
  }),
});
