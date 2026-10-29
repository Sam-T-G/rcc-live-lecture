// Live slides team: #/live, the phone view of the slide the professor is on. Registered in
// src/pages/index.ts already; build here.
import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useRoute } from "../../blocks/router";
import { CHANNEL, useDeckSlide } from "../../blocks/deck";
import { Card, Screen, Status } from "../../blocks/ui";
import Questions from "./Questions";
import { QuizCard } from "../checkin/Quiz";
import PastQuestions from "./PastQuestions";
import { GroupBadge, Leaderboard } from "./Leaderboard";
import "./live.css";

export default function LivePage() {
  const live = useDeckSlide(CHANNEL);
  const shown = useQuery(api.deck.slides, { channel: CHANNEL });
  // null follows the professor. A number is a slide this student paged back to; it stays put
  // when the professor moves on, until they tap "Back to live".
  const [pinned, setPinned] = useState<number | null>(null);
  const earlier = pinned !== null ? shown?.find((x) => x.index === pinned) : undefined;
  const slide = earlier ? { ...earlier, count: live?.count ?? 0 } : live;
  const here = slide ? slide.index : null;
  const before = shown && here !== null ? [...shown].reverse().find((x) => x.index < here) : undefined;
  const after = shown && here !== null && pinned !== null ? shown.find((x) => x.index > here) : undefined;
  function later() {
    if (!after || (live && after.index >= live.index)) setPinned(null);
    else setPinned(after.index);
  }
  const [, part] = useRoute(); // #/live/leaderboard: the big board for the projector
  if (part === "leaderboard")
    return (
      <Screen title="Leaderboard" wide>
        <Leaderboard big />
      </Screen>
    );
  return (
    <Screen title="Live slides" wide>
      <GroupBadge />
      <div className="live">
        <Card>
          {slide === undefined ? (
            <Status kind="loading">Loading the slide…</Status>
          ) : slide === null ? (
            <Status kind="empty">Waiting for the professor to start the slides.</Status>
          ) : (
            <>
              <h2 className="slide__title">{slide.title}</h2>
              <ul className="slide__lines">
                {slide.lines.map((l, i) => (
                  <li key={i}>{l}</li>
                ))}
              </ul>
              <p className="slide__count muted">Slide {slide.index + 1} of {slide.count}</p>
              <div className="slide__nav">
                <button type="button" disabled={!before} onClick={() => before && setPinned(before.index)}>← Earlier</button>
                <button type="button" disabled={pinned === null} onClick={later}>Later →</button>
                {pinned !== null && <button type="button" onClick={() => setPinned(null)}>Back to live</button>}
              </div>
              {pinned !== null && live && (
                <p className="muted">You’re looking back. The professor is on slide {live.index + 1}.</p>
              )}
            </>
          )}
        </Card>
        <div>
          <QuizCard />
          <Leaderboard />
          <PastQuestions />
          <Questions index={here} />
        </div>
      </div>
    </Screen>
  );
}
