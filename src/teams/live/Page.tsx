// Live slides team: #/live, the student's phone during class. Registered in src/pages/index.ts.
//   #/live: the slide the professor is on, live. The student can page back through slides this
//     class has shown without moving the projector; a phone that paged back follows live again
//     when the professor reaches or goes back past that slide, or when the deck stops listing it
//     (another deck tab took over), the same rule as #/portal. Under the slide: "I'm lost" for the
//     slide on screen (convex/live/lost.ts), or, signed out, a button that scrolls the Questions
//     card's sign-in box to the top of the screen. A signed-in student who isn't checked in
//     gets the check-in line and a link to #/checkin/student under the title, with or without a
//     slide up. Beside the slide: the quiz, the team leaderboard, past quizzes and votes, and the
//     questions board, each in its own ErrorBoundary, so a card whose query fails shows its own
//     error and the slide stays up.
//   #/live/leaderboard: the team board on the projector.
//   Both show the late banner (first names, for students who didn't opt out). Any other
//   #/live/<parts>, #/live/leaderboard/<part> included, shows "No page at #/live/<parts>".
import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { SignedInAs, useGoogleUser } from "../../blocks/auth";
import { CHANNEL, useDeckSlide } from "../../blocks/deck";
import { Button, Projector } from "../../blocks/kit";
import { Link, useRoute } from "../../blocks/router";
import { Card, ErrorBoundary, Screen, Status } from "../../blocks/ui";
import LateBanner from "../checkin/LateBanner";
import { SignInEnding, STUDENT_ENDING } from "../checkin/prof";
import { QuizCard } from "../checkin/Quiz";
import { GroupBadge, Leaderboard } from "./Leaderboard";
import PastQuestions from "./PastQuestions";
import Questions, { SIGN_IN_ID } from "./Questions";
import "./live.css";

// The box around the Questions card.
const QUESTIONS_ID = "live-questions";

export default function LivePage() {
  const [, ...rest] = useRoute();
  const [part] = rest;
  if (part === "leaderboard" && rest.length === 1)
    return (
      <Projector title="Team leaderboard">
        <ErrorBoundary label="The team leaderboard">
          <Leaderboard big />
        </ErrorBoundary>
        <div className="live-board__late">
          <LateBanner />
        </div>
      </Projector>
    );
  if (rest.length > 0)
    return (
      <Screen title={`No page at #/live/${rest.join("/")}`}>
        <p><Link to="">Go home</Link></p>
      </Screen>
    );
  return <LiveSlides />;
}

// The phone view. `pin` opens it on a slide the student paged back to, the way Page.test.ts
// checks where a paged-back phone ends up; the page itself starts on the live slide.
export function LiveSlides({ pin = null }: { pin?: number | null }) {
  const live = useDeckSlide(CHANNEL);
  const shown = useQuery(api.deck.slides, { channel: CHANNEL });
  // null follows the professor. A number is a slide this student paged back to: the phone stays
  // on it while the professor moves on, until the student taps "Back to live", or the professor
  // reaches or goes back past it, or the deck stops (live is null), or deck.slides stops listing
  // it (another deck tab took over: without this, a phone paged back to deck A's slide 2 would
  // jump back to it when the professor returns to deck A's tab after deck B; the iOS app's Follow
  // does the same). Set during render, React's way to adjust state when what it depends on
  // changes, so the phone never shows the old slide first.
  const [pinned, setPinned] = useState<number | null>(pin);
  if (
    pinned !== null &&
    (live === null || (live !== undefined && pinned >= live.index) || (shown !== undefined && !shown.some((x) => x.index === pinned)))
  )
    setPinned(null);
  const earlier = pinned !== null ? shown?.find((x) => x.index === pinned) : undefined;
  const looking = earlier !== undefined; // on a slide the student paged back to
  const slide = earlier ? { ...earlier, count: live?.count ?? 0 } : live;
  // The slide on screen: undefined while the deck loads, null before the slides start. Questions
  // reads undefined as "Loading questions…" and null as "You can ask once the slides start."
  const here = slide === undefined ? undefined : slide ? slide.index : null;
  const before = shown && typeof here === "number" ?[...shown].reverse().find((x) => x.index < here) : undefined;
  const after = earlier && shown ? shown.find((x) => x.index > earlier.index) : undefined;
  function next() {
    if (!after || (live && after.index >= live.index)) setPinned(null);
    else setPinned(after.index);
  }

  return (
    <Screen title="Live slides" wide>
      <SignInEnding line={STUDENT_ENDING} />
      <SignedInAs />
      <ErrorBoundary label="Check in">
        <CheckInFirst />
      </ErrorBoundary>
      <ErrorBoundary label="Your team">
        <GroupBadge />
      </ErrorBoundary>
      <div className="live">
        <Card>
          {slide === undefined ? (
            <Status kind="loading">Loading the slides…</Status>
          ) : slide === null ? (
            <Status kind="empty">Waiting for the slides to start.</Status>
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
                <Button variant="secondary" disabled={!before} onClick={() => before && setPinned(before.index)}>← Back</Button>
                <Button variant="secondary" disabled={!looking} onClick={next}>Next →</Button>
                {looking && <Button onClick={() => setPinned(null)}>Back to live</Button>}
              </div>
              {looking && live && <p className="slide__live muted">The professor is on slide {live.index + 1} now.</p>}
              <ErrorBoundary key={slide.index} label="The I’m lost button">
                <Lost index={slide.index} />
              </ErrorBoundary>
            </>
          )}
        </Card>
        <div className="live__side">
          <ErrorBoundary label="The quiz">
            <QuizCard />
          </ErrorBoundary>
          <ErrorBoundary label="The team leaderboard">
            <Leaderboard />
          </ErrorBoundary>
          <ErrorBoundary label="Past quizzes and votes">
            <PastQuestions />
          </ErrorBoundary>
          <div id={QUESTIONS_ID}>
            <ErrorBoundary label="Questions">
              <Questions index={here} />
            </ErrorBoundary>
          </div>
        </div>
      </div>
      <ErrorBoundary label="The late banner">
        <LateBanner />
      </ErrorBoundary>
    </Screen>
  );
}

