// #/live/leaderboard: the team board on the projector, with the late banner. live/Page.tsx routes
// here; StageBoard.tsx draws the board and stageboard.css sizes it and the banner for the stage.
import { Projector } from "../../blocks/kit";
import { ErrorBoundary } from "../../blocks/ui";
import LateBanner from "../checkin/LateBanner";
import { StageBoard } from "./StageBoard";

export default function BoardPage() {
  return (
    <Projector title="Team leaderboard">
      <ErrorBoundary label="The team leaderboard">
        <StageBoard />
      </ErrorBoundary>
      <div className="live-board__late">
        <LateBanner />
      </div>
    </Projector>
  );
}
