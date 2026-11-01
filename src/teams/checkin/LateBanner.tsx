// The late banner: when someone checks in late, every screen showing it gets a line with their
// first name and how many minutes late they are, for 8 seconds. Each student can turn it off for
// themselves with the checkbox on their pass (HideLate in Student.tsx).
// Where it renders, as <LateBanner /> with no props: #/checkin/student (the pass and the
// checked-in screen), #/live, #/live/leaderboard, #/portal and #/checkin/stage. The iOS app shows
// the same lines from its own copy (ios/RCCLivePortal/LateBanner.swift).
// It shows only arrivals scanned after the page opened, each once, and only when the list brings
// them within a minute of their scan (late.ts newArrivals). So an older arrival never shows when
// it comes back into the list of 5 because someone ticked or unticked the opt-out, or when the
// professor saves the class start after students walked in.
// `at` in the list is the server's time, so the banner asks the server's clock once when it opens
// (checkin.attendance.clock) and judges every row by the server's time, not by the screen's clock,
// which on a classroom PC can run minutes off. Until that answer comes back (or if it never does)
// it uses the screen's clock.
import { useEffect, useRef, useState } from "react";
import "./checkin.css";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { CHANNEL } from "../../blocks/deck";
import { lateLine, newArrivals, type Late, type Seen } from "./late";

const SHOW_MS = 8_000;
const CLOCK_TRIP_MS = 5_000;

export default function LateBanner() {
  const feed = useQuery(api.checkin.attendance.lateFeed, { channel: CHANNEL });
  const clock = useMutation(api.checkin.attendance.clock);
  const seen = useRef<Seen | null>(null);
  // How far the screen's clock runs ahead of the server's, in ms (negative: behind).
  const ahead = useRef(0);
  const timers = useRef<number[]>([]);
  const [showing, setShowing] = useState<Late[]>([]);

  // Half the round trip is the best guess of when the server read its clock. An answer that took
  // over 5 s (the page opened offline and the call waited) could be off by minutes, so it's dropped.
  useEffect(() => {
    const sent = Date.now();
    clock({}).then(
      (server) => {
        const back = Date.now();
        if (typeof server === "number" && Number.isFinite(server) && back - sent <= CLOCK_TRIP_MS) ahead.current = (sent + back) / 2 - server;
      },
      () => {},
    );
  }, [clock]);

  useEffect(() => {
    if (!feed) return;
    const { fresh, seen: next } = newArrivals(feed, seen.current, Date.now() - ahead.current);
    seen.current = next;
    if (fresh.length === 0) return;
    const ids = new Set(fresh.map((f) => f.id));
    setShowing((s) => [...fresh, ...s]);
    timers.current.push(window.setTimeout(() => setShowing((s) => s.filter((x) => !ids.has(x.id))), SHOW_MS));
  }, [feed]);

  // A page that drops the banner stops its timers too.
  useEffect(() => {
    const list = timers.current;
    return () => list.forEach((id) => clearTimeout(id));
  }, []);

  if (showing.length === 0) return null;
  return (
    <div className="late" role="status" aria-live="polite">
      {showing.map((l) => (
        <p key={l.id} className="late__item">
          {lateLine(l)}
        </p>
      ))}
    </div>
  );
}
