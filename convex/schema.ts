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

  // Block: deck bridge. Every slide a deck has shown, one row per slide, at the most presses
  // shown so far. Lets a phone page back through earlier slides while the deck moves on.
  deckSlides: defineTable({
    channel: v.string(),
    index: v.number(),
    beat: v.number(),
    title: v.string(),
    lines: v.array(v.string()),
    at: v.number(),
  }).index("by_channel_and_index", ["channel", "index"]),

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

  // team: live. A question or comment a student posts beside a slide. `name` is left out when
  // they post anonymously, and no query ever returns `user`; it is only for "mine" and delete.
  questions: defineTable({
    channel: v.string(),
    index: v.number(), // the slide it was posted on, 0-based
    user: v.string(), // identity.tokenIdentifier
    name: v.optional(v.string()),
    text: v.string(),
    votes: v.number(), // upvotes, kept in step with questionVotes
    at: v.number(),
  })
    .index("by_channel_and_index", ["channel", "index"])
    .index("by_channel_and_user", ["channel", "user"]),

  // team: live. One row per student per question they upvoted.
  questionVotes: defineTable({
    channel: v.string(),
    question: v.id("questions"),
    user: v.string(),
  })
    .index("by_question_and_user", ["question", "user"])
    .index("by_channel_and_user", ["channel", "user"]),

  // team: live. The small team a student plays on. Teams are numbered from 0 and dealt in arrival
  // order, three at a time: the 1st student is team 0 (Red), the 2nd team 1 (Blue), the 3rd team 2
  // (Yellow), then around again until each has the professor's team size; then the next three teams
  // open (Red 2, Blue 2, Yellow 2). One row per student per channel.
  groups: defineTable({
    channel: v.string(),
    user: v.string(), // identity.tokenIdentifier
    team: v.number(),
  })
    .index("by_channel", ["channel"])
    .index("by_channel_and_user", ["channel", "user"]),

  // team: live. How many students per team the professor chose: 3 or 4. No row means 4.
  groupSettings: defineTable({
    channel: v.string(),
    size: v.number(),
  }).index("by_channel", ["channel"]),

  // team: host. A question the professor asked the room on one slide. `correct` never goes to
  // students (questions.current leaves it out).
  quizQuestions: defineTable({
    channel: v.string(),
    index: v.number(), // the slide, 0-based, as in deckChannels
    text: v.string(),
    choices: v.array(v.string()),
    correct: v.number(), // index into choices
    status: v.union(v.literal("open"), v.literal("closed")),
    points: v.number(), // base points for a right answer
    openedAt: v.number(),
  }).index("by_channel", ["channel"]),

  // team: host. One row per student per question. The team (red, yellow, blue) is worked out
  // when read, from the user and the room's salt, so a reshuffle regroups everyone.
  answers: defineTable({
    questionId: v.id("quizQuestions"),
    user: v.string(), // identity.tokenIdentifier
    name: v.string(),
    choice: v.number(),
    correct: v.boolean(),
    points: v.number(),
    at: v.number(),
  })
    .index("by_question", ["questionId"])
    .index("by_question_and_user", ["questionId", "user"]),

  // team: host. Per-lecture settings. `salt` decides the random red/yellow/blue split.
  hostRooms: defineTable({
    channel: v.string(),
    salt: v.string(),
    dayStart: v.optional(v.number()), // when today's points started counting (End day moves it)
  }).index("by_channel", ["channel"]),
  // team: host. Manual changes to points: a deduction, or the extra credit a winning team gets
  // when the day ends. Totals are answers plus these, so every change can be seen and undone.
  pointEvents: defineTable({
    channel: v.string(),
    user: v.string(), // identity.tokenIdentifier
    name: v.string(),
    delta: v.number(),
    reason: v.string(),
    at: v.number(),
  }).index("by_channel", ["channel"]),

  // team: host. A question a student asks the professor. "private" is for the professor only.
  // The professor decides what is kept, answered, and shared with the room.
  studentQuestions: defineTable({
    channel: v.string(),
    index: v.number(), // the slide it was asked on
    user: v.string(),
    name: v.string(),
    text: v.string(),
    visibility: v.union(v.literal("public"), v.literal("private")),
    topic: v.optional(v.string()), // set by the AI grouping
    cluster: v.optional(v.string()), // the AI's label for questions that ask the same thing
    status: v.union(v.literal("new"), v.literal("keep"), v.literal("dismissed")),
    answer: v.optional(v.string()), // typed by the professor
    shared: v.boolean(), // the professor approved showing this (and its answer) to students
    at: v.number(),
  }).index("by_channel", ["channel"]),
});
