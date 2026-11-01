// Professor view team: #/host, the screen the professor glances at while teaching. Professors
// and admins only (StaffGate). Registered in src/pages/index.ts.
//   The header: the slide the deck is on, how many students checked in, how many tapped "I'm
//     lost" on this slide, and a "Lost by slide" line with every slide that has any taps this
//     class (live.read.lostCount and lostBySlide; students tap on #/live).
//   Three tabs: Now (ask the room, who is missing it), Points (teams and points) and Questions
//     (the students' questions). All three panels stay mounted and only the open one shows, so a
//     half-written question, the AI note and the "Group by topic" switch survive a tab switch.
//     That's why the tab bar is built here instead of with the kit's <Tabs>, which renders only
//     the open panel; it uses the kit's classes and keys (left and right arrows, Home and End,
//     one Tab stop on the open tab).
//   Any other #/host/<part> shows "No page at #/host/<part>".
import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { CHANNEL, useDeckSlide } from "../../blocks/deck";
import { Link, useRoute } from "../../blocks/router";
import { Big, Card, ErrorBoundary, Screen, Status } from "../../blocks/ui";
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
    <Screen title="Professor view" wide>
      <div className="host-root">
      <Card>
        <div className="host-head">
          <div>
            {slide === undefined && <Status kind="loading">Loading...</Status>}
            {slide === null && <Status kind="empty">The deck hasn't sent a slide yet.</Status>}
            {slide && (
              <>
                <p className="muted" style={{ margin: 0 }}>Slide {slide.index + 1} of {slide.count}</p>
                <h2>{slide.title}</h2>
              </>
            )}
            <p className="host-links"><Link to="checkin/teacher">Attendance</Link></p>
          </div>
          <div className="host-counts">
            <Big value={checkedIn ?? "-"} label="checked in" />
            <Big value={lost ?? "-"} label="lost on this slide" />
          </div>
        </div>
        <ErrorBoundary label="Lost by slide">
          <LostBySlide />
        </ErrorBoundary>
      </Card>

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

      <Panel tab="Now" open={tab}>
        <ErrorBoundary key="now" label="The Now tab">
          <div className="host-grid host-fade">
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
      </div>
    </Screen>
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

// "Lost by slide": every slide students tapped "I'm lost" on this class, in slide order, with how
// many are lost on it ("Slide 3: 4").
function LostBySlide() {
  const rows = useQuery(api.live.read.lostBySlide, { channel: CHANNEL });
  return (
    <p className="host-lost">
      <span className="host-lost__label">Lost by slide</span>
      {rows === undefined ? (
        <span className="muted">Loading...</span>
      ) : rows.length === 0 ? (
        <span className="muted">Nobody has tapped I’m lost yet.</span>
      ) : (
        rows.map((r) => (
          <span key={r.index} className="host-lost__slide">
            Slide {r.index + 1}: {r.count}
          </span>
        ))
      )}
    </p>
  );
}
