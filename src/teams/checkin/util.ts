// Small helpers the check-in pages share.

// The words a ConvexError carries, or a plain fallback.
export function why(e: unknown) {
  const x = e as { data?: unknown };
  return typeof x?.data === "string" ? x.data : "Something went wrong. Try again.";
}

// A time of day in the browser's language, like "2:30 PM".
export const clock = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

// How early scanning opens before a class's saved start, and the server's refusal before then
// (EARLY_MS and EARLY_SCAN in convex/lib.ts; util.test.ts checks they match).
export const EARLY_MS = 45 * 60_000;
export const EARLY_SCAN = "Scanning opens 45 minutes before class starts.";

// setClassStart's refusal of a start for the next class while this one is open
// (convex/checkin/attendance.ts STILL_OPEN; util.test.ts checks they match).
export const STILL_OPEN = "This class is still open. Press End class, then save the next start.";

// End class's question, on #/checkin/teacher (Teacher.tsx) and #/host Points (host/Boards.tsx):
// both run live.groups.endDay, so both ask the same thing.
export const END_CLASS_QUESTION =
  "End this class? Each student gets their team's extra credit now. Next class, everyone checks in again and points start from 0. This can't be undone.";

// When the class with this saved start takes scans, or null with no saved start.
export const scanOpensAt = (startsAt: number | null | undefined) => (startsAt == null ? null : startsAt - EARLY_MS);

// A scan refusal for the screen: the early refusal gets the time scanning opens, in the browser's
// time zone ("Scanning opens at 8:15 AM, 45 minutes before class starts."). The server can't
// write it, since it doesn't know the professor's time zone.
export function scanError(text: string, startsAt: number | null | undefined) {
  const opens = scanOpensAt(startsAt);
  return text === EARLY_SCAN && opens !== null ? `Scanning opens at ${clock(opens)}, 45 minutes before class starts.` : text;
}
