// The Now tab's "Ask the room" card. The professor drafts a question from the slide with the AI, or
// writes one, and opens it as a quiz or a vote on Check-in's polls (convex/checkin/quiz.ts), so it
// shows on every phone, on #/checkin/quiz and on the stage. While it's open the bars and "N of M
// answered" move as students answer; after End, each choice's %, the right answer (or the vote's
// top pick), % right and the median time show too.
//   It is the tab's focal card (the kit's .hcard): its heading row holds "Ask the room", the
// question's state word and facts, and the card's actions in one slot at the right in every state
// (Draft with AI and Write my own, then End while a question is open). The hero slot under it
// holds one number: how many answered while open, % right once a quiz with a right answer ends.
//   While a new question is being written the form is the card's content in every state: its Ask
// the room and Cancel take the heading row's action slot, and an existing question folds to its
// heading (and, while it's open, its question with End), so the form opens where the professor
// pressed Draft with AI or Write my own.
import { useId, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Status } from "../../blocks/ui";
import { Button, Field, Icon, Segmented } from "../../blocks/kit";
import { CHANNEL } from "../../blocks/deck";
import { NO_CLASS, errorText, useNoClass } from "./Team";
import "./ask.css";

const LETTERS = ["A", "B", "C", "D"];
type Kind = "quiz" | "vote";

// The question being written. `index` is the slide an AI draft came from (null: the slide the deck
// is on when it opens); `correct` is the box marked right, before blank boxes drop out.
type Form = { kind: Kind; question: string; choices: string[]; correct: number | null; index: number | null; aiDraft: boolean };

const RIGHT_ON_BLANK = "Type the right answer's choice.";

export default function AskRoom({ slideIndex }: { slideIndex: number | null }) {
  const current = useQuery(api.checkin.quiz.current, { channel: CHANNEL });
  const draftQuestion = useAction(api.checkin.quiz.draftQuestion);
  const ask = useMutation(api.checkin.quiz.ask);
  const [form, setForm] = useState<Form | null>(null);
  const [drafting, setDrafting] = useState(false); // the AI is writing a draft
  const [opening, setOpening] = useState(false); // the question is being opened
  const [error, setError] = useState("");
  const pollOpen = !!current?.open;
  const noClass = useNoClass();
  const loading = current === undefined;

  async function draft() {
    setDrafting(true);
    setError("");
    try {
      const d = await draftQuestion({ channel: CHANNEL });
      const boxes = [...d.choices, "", "", "", ""].slice(0, 4);
      setForm({ kind: "quiz", question: d.question, choices: boxes, correct: d.correct, index: d.index, aiDraft: true });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setDrafting(false);
    }
  }

  function writeOwn() {
    setError("");
    setForm({ kind: "quiz", question: "", choices: ["", "", "", ""], correct: null, index: null, aiDraft: false });
  }

  async function openQuestion(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    // Blank boxes drop out and the right answer follows its own box, as on #/checkin/quiz.
    const kept = form.choices.map((text, box) => ({ text: text.trim(), box })).filter((c) => c.text);
    const right = form.kind === "quiz" && form.correct !== null ? kept.findIndex((c) => c.box === form.correct) : -1;
    if (form.kind === "quiz" && form.correct !== null && right < 0) {
      setError(RIGHT_ON_BLANK);
      return;
    }
    setOpening(true);
    setError("");
    try {
      await ask({
        channel: CHANNEL,
        kind: form.kind,
        question: form.question,
        choices: kept.map((c) => c.text),
        ...(right >= 0 ? { correct: right } : {}),
        // An AI draft keeps the slide it was written from, even after the deck moves on. A
        // question written by hand takes the slide the deck is on when it opens, or none.
        ...(form.index !== null ? { index: form.index } : {}),
        ...(form.aiDraft ? { aiDraft: true } : {}),
      });
      setForm(null);
    } catch (x) {
      setError(errorText(x));
    } finally {
      setOpening(false);
    }
  }

  // Draft with AI and Write my own, in the heading row's action slot. With no question in this
  // class Draft with AI is the card's one green button; once there is one, End (while it's open)
  // or the % right (once it ends) is the green thing, so both are outlines. They wait, disabled,
  // while the class's question loads, and step aside while a new question is being written.
  const start = form ? null : (
    <>
      <Button variant={current ? "outline" : "primary"} size="lg" busy={drafting} disabled={loading} onClick={draft}>
        Draft with AI
      </Button>
      <Button variant="outline" size="lg" onClick={writeOwn} disabled={loading || drafting}>
        Write my own
      </Button>
    </>
  );

  return (
    <section className={form ? "hcard ask ask--draft" : "hcard ask"}>
      {current ? <Running key={current.id} poll={current} writing={!!form} actions={start} /> : <Head actions={start} />}
      {loading && (
        <div className="ask__load">
          <Status kind="loading">Loading the quiz or vote...</Status>
          <div className="skel-lines" aria-hidden="true">
            <span className="skel" />
            <span className="skel" />
            <span className="skel" />
          </div>
        </div>
      )}
      {current === null && !form && <Status kind="empty">{noClass ? NO_CLASS : "No quiz or vote in this class yet."}</Status>}

      {form && (
        <QuestionForm
          form={form}
          slide={form.index ?? slideIndex}
          pollOpen={pollOpen}
          opening={opening}
          onChange={setForm}
          onSubmit={openQuestion}
          onCancel={() => {
            setForm(null);
            setError("");
          }}
        />
      )}
      {error && <Status kind="error">{error}</Status>}
    </section>
  );
}

