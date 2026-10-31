// The Now tab's "Ask the room" card. The professor drafts a question from the slide with the AI, or
// writes one, and opens it as a quiz or a vote on Check-in's polls (convex/checkin/quiz.ts), so it
// shows on every phone, on #/checkin/quiz and on the stage. While it's open the bars and "N of M
// answered" move as students answer; after End, % right and the median time show too.
import { useId, useState, type FormEvent } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Card, Status } from "../../blocks/ui";
import { Badge, Button, Field, Segmented, Stat } from "../../blocks/kit";
import { CHANNEL } from "../../blocks/deck";
import { errorText } from "./Team";
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

  return (
    <Card title="Ask the room">
      {current === undefined && <Status kind="loading">Loading the question...</Status>}
      {current === null && !form && <Status kind="empty">No question in this class yet.</Status>}
      {current && <Running key={current.id} poll={current} writing={!!form} />}

      {form ? (
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
      ) : (
        <div className="row">
          <Button variant={pollOpen ? "secondary" : "primary"} busy={drafting} onClick={draft}>
            Draft with AI
          </Button>
          <Button variant="secondary" onClick={writeOwn} disabled={drafting}>
            Write my own
          </Button>
        </div>
      )}
      {error && <Status kind="error">{error}</Status>}
    </Card>
  );
}

type Poll = NonNullable<FunctionReturnType<typeof api.checkin.quiz.current>>;

// The question in this class now: open or ended, with its bars and numbers. While the next
// question is being written (`writing`), its Open button is the main one, so End steps back.
function Running({ poll, writing }: { poll: Poll; writing: boolean }) {
  const stats = useQuery(api.checkin.quiz.stats, { poll: poll.id });
  const end = useMutation(api.checkin.quiz.end);
  const [ending, setEnding] = useState(false);
  const [error, setError] = useState("");
  const vote = poll.kind === "vote";
  const counts = stats?.counts ?? poll.choices.map(() => 0);
  const answered = stats?.answered ?? poll.answered;
  // The right answer is marked once the question has ended, as on the phones.
  const right = !poll.open && stats ? stats.correct : null;

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

  return (
    <div className="ask-poll">
      <div className="row">
        <Badge tone={poll.open ? "live" : "neutral"}>{poll.open ? "Open" : "Ended"}</Badge>
        <Badge>{vote ? "Vote" : "Quiz"}</Badge>
        {stats && stats.index !== null && <Badge>Slide {stats.index + 1}</Badge>}
        {stats?.aiDraft && <Badge tone="accent">AI draft</Badge>}
      </div>
      <h3 className="ask-poll__q">{poll.question}</h3>
      <ul className="ask-bars">
        {poll.choices.map((c, i) => (
          <li key={i} className={i === right ? "ask-bar ask-bar--right" : "ask-bar"}>
            <b className="ask-bar__letter">{LETTERS[i]}</b>
            <span className="ask-bar__text">
              {c}
              {i === right && <span className="ask-bar__mark"> · right answer</span>}
            </span>
            <span className="ask-bar__n">{counts[i]}</span>
            <span className="ask-bar__track" aria-hidden="true">
              <span className="ask-bar__fill" style={{ width: `${answered ? (counts[i] / answered) * 100 : 0}%` }} />
            </span>
          </li>
        ))}
      </ul>
      <div className="ask-stats">
        <Stat value={stats ? `${stats.answered} of ${stats.checkedIn}` : "-"} label="answered" accent />
        {!poll.open && stats && stats.rightPct !== null && <Stat value={`${stats.rightPct}%`} label="got it right" />}
        {!poll.open && stats && stats.medianSec !== null && <Stat value={`${stats.medianSec} s`} label="median time to answer" />}
      </div>
      {poll.open && (
        <Button variant={writing ? "secondary" : "primary"} busy={ending} onClick={() => endIt(poll.id)}>
          {vote ? "End the vote" : "End the question"}
        </Button>
      )}
      {error && <Status kind="error">{error}</Status>}
    </div>
  );
}

// The question being written: quiz or vote, the question, up to 4 choices and, on a quiz, the
// right answer.
function QuestionForm({
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

  return (
    <form className="ask-form" onSubmit={onSubmit}>
      <div className="row ask-form__top">
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
        {form.aiDraft && <Badge tone="accent">AI draft</Badge>}
        {slide !== null && <Badge>Slide {slide + 1}</Badge>}
      </div>
      <p className="muted ask-form__rule">
        {quiz ? "Students can't change their answer." : "No right answer. Students can change their pick until you end it."}
      </p>
      <Field label="Question">
        {(f) => <input {...f} value={form.question} onChange={(e) => onChange({ ...form, question: e.target.value })} />}
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
      </div>
      <div className="row">
        <Button type="submit" busy={opening}>
          {quiz ? "Open question" : "Start the vote"}
        </Button>
        {quiz && form.correct !== null && (
          <Button variant="quiet" onClick={() => onChange({ ...form, correct: null })}>
            No right answer
          </Button>
        )}
        <Button variant="quiet" onClick={onCancel}>
          Cancel
        </Button>
      </div>
      {pollOpen && <p className="muted ask-form__rule">Opening this ends the question that's open now.</p>}
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
      <b className="ask-choices__letter">{letter}</b>
      <input value={text} onChange={(e) => onText(e.target.value)} placeholder={needed ? "Choice (needed)" : "Choice (optional)"} aria-label={`Choice ${letter}`} />
      {quiz && (
        <label className="ask-choices__right">
          <input type="radio" name={radio} checked={right} onChange={onRight} aria-label={`${letter} is the right answer`} />
        </label>
      )}
    </>
  );
}