// The words a ConvexError("text") carries ("Check in first."), or a plain line for anything else.
function why(e: unknown) {
  const data = (e as { data?: unknown } | null)?.data;
  return typeof data === "string" ? data : "Something went wrong. Try again.";
}

// Signed out: scroll the sign-in box in the Questions card ("Sign in to post and upvote." and
// Google's button) to the top of the screen, so the student signs in once for I'm lost, questions
// and upvotes. On the live site the box has only Google's button, so nothing gets the cursor; a
// dev build also has the typed test form under it, and the cursor goes in its first field.
function toSignIn() {
  const box = document.getElementById(SIGN_IN_ID);
  box?.scrollIntoView({ block: "start" });
  box?.querySelector<HTMLElement>("form input")?.focus({ preventScroll: true });
}

// Under the title, for a signed-in student who isn't checked in this class: the line and a link to
// #/checkin/student. It shows whether or not a slide is up, so a student who opens #/live before
// the professor presents can still check in. Nothing while signed out (the Questions card has the
// sign-in) or while the check-in state loads.
function CheckInFirst() {
  const { user } = useGoogleUser();
  const checkedIn = useQuery(api.checkin.read.me, user ? { channel: CHANNEL } : "skip");
  if (!user || checkedIn !== false) return null;
  return (
    <div className="live-checkin">
      <p className="live-checkin__note">Check in to answer, ask and join a team.</p>
      <Link to="checkin/student" className="btn btn--secondary btn--block">Check in</Link>
    </div>
  );
}

// Under the slide on screen: "I'm lost" for a checked-in student (pressed while they're counted
// as lost on it), or "Sign in to tap I'm lost" while signed out ("Your sign-in ended." over "Sign
// in again to tap I'm lost" when the sign-in ran out on this page). A signed-in student who isn't
// checked in gets nothing here: CheckInFirst sits above the slide. The professor's #/host shows
// the count for each slide.
function Lost({ index }: { index: number }) {
  const { user, ended } = useGoogleUser();
  const checkedIn = useQuery(api.checkin.read.me, user ? { channel: CHANNEL } : "skip");
  const mine = useQuery(api.live.read.mine, user && checkedIn ? { channel: CHANNEL, index } : "skip");
  const toggle = useMutation(api.live.lost.toggle);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!user)
    return (
      <div className="lost">
        {ended && <p>Your sign-in ended.</p>}
        <Button variant="secondary" block onClick={toSignIn}>{ended ? "Sign in again to tap I’m lost" : "Sign in to tap I’m lost"}</Button>
      </div>
    );
  if (checkedIn === undefined) return <div className="lost" aria-busy="true" />;
  if (!checkedIn) return null; // CheckInFirst, above the slide, says what to do

  async function tap() {
    setBusy(true);
    setError("");
    try {
      await toggle({ channel: CHANNEL, index });
    } catch (e) {
      setError(why(e));
    } finally {
      setBusy(false);
    }
  }
  // Busy only while a tap is on its way. Before `mine` arrives (a moment after each slide change)
  // the button shows as not pressed and still works: the server decides on or off, and `mine`
  // updates the button.
  return (
    <div className="lost">
      <Button variant="secondary" block className="lost__button" aria-pressed={mine === true} busy={busy} onClick={() => void tap()}>
        {mine && <span aria-hidden="true">✓ </span>}I’m lost
      </Button>
      <p className="lost__note muted">
        {mine
          ? `You’re counted as lost on slide ${index + 1}. Tap again to undo.`
          : "The professor sees how many people are lost on each slide. Your name isn’t shown."}
      </p>
      {error && <Status kind="error">{error}</Status>}
    </div>
  );
}
