// Live quiz and vote. Two parts:
//   <Professor />: #/checkin/quiz, for professors and admins (StaffGate). Start a quiz or a vote,
//     watch answers come in, end it, see the results. It lives in QuizDesk.tsx; this file
//     re-exports it, so imports from "./Quiz" keep working.
//   <QuizCard />: the student's side, on #/checkin/student after check-in and on #/live. Anyone
//     can read the open question and its choices; only a checked-in student gets answer buttons.
//     Signed out it says "Sign in and check in to answer.", signed in "Check in to answer." (on a
//     vote, "... to vote."), with a "Check in" link to #/checkin/student. When the sign-in ran out
//     on this page it says "Your sign-in ended. Sign in again to answer." with a "Sign in" link.
//     An open poll is the green field (kit .qfield) with the A to D tiles (kit .choice); its
//     results are a raised card with the verdict, the question and the bars (checkin.css).
// A button that sends something ignores presses until the server answers (usePending), so a
// double click asks the room once and a double tap sends one answer.
import { useRef, useState } from "react";
import "./checkin.css";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Status } from "../../blocks/ui";
import { Icon } from "../../blocks/kit";
import { Link } from "../../blocks/router";
import { useGoogleUser } from "../../blocks/auth";
import { CHANNEL } from "../../blocks/deck";
import { why } from "./util";

export { Professor } from "./QuizDesk";

export const LETTERS = ["A", "B", "C", "D"];

// One request at a time. run(send) does nothing while the last send is still out; `pending` is
// true until it settles, for the button's busy or disabled look. It checks a ref as well as the
// state, so a second press that lands before React draws the disabled button still sends
// nothing. `send` catches its own errors.
export function usePending() {
  const [pending, setPending] = useState(false);
  const out = useRef(false);
  async function run(send: () => Promise<void>) {
    if (out.current) return;
    out.current = true;
    setPending(true);
    try {
      await send();
    } finally {
      out.current = false;
      setPending(false);
    }
  }
  return [pending, run] as const;
}

