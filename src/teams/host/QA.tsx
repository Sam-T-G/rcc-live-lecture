// #/host Questions: every question students posted on #/live in this class, private ones too,
// newest first, with each one's slide, upvotes and name ("Anonymous" when they hid it). The
// professor keeps or dismisses a question (that only sorts this list), types an answer and shares
// it under the question on every phone, or deletes the question from every phone. A private
// question's answer can't be shared (Sam's decision D12 e), so its row has no share button.
// "Group by topic with AI" sends Gemini the texts of questions that aren't dismissed, private ones
// too (D12 f), never names, and sorts the list into topics. The server's rules are in
// convex/live/questions.ts.
//   Laid out on the kit's desk: "Questions from students" is the tab's focal card, its rows
// ruled straight on the card with their actions on every row; "Shared with students" is the
// aside, flat on the page, where each shared answer shows in full.
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../../convex/_generated/api";
import { CHANNEL } from "../../blocks/deck";
import { Badge, Button, EmptyState, Field, StateChip } from "../../blocks/kit";
import { Status } from "../../blocks/ui";
import { errorText } from "./Team";
import "./qa.css";

type Item = FunctionReturnType<typeof api.live.questions.forHost>[number];

const ANSWER_MAX = 1000;
const upvotes = (n: number) => `${n} ${n === 1 ? "upvote" : "upvotes"}`;

// What Save does for this question's answer. Saving never changes sharing (answer() in
// convex/live/questions.ts), so an answer that's already shared reaches its readers as soon as
// it's saved. A private question's answer can't be shared, so only the professor sees it.
function answerHint(q: Item) {
  if (q.private) return "Only you see this answer. A private question’s answer can’t be shared.";
  if (q.shared) return "Students see your changes as soon as you save.";
  return "Students see it only after you share it.";
}

