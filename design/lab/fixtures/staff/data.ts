// Shared fake data and page helpers for the staff scenarios. Everyone here is made up: a 38-student
// section of "Intro to Circuits (Lab 101)" on example.edu, eight teams, a dozen questions a term.
import type { Id } from "../../../../convex/_generated/dataModel";
import { at } from "../../lib/types";

// Thursday's class: it opened at 2:28 PM, starts at 2:30 PM, and is late after 2:35 PM.
export const NOW = "2026-11-05T14:41:00-08:00";
export const STARTED = at(NOW, -13);
export const STARTS = at(NOW, -11);
export const GRACE = 5;

const FIRST = [
  "Pip", "Quill", "Wren", "Juniper", "Bram", "Tansy", "Orrin", "Lark", "Fennel", "Ember",
  "Rook", "Sorrel", "Moss", "Clove", "Dune", "Hazel", "Indigo", "Kestrel", "Linden", "Maple",
  "Nettle", "Oriel", "Perrin", "Rue", "Sable", "Thistle", "Umber", "Vale", "Willow", "Yarrow",
  "Zephyr", "Alder", "Briar", "Cove", "Dahlia", "Elm", "Fern", "Gale",
];
const LAST = ["Example", "Sample", "Testwood", "Placeholder", "Mockley", "Demoson"];

// The 38 who checked in, first in first: 34 on time between 2:22 and 2:35, then 4 late.
const LATE_MIN = [1, 3, 4, 6];
export const ROSTER = FIRST.map((first, i) => {
  const late = i >= 34 ? LATE_MIN[i - 34] : null;
  const atMs = late !== null ? STARTS + (GRACE + late) * 60_000 : at(NOW, -19) + Math.round((i * 12 * 60_000) / 34);
  const last = LAST[i % LAST.length];
  return {
    id: `lab-checkin-${i + 1}` as Id<"checkins">,
    name: `${first} ${last}`,
    email: `${first.toLowerCase()}.${last.toLowerCase()}@example.edu`,
    at: atMs,
    lateMin: late,
  };
});

// checkin/read:names is newest first; checkin/attendance:sheet is first in first.
export const NAMES = ROSTER.map(({ id, name, at }) => ({ id, name, at })).reverse();
export const SHEET = ROSTER.map(({ name, email, at, lateMin }) => ({ name, email, at, lateMin }));

const DAY = 86_400_000;
export const CLASSES = [
  { lecture: "lab-lecture-9" as Id<"lectures">, open: true, startedAt: STARTED, startsAt: STARTS, graceMin: GRACE, endedAt: null, count: 38 },
  { lecture: "lab-lecture-8" as Id<"lectures">, open: false, startedAt: STARTED - 2 * DAY, startsAt: STARTS - 2 * DAY, graceMin: GRACE, endedAt: STARTED - 2 * DAY + 80 * 60_000, count: 36 },
  { lecture: "lab-lecture-7" as Id<"lectures">, open: false, startedAt: STARTED - 7 * DAY, startsAt: STARTS - 7 * DAY, graceMin: GRACE, endedAt: STARTED - 7 * DAY + 80 * 60_000, count: 35 },
  { lecture: "lab-lecture-6" as Id<"lectures">, open: false, startedAt: STARTED - 9 * DAY, startsAt: STARTS - 9 * DAY, graceMin: GRACE, endedAt: STARTED - 9 * DAY + 80 * 60_000, count: 37 },
];

// Server refusals, typing, a sign-in that ends soon and an unverified email are scenario fields
// now (refuses() in lib/types.ts, `type`, `user.endsInMin`, `user.emailVerified`).
