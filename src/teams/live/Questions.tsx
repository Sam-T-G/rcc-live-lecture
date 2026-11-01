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

// The box around the sign-in for a signed-out student. "Sign in to tap I'm lost" under the slide
// (Page.tsx) scrolls it to the top of the screen.
export const SIGN_IN_ID = "live-signin";

// `index` is the slide on the student's screen, null before the deck sends a slide, or undefined
// while the page is still loading the deck (the card then says "Loading questions…", no form).
export default function Questions({ index }: { index: number | null | undefined }) {
  const { user } = useGoogleUser();
  const [scope, setScope] = useState<Scope>("slide");
  const [text, setText] = useState("");
  // The slide on screen when the student typed the first character. A phone that follows live
  // moves on while the student types, so the post goes on the slide they started on, and the form
  // says which. Sending the post or emptying the box lets go of it.
  const [draftAt, setDraftAt] = useState<number | null>(null);
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

  // The slide this post goes on.
  const target = draftAt ?? index;

  function onType(value: string) {
    setText(value);
    setDraftAt(value === "" ? null : (draftAt ?? (typeof index === "number" ? index : null)));
  }

  async function send(e: FormEvent) {
    e.preventDefault();
    if (target === null || target === undefined || sending) return;
    setSending(true);
    setError("");
    try {
      await ask({ channel: CHANNEL, index: target, text, anonymous, private: onlyProfessor });
      setText("");
      setDraftAt(null);
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
        <div id={SIGN_IN_ID}>
          <p className="muted">Sign in to post and upvote.</p>
          <StudentSignIn />
        </div>
      ) : loading ? null : index === null ? (
        <p className="muted">You can ask once the slides start.</p>
      ) : (
        <form className="live-ask" onSubmit={send}>
          <textarea
            value={text}
            maxLength={MAX_LENGTH}
            placeholder="Ask a question or leave a comment"
            aria-label="Your question or comment"
            onChange={(e) => onType(e.target.value)}
          />
          {typeof target === "number" && <p className="muted">Your post goes on slide {target + 1}.</p>}
          <label>
            <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} />
            Post anonymously
          </label>
          <label>
            <input type="checkbox" checked={onlyProfessor} onChange={(e) => setOnlyProfessor(e.target.checked)} />
            Only the professor sees it
          </label>
          {/* Sam's decision D12 (f): "Group by topic with AI" on #/host sends private texts to Gemini too, never names. */}
          {onlyProfessor && (
            <p className="muted">If the professor groups questions by topic with AI, your question’s text goes to Google’s Gemini without your name.</p>
          )}
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
