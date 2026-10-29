// Every quiz and vote question the professor has ended, newest first, with the right answer and
// what you picked, so a student can look back from their own phone.
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { CHANNEL } from "../../blocks/deck";
import { Card, Status } from "../../blocks/ui";

const LETTERS = ["A", "B", "C", "D"];

export default function PastQuestions() {
  const rows = useQuery(api.live.past.past, { channel: CHANNEL });
  return (
    <Card title="Past questions">
      {rows === undefined ? (
        <Status kind="loading">Loading past questions…</Status>
      ) : rows.length === 0 ? (
        <Status kind="empty">No questions have ended yet.</Status>
      ) : (
        <ul className="past">
          {rows.map((r, n) => {
            const verdict =
              r.kind === "vote" ? "Vote" : r.mine === null ? "No answer" : r.mine === r.correct ? "You got it right" : "You got it wrong";
            return (
              <li key={r.id}>
                <details>
                  <summary>
                    <span className="past__q">{r.question}</span>
                    <span className="past__verdict muted">Question {rows.length - n} · {verdict}</span>
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
            );
          })}
        </ul>
      )}
    </Card>
  );
}
