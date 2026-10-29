// Ask the room: the AI drafts a question from the slide, the professor edits it and opens it,
// and the bars fill in as students answer.
import { useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Card, Status } from "../../blocks/ui";
import { CHANNEL } from "../../blocks/deck";
import { useProfKey } from "../checkin/prof";
import { errorText } from "./Team";

type Draft = { text: string; choices: string[]; correct: number };

export default function AskRoom({ slideIndex }: { slideIndex: number | null }) {
  const key = useProfKey();
  const question = useQuery(api.host.questions.forHost, { key, channel: CHANNEL });
  const draftQuestion = useAction(api.host.ai.draftQuestion);
  const open = useMutation(api.host.questions.open);
  const close = useMutation(api.host.questions.close);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function run(job: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await job();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  const makeDraft = () => run(async () => setDraft(await draftQuestion({ key, channel: CHANNEL })));
  const blank = () => setDraft({ text: "", choices: ["", "", "", ""], correct: 0 });
  const openIt = () =>
    run(async () => {
      if (!draft || slideIndex === null) return;
      await open({ key, channel: CHANNEL, index: slideIndex, ...draft });
      setDraft(null);
    });

  return (
    <Card title="Ask the room">
      {draft ? (
        <div className="host-draft">
          <label>
            Question
            <input value={draft.text} onChange={(e) => setDraft({ ...draft, text: e.target.value })} />
          </label>
          {draft.choices.map((c, i) => (
            <div key={i} className="host-draft__choice">
              <input type="radio" name="right" checked={draft.correct === i} onChange={() => setDraft({ ...draft, correct: i })} aria-label={`Choice ${i + 1} is right`} />
              <input value={c} onChange={(e) => setDraft({ ...draft, choices: draft.choices.map((x, j) => (j === i ? e.target.value : x)) })} aria-label={`Choice ${i + 1}`} />
            </div>
          ))}
          <p className="muted">The dot marks the right answer.</p>
          <div className="row">
            <button className="host-main" onClick={openIt} disabled={busy || slideIndex === null}>Open question</button>
            <button className="host-quiet" onClick={() => setDraft(null)} disabled={busy}>Cancel</button>
          </div>
        </div>
      ) : (
        <div className="row">
          <button className="host-main" onClick={makeDraft} disabled={busy || slideIndex === null}>{busy ? "Writing..." : "Draft with AI"}</button>
          <button onClick={blank} disabled={busy}>Write my own</button>
        </div>
      )}
      {error && <Status kind="error">{error}</Status>}

      {question === undefined && <Status kind="loading">Loading...</Status>}
      {question && (
        <>
          <h3>{question.text}</h3>
          <p className="muted">
            Slide {question.index + 1} · {question.status === "open" ? "Open" : "Closed"} · {question.answered} answered · {question.rightCount} right
          </p>
          {question.choices.map((c, i) => (
            <div key={i} className={"host-bar" + (i === question.correct ? " host-bar--right" : "")}>
              <strong>{String.fromCharCode(65 + i)}</strong>
              <div className="host-bar__track" title={c}>
                <div className="host-bar__fill" style={{ width: `${question.answered ? (question.picks[i] / question.answered) * 100 : 0}%` }} />
              </div>
              <span className="host-bar__n">{question.picks[i]}</span>
            </div>
          ))}
          <ol type="A" className="host-choices">{question.choices.map((c, i) => <li key={i}>{c}{i === question.correct ? " (right)" : ""}</li>)}</ol>
          {question.status === "open" && <button className="host-small" onClick={() => run(() => close({ key, questionId: question._id }).then(() => undefined))} disabled={busy}>Close question</button>}
        </>
      )}
      {question === null && !draft && <Status kind="empty">No question yet.</Status>}
    </Card>
  );
}
