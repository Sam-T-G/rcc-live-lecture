// The Now tab's "Who got it wrong" section, on Check-in's polls (checkin.quiz.missing): the newest
// quiz with a right answer in this class, and each student who picked a wrong choice, with their
// team and their pick. "Ask the AI" gets 2 or 3 sentences on which wrong choice most people picked
// and what to explain again (checkin.quiz.feedback); no names go to the AI. It shows only once
// someone got it wrong: with no wrong choice picked, the AI would name one nobody picked.
//   It is the tab's aside: flat on the page beside the Ask the room card, the table in its sunken
// well. Before there is anyone to list, the well holds the table's head over one line that says
// why, so the slot reads as the table it becomes and ends at its content.
import { useState, type ReactNode } from "react";
import { useAction, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Status } from "../../blocks/ui";
import { Button } from "../../blocks/kit";
import { CHANNEL } from "../../blocks/deck";
import { TeamChip, errorText } from "./Team";
import "./ask.css";

export function Missing() {
  const data = useQuery(api.checkin.quiz.missing, { channel: CHANNEL });
  const current = useQuery(api.checkin.quiz.current, { channel: CHANNEL });
  const feedback = useAction(api.checkin.quiz.feedback);
  const [asking, setAsking] = useState(false);
  const [ai, setAi] = useState<{ key: string; text: string; failed: boolean } | null>(null);

  // The AI's note belongs to one quiz, asked while one question was the newest in the class. When a
  // new question opens (a quiz or a vote), the note goes away.
  const key = data?.kind === "quiz" ? `${data.poll} ${current?.id ?? ""}` : "";
  const note = ai && ai.key === key ? ai : null;

  async function askAI() {
    const askedFor = key;
    setAsking(true);
    setAi(null);
    try {
      setAi({ key: askedFor, text: await feedback({ channel: CHANNEL }), failed: false });
    } catch (e) {
      setAi({ key: askedFor, text: errorText(e), failed: true });
    } finally {
      setAsking(false);
    }
  }

  const wrong = data?.kind === "quiz" ? data.wrong : [];
  return (
    <section className="host-side host-sec ask-wrong">
      <div className="host-sec__head">
        <h2>Who got it wrong</h2>
        {wrong.length > 0 && (
          <Button variant="outline" busy={asking} onClick={askAI}>
            Ask the AI
          </Button>
        )}
      </div>
      {data === undefined && (
        <Waiting>
          <Status kind="loading">Loading the answers...</Status>
        </Waiting>
      )}
      {data === null && (
        <Waiting>
          <Status kind="empty">No quiz with a right answer yet.</Status>
        </Waiting>
      )}
      {data?.kind === "vote" && (
        <Waiting>
          <Status kind="empty">“{data.question}” is a vote, so it has no right answer.</Status>
        </Waiting>
      )}
      {data?.kind === "quiz" && (
        <>
          <p className="ask-wrong__q">
            <span>{data.question}</span> <span className={data.open ? "stateword stateword--open" : "stateword stateword--ended"}>{data.open ? "Open" : "Ended"}</span>
          </p>
          <p className="ask-wrong__sum">
            {data.answered} answered{data.wrong.length > 0 && `, ${data.wrong.length} wrong`}. Right answer: {data.choices[data.correct]}.
          </p>
          {data.wrong.length === 0 ? (
            <Waiting>
              <Status kind="empty">Nobody got it wrong yet.</Status>
            </Waiting>
          ) : (
            <table className="table ask-wrong__table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Team</th>
                  <th>Picked</th>
                </tr>
              </thead>
              <tbody>
                {data.wrong.map((w, i) => (
                  <tr key={i}>
                    <td>{w.name}</td>
                    <td>{w.team ? <TeamChip color={w.team.color} label={w.team.label} /> : <span className="muted">No team</span>}</td>
                    <td>{w.picked}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {note && (note.failed ? <Status kind="error">{note.text}</Status> : <p className="answer ask-note">{note.text}</p>)}
        </>
      )}
    </section>
  );
}

// The table's well before there is anyone to list: its head (Name, Team, Picked) over one row
// holding the line that says why, so the slot keeps the table's shape and ends at its content.
function Waiting({ children }: { children: ReactNode }) {
  return (
    <div className="ruled ruled--well ask-wrong__wait">
      <div className="ruled__head" aria-hidden="true">
        <span>Name</span>
        <span>Team</span>
        <span>Picked</span>
      </div>
      <div className="ruled__row ruled__row--empty">{children}</div>
    </div>
  );
}
