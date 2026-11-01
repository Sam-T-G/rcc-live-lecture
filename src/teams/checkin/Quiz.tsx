// Live quiz and vote. Two parts:
//   <Professor />: #/checkin/quiz, for professors and admins (StaffGate). Ask a question, watch
//     answers come in, end it, see the results.
//   <QuizCard />: the student's side, on #/checkin/student after check-in and on #/live. Anyone
//     can read the open question and its choices; only a checked-in student gets answer buttons.
//     Signed out it says "Sign in and check in to answer.", signed in "Check in to answer." (on a
//     vote, "... to vote."), with a "Check in" link to #/checkin/student. When the sign-in ran out
//     on this page it says "Your sign-in ended. Sign in again to answer." with a "Sign in" link.
// A button that sends something ignores presses until the server answers (usePending), so a
// double click asks the room once and a double tap sends one answer.
import { useRef, useState, type FormEvent } from "react";
import "./checkin.css";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Big, Card, Screen, Status } from "../../blocks/ui";
import { Button, Stat } from "../../blocks/kit";
import { Link } from "../../blocks/router";
import { useGoogleUser } from "../../blocks/auth";
import { CHANNEL } from "../../blocks/deck";
import { StaffGate } from "./prof";
import { why } from "./util";

const LETTERS = ["A", "B", "C", "D"];

