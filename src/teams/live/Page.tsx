// Live slides team: #/live, the phone view of the slide the professor is on. Registered in
// src/pages/index.ts already; build here.
import { useRoute } from "../../blocks/router";
import { CHANNEL, useDeckSlide } from "../../blocks/deck";
import { Card, Screen, Status } from "../../blocks/ui";
import Questions from "./Questions";
import PastQuestions from "./PastQuestions";
import { GroupBadge, Leaderboard } from "./Leaderboard";
import "./live.css";

export default function LivePage() {
  const slide = useDeckSlide(CHANNEL);
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
            </>
          )}
        </Card>
        <div>
          <Leaderboard />
          <PastQuestions />
          <Questions index={slide ? slide.index : null} />
        </div>
      </div>
    </Screen>
  );
}
