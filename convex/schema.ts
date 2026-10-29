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

  // Team tables. Agreed before the meeting so the teams never wait on each other: every
  // lecture is one deck channel ("gdg" on 10-29), and docs/contracts.md says who writes
  // each table and who reads it. A team may add fields; tell the team that reads the table
  // before renaming or removing one.

  // team: checkin. One kiosk per channel: the code its QR shows now and the one before it
  // (a phone that scanned a second before it changed still gets in), and where the room is.
  kiosks: defineTable({
    channel: v.string(),
    code: v.string(),
    prevCode: v.string(),
    at: v.number(), // when `code` was made
    lat: v.optional(v.number()),
    lng: v.optional(v.number()),
    radius: v.optional(v.number()), // meters
  }).index("by_channel", ["channel"]),

  // team: checkin. One row per student per channel.
  checkins: defineTable({
    channel: v.string(),
    user: v.string(), // identity.tokenIdentifier
    name: v.string(),
    at: v.number(),
    meters: v.optional(v.number()), // distance from the room when they checked in; never their coordinates
  })
    .index("by_channel", ["channel"])
    .index("by_channel_and_user", ["channel", "user"]),

  // team: live. One row per student per slide they said they're lost on.
  lost: defineTable({
    channel: v.string(),
    index: v.number(), // the slide, 0-based, as in deckChannels
    user: v.string(), // identity.tokenIdentifier
    at: v.number(),
  })
    .index("by_channel_and_index", ["channel", "index"])
    .index("by_channel_and_index_and_user", ["channel", "index", "user"]),
});
