// Past quizzes and votes: every quiz and vote the professor has ended, newest first, with the
// right answer and what you picked, so a student can look back from their own phone. Each row is
// "Quiz 3" or "Vote 2", counted apart, and never "question": that word is for students' posts on
// the Questions card. A vote, or a quiz with no right answer, says which choice you picked, never
// right or wrong. Signed out, live.past sends no picks (mine is null on every row), so the card
// says "Sign in to see your answers." and leaves off each row's verdict and "(your pick)" instead
// of saying "No answer" for a quiz the student answered before their sign-in ended.
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useGoogleUser } from "../../blocks/auth";
import { CHANNEL } from "../../blocks/deck";
import { Card, Status } from "../../blocks/ui";

const LETTERS = ["A", "B", "C", "D"];

// The line under each quiz or vote. Right or wrong only on a quiz that has a right answer.
function verdict(r: { kind: "quiz" | "vote"; correct: number | null; mine: number | null }) {
  if (r.mine === null) return "No answer";
  if (r.kind === "vote" || r.correct === null) return `You picked ${LETTERS[r.mine]}`;
  return r.mine === r.correct ? "You got it right" : "You got it wrong";
}

// "Quiz 3" or "Vote 2": rows come newest first, so a row's number is how many of its kind are
// at or below it.
function label(rows: { kind: "quiz" | "vote" }[], n: number) {
  const kind = rows[n].kind;
  const count = rows.slice(n).filter((r) => r.kind === kind).length;
  return `${kind === "vote" ? "Vote" : "Quiz"} ${count}`;
}

export default function PastQuestions() {
  const { user } = useGoogleUser();
  const rows = useQuery(api.live.past.past, { channel: CHANNEL });
  return (
    <Card title="Past quizzes and votes">
      {rows === undefined ? (
        <Status kind="loading">Loading past quizzes and votes…</Status>
      ) : rows.length === 0 ? (
        <Status kind="empty">No quiz or vote has ended yet.</Status>
      ) : (
        <>
          {!user && <p className="muted">Sign in to see your answers.</p>}
          <ul className="past">
            {rows.map((r, n) => (
              <li key={r.id}>
                <details>
                  <summary>
                    <span className="past__q">{r.question}</span>
                    <span className="past__verdict muted">{label(rows, n)}{user && ` · ${verdict(r)}`}</span>
                  </summary>
                  <ul className="past__choices">
                    {r.choices.map((c, i) => (
                      <li key={i} className={r.correct === i ? "past__choice past__choice--right" : "past__choice"}>
                        <b>{LETTERS[i]}</b> {c}
                        {r.correct === i && " ✓ right answer"}
                        {r.mine === i && " (your pick)"}
                        <span className="muted"> · {r.counts[i]}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}
