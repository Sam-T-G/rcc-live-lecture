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
    email: v.optional(v.string()), // for the professor's attendance sheet; hosts only
    lateMin: v.optional(v.number()), // minutes after class start plus grace; missing = on time
  })
    .index("by_channel", ["channel"])
    .index("by_channel_and_user", ["channel", "user"]),

  // team: checkin. Each student's own QR pass. The code changes every 20 seconds so a
  // screenshot sent to a friend stops working; the one before it still scans.
  passes: defineTable({
    user: v.string(), // identity.tokenIdentifier
    name: v.string(),
    email: v.string(),
    code: v.string(),
    prevCode: v.string(),
    at: v.number(), // when `code` was made
    hideLate: v.optional(v.boolean()), // the student turned off the late banner for themselves
  })
    .index("by_user", ["user"])
    .index("by_code", ["code"])
    .index("by_prevCode", ["prevCode"]),

  // team: checkin. When class starts on a channel, set by a host. A check-in after
  // startsAt + graceMin counts as late.
  classStarts: defineTable({
    channel: v.string(),
    startsAt: v.number(),
    graceMin: v.number(),
  }).index("by_channel", ["channel"]),

  // team: checkin. Live quiz or vote: a host asks one question at a time on a channel;
  // checked-in students pick one choice. A quiz may have a right answer; a vote never does.
  polls: defineTable({
    channel: v.string(),
    question: v.string(),
    choices: v.array(v.string()),
    correct: v.optional(v.number()), // index into choices; never set on a vote
    kind: v.optional(v.union(v.literal("quiz"), v.literal("vote"))), // missing = quiz
    open: v.boolean(),
    at: v.number(),
    closedAt: v.optional(v.number()),
  }).index("by_channel", ["channel"]),

  // team: checkin. One answer per student per poll: locked on a quiz, changeable on an open vote.
  pollAnswers: defineTable({
    poll: v.id("polls"),
    user: v.string(), // identity.tokenIdentifier
    choice: v.number(),
    at: v.number(),
  })
    .index("by_poll", ["poll"])
    .index("by_poll_and_user", ["poll", "user"]),

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
