// #/portal: a student's phone shows the slide the professor is on, live, and lets the
// student page back through slides already shown (swipe, the arrow keys, or ← Back and
// Next →). Paging only changes this phone's view; the page only reads the deck.
// Under the slide, "Check in" opens the pass (#/checkin/student) and "Quiz and questions"
// opens #/live, so a student who opened #/portal from a QR code on the deck can still check
// in and answer the quiz. The loading and waiting screens have both links too.
// <LateBanner /> (Check-in's) shows a late student's first name for 8 seconds.
// Test on another channel with #/portal?channel=<name>. The late banner lists check-ins on
// CHANNEL ("gdg") only, so it stays off on any other channel. #/portal/<part> shows
// "No page at #/portal/<part>".
import { useEffect, useRef, useState, type TouchEvent } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { CHANNEL, useDeckSlide } from "../blocks/deck";
import { Link, useHashParams, useRoute } from "../blocks/router";
import { ErrorBoundary, Screen, Status } from "../blocks/ui";
import LateBanner from "../teams/checkin/LateBanner";
import "./portal.css";

export default function PortalPage() {
  const [, ...rest] = useRoute();
  if (rest.length > 0) {
    return (
      <Screen title={`No page at #/portal/${rest.join("/")}`}>
        <p><Link to="">Go home</Link></p>
      </Screen>
    );
  }
  return <Portal />;
}

function Links() {
  return (
    <div className="portal__links">
      <Link to="checkin/student" className="btn btn--secondary">Check in</Link>
      <Link to="live" className="btn btn--secondary">Quiz and questions</Link>
    </div>
  );
}

function Portal() {
  const params = useHashParams();
  const channel = params.get("channel")?.trim() || CHANNEL;
  // The banner sits beside the page, not inside it, so it stays mounted when the page goes from
  // loading to waiting to a slide: a remount would cut a showing banner short and count an
  // arrival that lands during the switch as already seen. A failing late feed shows its own
  // error line ("The late banner didn't load.") and leaves the slide up.
  return (
    <>
      <Slides channel={channel} />
      {channel === CHANNEL && (
        <ErrorBoundary label="The late banner">
          <LateBanner />
        </ErrorBoundary>
      )}
    </>
  );
}

type Shown = { index: number; title: string; lines: string[] };

function Slides({ channel }: { channel: string }) {
  const live = useDeckSlide(channel);
  const shown = useQuery(api.deck.slides, { channel });

  // null: follow the live slide. A number: the student paged to that slide.
  const [viewing, setViewing] = useState<number | null>(null);
  // The live slide when the student started browsing, to tell when the professor moves on.
  const [liveAtBrowse, setLiveAtBrowse] = useState<number | null>(null);

  // A new channel starts over on the live slide.
  useEffect(() => {
    setViewing(null);
    setLiveAtBrowse(null);
  }, [channel]);

  const liveIndex = live ? live.index : null;

  // If the professor lands on (or goes back past) the slide the student is reading, the
  // student is live again.
  useEffect(() => {
    if (viewing !== null && liveIndex !== null && viewing >= liveIndex) {
      setViewing(null);
      setLiveAtBrowse(null);
    }
  }, [viewing, liveIndex]);

  // Slides a student can open: every slide shown so far, up to the live one, plus the live one.
  const byIndex = new Map<number, Shown>();
  for (const s of shown ?? []) if (liveIndex !== null && s.index <= liveIndex) byIndex.set(s.index, s);
  if (live) byIndex.set(live.index, live); // the live slide as it is on screen right now
  const order = [...byIndex.keys()].sort((a, b) => a - b);

  const following = viewing === null || viewing === liveIndex || !byIndex.has(viewing);
  const at = following ? liveIndex : viewing;
  const pos = at === null ? -1 : order.indexOf(at);
  const prev = pos > 0 ? order[pos - 1] : null;
  const next = pos >= 0 && pos < order.length - 1 ? order[pos + 1] : null;
  const moved = !following && liveAtBrowse !== null && liveIndex !== liveAtBrowse;

  function open(index: number | null) {
    if (index === null) return;
    if (index === liveIndex) {
      setViewing(null);
      setLiveAtBrowse(null);
    } else {
      if (following) setLiveAtBrowse(liveIndex);
      setViewing(index);
    }
  }
  const openRef = useRef(open);
  openRef.current = open;
  const prevRef = useRef(prev);
  prevRef.current = prev;
  const nextRef = useRef(next);
  nextRef.current = next;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (e.key === "ArrowLeft") openRef.current(prevRef.current);
      else if (e.key === "ArrowRight") openRef.current(nextRef.current);
      else return;
      e.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const touch = useRef<{ x: number; y: number } | null>(null);
  function onTouchStart(e: TouchEvent) {
    const t = e.touches[0];
    touch.current = e.touches.length === 1 ? { x: t.clientX, y: t.clientY } : null;
  }
  function onTouchEnd(e: TouchEvent) {
    const start = touch.current;
    touch.current = null;
    if (!start) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    open(dx < 0 ? next : prev);
  }

  if (live === undefined || shown === undefined) {
    return (
      <Screen>
        <Status kind="loading">Loading the slides…</Status>
        <Links />
      </Screen>
    );
  }
  if (live === null || at === null) {
    return (
      <Screen>
        <Status kind="empty">Waiting for the slides to start.</Status>
        <Links />
      </Screen>
    );
  }

  const slide = byIndex.get(at)!;

  return (
    <main className="portal" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <header className="portal__bar">
        <p className="portal__count" aria-live="polite">
          Slide {at + 1} of {live.count}
        </p>
        {following ? (
          <span className="portal__tag portal__tag--live">Live</span>
        ) : moved ? null : (
          <button type="button" className="portal__tolive" onClick={() => open(liveIndex)}>
            Back to live
          </button>
        )}
      </header>

      {moved && (
        <div className="portal__notice" role="status">
          <span>The professor is on slide {live.index + 1} now.</span>
          <button type="button" onClick={() => open(liveIndex)}>
            Back to live
          </button>
        </div>
      )}

      <article className="portal__slide" key={at}>
        {slide.title && <h1>{slide.title}</h1>}
        {slide.lines.length > 0 && (
          <ul>
            {slide.lines.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        )}
      </article>

      <nav className="portal__nav" aria-label="Slides">
        <button type="button" onClick={() => open(prev)} disabled={prev === null}>
          ← Back
        </button>
        <button type="button" onClick={() => open(next)} disabled={next === null}>
          Next →
        </button>
      </nav>

      <Links />
    </main>
  );
}
