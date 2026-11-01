// The Now tab's "Who got it wrong" card, on Check-in's polls (checkin.quiz.missing): the newest quiz
// with a right answer in this class, and each student who picked a wrong choice, with their team and
// their pick. "Ask the AI" gets 2 or 3 sentences on which wrong choice most people picked and what
// to explain again (checkin.quiz.feedback); no names go to the AI. It shows only once someone got
// it wrong: with no wrong choice picked, the AI would name one nobody picked.
import { useState } from "react";
import { useAction, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Card, Status } from "../../blocks/ui";
import { Badge, Button } from "../../blocks/kit";
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

  return (
    <Card title="Who got it wrong">
      {data === undefined && <Status kind="loading">Loading the answers...</Status>}
      {data === null && <Status kind="empty">No quiz with a right answer yet.</Status>}
      {data?.kind === "vote" && <Status kind="empty">“{data.question}” is a vote, so it has no right answer.</Status>}
      {data?.kind === "quiz" && (
        <>
          <div className="ask-missing__head">
            <h3 className="ask-missing__q">{data.question}</h3>
            <Badge tone={data.open ? "live" : "neutral"}>{data.open ? "Open" : "Ended"}</Badge>
          </div>
          <p className="muted ask-missing__sum">
            {data.answered} answered{data.wrong.length > 0 && `, ${data.wrong.length} wrong`}. Right answer: {data.choices[data.correct]}.
          </p>
          {data.wrong.length === 0 ? (
            <Status kind="empty">Nobody got it wrong yet.</Status>
          ) : (
            <div className="table-scroll">
              <table>
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
            </div>
          )}
          {data.wrong.length > 0 && (
            <>
              <div className="row ask-missing__ai">
                <Button variant="secondary" small busy={asking} onClick={askAI}>
                  Ask the AI
                </Button>
              </div>
              {note && (note.failed ? <Status kind="error">{note.text}</Status> : <p className="ask-note">{note.text}</p>)}
            </>
          )}
        </>
      )}
    </Card>
  );
}
