// The late banner's lines, and which late arrivals it shows (LateBanner.tsx). The iOS app shows
// the same lines (ios/RCCLivePortal/LateBanner.swift).

// One late arrival from checkin.attendance.lateFeed: a first name only.
export type Late = { id: string; first: string; lateMin: number; at: number };

const LINES = [
  (n: string, m: number) => `🐢 ${n} just walked in, ${m} min late.`,
  (n: string, m: number) => `🚨 Late alert: ${n}, ${m} min after start.`,
  (n: string, m: number) => `⏰ ${n} is here. Class started ${m} min ago.`,
  (n: string, m: number) => `⏰ ${n} walked in ${m} min late.`,
  (n: string, m: number) => `👀 Everyone say hi to ${n}, ${m} min late.`,
];

// The banner's line for one arrival. The line is picked from the check-in's id, so the same
// arrival gets the same words on every screen.
export function lateLine(l: Pick<Late, "id" | "first" | "lateMin">) {
  let h = 0;
  for (const c of l.id) h = (h * 31 + c.charCodeAt(0)) | 0;
  return LINES[Math.abs(h) % LINES.length](l.first, l.lateMin);
}

// What a banner has seen: the newest arrival time, and the arrivals at exactly that time (two
// scans can land in the same millisecond).
export type Seen = { at: number; ids: string[] };

// The arrivals in `feed` newer than every one seen, and what's seen once they show. The first
// feed a banner gets (seen null) only sets what's seen: those arrivals came before the page
// opened. The feed holds the newest 5 late arrivals, so an older one comes back into it when a
// newer one ticks the opt-out, or when someone unticks theirs; comparing times keeps those from
// showing again.
// `now` is the phone's clock when the feed arrived (Date.now()). With it, the first feed also
// marks everything scanned before that moment as seen, so an arrival from before the page opened
// never shows, even one the first feed didn't hold: someone who had the opt-out ticked and
// unticks it later, or students who become late when the professor saves the class start after
// they walked in (lateFeed works lateness out when read). A phone clock that runs fast by a few
// seconds only skips arrivals in those first seconds. Without `now`, the first feed's newest
// arrival is the floor, which lets those cases show.
export function newArrivals(feed: Late[], seen: Seen | null, now?: number): { fresh: Late[]; seen: Seen } {
  if (seen === null) return { fresh: [], seen: newest(feed, { at: now ?? -Infinity, ids: [] }) };
  const fresh = feed.filter((f) => f.at > seen.at || (f.at === seen.at && !seen.ids.includes(f.id)));
  return { fresh, seen: newest(fresh, seen) };
}

function newest(rows: Late[], from: Seen): Seen {
  let out = from;
  for (const r of rows) {
    if (r.at > out.at) out = { at: r.at, ids: [r.id] };
    else if (r.at === out.at && !out.ids.includes(r.id)) out = { at: out.at, ids: [...out.ids, r.id] };
  }
  return out;
}
