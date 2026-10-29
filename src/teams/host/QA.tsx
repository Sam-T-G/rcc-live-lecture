// Student questions, organized for the professor. The professor decides what to keep, answers
// by typing, and approves what the room sees. The AI only sorts; it shares nothing.
import { useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Card, Status } from "../../blocks/ui";
import { CHANNEL } from "../../blocks/deck";
import { useProfKey } from "../checkin/prof";
import { errorText } from "./Team";

type Item = NonNullable<ReturnType<typeof useQuery<typeof api.host.qa.list>>>[number];

function Question({ q }: { q: Item }) {
  const key = useProfKey();
  const setStatus = useMutation(api.host.qa.setStatus);
  const answer = useMutation(api.host.qa.answer);
  const share = useMutation(api.host.qa.share);
  const [typing, setTyping] = useState(false);
  const [text, setText] = useState(q.answer ?? "");
  const [error, setError] = useState("");
  const id: Id<"studentQuestions"> = q._id;
  const run = (job: Promise<unknown>) => job.then(() => setError(""), (e) => setError(errorText(e)));

  return (
    <div className={"host-q" + (q.status === "dismissed" ? " host-q--dim" : "")}>
      <strong>{q.text}</strong>
      <div className="host-q__meta">
        <span className="host-pill">{q.visibility === "private" ? "Private" : "Public"}</span>
        <span className="host-pill">Slide {q.index + 1}</span>
        <span className="muted">{q.name}</span>
        {q.status === "keep" && <span className="host-pill">Kept</span>}
        {q.shared && <span className="host-pill">Shared with students</span>}
      </div>
      {q.answer && !typing && <p className="muted">Answer: {q.answer}</p>}
      {typing && (
        <div>
          <textarea className="host-answer" rows={3} value={text} onChange={(e) => setText(e.target.value)} aria-label="Your answer" />
          <div className="row">
            <button className="host-small host-main" onClick={() => void run(answer({ key, id, text }).then(() => setTyping(false)))}>Save answer</button>
            <button className="host-small host-quiet" onClick={() => setTyping(false)}>Cancel</button>
          </div>
        </div>
      )}
      <div className="host-q__actions">
        {q.status === "dismissed" ? (
          <button className="host-small host-quiet" onClick={() => void run(setStatus({ key, id, status: "new" }))}>Bring back</button>
        ) : (
          <>
            {q.status !== "keep" && <button className="host-small host-quiet" onClick={() => void run(setStatus({ key, id, status: "keep" }))}>Keep</button>}
            <button className="host-small host-quiet" onClick={() => setTyping(true)}>{q.answer ? "Edit answer" : "Type answer"}</button>
            <button className="host-small host-quiet" disabled title="Voice answers are coming" onClick={() => undefined}>Record answer</button>
            {q.visibility === "public" && (
              <button className="host-small host-quiet" onClick={() => void run(share({ key, id, shared: !q.shared }))}>{q.shared ? "Stop sharing" : "Share with students"}</button>
            )}
            <button className="host-small host-quiet" onClick={() => void run(setStatus({ key, id, status: "dismissed" }))}>Dismiss</button>
          </>
        )}
      </div>
      {error && <Status kind="error">{error}</Status>}
    </div>
  );
}

// Topic, then groups of the same question, biggest first.
function grouped(items: Item[]) {
  const topics = new Map<string, Map<string, Item[]>>();
  for (const q of items) {
    const topic = q.topic ?? "Not sorted yet";
    const clusters = topics.get(topic) ?? new Map<string, Item[]>();
    const key = q.cluster ?? q.text;
    clusters.set(key, [...(clusters.get(key) ?? []), q]);
    topics.set(topic, clusters);
  }
  const size = (c: Map<string, Item[]>) => [...c.values()].reduce((n, l) => n + l.length, 0);
  return [...topics.entries()]
    .sort((a, b) => size(b[1]) - size(a[1]))
    .map(([topic, clusters]) => ({ topic, count: size(clusters), clusters: [...clusters.entries()].sort((a, b) => b[1].length - a[1].length) }));
}

export default function QA() {
  const key = useProfKey();
  const items = useQuery(api.host.qa.list, { key, channel: CHANNEL });
  const organize = useAction(api.host.ai.organize);
  const [sorted, setSorted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function toggle(on: boolean) {
    setSorted(on);
    if (!on) return;
    setBusy(true);
    setError("");
    try {
      await organize({ key, channel: CHANNEL });
    } catch (e) {
      setError(errorText(e));
      setSorted(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="host-grid">
      <Card title="Questions from students">
        <div className="row">
          <label className="host-switch">
            <input type="checkbox" checked={sorted} disabled={busy} onChange={(e) => void toggle(e.target.checked)} />
            <span className="host-switch__track" />
            Group by topic with AI
          </label>
          {busy && <span className="muted">Sorting...</span>}
        </div>
        {error && <Status kind="error">{error}</Status>}
        {items === undefined && <Status kind="loading">Loading...</Status>}
        {items?.length === 0 && <Status kind="empty">No questions yet.</Status>}
        {items && !sorted && items.map((q) => <Question key={q._id} q={q} />)}
        {items && sorted &&
          grouped(items).map((t) => (
            <div key={t.topic} className="host-topic">
              <h3>{t.topic} <span className="host-pill">{t.count}</span></h3>
              {t.clusters.map(([label, list]) => (
                <div key={label} className="host-cluster">
                  <p className="host-cluster__label">{list.length > 1 ? `${label} · asked ${list.length} times` : label}</p>
                  {list.map((q) => <Question key={q._id} q={q} />)}
                </div>
              ))}
            </div>
          ))}
      </Card>
      <div>
        <Card title="Shared with students">
          <Shared />
        </Card>
        <Card title="Voice answers and textbook">
          <p className="muted host-soon">Voice answers, recordings, and textbook matches come later. The AI will never share anything you haven't approved.</p>
        </Card>
      </div>
    </div>
  );
}

function Shared() {
  const key = useProfKey();
  const items = useQuery(api.host.qa.list, { key, channel: CHANNEL });
  const shared = items?.filter((q) => q.shared) ?? [];
  if (items === undefined) return <Status kind="loading">Loading...</Status>;
  if (shared.length === 0) return <Status kind="empty">Nothing shared yet.</Status>;
  return (
    <ul>
      {shared.map((q) => <li key={q._id}>{q.text}{q.answer ? ` - ${q.answer}` : ""}</li>)}
    </ul>
  );
}
