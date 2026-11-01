import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { CHANNEL } from "../../blocks/deck";
// The `.group--<color>` styles in live.css set each team's --group color.
import "../live/live.css";

// A team from live.groups (describe(): { team, color, label }) as a colored dot and its label.
export function TeamChip({ color, label }: { color: string; label: string }) {
  return <span className={"team-chip group--" + color}>{label}</span>;
}

// What an empty list on the Now and Points tabs says between classes (after End class or the
// 12-hour close), in place of "... in this class yet.": no class is open, and the next ask, scan
// or deck press opens one (convex/lib.ts ensureLecture).
export const NO_CLASS = "No class is running. A class starts when you ask a quiz or vote, scan a pass or change slides.";

// True once the class list has loaded with no class open; false while it loads or a class is open.
export function useNoClass() {
  const classes = useQuery(api.checkin.attendance.lectures, { channel: CHANNEL });
  return classes !== undefined && !classes.some((c) => c.open);
}

// A Convex error thrown as ConvexError("text") arrives as e.data; anything else gets a plain line.
export function errorText(e: unknown) {
  const data = (e as { data?: unknown })?.data;
  return typeof data === "string" ? data : "Something went wrong. Try again.";
}
