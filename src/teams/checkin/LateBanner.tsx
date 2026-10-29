// The late banner: when someone checks in late, every screen showing this gets a banner
// with their first name for 8 seconds. Check-in owns it; Live slides drops it on #/live
// with one line: <LateBanner />. Arrivals already there when the page opens don't replay.
import { useEffect, useRef, useState } from "react";
import "./checkin.css";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { CHANNEL } from "../../blocks/deck";

type Late = { id: string; first: string; lateMin: number };

const LINES = [
  (n: string, m: number) => `🐢 ${n} just walked in, ${m} min late.`,
  (n: string, m: number) => `🚨 Late alert: ${n}, ${m} min after start.`,
  (n: string, m: number) => `⏰ ${n} is here. Class started ${m} min ago.`,
  (n: string, m: number) => `🥐 ${n} stopped for breakfast. ${m} min late.`,
  (n: string, m: number) => `👀 Everyone say hi to ${n}, ${m} min late.`,
];

function line(l: Late) {
  // Same person always gets the same line, so two screens show the same words.
  let h = 0;
  for (const c of l.id) h = (h * 31 + c.charCodeAt(0)) | 0;
  return LINES[Math.abs(h) % LINES.length](l.first, l.lateMin);
}

export default function LateBanner() {
  const feed = useQuery(api.checkin.attendance.lateFeed, { channel: CHANNEL });
  const seen = useRef<Set<string> | null>(null);
  const [showing, setShowing] = useState<Late[]>([]);

  useEffect(() => {
    if (!feed) return;
    if (!seen.current) {
      seen.current = new Set(feed.map((f) => f.id));
      return;
    }
    const fresh = feed.filter((f) => !seen.current!.has(f.id));
    if (fresh.length === 0) return;
    fresh.forEach((f) => seen.current!.add(f.id));
    setShowing((s) => [...fresh, ...s]);
    const ids = new Set<string>(fresh.map((f) => f.id));
    setTimeout(() => setShowing((s) => s.filter((x) => !ids.has(x.id))), 8000);
  }, [feed]);

  if (showing.length === 0) return null;
  return (
    <div className="late" role="status" aria-live="polite">
      {showing.map((l) => <p key={l.id} className="late__item">{line(l)}</p>)}
    </div>
  );
}