// One bar per choice. The right answer (quiz) or the top pick (vote) is highlighted. The
// professor's results (QuizDesk.tsx) and the student's use the same bars. The count and the
// percent are their own spans, so the phone (checkin.css .qresult) can set them in two columns on
// the label's line; elsewhere they read "19 · 63%" as before. A quiz's right answer is
// .bars__row--right.
export function Bars({ choices, counts, correct, mine }: { choices: string[]; counts: number[]; correct: number | null; mine?: number | null }) {
  const total = counts.reduce((a, b) => a + b, 0);
  const top = Math.max(...counts);
  return (
    <ul className="bars">
      {choices.map((c, i) => {
        const pct = total ? Math.round((counts[i] / total) * 100) : 0;
        const right = correct === i;
        const won = correct === null && total > 0 && counts[i] === top;
        const cls = "bars__row" + (right || won ? " bars__row--win" : "") + (right ? " bars__row--right" : "");
        return (
          <li key={i} className={cls}>
            <span className="bars__label">
              <b>{LETTERS[i]}</b> {c}
              {right && " ✓ right answer"}
              {mine === i && " (you)"}
            </span>
            <span className="bars__track"><span className="bars__fill" style={{ width: pct + "%" }} /></span>
            <span className="bars__num">
              <span className="bars__count">{counts[i]}</span>
              <span className="bars__dot"> · </span>
              <span className="bars__pct">{pct}%</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export type Poll = NonNullable<ReturnType<typeof useCurrent>>;
export function useCurrent() { return useQuery(api.checkin.quiz.current, { channel: CHANNEL }); }

// ---------- Student ----------

export function QuizCard() {
  const poll = useCurrent();
  const mine = useQuery(api.checkin.quiz.mine, poll ? { poll: poll.id } : "skip");
  // Read here, not in Answer, so the check-in status stays loaded from one question to the next.
  const here = useQuery(api.checkin.read.me, { channel: CHANNEL });
  const { user, ended } = useGoogleUser();
  if (!poll) return null;
  const vote = poll.kind === "vote";

  // After the professor ends it: the result card, raised, the verdict as its headline with its
  // glyph inline, then the question and the bars. A wrong pick's glyph is muted, never red: a wrong
  // answer isn't an app failure.
  if (!poll.open && poll.results) {
    const right = !vote && poll.results.correct !== null && mine !== undefined && mine !== null ? mine === poll.results.correct : null;
    return (
      <section className="qresult livestate">
        <h2 className="qresult__head">{vote ? "The room voted" : "Results"}</h2>
        {right !== null && (
          <p className={right ? "qresult__verdict lockup lockup--in" : "qresult__verdict lockup lockup--miss"}>
            <Icon name={right ? "check" : "x"} className="icon--d" />
            {right ? "You got it right." : "Not this time."}
          </p>
        )}
        <p className="quiz__q">{poll.question}</p>
        <Bars choices={poll.choices} counts={poll.results.counts} correct={poll.results.correct} mine={mine} />
      </section>
    );
  }

  return <Answer key={poll.id} poll={poll} mine={mine} here={here} signedIn={!!user} ended={!user && !!ended} />;
}

// The open question. Keyed by poll in QuizCard, so a failed answer's error and a send still out
// never carry over to the next question. `here` is checkin.read.me: undefined while it loads.
// `ended`: the sign-in ran out on this page (AuthState.ended), so the line says so.
function Answer({ poll, mine, here, signedIn, ended }: { poll: Poll; mine: number | null | undefined; here: boolean | undefined; signedIn: boolean; ended: boolean }) {
  const answer = useMutation(api.checkin.quiz.answer);
  const [sending, run] = usePending();
  // A failed answer, with what `mine` was when the student tapped and the choice that failed (its
  // tile takes the red ring). Its words stay up until the answer lands (`mine` changes). A quiz
  // that has an answer shows "Answer sent." and no error: a second send that comes back "You
  // already answered." has nothing left to fix.
  const [failed, setFailed] = useState<{ mine: number | null | undefined; text: string; choice?: number } | null>(null);
  // The choice on its way to the server, for its tile's sending look.
  const [tapped, setTapped] = useState<number | null>(null);
  const vote = poll.kind === "vote";
  const locked = !vote && mine !== null && mine !== undefined;
  const err = failed && failed.mine === mine && !locked ? failed.text : "";

  function pick(choice: number) {
    const before = mine;
    void run(async () => {
      setTapped(choice);
      try {
        await answer({ poll: poll.id, choice });
        setFailed(null);
      } catch (e) {
        setFailed({ mine: before, text: why(e), choice });
      } finally {
        setTapped(null);
      }
    });
  }

  // One tile's look (kit .choice): the student's pick keeps its fill and takes the ring; while an
  // answer sends, the tapped tile is busy with the same ring and the others step down to the out
  // fill, as they do once a quiz answer is in; a failed send rings its tile red. The tapped tile
  // ends with "Sending" while it sends, and a quiz answer that's in ends with the check and
  // "Sent" (comps phone-quiz-sending and phone-quiz-sent); a vote's pick can still change, so it
  // gets no "Sent".
  function tile(i: number) {
    const busy = sending && tapped === i;
    const out = (sending && tapped !== null && tapped !== i) || (locked && mine !== i);
    const failedHere = !!err && failed?.choice === i;
    return "quiz__pick choice" + (mine === i || busy ? " is-picked" : "") + (locked && mine === i ? " is-locked" : "") + (out ? " is-out" : "") + (failedHere && !busy ? " is-error" : "");
  }

  const how = (ended ? "Your sign-in ended. Sign in again to " : signedIn ? "Check in to " : "Sign in and check in to ") + (vote ? "vote." : "answer.");
  // The open poll is the green field (kit .qfield): what it is, the question, then the four tiles
  // in the thumb band, and one line under them for what happened.
  return (
    <section className="qfield quiz-open">
      <h2 className="qfield__kind">{vote ? "Vote now" : "Quiz now"}</h2>
      <p className="quiz__q">{poll.question}</p>
      {here ? (
        <div className="quiz__picks choices">
          {poll.choices.map((c, i) => (
            <button
              key={i}
              type="button"
              className={tile(i)}
              disabled={locked || sending}
              onClick={() => pick(i)}
              aria-pressed={mine === i}
              aria-busy={(sending && tapped === i) || undefined}
            >
              <b>{LETTERS[i]}</b> {c}
              {/* A space before the word, so the button reads "B Current Sent". */}
              {sending && tapped === i ? (
                <> <span className="choice__state"><Icon name="clock" className="choice__clock" />Sending</span></>
              ) : (
                locked && mine === i && <> <span className="choice__state"><Icon name="check" className="icon--d" />Sent</span></>
              )}
            </button>
          ))}
        </div>
      ) : (
        <ul className="quiz__list choices">{poll.choices.map((c, i) => <li key={i}><b>{LETTERS[i]}</b> {c}</li>)}</ul>
      )}
      {here === false && (
        <div className="quiz-how">
          <p>{how}</p>
          <Link to="checkin/student" className="btn btn--on-field">{ended ? "Sign in" : "Check in"}</Link>
        </div>
      )}
      {here && locked && (
        <p className="qfield__foot">
          <Icon name="check" />
          <span>Answer sent. Results show when the professor ends the quiz.</span>
        </p>
      )}
      {here && vote && mine !== null && mine !== undefined && (
        <p className="qfield__foot">
          <Icon name="check" />
          <span>You picked {LETTERS[mine]}. Tap another to change it.</span>
        </p>
      )}
      {err && <Status kind="error">{err}</Status>}
    </section>
  );
}
