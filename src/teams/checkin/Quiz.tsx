// Live quiz and vote. Two parts:
//   <Professor />: #/checkin/quiz, for professors and admins (StaffGate). Start a quiz or a vote,
//     watch answers come in, end it, see the results. It lives in QuizDesk.tsx; this file
//     re-exports it, so imports from "./Quiz" keep working.
//   <QuizCard />: the student's side, on #/checkin/student after check-in and on #/live. Anyone
//     can read the open question and its choices; only a checked-in student gets answer buttons.
//     Signed out it says "Sign in and check in to answer.", signed in "Check in to answer." (on a
//     vote, "... to vote."), with a "Check in" link to #/checkin/student. When the sign-in ran out
//     on this page it says "Your sign-in ended. Sign in again to answer." with a "Sign in" link.
// A button that sends something ignores presses until the server answers (usePending), so a
// double click asks the room once and a double tap sends one answer.
import { useRef, useState } from "react";
import "./checkin.css";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Card, Status } from "../../blocks/ui";
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
// professor's results (QuizDesk.tsx) and the student's use the same bars.
export function Bars({ choices, counts, correct, mine }: { choices: string[]; counts: number[]; correct: number | null; mine?: number | null }) {
  const total = counts.reduce((a, b) => a + b, 0);
  const top = Math.max(...counts);
  return (
    <ul className="bars">
      {choices.map((c, i) => {
        const pct = total ? Math.round((counts[i] / total) * 100) : 0;
        const right = correct === i;
        const won = correct === null && total > 0 && counts[i] === top;
        return (
          <li key={i} className={"bars__row" + (right || won ? " bars__row--win" : "")}>
            <span className="bars__label">
              <b>{LETTERS[i]}</b> {c}
              {right && " ✓ right answer"}
              {mine === i && " (you)"}
            </span>
            <span className="bars__track"><span className="bars__fill" style={{ width: pct + "%" }} /></span>
            <span className="bars__num">{counts[i]} · {pct}%</span>
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

  if (!poll.open && poll.results)
    return (
      <Card title={vote ? "The room voted" : "Results"}>
        <p className="quiz__q">{poll.question}</p>
        {!vote && poll.results.correct !== null && mine !== undefined && mine !== null && (
          <p className="pass__name">{mine === poll.results.correct ? "You got it right." : "Not this time."}</p>
        )}
        <Bars choices={poll.choices} counts={poll.results.counts} correct={poll.results.correct} mine={mine} />
      </Card>
    );

  return <Answer key={poll.id} poll={poll} mine={mine} here={here} signedIn={!!user} ended={!user && !!ended} />;
}

// The open question. Keyed by poll in QuizCard, so a failed answer's error and a send still out
// never carry over to the next question. `here` is checkin.read.me: undefined while it loads.
// `ended`: the sign-in ran out on this page (AuthState.ended), so the line says so.
function Answer({ poll, mine, here, signedIn, ended }: { poll: Poll; mine: number | null | undefined; here: boolean | undefined; signedIn: boolean; ended: boolean }) {
  const answer = useMutation(api.checkin.quiz.answer);
  const [sending, run] = usePending();
  // A failed answer, with what `mine` was when the student tapped. Its words stay up until the
  // answer lands (`mine` changes). A quiz that has an answer shows "Answer sent." and no error:
  // a second send that comes back "You already answered." has nothing left to fix.
  const [failed, setFailed] = useState<{ mine: number | null | undefined; text: string } | null>(null);
  const vote = poll.kind === "vote";
  const locked = !vote && mine !== null && mine !== undefined;
  const err = failed && failed.mine === mine && !locked ? failed.text : "";

  function pick(choice: number) {
    const before = mine;
    void run(async () => {
      try {
        await answer({ poll: poll.id, choice });
        setFailed(null);
      } catch (e) {
        setFailed({ mine: before, text: why(e) });
      }
    });
  }

  const how = (ended ? "Your sign-in ended. Sign in again to " : signedIn ? "Check in to " : "Sign in and check in to ") + (vote ? "vote." : "answer.");
  return (
    <Card title={vote ? "Vote now" : "Quiz now"}>
      <p className="quiz__q">{poll.question}</p>
      {here ? (
        <div className="quiz__picks">
          {poll.choices.map((c, i) => (
            <button key={i} type="button" className={mine === i ? "quiz__pick quiz__pick--mine" : "quiz__pick btn--secondary"} disabled={locked || sending} onClick={() => pick(i)} aria-pressed={mine === i}>
              <b>{LETTERS[i]}</b> {c}
            </button>
          ))}
        </div>
      ) : (
        <ul className="quiz__list">{poll.choices.map((c, i) => <li key={i}><b>{LETTERS[i]}</b> {c}</li>)}</ul>
      )}
      {here === false && (
        <>
          <p>{how}</p>
          <Link to="checkin/student" className="btn btn--quiet btn--flush">{ended ? "Sign in" : "Check in"}</Link>
        </>
      )}
      {here && locked && <p className="muted">Answer sent. Results show when the professor ends the quiz.</p>}
      {here && vote && mine !== null && mine !== undefined && <p className="muted">You picked {LETTERS[mine]}. Tap another to change it.</p>}
      {err && <Status kind="error">{err}</Status>}
    </Card>
  );
}
