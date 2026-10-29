// Questions and comments beside the slide: post by name or anonymously, upvote what you agree with.
import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { SignInButton, useGoogleUser } from "../../blocks/auth";
import { CHANNEL } from "../../blocks/deck";
import { Card, Status } from "../../blocks/ui";

const MAX_LENGTH = 280;

function errorText(e: unknown) {
  return e instanceof ConvexError && typeof e.data === "string" ? e.data : "Something went wrong. Try again.";
}

export default function Questions({ index }: { index: number | null }) {
  const { user } = useGoogleUser();
  const [scope, setScope] = useState<"slide" | "all">("slide");
  const [text, setText] = useState("");
  const [anonymous, setAnonymous] = useState(true);
  const [error, setError] = useState("");
  const ask = useMutation(api.live.questions.ask);
  const vote = useMutation(api.live.questions.vote);
  const remove = useMutation(api.live.questions.remove);
  const onSlide = scope === "slide" && index !== null;
  const rows = useQuery(api.live.questions.list, { channel: CHANNEL, index: onSlide ? index : undefined });

  async function run(p: Promise<unknown>) {
    setError("");
    try {
      await p;
    } catch (e) {
      setError(errorText(e));
    }
  }

  function send(e: React.FormEvent) {
    e.preventDefault();
    if (index === null) return;
    void run(ask({ channel: CHANNEL, index, text, anonymous }).then(() => setText("")));
  }

  return (
    <Card title="Questions">
      <div className="qa__tabs">
        <button type="button" aria-pressed={scope === "slide"} onClick={() => setScope("slide")}>This slide</button>
        <button type="button" aria-pressed={scope === "all"} onClick={() => setScope("all")}>All slides</button>
      </div>

      {user ? (
        <form className="qa__form" onSubmit={send}>
          <textarea
            value={text}
            maxLength={MAX_LENGTH}
            placeholder="Ask a question or leave a comment"
            aria-label="Your question or comment"
            onChange={(e) => setText(e.target.value)}
          />
          <div className="qa__row">
            <label>
              <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} />
              Post anonymously
            </label>
            <span className="muted">{text.length}/{MAX_LENGTH}</span>
            <button type="submit" disabled={!text.trim() || index === null}>Post</button>
          </div>
        </form>
      ) : (
        <>
          <p className="muted">Sign in to post and upvote.</p>
          <SignInButton />
        </>
      )}
      {error && <Status kind="error">{error}</Status>}

      {rows === undefined ? (
        <Status kind="loading">Loading questions…</Status>
      ) : rows.length === 0 ? (
        <Status kind="empty">No questions yet. Be the first.</Status>
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
                onClick={() => void run(vote({ question: r._id as Id<"questions"> }))}
              >
                <span aria-hidden>▲</span>
                <span>{r.votes}</span>
              </button>
              <div>
                <p className="q__text">{r.text}</p>
                <p className="q__meta">
                  {r.name ?? "Anonymous"}
                  {scope === "all" && ` · slide ${r.index + 1}`}
                  {" · "}
                  {new Date(r.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                  {r.mine && <button type="button" onClick={() => void run(remove({ question: r._id }))}>Delete</button>}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