// One request at a time. run(send) does nothing while the last send is still out; `pending` is
// true until it settles, for the button's busy or disabled look. It checks a ref as well as the
// state, so a second press that lands before React draws the disabled button still sends
// nothing. `send` catches its own errors.
function usePending() {
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

// One bar per choice. The right answer (quiz) or the top pick (vote) is highlighted.
function Bars({ choices, counts, correct, mine }: { choices: string[]; counts: number[]; correct: number | null; mine?: number | null }) {
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

// ---------- Professor ----------

export function Professor() {
  return <StaffGate title="Live quiz"><ProfessorBoard /></StaffGate>;
}

function ProfessorBoard() {
  const poll = useQuery(api.checkin.quiz.current, { channel: CHANNEL });
  const [asking, setAsking] = useState(false);
  const showForm = poll === null || (!!poll && !poll.open && asking);
  return (
    <Screen title="Live quiz" wide>
      <div className="scanner">
        <div>
          {poll === undefined && <Status kind="loading">Loading…</Status>}
          {showForm
            ? <AskForm onDone={() => setAsking(false)} />
            : poll && <Running key={poll.id} poll={poll} onNew={() => setAsking(true)} />}
        </div>
        <History />
      </div>
    </Screen>
  );
}

function AskForm({ onDone }: { onDone: () => void }) {
  const ask = useMutation(api.checkin.quiz.ask);
  const [kind, setKind] = useState<"quiz" | "vote">("quiz");
  const [question, setQuestion] = useState("");
  const [choices, setChoices] = useState(["", "", "", ""]);
  const [correct, setCorrect] = useState<number | null>(null);
  const [err, setErr] = useState("");
  const [sending, run] = usePending();

  function send(e: FormEvent) {
    e.preventDefault();
    // The page checks these two and says what's wrong (noValidate turns off the browser's own
    // message for the required question); the server checks the question again, and the number
    // of choices.
    const right = kind === "quiz" ? correct : null;
    if (!question.trim()) {
      setErr("Type a question.");
      return;
    }
    if (right !== null && !choices[right].trim()) {
      setErr("Type the right answer’s choice.");
      return;
    }
    // Blank choices drop out, so the right answer's index has to follow its choice.
    const kept = choices.map((c, i) => ({ c: c.trim(), i })).filter((x) => x.c);
    const at = right === null ? -1 : kept.findIndex((x) => x.i === right);
    void run(async () => {
      try {
        await ask({ channel: CHANNEL, kind, question, choices: kept.map((x) => x.c), correct: at >= 0 ? at : undefined });
        setErr("");
        onDone();
      } catch (x) {
        setErr(why(x));
      }
    });
  }

  return (
    <form onSubmit={send} className="ask" noValidate>
      <div className="row" role="radiogroup" aria-label="Quiz or vote">
        <button type="button" className={kind === "quiz" ? "" : "quiet"} onClick={() => setKind("quiz")} aria-pressed={kind === "quiz"}>Quiz</button>
        <button type="button" className={kind === "vote" ? "" : "quiet"} onClick={() => setKind("vote")} aria-pressed={kind === "vote"}>Vote</button>
      </div>
      <p className="muted">
        {kind === "quiz"
          ? "Quiz: mark the right answer if there is one. Students can't change their answer."
          : "Vote: no right answer. Students can change their pick until you end it."}
      </p>
      <label className="ask__q">
        Question
        <input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder={kind === "quiz" ? "What does a capacitor store?" : "What should we cover next?"} required />
      </label>
      {choices.map((c, i) => (
        <div key={i} className="row ask__choice">
          <b>{LETTERS[i]}</b>
          <input value={c} onChange={(e) => setChoices(choices.map((x, j) => (j === i ? e.target.value : x)))} placeholder={i < 2 ? "Choice (needed)" : "Choice (optional)"} aria-label={"Choice " + LETTERS[i]} />
          {kind === "quiz" && (
            <label className="muted">
              <input type="radio" name="correct" checked={correct === i} onChange={() => setCorrect(i)} /> Right
            </label>
          )}
        </div>
      ))}
      <p className="row">
        <Button type="submit" busy={sending}>{kind === "quiz" ? "Ask the room" : "Start the vote"}</Button>
        {kind === "quiz" && correct !== null && <button type="button" className="quiet" onClick={() => setCorrect(null)}>No right answer</button>}
      </p>
      {err && <Status kind="error">{err}</Status>}
    </form>
  );
}

type Poll = NonNullable<ReturnType<typeof useCurrent>>;
function useCurrent() { return useQuery(api.checkin.quiz.current, { channel: CHANNEL }); }

// One question, open or ended. ProfessorBoard keys it by poll, so an End error never carries over
// to the next question.
function Running({ poll, onNew }: { poll: Poll; onNew: () => void }) {
  const stats = useQuery(api.checkin.quiz.stats, { poll: poll.id });
  const end = useMutation(api.checkin.quiz.end);
  const [err, setErr] = useState("");
  const [ending, run] = usePending();
  const vote = poll.kind === "vote";

  function stop() {
    void run(async () => {
      try {
        await end({ poll: poll.id });
        setErr("");
      } catch (x) {
        setErr(why(x));
      }
    });
  }

  return (
    <div>
      <p className="muted">{vote ? "Vote" : "Quiz"} · {poll.open ? "open" : "ended"}</p>
      <h2 className="quiz__q">{poll.question}</h2>
      {poll.open ? (
        <>
          <Big value={stats ? `${stats.answered} of ${stats.checkedIn}` : "…"} label="checked-in students answered" />
          <ul className="quiz__list">{poll.choices.map((c, i) => <li key={i}><b>{LETTERS[i]}</b> {c}</li>)}</ul>
          <p className="row"><Button busy={ending} onClick={stop}>{vote ? "End the vote" : "End the quiz"}</Button></p>
          {err && <Status kind="error">{err}</Status>}
        </>
      ) : stats ? (
        <>
          <Bars choices={poll.choices} counts={stats.counts} correct={stats.correct} />
          <div className="quiz__stats">
            <Stat value={`${stats.answered} of ${stats.checkedIn}`} label="answered" accent />
            {stats.rightPct !== null && <Stat value={stats.rightPct + "%"} label="got it right" />}
            {stats.medianSec !== null && <Stat value={stats.medianSec + " s"} label="median time to answer" />}
          </div>
          <p className="row"><button onClick={onNew}>Ask another</button></p>
        </>
      ) : <Status kind="loading">Counting…</Status>}
    </div>
  );
}

function History() {
  const past = useQuery(api.checkin.quiz.history, { channel: CHANNEL });
  return (
    <div>
      <h2>This class</h2>
      {past === undefined ? (
        <Status kind="loading">Loading…</Status>
      ) : past.length === 0 ? (
        <Status kind="empty">No quiz or vote yet.</Status>
      ) : (
        <ul className="scanner__names">
          {past.map((p) => (
            <li key={p.id}>
              {p.question}{" "}
              <span className="muted">
                {p.kind === "vote" ? "vote" : "quiz"} · {p.answered} answered{p.rightPct !== null ? ` · ${p.rightPct}% right` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

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
            <button key={i} type="button" className={mine === i ? "quiz__pick quiz__pick--mine" : "quiz__pick quiet"} disabled={locked || sending} onClick={() => pick(i)} aria-pressed={mine === i}>
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
