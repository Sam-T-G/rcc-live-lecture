// Small helpers the check-in pages share.

// The words a ConvexError carries, or a plain fallback.
export function why(e: unknown) {
  const x = e as { data?: unknown };
  return typeof x?.data === "string" ? x.data : "Something went wrong. Try again.";
}

// A time of day in the browser's language, like "2:30 PM".
export const clock = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
