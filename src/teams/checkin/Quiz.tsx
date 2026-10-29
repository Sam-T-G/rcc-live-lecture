// Live quiz and vote. Two parts:
//   <Professor />: #/checkin/quiz, hosts only. Ask a question, watch answers come in, end it,
//     see the results.
//   <QuizCard />: the student's side. Shows on the phone after check-in; Live slides can drop
//     it on #/live too with <QuizCard />.
import { useState, type FormEvent } from "react";
import "./checkin.css";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Big, Card, Screen, Status } from "../../blocks/ui";
import { CHANNEL } from "../../blocks/deck";
import { SignInButton, useGoogleUser } from "../../blocks/auth";

const LETTERS = ["A", "B", "C", "D"];

function why(e: unknown) {
  const x = e as { data?: unknown };
  return typeof x?.data === "string" ? x.data : "Something went wrong. Try again.";
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
  const { user } = useGoogleUser();
  const host = useQuery(api.checkin.pass.amHost);
  if (!user)
    return (
      <Screen title="Live quiz" wide>
        <Card title="Sign in"><p>Sign in with a teacher account.</p><SignInButton /></Card>
      </Screen>
    );
  if (host === undefined) return <Screen title="Live quiz" wide><Status kind="loading">Checking your account…</Status></Screen>;
  if (!host) return <Screen title="Live quiz" wide><Status kind="error">Only teachers can open this page.</Status></Screen>;
  return <ProfessorBoard />;
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
            : poll && <Running poll={poll} onNew={() => setAsking(true)} />}
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

  function send(e: FormEvent) {
    e.preventDefault();
    // Blank choices drop out, so the right answer's index has to follow its choice.
    const kept = choices.map((c, i) => ({ c: c.trim(), i })).filter((x) => x.c);
    const at = kind === "quiz" && correct !== null ? kept.findIndex((x) => x.i === correct) : -1;
    ask({ channel: CHANNEL, kind, question, choices: kept.map((x) => x.c), correct: at >= 0 ? at : undefined })
      .then(() => { setErr(""); onDone(); })
      .catch((x) => setErr(why(x)));
  }

  return (
    <form onSubmit={send} className="ask">
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
        <button type="submit">{kind === "quiz" ? "Ask the room" : "Start the vote"}</button>
        {kind === "quiz" && correct !== null && <button type="button" className="quiet" onClick={() => setCorrect(null)}>No right answer</button>}
      </p>
      {err && <Status kind="error">{err}</Status>}
    </form>
  );
}

type Poll = NonNullable<ReturnType<typeof useCurrent>>;
function useCurrent() { return useQuery(api.checkin.quiz.current, { channel: CHANNEL }); }

function Running({ poll, onNew }: { poll: Poll; onNew: () => void }) {
  const stats = useQuery(api.checkin.quiz.stats, { poll: poll.id });
  const end = useMutation(api.checkin.quiz.end);
  const vote = poll.kind === "vote";
  return (
    <div>
      <p className="muted">{vote ? "Vote" : "Quiz"} · {poll.open ? "open" : "ended"}</p>
      <h2 className="quiz__q">{poll.question}</h2>
      {poll.open ? (
        <>
          <Big value={stats ? `${stats.answered} / ${stats.checkedIn}` : "…"} label="checked-in students answered" />
          <ul className="quiz__list">{poll.choices.map((c, i) => <li key={i}><b>{LETTERS[i]}</b> {c}</li>)}</ul>
          <p className="row"><button onClick={() => end({ poll: poll.id })}>{vote ? "End the vote" : "End the question"}</button></p>
        </>
      ) : stats ? (
        <>
          <Bars choices={poll.choices} counts={stats.counts} correct={stats.correct} />
          <div className="quiz__stats">
            <Big value={`${stats.answered} / ${stats.checkedIn}`} label="answered" />
            {stats.rightPct !== null && <Big value={stats.rightPct + "%"} label="got it right" />}
            {stats.medianSec !== null && <Big value={stats.medianSec + " s"} label="median time to answer" />}
          </div>
          <p className="row"><button onClick={onNew}>Ask another</button></p>
        </>
      ) : <Status kind="loading">Counting…</Status>}
    </div>
  );
}

function History() {
  const past = useQuery(api.checkin.quiz.history, { channel: CHANNEL });
  if (!past || past.length === 0) return <div><h2>This class</h2><Status kind="empty">No questions yet.</Status></div>;
  return (
    <div>
      <h2>This class</h2>
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
    </div>
  );
}

// ---------- Student ----------

export function QuizCard() {
  const poll = useCurrent();
  const mine = useQuery(api.checkin.quiz.mine, poll ? { poll: poll.id } : "skip");
  const answer = useMutation(api.checkin.quiz.answer);
  const [err, setErr] = useState("");
  if (!poll) return null;
  const vote = poll.kind === "vote";

  function pick(id: Id<"polls">, i: number) {
    answer({ poll: id, choice: i }).then(() => setErr("")).catch((e) => setErr(why(e)));
  }

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

  const locked = !vote && mine !== null && mine !== undefined;
  return (
    <Card title={vote ? "Vote now" : "Question"}>
      <p className="quiz__q">{poll.question}</p>
      <div className="quiz__picks">
        {poll.choices.map((c, i) => (
          <button key={i} className={mine === i ? "quiz__pick quiz__pick--mine" : "quiz__pick quiet"} disabled={locked} onClick={() => pick(poll.id, i)} aria-pressed={mine === i}>
            <b>{LETTERS[i]}</b> {c}
          </button>
        ))}
      </div>
      {locked && <p className="muted">Answer sent. Results show when the professor ends the question.</p>}
      {vote && mine !== null && mine !== undefined && <p className="muted">You picked {LETTERS[mine]}. Tap another to change it.</p>}
      {err && <Status kind="error">{err}</Status>}
    </Card>
  );
}
