// Professor view team: #/host, hosts only. The slide, who's here, and who's lost where.
import "./host.css";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Big, Card, Screen, Status } from "../../blocks/ui";
import { CHANNEL, useDeckSlide } from "../../blocks/deck";
import { SignInButton, useGoogleUser } from "../../blocks/auth";

export default function HostPage() {
  const { user } = useGoogleUser();
  const host = useQuery(api.host.me.isHost);
  if (!user)
    return (
      <Screen title="Professor view" wide>
        <p>Sign in with a host account.</p>
        <SignInButton />
      </Screen>
    );
  if (host === undefined) return <Screen title="Professor view" wide><Status kind="loading">Checking your account…</Status></Screen>;
  if (!host) return <Screen title="Professor view" wide><Status kind="error">Hosts only.</Status></Screen>;
  return <HostOn />;
}

function HostOn() {
  const slide = useDeckSlide(CHANNEL);
  const here = useQuery(api.checkin.read.count, { channel: CHANNEL });
  const names = useQuery(api.checkin.read.names, { channel: CHANNEL });
  const lostHere = useQuery(api.live.read.lostCount, slide ? { channel: CHANNEL, index: slide.index } : "skip");
  const bySlide = useQuery(api.live.read.lostBySlide, { channel: CHANNEL });
  return (
    <Screen title="Professor view" wide>
      {slide ? (
        <>
          <p className="muted">Slide {slide.index + 1} of {slide.count}</p>
          <h2 className="host__slide">{slide.title}</h2>
        </>
      ) : (
        <Status kind="empty">No slide yet. Open the deck with the slide feed on.</Status>
      )}
      <div className="host__nums">
        <Big value={here ?? "…"} label="checked in" />
        <Big value={slide ? (lostHere ?? "…") : "–"} label="lost on this slide" />
      </div>
      <div className="host__cards">
        <Card title="Where people got lost">
          {bySlide === undefined ? (
            <Status kind="loading">Loading…</Status>
          ) : bySlide.length ? (
            <ul>{bySlide.map((s) => <li key={s.index}>Slide {s.index + 1} · {s.count} lost</li>)}</ul>
          ) : (
            <p className="muted">Nobody has said they’re lost yet.</p>
          )}
        </Card>
        <Card title="Checked in">
          {names === undefined ? (
            <Status kind="loading">Loading…</Status>
          ) : names.length ? (
            <ul>{names.map((n) => <li key={n.at + n.name}>{n.name}</li>)}</ul>
          ) : (
            <p className="muted">Nobody yet. The kiosk is at #/checkin/kiosk.</p>
          )}
        </Card>
      </div>
    </Screen>
  );
}
