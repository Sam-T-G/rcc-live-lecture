// The `.group--<color>` styles in live.css set each team's --group color.
import "../live/live.css";

export const TEAMS = ["red", "yellow", "blue"] as const;
export type TeamName = (typeof TEAMS)[number];

export function Team({ name }: { name: TeamName }) {
  return <span className={"team team--" + name}>{name}</span>;
}

// A team from live.groups (describe(): { team, color, label }) as a colored dot and its label.
export function TeamChip({ color, label }: { color: string; label: string }) {
  return <span className={"team-chip group--" + color}>{label}</span>;
}

// A Convex error thrown as ConvexError("text") arrives as e.data; anything else gets a plain line.
export function errorText(e: unknown) {
  const data = (e as { data?: unknown })?.data;
  return typeof data === "string" ? data : "Something went wrong. Try again.";
}
