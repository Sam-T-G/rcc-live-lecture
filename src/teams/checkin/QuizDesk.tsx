// The professor's side of the live quiz and vote: <Professor />, #/checkin/quiz, for professors
// and admins (StaffGate). Start a quiz or a vote, watch answers come in, end it, see the results.
// On screen a poll is a quiz or a vote, never a "question" (that word is for students' posts;
// Quiz.press.test.ts checks it). Quiz.tsx re-exports Professor and has the student's side
// (QuizCard) and the parts both use (usePending, useCurrent).
// The page: the staff bar (StaffGate), then the quiz card, the page's one raised card, and This
// class beside it. The card's action (End the quiz, Ask another) sits at the end of its first
// line in every state; the results are the kit's ruled bar chart (.rbars) on the card.
import "./quizdesk.css";
import { useState, type CSSProperties, type FormEvent } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Big, Screen, Status } from "../../blocks/ui";
import { Button, Icon, Segmented, Stat, type Choice } from "../../blocks/kit";
import { CHANNEL } from "../../blocks/deck";
import { StaffGate } from "./prof";
import { LETTERS, usePending, type Poll } from "./Quiz";
import { why } from "./util";

const KINDS: Choice<"quiz" | "vote">[] = [
  { value: "quiz", label: "Quiz" },
  { value: "vote", label: "Vote" },
];

export function Professor() {
  return <StaffGate title="Live quiz" bar><ProfessorBoard /></StaffGate>;
}

function ProfessorBoard() {
  const poll = useQuery(api.checkin.quiz.current, { channel: CHANNEL });
  const [asking, setAsking] = useState(false);
  const showForm = poll === null || (!!poll && !poll.open && asking);
  return (
    <div className="staff-page">
      <Screen wide>
        <div className="desk qd">
          <section className="focal qd-card" aria-busy={poll === undefined || undefined}>
            {poll === undefined && (
              <>
                <Status kind="loading">Loading…</Status>
                <div className="skel-lines" aria-hidden="true">
                  <span className="skel" />
                  <span className="skel" />
                  <span className="skel" />
                </div>
              </>
            )}
            {showForm
              ? <AskForm onDone={() => setAsking(false)} />
              : poll && <Running key={poll.id} poll={poll} onNew={() => setAsking(true)} />}
          </section>
          <History />
        </div>
      </Screen>
    </div>
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

  // Quiz or Vote on the card's first line, the rule under it, the text, then A to D as rows: the
  // letter tile, the choice, and the right-answer radio in one column at the end.
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
      <div className="ask__choices">
        {choices.map((c, i) => (
          <div key={i} className="row ask__choice">
            <span className="letter" aria-hidden="true">{LETTERS[i]}</span>
            <input value={c} onChange={(e) => setChoices(choices.map((x, j) => (j === i ? e.target.value : x)))} placeholder={i < 2 ? "Choice (needed)" : "Choice (optional)"} aria-label={"Choice " + LETTERS[i]} />
            {kind === "quiz" && (
              <label className="muted ask__right">
                <input type="radio" className="radio" name="correct" checked={correct === i} onChange={() => setCorrect(i)} aria-label={`Right answer: ${LETTERS[i]}`} /> Right
              </label>
            )}
          </div>
        ))}
      </div>
      <p className="row ask__send">
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

  // The lead count: got it right for a quiz with a right answer, else answered.
  const right = stats?.rightPct ?? null;
  return (
    <div className="qd-run">
      <p className="qd-run__state">
        <span>{vote ? "Vote" : "Quiz"}</span> · <span className={poll.open ? "stateword stateword--open" : "stateword stateword--ended"}>{poll.open ? "open" : "ended"}</span>
      </p>
      <h2 className="quiz__q">{poll.question}</h2>
      {poll.open ? (
        <>
          <Big value={stats ? `${stats.answered} of ${stats.checkedIn}` : "…"} label="checked-in students answered" />
          <ul className="ruled rbars qd-choices">
            {poll.choices.map((c, i) => (
              <li key={i} className="ruled__row">
                <span className="letter">{LETTERS[i]}</span> <span>{c}</span>
              </li>
            ))}
          </ul>
          <p className="row qd-act"><Button busy={ending} onClick={stop}>{vote ? "End the vote" : "End the quiz"}</Button></p>
          {err && <Status kind="error">{err}</Status>}
        </>
      ) : stats ? (
        <>
          <div className="quiz__stats">
            {right !== null && <Stat value={right + "%"} label="got it right" accent />}
            <Stat value={`${stats.answered} of ${stats.checkedIn}`} label="answered" accent={right === null} />
            {stats.medianSec !== null && <Stat value={stats.medianSec + " s"} label="median time to answer" />}
          </div>
          <Results choices={poll.choices} counts={stats.counts} correct={stats.correct} />
          <p className="row qd-act"><button onClick={onNew}>Ask another</button></p>
        </>
      ) : <Status kind="loading">Counting…</Status>}
    </div>
  );
}

// The ended quiz's or vote's answers as the kit's ruled bar chart on the card: the letter, the
// choice over its bar, the count and the percent. The right answer's bar fills green with the
// check and "right answer" on its line; a vote's top pick is marked as the lead. The percent is
// of everyone who answered.
function Results({ choices, counts, correct }: { choices: string[]; counts: number[]; correct: number | null }) {
  const total = counts.reduce((a, b) => a + b, 0);
  const top = Math.max(...counts);
  return (
    <ul className="ruled rbars qd-bars">
      {choices.map((c, i) => {
        const n = counts[i] ?? 0;
        const share = total ? n / total : 0;
        const right = correct === i;
        const lead = correct === null && total > 0 && n === top;
        return (
          <li key={i} className={"ruled__row" + (right ? " is-right" : "") + (lead ? " is-lead" : "")}>
            <span className="letter">{LETTERS[i]}</span>
            <span className="rbar__text">
              <span className="rbar__label">
                <span>{c}</span>
                {right && (
                  <span className="rbar__tag">
                    <Icon name="check" />
                    right answer
                  </span>
                )}
              </span>
              <span className="rbar__track">
                <span className="rbar__fill" style={{ "--f": share } as CSSProperties} />
              </span>
            </span>
            <span className="rbar__n">
              <span>{n}</span>
              <span className="rbar__pct">{Math.round(share * 100)}%</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

// This class's quizzes and votes, newest first, as rows in a well beside the card.
function History() {
  const past = useQuery(api.checkin.quiz.history, { channel: CHANNEL });
  return (
    <section className="qd-history">
      <h2>This class</h2>
      {past === undefined ? (
        <div className="state state--inline">
          <Status kind="loading">Loading…</Status>
        </div>
      ) : past.length === 0 ? (
        <div className="state state--inline">
          <Status kind="empty">No quiz or vote yet.</Status>
        </div>
      ) : (
        <ul className="ruled ruled--well qd-history__list">
          {past.map((p) => (
            <li key={p.id} className="ruled__row">
              {p.question}{" "}
              <span className="muted">
                {p.kind === "vote" ? "vote" : "quiz"} · {p.answered} answered{p.rightPct !== null ? ` · ${p.rightPct}% right` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
