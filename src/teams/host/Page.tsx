// Professor view team: #/host, the screen the professor glances at while teaching. Professors
// and admins only (StaffGate). Registered in src/pages/index.ts.
//   The app bar: the page's name, the three tabs and the Attendance link.
//   The slide track under it, the same on every tab: the slide the deck is on, how many students
//     tapped "I'm lost" on each slide this class (live.read.lostBySlide; students tap on #/live),
//     drawn over the deck's slides, and how many checked in. Screen readers get the same as
//     words: the slide, how many are lost on it (live.read.lostCount), the "Lost by slide" line
//     and the check-in count.
//   Three tabs: Now (ask the room, who is missing it), Points (teams and points) and Questions
//     (the students' questions). All three panels stay mounted and only the open one shows, so a
//     half-written question, the AI note and the "Group by topic" switch survive a tab switch.
//     That's why the tab bar is built here instead of with the kit's <Tabs>, which renders only
//     the open panel; it uses the kit's classes and keys (left and right arrows, Home and End,
//     one Tab stop on the open tab).
//   Any other #/host/<part> shows "No page at #/host/<part>".
import { useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { CHANNEL, useDeckSlide } from "../../blocks/deck";
import { Link, useRoute } from "../../blocks/router";
import { Big, ErrorBoundary, Screen, Status } from "../../blocks/ui";
import { StaffGate } from "../checkin/prof";
import AskRoom from "./AskRoom";
import { PointsTab } from "./Boards";
import { Missing } from "./Missing";
import QA from "./QA";
import "./host.css";
import "./lost.css";

const TABS = ["Now", "Points", "Questions"] as const;
export type Tab = (typeof TABS)[number];

// The tab a key moves to from tab `at` of `n`, as in the kit's <Tabs>: left and right arrows go
// round, Home and End go to the first and last. undefined for any other key.
export function tabKey(key: string, at: number, n: number): number | undefined {
  const moves: Record<string, number> = { ArrowRight: (at + 1) % n, ArrowLeft: (at - 1 + n) % n, Home: 0, End: n - 1 };
  return moves[key];
}

export default function HostPage() {
  const [, part] = useRoute();
  if (part !== undefined)
    return (
      <Screen title={`No page at #/host/${part}`}>
        <p><Link to="">Go home</Link></p>
      </Screen>
    );
  return (
    <StaffGate title="Professor view">
      <Dashboard />
    </StaffGate>
  );
}

// `first` is the tab it opens on ("Now" on the page); Page.test.ts opens each tab this way to
// check which panel shows.
export function Dashboard({ first = "Now" }: { first?: Tab }) {
  const [tab, setTab] = useState<Tab>(first);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const slide = useDeckSlide(CHANNEL);
  const checkedIn = useQuery(api.checkin.read.count, { channel: CHANNEL });
  const lost = useQuery(api.live.read.lostCount, slide ? { channel: CHANNEL, index: slide.index } : "skip");

  function onTabKey(e: KeyboardEvent, at: number) {
    const next = tabKey(e.key, at, TABS.length);
    if (next === undefined) return;
    e.preventDefault();
    tabRefs.current[next]?.focus();
    setTab(TABS[next]);
  }

  return (
    <div className="host-root">
      <header className="bar host-bar">
        <h1>Professor view</h1>
        <div className="tabs__list" role="tablist" aria-label="Professor view">
          {TABS.map((t, i) => (
            <button
              key={t}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              type="button"
              id={`host-tab-${t}`}
              className="tabs__tab"
              role="tab"
              aria-selected={tab === t}
              aria-controls={`host-panel-${t}`}
              tabIndex={tab === t ? 0 : -1}
              onClick={() => setTab(t)}
              onKeyDown={(e) => onTabKey(e, i)}
            >
              {t}
            </button>
          ))}
        </div>
        <p className="host-links"><Link to="checkin/teacher">Attendance</Link></p>
      </header>

      <div className="band track host-track">
        <div className="track__where">
          {slide === undefined && <Status kind="loading">Loading...</Status>}
          {slide === null && <Status kind="empty">The deck hasn't sent a slide yet.</Status>}
          {slide && (
            <>
              <p className="track__of">Slide {slide.index + 1} of {slide.count}</p>
              <h2>{slide.title}</h2>
            </>
          )}
          {/* The lane draws this count over the slide's own segment; screen readers hear it here. */}
          <div className="sr-only">
            <Big value={lost ?? "-"} label="lost on this slide" />
          </div>
        </div>
        <ErrorBoundary label="Lost by slide">
          <LostBySlide slide={slide} />
        </ErrorBoundary>
        <div className="track__room">
          <Big value={checkedIn ?? <span className="skel skel--num" aria-hidden="true" />} label="checked in" />
        </div>
      </div>

      <main className="host-page">
        <Panel tab="Now" open={tab}>
          <ErrorBoundary key="now" label="The Now tab">
            <div className="desk host-desk">
              <AskRoom slideIndex={slide ? slide.index : null} />
              <Missing />
            </div>
          </ErrorBoundary>
        </Panel>
        <Panel tab="Points" open={tab}>
          <ErrorBoundary key="points" label="The Points tab">
            <div className="host-fade"><PointsTab /></div>
          </ErrorBoundary>
        </Panel>
        <Panel tab="Questions" open={tab}>
          <ErrorBoundary key="q" label="The Questions tab">
            <div className="host-fade"><QA /></div>
          </ErrorBoundary>
        </Panel>
      </main>
    </div>
  );
}

// One tab's panel. It stays mounted when another tab is open, hidden, so what the professor typed
// or switched on in it is still there when they come back.
function Panel({ tab, open, children }: { tab: Tab; open: Tab; children: ReactNode }) {
  return (
    <div id={`host-panel-${tab}`} role="tabpanel" aria-labelledby={`host-tab-${tab}`} hidden={open !== tab}>
      {children}
    </div>
  );
}

// The most slides the lane draws: each slide's column holds a two-digit count (28px and a 4px
// gap), so more slides than this push the lane past the 1280 window. A longer deck shows the
// "Lost by slide" line as words instead.
const LANE_MAX = 14;

type Slide = ReturnType<typeof useDeckSlide>;

// "Lost by slide": how many students tapped "I'm lost" on each slide this class. The lane draws one
// segment per slide (the current one filled, its number bold) with each slide's count over it: a
// slide already shown with no taps prints a quiet 0, a slide not reached yet prints nothing. The
// line beside the label says the same in words ("Slide 3: 4"), for screen readers when the lane
// is drawn and on screen when it isn't (a long deck, or no slide from the deck yet).
function LostBySlide({ slide }: { slide: Slide }) {
  const rows = useQuery(api.live.read.lostBySlide, { channel: CHANNEL });
  const slides = Math.max(slide?.count ?? 0, ...(rows ?? []).map((r) => r.index + 1));
  const at = slide ? slide.index : -1;
  const lane = !!slide && slides <= LANE_MAX;
  const counted = lane && rows !== undefined && rows.length > 0;
  const count = (i: number) => rows?.find((r) => r.index === i)?.count ?? (i <= at ? 0 : null);
  return (
    <div className={lane ? "track__lane host-lane" : "host-lane host-lane--words"} style={{ "--slides": Math.max(slides, 1) } as CSSProperties}>
      <p className="host-lost">
        <span className="host-lost__label">Lost by slide</span>
        {rows === undefined ? (
          <span className="muted host-lost__line">Loading...</span>
        ) : rows.length === 0 ? (
          <span className="muted host-lost__line">Nobody has tapped I’m lost yet.</span>
        ) : (
          rows.map((r) => (
            <span key={r.index} className={counted ? "host-lost__slide sr-only" : "host-lost__slide"}>
              Slide {r.index + 1}: {r.count}
            </span>
          ))
        )}
      </p>
      {counted &&
        Array.from({ length: slides }, (_, i) => {
          const n = count(i);
          if (n === null) return null;
          return (
            <span key={`n${i}`} className={n === 0 ? "track__n track__n--zero" : "track__n"} style={{ gridRow: 1, gridColumn: i + 2 }} aria-hidden="true">
              {n}
            </span>
          );
        })}
      {lane &&
        Array.from({ length: slides }, (_, i) => (
          <span key={`s${i}`} className={i === at ? "track__seg track__seg--now" : "track__seg"} style={{ gridRow: 2, gridColumn: i + 2 }} aria-hidden="true" />
        ))}
      {lane &&
        Array.from({ length: slides }, (_, i) => (
          <span key={`i${i}`} className={i === at ? "track__i track__i--now" : "track__i"} style={{ gridRow: 3, gridColumn: i + 2 }} aria-hidden="true">
            {i + 1}
          </span>
        ))}
    </div>
  );
}
