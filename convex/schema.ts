import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// A staff member's role (convex/checkin/prof.ts says what each one may do).
export const roleValidator = v.union(v.literal("admin"), v.literal("professor"), v.literal("scanner"));
// What a staffEvents row records: someone added, a role changed, someone removed, an iPad paired or unpaired.
export const staffActionValidator = v.union(v.literal("add"), v.literal("role"), v.literal("remove"), v.literal("pair"), v.literal("unpair"));

// Every table: the plumbing blocks first, then one commented block per team. Prod has rows in
// these tables, so a change only adds tables, indexes or optional fields: a new required field,
// or a renamed or removed one, fails the deploy.
export default defineSchema({
  // Block: deck bridge. The latest slide a deck is on, one row per channel (BLOCKS.md, "Deck
  // bridge"). Each press replaces the row, which keeps its old _creationTime, so a read for the
  // current class compares `at` with the class window's start.
  deckChannels: defineTable({
    channel: v.string(),
    index: v.number(), // 0-based slide number
    beat: v.number(), // presses revealed on that slide
    count: v.number(), // slides in the deck
    title: v.string(),
    lines: v.array(v.string()), // the slide's visible text, in order
    at: v.number(),
    run: v.optional(v.string()), // which open deck sent it: an id the deck keeps for its browser tab, so a reload keeps it; missing on old rows
    seq: v.optional(v.number()), // counts up with each send from that deck, so a send that arrives after a newer one can be ignored
  }).index("by_channel", ["channel"]),

  // Block: deck bridge. Every slide a deck has shown, one row per slide, at the most presses
  // shown so far. Lets a phone page back through earlier slides while the deck moves on. Rows
  // are replaced too, so a read for the current class compares `at` with the window's start.
  deckSlides: defineTable({
    channel: v.string(),
    index: v.number(),
    beat: v.number(),
    title: v.string(),
    lines: v.array(v.string()),
    at: v.number(),
    run: v.optional(v.string()), // the deck tab (deckChannels.run) that last pressed this slide; missing on old rows and from an older bridge
  }).index("by_channel_and_index", ["channel", "index"]),

  // Block: lab. One row per press of the lab page's "ping" button, to prove live sync.
  pings: defineTable({
    user: v.string(),
    at: v.number(),
  }),

  // Block: access (convex/staff.ts, convex/checkin/prof.ts). Who may use the professor pages and
  // the door scanner, by email: one row per email with a role. Admins in the ADMIN_EMAILS env var
  // count as admins with or without a row here, and #/admin can't change or remove them.
  staff: defineTable({
    email: v.string(), // trimmed and lower case
    role: roleValidator,
    addedBy: v.string(), // the admin's email, "HOST_EMAILS import" or "devGrant"
    at: v.number(), // when it was added; for a test email (@test.local), when its 2 hours started
  })
    .index("by_email", ["email"])
    .index("by_addedBy", ["addedBy"]), // who added a row

  // Block: access. Every change to the staff list and the door iPads: who made it, and what changed.
  staffEvents: defineTable({
    by: v.string(), // the email of who made the change, "HOST_EMAILS import" or "devGrant"
    action: staffActionValidator,
    email: v.optional(v.string()), // add, role, remove: whose role changed
    role: v.optional(roleValidator), // add, role: the role they have now
    oldRole: v.optional(roleValidator), // role, remove: the role they had
    device: v.optional(v.id("devices")), // pair, unpair (an unpaired iPad's row is gone)
    label: v.optional(v.string()), // pair, unpair: the iPad's name
    at: v.number(),
  }),

  // Block: access. A paired door iPad. It scans passes by sending its device token; only the
  // token's SHA-256 is stored. Unpairing deletes the row, so the token stops working.
  devices: defineTable({
    tokenHash: v.string(), // SHA-256 of the device token, as hex
    label: v.string(), // the name a professor gave it, like "A-210 door"
    pairedBy: v.string(), // the email of the professor or admin who approved it
    pairedAt: v.number(),
    lastUsedAt: v.optional(v.number()), // the last scan it made
  }).index("by_tokenHash", ["tokenHash"]),

  // Block: access. A door iPad waiting to pair: the 6-digit code its screen shows, for 10
  // minutes. Approving the code (or the code expiring) deletes the row.
  pairings: defineTable({
    code: v.string(), // 6 digits (the 6th checks the first 5), unique among the codes still open
    tokenHash: v.string(), // SHA-256 of the iPad's device token, as hex
    expiresAt: v.number(),
  })
    .index("by_code", ["code"])
    .index("by_tokenHash", ["tokenHash"])
    .index("by_expiresAt", ["expiresAt"]),

  // Team tables. Every class runs on one deck channel ("gdg"). A row belongs to the class whose
  // window holds its _creationTime (the `lectures` table below and lib.lectureWindow), so reads
  // for this class use .gte("_creationTime", start) on the index. docs/contracts.md says who
  // writes each table and who reads it.

  // team: checkin. One kiosk per channel: the code its QR shows now and the one before it, and
  // where the room is. Nothing reads or writes this table since the student passes replaced the
  // kiosk QR; it stays because prod may hold rows.
  kiosks: defineTable({
    channel: v.string(),
    code: v.string(),
    prevCode: v.string(),
    at: v.number(), // when `code` was made
    lat: v.optional(v.number()),
    lng: v.optional(v.number()),
    radius: v.optional(v.number()), // meters
  }).index("by_channel", ["channel"]),

  // team: checkin. One row per student per class.
  checkins: defineTable({
    channel: v.string(),
    user: v.string(), // identity.tokenIdentifier
    name: v.string(),
    at: v.number(),
    meters: v.optional(v.number()), // distance from the room at check-in; no page reads it, and it stays because prod rows may have it
    email: v.optional(v.string()), // for the professor's attendance sheet; hosts only
    lateMin: v.optional(v.number()), // minutes after class start (legacy; late minutes are now worked out when read, from `at` and the class's startsAt and graceMin)
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
    prevAt: v.optional(v.number()), // when `prevCode` was made (missing on passes from before 2026-11)
    hideLate: v.optional(v.boolean()), // the student turned off the late banner for themselves
    nameFromEmail: v.optional(v.boolean()), // `name` is the part of an email before the "@" (lib.nameIsEmail), so the late banner shows "Someone"
  })
    .index("by_user", ["user"])
    .index("by_code", ["code"])
    .index("by_prevCode", ["prevCode"]),

  // team: checkin. When class starts on a channel. Every attendance.setClassStart replaces the
  // channel's row (each class also keeps its own start in `lectures`). lib.lectureWindow reads its
  // startsAt and graceMin (a check-in after startsAt + graceMin is late) only before the first
  // class; attendance.startSavedAt reads its _creationTime (when the start was last saved) for
  // lateFeed in every class, so keep the write in setClassStart.
  classStarts: defineTable({
    channel: v.string(),
    startsAt: v.number(),
    graceMin: v.number(),
  }).index("by_channel", ["channel"]),

  // team: checkin. One row per class on a channel. A class opens when lib.ensureLecture runs
  // (the professor's actions that start class activity call it) and ends with End day
  // (lib.endLecture) or by itself 12 hours after it opened or after its saved start time,
  // whichever is later (lib.lectureClosesAt, convex/lectures.ts). Nothing is
  // deleted at the end: rows from earlier classes stay and drop out of this class's reads.
  lectures: defineTable({
    channel: v.string(),
    startedAt: v.number(), // when the class opened
    startsAt: v.optional(v.number()), // when class starts, set by the professor; missing = nobody is late
    graceMin: v.optional(v.number()), // minutes after startsAt before a check-in counts as late
    endedAt: v.optional(v.number()), // when End day ended it, or lib.lectureClosesAt for a class nobody ended; missing = still open
  }).index("by_channel", ["channel"]),

  // team: checkin. Live quiz or vote: a host asks one question at a time on a channel;
  // checked-in students pick one choice. A quiz may have a right answer; a vote never does.
  polls: defineTable({
    channel: v.string(),
    question: v.string(),
    choices: v.array(v.string()),
    correct: v.optional(v.number()), // index into choices; never set on a vote
    kind: v.optional(v.union(v.literal("quiz"), v.literal("vote"))), // missing = quiz
    index: v.optional(v.number()), // the slide the deck was on when it was asked, 0-based
    aiDraft: v.optional(v.boolean()), // the professor started from the AI's draft
    open: v.boolean(),
    at: v.number(),
    closedAt: v.optional(v.number()),
    // How many picked each choice, saved when the poll ends (quiz.end, or ask closing it), so
    // live.past reads one row instead of every answer. Missing on polls ended before it existed.
    counts: v.optional(v.array(v.number())),
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

  // team: live. One row per student per slide they said they're lost on, in each class.
  // by_channel reads one class's taps on every slide, from the class's start.
  lost: defineTable({
    channel: v.string(),
    index: v.number(), // the slide, 0-based, as in deckChannels
    user: v.string(), // identity.tokenIdentifier
    at: v.number(),
  })
    .index("by_channel_and_index", ["channel", "index"])
    .index("by_channel_and_index_and_user", ["channel", "index", "user"])
    .index("by_channel", ["channel"]),

  // team: live. A question or comment a student posts beside a slide. `name` is left out when
  // they post anonymously, and no query ever returns `user`; it is only for "mine" and delete.
  // by_channel reads one class's questions on every slide, from the class's start.
  questions: defineTable({
    channel: v.string(),
    index: v.number(), // the slide it was posted on, 0-based
    user: v.string(), // identity.tokenIdentifier
    name: v.optional(v.string()),
    text: v.string(),
    votes: v.number(), // upvotes, kept in step with questionVotes
    private: v.optional(v.boolean()), // only the author and the professor see it; nobody upvotes it
    answer: v.optional(v.string()), // the professor's typed answer
    shared: v.optional(v.boolean()), // the professor showed the answer to the room
    status: v.optional(v.union(v.literal("keep"), v.literal("dismissed"))), // the professor's sorting; missing = new
    topic: v.optional(v.string()), // AI grouping, professor view only
    cluster: v.optional(v.string()), // AI label for questions that ask the same thing, professor view only
    at: v.number(),
  })
    .index("by_channel_and_index", ["channel", "index"])
    .index("by_channel_and_user", ["channel", "user"])
    .index("by_channel", ["channel"]),

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
  // open (Green, Orange, Purple, and on through a longer color list). One row per student per class.
  groups: defineTable({
    channel: v.string(),
    user: v.string(), // identity.tokenIdentifier
    team: v.number(),
  })
    .index("by_channel", ["channel"])
    .index("by_channel_and_user", ["channel", "user"]),

  // team: live. How many students per team the professor chose: 3 or 4 (no row means 4), and when
  // the teams were locked. Teams lock 5 minutes after class starts (or after the first check-in when
  // no start time is set); `scheduled` means that lock is already queued. Each class gets its own
  // row, with the size carried over from the class before.
  groupSettings: defineTable({
    channel: v.string(),
    size: v.number(),
    lockedAt: v.optional(v.number()),
    scheduled: v.optional(v.boolean()),
  }).index("by_channel", ["channel"]),

  // team: live. Points the professor adds or takes off by hand, with a reason. A row for one
  // student (`user`) counts for that student's current team, like a right answer; a row for a
  // team (`team`) stays with that team. Only rows from the current class count.
  groupPoints: defineTable({
    channel: v.string(),
    user: v.optional(v.string()), // identity.tokenIdentifier; never returned by a query
    team: v.optional(v.number()),
    delta: v.number(), // a whole number of points: 1 to 5 added, or -1 to -5 taken off; never 0
    reason: v.string(),
    at: v.number(),
  }).index("by_channel", ["channel"]),

  // team: live. Extra credit saved when a class ends (End day, or the class closing by itself):
  // one row per student on a team with members, with that team's rank, points and extra credit in
  // the class that ended. name, email and total are on rows saved from 2026-10-31 on.
  groupResults: defineTable({
    channel: v.string(),
    lecture: v.id("lectures"), // the class that ended
    endedAt: v.number(),
    user: v.string(), // identity.tokenIdentifier; never returned by a query
    name: v.optional(v.string()), // from the student's check-in in that class
    email: v.optional(v.string()),
    team: v.number(),
    rank: v.number(),
    points: v.number(), // the team's points in that class
    ec: v.number(), // 5, 3, 1 or 0; teams that tie split the places they fill (two tied for 3rd get 0.5 each)
    total: v.optional(v.number()), // the student's extra credit on this channel, this class included
  })
    .index("by_channel", ["channel"])
    .index("by_channel_and_lecture", ["channel", "lecture"])
    .index("by_channel_and_user", ["channel", "user"]),

  // Retired 2026-10-30 (Sam's decision 1). The professor view now uses polls/pollAnswers,
  // groups/groupSettings/groupPoints/groupResults and questions/questionVotes. No function reads
  // or writes the five tables below. Their definitions stay so prod keeps its documents and a push
  // never has to drop a table that holds data. Remove them only after Sam exports and deletes the data.

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