// One question with its buttons. `open` starts with the answer editor open, the way
// QA.hint.test.ts checks the hint; the page always starts with it closed.
export function Question({ q, open = false }: { q: Item; open?: boolean }) {
  const setStatus = useMutation(api.live.questions.setStatus);
  const saveAnswer = useMutation(api.live.questions.answer);
  const share = useMutation(api.live.questions.share);
  const remove = useMutation(api.live.questions.remove);
  const [typing, setTyping] = useState(open);
  const [text, setText] = useState(open ? (q.answer ?? "") : "");
  const [busy, setBusy] = useState(""); // the button whose request is running
  const [error, setError] = useState("");

  // Runs one request; its error shows under this question. True when it worked.
  async function run(button: string, job: () => Promise<unknown>) {
    setBusy(button);
    setError("");
    try {
      await job();
      return true;
    } catch (e) {
      setError(errorText(e));
      return false;
    } finally {
      setBusy("");
    }
  }

  function edit() {
    setText(q.answer ?? "");
    setTyping(true);
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    if (await run("save", () => saveAnswer({ question: q._id, text }))) setTyping(false);
  }
  const mark = (button: string, status: Item["status"]) => void run(button, () => setStatus({ question: q._id, status }));
  const dismissed = q.status === "dismissed";
  // A private row an older build marked shared counts as not shared: list() never shows its answer.
  const shared = q.shared && !q.private;

  return (
    <li className={dismissed ? "qa-q qa-q--dismissed" : "qa-q"}>
      <p className="qa-q__text">{q.text}</p>
      <div className="qa-q__meta">
        <p className="facts-list qa-q__facts">
          <span>{upvotes(q.votes)}</span>
          <span>Slide {q.index + 1}</span>
          <span>{q.name ?? "Anonymous"}</span>
        </p>
        {q.private && <Badge tone="warn">Private</Badge>}
        {q.status === "keep" && <StateChip tone="neutral" glyph="check">Kept</StateChip>}
        {dismissed && <StateChip tone="wait">Dismissed</StateChip>}
        {shared && (
          <StateChip tone="in" glyph="eye">
            Shared with students
          </StateChip>
        )}
      </div>
      {q.answer !== null && !typing && (
        <p className={shared ? "answer qa-q__answer qa-q__answer--shared" : "answer qa-q__answer"}>
          <strong>Your answer:</strong> {q.answer}
        </p>
      )}
      {typing && (
        <form className="qa-q__editor" onSubmit={save}>
          <Field label="Your answer" hint={answerHint(q)}>
            {(f) => <textarea {...f} className="textarea" rows={3} maxLength={ANSWER_MAX} value={text} onChange={(e) => setText(e.target.value)} />}
          </Field>
          <div className="qa-q__editor-acts">
            <Button type="submit" small busy={busy === "save"}>
              Save answer
            </Button>
            <Button variant="plain" small disabled={busy === "save"} onClick={() => setTyping(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}
      <div className="qa-q__actions">
        {dismissed ? (
          <Button variant="ghost" size="sm" busy={busy === "back"} onClick={() => mark("back", "new")}>
            Bring back
          </Button>
        ) : (
          <>
            {q.status !== "keep" && (
              <Button variant="ghost" size="sm" busy={busy === "keep"} onClick={() => mark("keep", "keep")}>
                Keep
              </Button>
            )}
            {!typing && (
              <Button variant="ghost" size="sm" onClick={edit}>
                {q.answer === null ? "Type answer" : "Edit answer"}
              </Button>
            )}
            {q.answer !== null && !q.private && (
              <Button variant="ghost" size="sm" busy={busy === "share"} onClick={() => void run("share", () => share({ question: q._id, shared: !shared }))}>
                {shared ? "Stop sharing" : "Share the answer"}
              </Button>
            )}
            <Button variant="ghost" size="sm" busy={busy === "dismiss"} onClick={() => mark("dismiss", "dismissed")}>
              Dismiss
            </Button>
          </>
        )}
        <DeleteQuestion busy={busy === "delete"} onDelete={() => run("delete", () => remove({ question: q._id }))} />
      </div>
      {error && <Status kind="error">{error}</Status>}
    </li>
  );
}

// Delete asks first, in place, because it takes the question off every phone and can't be
// undone: the kit's confirm box rises where the buttons were, its question after the warning
// glyph, Delete the one red fill. Cancel or Escape goes back. When the delete fails, the question
// stays open with the error under it, so the professor can try again.
function DeleteQuestion({ busy, onDelete }: { busy: boolean; onDelete: () => Promise<boolean> }) {
  const [asking, setAsking] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const pressed = useRef(false); // focus moves only after a press, never on the first render

  useEffect(() => {
    if (pressed.current) (asking ? cancel : opener).current?.focus();
  }, [asking]);

  function show(next: boolean) {
    pressed.current = true;
    setAsking(next);
  }

  if (!asking)
    return (
      <Button ref={opener} variant="ghost" size="sm" className="btn--danger-quiet qa-q__delete" onClick={() => show(true)}>
        Delete
      </Button>
    );
  return (
    <div
      className="confirm qa-q__confirm"
      role="group"
      aria-label="Delete this question"
      onKeyDown={(e) => {
        if (e.key === "Escape" && !busy) show(false);
      }}
    >
      <p className="confirm__question">Delete this question from every phone?</p>
      <div className="confirm__actions">
        <Button variant="danger" small busy={busy} onClick={() => void onDelete()}>
          Delete
        </Button>
        <Button ref={cancel} variant="secondary" small disabled={busy} onClick={() => show(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

// Topics, biggest first, each with its groups of questions that ask the same thing, biggest
// first. Questions posted since the last grouping come first, under "No topic yet". Private
// questions sit in their topics with the rest (organize sends them too, Sam's decision D12 f).
// Dismissed ones come last. `key` is for React only.
type Group = { key: string; label: string; list: Item[] };
type Topic = { key: string; topic: string; count: number; groups: Group[] };
const NO_TOPIC = "No topic yet";

export function grouped(items: Item[]): Topic[] {
  const topics = new Map<string, Map<string, Item[]>>();
  for (const q of items) {
    if (q.status === "dismissed") continue;
    const topic = q.topic ?? NO_TOPIC;
    const groups = topics.get(topic) ?? new Map<string, Item[]>();
    const label = q.cluster ?? q.text;
    groups.set(label, [...(groups.get(label) ?? []), q]);
    topics.set(topic, groups);
  }
  const size = (g: Map<string, Item[]>) => [...g.values()].reduce((n, l) => n + l.length, 0);
  const rank = (topic: string, g: Map<string, Item[]>) => (topic === NO_TOPIC ? Infinity : size(g));
  const out: Topic[] = [...topics.entries()]
    .sort((a, b) => rank(b[0], b[1]) - rank(a[0], a[1]))
    .map(([topic, groups]) => ({
      key: `topic:${topic}`,
      topic,
      count: size(groups),
      groups: [...groups.entries()].sort((a, b) => b[1].length - a[1].length).map(([label, list]) => ({ key: label, label, list })),
    }));
  const dismissed = items.filter((q) => q.status === "dismissed");
  if (dismissed.length)
    out.push({ key: "dismissed", topic: "Dismissed", count: dismissed.length, groups: dismissed.map((q) => ({ key: q._id, label: q.text, list: [q] })) });
  return out;
}

export default function QA() {
  const items = useQuery(api.live.questions.forHost, { channel: CHANNEL });
  const organize = useAction(api.live.questions.organize);
  const [sorted, setSorted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function toggle(on: boolean) {
    setSorted(on);
    setError("");
    if (!on) return;
    setBusy(true);
    try {
      await organize({ channel: CHANNEL });
    } catch (e) {
      setError(errorText(e));
      setSorted(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="desk host-desk">
      <section className="hcard qa">
        <div className="hline host-head">
          <h2 className="hline__t">Questions from students</h2>
          <div className="hline__end qa__group">
            {busy && <span className="muted">Grouping…</span>}
            <label className="host-switch">
              <input type="checkbox" checked={sorted} disabled={busy} onChange={(e) => void toggle(e.target.checked)} />
              <span className="host-switch__track" />
              Group by topic with AI
            </label>
          </div>
        </div>
        {error && <Status kind="error">{error}</Status>}
        {items === undefined ? (
          <Status kind="loading">Loading questions…</Status>
        ) : items.length === 0 ? (
          <EmptyState title="No questions yet.">Students ask from the Live slides page on their phones.</EmptyState>
        ) : !sorted ? (
          <ul className="qa-list">
            {items.map((q) => (
              <Question key={q._id} q={q} />
            ))}
          </ul>
        ) : (
          grouped(items).map((t) => (
            <section key={t.key} className="qa-topic">
              <h3>
                {t.topic}
                <span className="headn">{t.count}</span>
              </h3>
              {t.groups.map((g) => (
                <div key={g.key} className="qa-cluster">
                  {g.list.length > 1 && <p className="qa-cluster__label">{`${g.label} · asked ${g.list.length} times`}</p>}
                  <ul className="qa-list">
                    {g.list.map((q) => (
                      <Question key={q._id} q={q} />
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          ))
        )}
      </section>
      <section className="host-side host-sec qa-shared">
        <h2>Shared with students</h2>
        <Shared items={items} />
      </section>
    </div>
  );
}

// The answers students can see now, under their questions. A private question's answer is never
// shared, so a private row an older build marked shared is left out.
function Shared({ items }: { items: Item[] | undefined }) {
  if (items === undefined) return <Status kind="loading">Loading…</Status>;
  const shared = items.filter((q) => q.shared && !q.private);
  if (shared.length === 0) return <Status kind="empty">No answers shared yet.</Status>;
  return (
    <ul className="qa-shared__list">
      {shared.map((q) => (
        <li key={q._id}>
          <p className="qa-shared__q">{q.text}</p>
          <p className="qa-shared__a">{q.answer}</p>
        </li>
      ))}
    </ul>
  );
}
