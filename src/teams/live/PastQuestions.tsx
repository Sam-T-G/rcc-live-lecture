// Past quizzes: every quiz and vote question the professor has ended, newest first, with the
// right answer and what you picked, so a student can look back from their own phone. A quiz the
// professor asked with no right answer says which choice you picked, never right or wrong.
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { CHANNEL } from "../../blocks/deck";
import { Card, Status } from "../../blocks/ui";

const LETTERS = ["A", "B", "C", "D"];

// The line under each question. Right or wrong only on a quiz that has a right answer.
function verdict(r: { kind: "quiz" | "vote"; correct: number | null; mine: number | null }) {
  if (r.kind === "vote") return "Vote";
  if (r.mine === null) return "No answer";
  if (r.correct === null) return `You picked ${LETTERS[r.mine]}`;
  return r.mine === r.correct ? "You got it right" : "You got it wrong";
}

export default function PastQuestions() {
  const rows = useQuery(api.live.past.past, { channel: CHANNEL });
  return (
    <Card title="Past quizzes">
      {rows === undefined ? (
        <Status kind="loading">Loading past questions…</Status>
      ) : rows.length === 0 ? (
        <Status kind="empty">No questions have ended yet.</Status>
      ) : (
        <ul className="past">
          {rows.map((r, n) => (
            <li key={r.id}>
              <details>
                <summary>
                  <span className="past__q">{r.question}</span>
                  <span className="past__verdict muted">Question {rows.length - n} · {verdict(r)}</span>
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
      )}
    </Card>
  );
}