// The card's heading row: "Ask the room" with the question's state word beside it, its facts
// (Quiz or Vote, AI draft, the slide) under it, and the action slot at the right. The row keeps its
// height whether or not the slot has anything in it.
function Head({ state, facts = [], actions }: { state?: "open" | "ended"; facts?: string[]; actions?: ReactNode }) {
  return (
    <div className="hline host-head ask__head">
      <h2 className="hline__t">
        Ask the room
        {state && <span className={`stateword stateword--${state}`}>{state === "open" ? "Open" : "Ended"}</span>}
      </h2>
      {facts.length > 0 && (
        <p className="facts facts-list">
          {facts.map((f) => (
            <span key={f}>{f}</span>
          ))}
        </p>
      )}
      {actions && <div className="hline__end">{actions}</div>}
    </div>
  );
}

type Poll = NonNullable<FunctionReturnType<typeof api.checkin.quiz.current>>;
type Stats = NonNullable<FunctionReturnType<typeof api.checkin.quiz.stats>>;

// The question in this class now: open or ended, with its bars and numbers. While the next
// question is being written (`writing`), the form's Ask the room holds the heading row's slot, so
// this folds to its heading and, while it's open, one line with its question and End (stepped back
// to secondary). `actions` (Draft with AI and Write my own) go in the heading row's slot before End.
function Running({ poll, writing, actions }: { poll: Poll; writing: boolean; actions: ReactNode }) {
  const stats = useQuery(api.checkin.quiz.stats, { poll: poll.id });
  const end = useMutation(api.checkin.quiz.end);
  const [ending, setEnding] = useState(false);
  const [error, setError] = useState("");
  const vote = poll.kind === "vote";
  const counts = stats?.counts ?? poll.choices.map(() => 0);
  const answered = stats?.answered ?? poll.answered;
  const ended = !poll.open && !!stats;
  // Once the question has ended, as on #/checkin/quiz: the right answer is marked, or on a vote
  // (or a quiz with no right answer) the choice or choices most students picked.
  const right = ended ? stats.correct : null;
  const most = Math.max(...counts);
  const top = (i: number) => ended && right === null && answered > 0 && counts[i] === most;
  // While it's open, the choice most students picked so far fills in ink; nothing is green yet.
  // Before the counts arrive every count is a stand-in 0, so nothing leads.
  const lead = (i: number) => poll.open && !!stats && stats.answered > 0 && counts[i] === most;
  const share = (i: number) => (answered ? counts[i] / answered : 0);
  const pct = (i: number) => Math.round(share(i) * 100);
  const facts = [vote ? "Vote" : "Quiz", ...(stats?.aiDraft ? ["AI draft"] : []), ...(stats && stats.index !== null ? [`Slide ${stats.index + 1}`] : [])];

  async function endIt(id: Id<"polls">) {
    setEnding(true);
    setError("");
    try {
      await end({ poll: id });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setEnding(false);
    }
  }

  const endButton = poll.open && (
    <Button variant={writing ? "secondary" : "primary"} size="lg" busy={ending} onClick={() => endIt(poll.id)}>
      {vote ? "End the vote" : "End the quiz"}
    </Button>
  );

  if (writing)
    return (
      <>
        <Head state={poll.open ? "open" : "ended"} facts={facts} />
        {poll.open && (
          <div className="ask-run">
            <p className="ask-run__q">{poll.question}</p>
            {endButton}
          </div>
        )}
        {error && <Status kind="error">{error}</Status>}
      </>
    );

  return (
    <>
      <Head
        state={poll.open ? "open" : "ended"}
        facts={facts}
        actions={
          <>
            {actions}
            {endButton}
          </>
        }
      />
      <Tally open={poll.open} stats={stats} />
      <h3 className="ask-poll__q">{poll.question}</h3>
      <ul className="ruled rbars ask-bars">
        {poll.choices.map((c, i) => {
          const cls = ["ruled__row", i === right && "is-right", (top(i) || lead(i)) && "is-lead", (i === right || top(i)) && "ask-bar--right"];
          return (
            <li key={i} className={cls.filter(Boolean).join(" ")}>
              <span className="letter">{LETTERS[i]}</span>
              <span className="rbar__text">
                <span className="rbar__label">
                  <span className="ask-bar__text">{c}</span>
                  {i === right && (
                    <span className="rbar__tag">
                      <Icon name="check" />
                      <span className="sr-only"> · </span>right answer
                    </span>
                  )}
                  {top(i) && (
                    <span className="rbar__tag ask-bar__top">
                      <span className="sr-only"> · </span>top pick
                    </span>
                  )}
                </span>
                <span className="rbar__track">
                  <span className="rbar__fill" style={{ "--f": share(i) } as CSSProperties} />
                </span>
              </span>
              <span className="rbar__n">
                <span>{counts[i]}</span>
                {ended && (
                  <>
                    <span className="sr-only"> · </span>
                    <span className="rbar__pct">{pct(i)}%</span>
                  </>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      {error && <Status kind="error">{error}</Status>}
    </>
  );
}

// The hero slot: one number at the hero size, the same slot in every state. While the question is
// open (and after a vote, or a quiz with no right answer, ends) it is how many answered, "of 38"
// beside it; once a quiz with a right answer ends it is the % that got it right, in green (the
// card's one green thing then), with how many answered and the median time in a line under it.
// No stats yet (or none for a question that's gone): a still block in the number's place.
function Tally({ open, stats }: { open: boolean; stats: Stats | null | undefined }) {
  if (!stats)
    return (
      <div className="tally ask__tally">
        <span className="tally__lead n-hero">
          <span className="skel skel--num" aria-hidden="true" />
        </span>
        <span className="tally__of">answered</span>
      </div>
    );
  const median = !open && stats.medianSec !== null;
  if (!open && stats.rightPct !== null)
    return (
      <div className="tally tally--accent ask__tally">
        <span className="tally__lead n-hero">
          {stats.rightPct}
          <span className="num__unit">%</span>
        </span>
        <span className="tally__of">got it right</span>
        <p className="tally__line">
          <b>{stats.answered}</b> of <b>{stats.checkedIn}</b> answered
          {median && (
            <>
              {" · "}median time to answer <b>{stats.medianSec}</b> s
            </>
          )}
        </p>
      </div>
    );
  return (
    <div className="tally ask__tally">
      <span className="sr-only">{`${stats.answered} of ${stats.checkedIn} answered`}</span>
      <span className="tally__lead n-hero" aria-hidden="true">
        {stats.answered}
      </span>
      <span className="tally__of" aria-hidden="true">
        of {stats.checkedIn} answered
      </span>
      {median && (
        <p className="tally__line">
          median time to answer <b>{stats.medianSec}</b> s
        </p>
      )}
    </div>
  );
}

// The question being written: quiz or vote, the question, up to 4 choices and, on a quiz, the
// right answer, picked in one column of radios that ends with "No right answer". Exported for
// AskRoom.test.ts.
export function QuestionForm({
  form,
  slide,
  pollOpen,
  opening,
  onChange,
  onSubmit,
  onCancel,
}: {
  form: Form;
  slide: number | null;
  pollOpen: boolean;
  opening: boolean;
  onChange: (form: Form) => void;
  onSubmit: (e: FormEvent) => void;
  onCancel: () => void;
}) {
  const radio = useId();
  const quiz = form.kind === "quiz";
  const setChoice = (i: number, text: string) => onChange({ ...form, choices: form.choices.map((c, j) => (j === i ? text : c)) });
  const facts = [...(form.aiDraft ? ["AI draft"] : []), ...(slide !== null ? [`Slide ${slide + 1}`] : [])];

  return (
    <form className="ask-form" onSubmit={onSubmit}>
      <div className="ask-form__top">
        <Segmented<Kind>
          label="Quiz or vote"
          hideLabel
          value={form.kind}
          onChange={(kind) => onChange({ ...form, kind })}
          options={[
            { value: "quiz", label: "Quiz" },
            { value: "vote", label: "Vote" },
          ]}
        />
        <p className="ask-form__rule">
          {quiz ? (
            <>
              <Icon name="lock" />
              <span>Students can't change their answer.</span>
            </>
          ) : (
            "No right answer. Students can change their pick until you end it."
          )}
        </p>
        {facts.length > 0 && (
          <p className="facts facts-list ask-form__facts">
            {facts.map((f) => (
              <span key={f}>{f}</span>
            ))}
          </p>
        )}
      </div>
      <Field label="Question">
        {(f) => <input {...f} className="input ask-form__ask" value={form.question} onChange={(e) => onChange({ ...form, question: e.target.value })} />}
      </Field>
      <div className={quiz ? "ask-choices" : "ask-choices ask-choices--vote"}>
        <span className="ask-choices__head" aria-hidden="true" />
        <span className="ask-choices__head">Choices</span>
        {quiz && <span className="ask-choices__head ask-choices__head--right">Right answer</span>}
        {form.choices.map((c, i) => (
          <ChoiceRow
            key={i}
            letter={LETTERS[i]}
            text={c}
            needed={i < 2}
            quiz={quiz}
            radio={radio}
            right={form.correct === i}
            onText={(text) => setChoice(i, text)}
            onRight={() => onChange({ ...form, correct: i })}
          />
        ))}
        {quiz && (
          <label className="ask-choices__none">
            <span>No right answer</span>
            <input type="radio" className="radio" name={radio} checked={form.correct === null} onChange={() => onChange({ ...form, correct: null })} />
          </label>
        )}
      </div>
      <div className="ask-form__acts">
        <Button type="submit" size="lg" busy={opening}>
          {quiz ? "Ask the room" : "Start the vote"}
        </Button>
        <Button variant="plain" size="lg" onClick={onCancel}>
          Cancel
        </Button>
      </div>
      {pollOpen && (
        <p className="ask-form__rule">
          {quiz ? "Asking this quiz ends the quiz or vote that's open now." : "Starting this vote ends the quiz or vote that's open now."}
        </p>
      )}
    </form>
  );
}

function ChoiceRow({
  letter,
  text,
  needed,
  quiz,
  radio,
  right,
  onText,
  onRight,
}: {
  letter: string;
  text: string;
  needed: boolean;
  quiz: boolean;
  radio: string;
  right: boolean;
  onText: (text: string) => void;
  onRight: () => void;
}) {
  return (
    <>
      <span className={quiz && right ? "letter ask-choices__letter is-right" : "letter ask-choices__letter"} aria-hidden="true">
        {letter}
      </span>
      <input className="input" value={text} onChange={(e) => onText(e.target.value)} placeholder={needed ? "Choice (needed)" : "Choice (optional)"} aria-label={`Choice ${letter}`} />
      {quiz && (
        <label className="ask-choices__right">
          <input type="radio" className="radio" name={radio} checked={right} onChange={onRight} aria-label={`${letter} is the right answer`} />
        </label>
      )}
    </>
  );
}
