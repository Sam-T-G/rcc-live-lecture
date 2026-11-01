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
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type TouchEvent } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { CHANNEL, useDeckSlide } from "../blocks/deck";
import { Link, useHashParams, useRoute } from "../blocks/router";
import { ErrorBoundary, Screen, Status } from "../blocks/ui";
import LateBanner from "../teams/checkin/LateBanner";
import { scrollToBottom, watchLateRoom } from "./lateRoom";
import { FOLLOW, open as openSlide, pages, place, settle, swipe, type Browse } from "./paging";
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
  // While a banner shows, the page gets that much more room at the bottom (--late-room, the
  // banner's height plus its 16px gap), so Back, Next and the two links move up above it. On a
  // page taller than the screen, a student at the bottom is scrolled to the new bottom
  // (lateRoom.ts says why).
  const late = useRef<HTMLDivElement>(null);
  const [lateRoom, setLateRoom] = useState(0);
  const keepBottom = useRef(false);
  const withBanner = channel === CHANNEL;
  useEffect(() => {
    const el = late.current;
    if (!el || typeof ResizeObserver === "undefined") {
      setLateRoom(0);
      return;
    }
    return watchLateRoom(el, window, ResizeObserver, (px, bottom) => {
      keepBottom.current = bottom;
      setLateRoom(px);
    });
  }, [withBanner]);
  useLayoutEffect(() => {
    if (!keepBottom.current) return;
    keepBottom.current = false;
    scrollToBottom(window);
  }, [lateRoom]);
  return (
    <div className="portal-room" style={{ "--late-room": `${lateRoom}px` } as CSSProperties}>
      <Slides key={channel} channel={channel} />
      {withBanner && (
        <div className="portal-late" ref={late}>
          <ErrorBoundary label="The late banner">
            <LateBanner />
          </ErrorBoundary>
        </div>
      )}
    </div>
  );
}

// `start` opens the page paged back (Page.test.ts checks the words that way); the page itself
// starts on the live slide. Portal keys Slides by channel, so a new channel starts over on the
// live slide. The paging rules are in paging.ts.
export function Slides({ channel, start = FOLLOW }: { channel: string; start?: Browse }) {
  const live = useDeckSlide(channel);
  const shown = useQuery(api.deck.slides, { channel });

  const [browse, setBrowse] = useState<Browse>(start);
  const liveIndex = live ? live.index : null;
  const byIndex = pages(shown, live);
  // Follow live again when the professor lands on (or goes back past) the slide the student is
  // reading, or when it's no longer one they can open (paging.settle). Set during render, React's
  // way to adjust state when what it depends on changes, so the phone never shows the old slide
  // first. Not while either query loads: byIndex would be missing slides the student can open.
  if (live !== undefined && shown !== undefined) {
    const settled = settle(browse, liveIndex, byIndex);
    if (settled !== browse) setBrowse(settled);
  }
  const { following, at, prev, next, moved } = place(byIndex, liveIndex, browse);

  function open(index: number | null) {
    setBrowse((b) => openSlide(b, index, liveIndex, following));
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
    const from = touch.current;
    touch.current = null;
    if (!from) return;
    const t = e.changedTouches[0];
    const way = swipe(t.clientX - from.x, t.clientY - from.y);
    if (way) open(way === "next" ? next : prev);
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
