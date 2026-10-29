export const TEAMS = ["red", "yellow", "blue"] as const;
export type TeamName = (typeof TEAMS)[number];

export function Team({ name }: { name: TeamName }) {
  return <span className={"team team--" + name}>{name}</span>;
}

// A Convex error thrown as ConvexError("text") arrives as e.data; anything else gets a plain line.
export function errorText(e: unknown) {
  const data = (e as { data?: unknown })?.data;
  return typeof data === "string" ? data : "Something went wrong. Try again.";
}
