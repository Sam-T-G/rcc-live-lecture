// The professor's side of the live quiz and vote: <Professor />, #/checkin/quiz, for professors
// and admins (StaffGate). Start a quiz or a vote, watch answers come in, end it, see the results.
// On screen a poll is a quiz or a vote, never a "question" (that word is for students' posts;
// Quiz.press.test.ts checks it). Quiz.tsx re-exports Professor and has the student's side
// (QuizCard) and the parts both use (Bars, usePending, useCurrent).
import { useState, type FormEvent } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Big, Screen, Status } from "../../blocks/ui";
import { Button, Segmented, Stat, type Choice } from "../../blocks/kit";
import { CHANNEL } from "../../blocks/deck";
import { StaffGate } from "./prof";
import { Bars, LETTERS, usePending, type Poll } from "./Quiz";
import { why } from "./util";

const KINDS: Choice<"quiz" | "vote">[] = [
  { value: "quiz", label: "Quiz" },
  { value: "vote", label: "Vote" },
];

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
    // message for the required text); the server checks the text again, and the number of
    // choices. On screen the text is "Quiz text" or "Vote text": "question" is for students' posts.
    const right = kind === "quiz" ? correct : null;
    if (!question.trim()) {
      setErr(`Type the ${kind} text.`);
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
      <Segmented label="Quiz or vote" hideLabel options={KINDS} value={kind} onChange={setKind} />
      <p className="muted">
        {kind === "quiz"
          ? "Quiz: mark the right answer if there is one. Students can't change their answer."
          : "Vote: no right answer. Students can change their pick until you end it."}
      </p>
      <label className="ask__q">
        {kind === "quiz" ? "Quiz text" : "Vote text"}
        <input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder={kind === "quiz" ? "What does a capacitor store?" : "What should we cover next?"} required />
      </label>
      {choices.map((c, i) => (
        <div key={i} className="row ask__choice">
          <b>{LETTERS[i]}</b>
          <input value={c} onChange={(e) => setChoices(choices.map((x, j) => (j === i ? e.target.value : x)))} placeholder={i < 2 ? "Choice (needed)" : "Choice (optional)"} aria-label={"Choice " + LETTERS[i]} />
          {kind === "quiz" && (
            <label className="muted">
              <input type="radio" name="correct" checked={correct === i} onChange={() => setCorrect(i)} aria-label={`Right answer: ${LETTERS[i]}`} /> Right
            </label>
          )}
        </div>
      ))}
      <p className="row">
        <Button type="submit" busy={sending}>{kind === "quiz" ? "Ask the room" : "Start the vote"}</Button>
        {kind === "quiz" && correct !== null && <Button variant="quiet" onClick={() => setCorrect(null)}>No right answer</Button>}
      </p>
      {err && <Status kind="error">{err}</Status>}
    </form>
  );
}

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
