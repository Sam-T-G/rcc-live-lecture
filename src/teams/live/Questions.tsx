// Questions and comments beside the slide on #/live: post by name or anonymously, keep a question
// between you and the professor, upvote what you agree with, and read the professor's answer once
// they share it. Posting and upvoting need a check-in in this class; reading doesn't. The server's
// rules are in convex/live/questions.ts.
import { useState, type FormEvent } from "react";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { StudentSignIn, useGoogleUser } from "../../blocks/auth";
import { CHANNEL } from "../../blocks/deck";
import { Badge, Button, Segmented, type Choice } from "../../blocks/kit";
import { Card, Status } from "../../blocks/ui";
import "./questions.css";

const MAX_LENGTH = 280;

type Scope = "slide" | "all";
const SCOPES: Choice<Scope>[] = [
  { value: "slide", label: "This slide" },
  { value: "all", label: "All slides" },
];

function errorText(e: unknown) {
  return e instanceof ConvexError && typeof e.data === "string" ? e.data : "Something went wrong. Try again.";
}

const clock = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

// `index` is the slide on the student's screen, null before the deck sends a slide, or undefined
// while the page is still loading the deck (the card then says "Loading questions…", no form).
export default function Questions({ index }: { index: number | null | undefined }) {
  const { user } = useGoogleUser();
  const [scope, setScope] = useState<Scope>("slide");
  const [text, setText] = useState("");
  const [anonymous, setAnonymous] = useState(true);
  const [onlyProfessor, setOnlyProfessor] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  // An upvote or delete that failed shows under its own question, where the student tapped.
  const [rowError, setRowError] = useState<{ id: Id<"questions">; text: string } | null>(null);
  const ask = useMutation(api.live.questions.ask);
  const vote = useMutation(api.live.questions.vote);
  const remove = useMutation(api.live.questions.remove);
  // Before the deck sends a slide there's no "this slide", so that tab lists nothing. While the
  // deck is loading, that tab waits for it; "All slides" doesn't need it.
  const loading = index === undefined;
  const noSlide = scope === "slide" && index === null;
  const fetched = useQuery(
    api.live.questions.list,
    scope === "all" ? { channel: CHANNEL } : typeof index === "number" ? { channel: CHANNEL, index } : "skip",
  );
  const rows = noSlide ? [] : fetched;

  async function send(e: FormEvent) {
    e.preventDefault();
    if (index === null || index === undefined || sending) return;
    setSending(true);
    setError("");
    try {
      await ask({ channel: CHANNEL, index, text, anonymous, private: onlyProfessor });
      setText("");
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSending(false);
    }
  }

  async function onRow(id: Id<"questions">, job: Promise<unknown>) {
    setRowError(null);
    try {
      await job;
    } catch (err) {
      setRowError({ id, text: errorText(err) });
    }
  }

  return (
    <Card title="Questions">
      <Segmented label="Show questions from" hideLabel block options={SCOPES} value={scope} onChange={setScope} />

      {!user ? (
        <>
          <p className="muted">Sign in to post and upvote.</p>
          <StudentSignIn />
        </>
      ) : loading ? null : index === null ? (
        <p className="muted">You can ask once the slides start.</p>
      ) : (
        <form className="live-ask" onSubmit={send}>
          <textarea
            value={text}
            maxLength={MAX_LENGTH}
            placeholder="Ask a question or leave a comment"
            aria-label="Your question or comment"
            onChange={(e) => setText(e.target.value)}
          />
          <label>
            <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} />
            Post anonymously
          </label>
          <label>
            <input type="checkbox" checked={onlyProfessor} onChange={(e) => setOnlyProfessor(e.target.checked)} />
            Only the professor can see it
          </label>
          <div className="live-ask__foot">
            <span className="live-ask__count">
              {text.length}/{MAX_LENGTH}
            </span>
            <Button type="submit" busy={sending} disabled={!text.trim()}>
              Post
            </Button>
          </div>
          {error && <Status kind="error">{error}</Status>}
        </form>
      )}

      {rows === undefined ? (
        <Status kind="loading">Loading questions…</Status>
      ) : rows.length === 0 ? (
        <Status kind="empty">No questions yet.</Status>
      ) : (
        <ul className="qa__list">
          {rows.map((r) => (
            <li key={r._id} className="q">
              <button
                type="button"
                className="q__vote"
                aria-pressed={r.voted}
                aria-label={`Upvote, ${r.votes} so far`}
                disabled={!user || r.mine}
                onClick={() => void onRow(r._id, vote({ question: r._id }))}
              >
                <span aria-hidden>▲</span>
                <span>{r.votes}</span>
              </button>
              <div className="q__body">
                <p className="q__text">{r.text}</p>
                <p className="q__meta">
                  {r.private && <Badge>Private</Badge>}
                  {r.name ?? "Anonymous"}
                  {scope === "all" && ` · slide ${r.index + 1}`}
                  {` · ${clock(r.at)}`}
                </p>
                {r.answer !== null && (
                  <p className="q__answer">
                    <strong>Professor's answer:</strong> {r.answer}
                  </p>
                )}
                {r.mine && (
                  <Button variant="quiet" className="btn--flush" onClick={() => void onRow(r._id, remove({ question: r._id }))}>
                    Delete
                  </Button>
                )}
                {rowError?.id === r._id && <Status kind="error">{rowError.text}</Status>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
