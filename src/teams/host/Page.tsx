// Professor view team: #/host, the screen the professor glances at while teaching. Hosts
// only. Registered in src/pages/index.ts already; build here.
import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { CHANNEL, useDeckSlide } from "../../blocks/deck";
import { Link } from "../../blocks/router";
import { Big, Card, ErrorBoundary, Screen, Status } from "../../blocks/ui";
import { ProfGate } from "../checkin/prof";
import AskRoom from "./AskRoom";
import { PointsTab } from "./Boards";
import { Missing } from "./Missing";
import QA from "./QA";
import "./host.css";

const TABS = ["Now", "Points", "Questions"] as const;
type Tab = (typeof TABS)[number];

export default function HostPage() {
  return (
    <ProfGate title="Professor view">
      <Dashboard />
    </ProfGate>
  );
}

function Dashboard() {
  const [tab, setTab] = useState<Tab>("Now");
  const slide = useDeckSlide(CHANNEL);
  const checkedIn = useQuery(api.checkin.read.count, { channel: CHANNEL });
  const lost = useQuery(api.live.read.lostCount, slide ? { channel: CHANNEL, index: slide.index } : "skip");

  return (
    <Screen wide>
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
      </Card>

      <div className="host-tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      {tab === "Now" && (
        <ErrorBoundary key="now" label="The Now tab">
          <div className="host-grid host-fade">
            <AskRoom slideIndex={slide ? slide.index : null} />
            <Missing />
          </div>
        </ErrorBoundary>
      )}
      {tab === "Points" && (
        <ErrorBoundary key="points" label="The Points tab">
          <div className="host-fade"><PointsTab /></div>
        </ErrorBoundary>
      )}
      {tab === "Questions" && (
        <ErrorBoundary key="q" label="The Questions tab">
          <div className="host-fade"><QA /></div>
        </ErrorBoundary>
      )}
      </div>
    </Screen>
  );
}
