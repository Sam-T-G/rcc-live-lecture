// The Now tab's "Who is missing it" card: each student who picked a wrong answer on the newest
// question, with their team and what they picked, and an "Ask the AI" button that gets 2 or 3
// sentences on which wrong answer most people picked and what to explain again.
import { useState } from "react";
import { useAction, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Card, Status } from "../../blocks/ui";
import { CHANNEL } from "../../blocks/deck";
import { Team, errorText } from "./Team";

export function Missing() {
  const rows = useQuery(api.host.board.missing, { channel: CHANNEL });
  const feedback = useAction(api.host.ai.feedback);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function ask() {
    setBusy(true);
    setError("");
    try {
      setNote(await feedback({ channel: CHANNEL }));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Who is missing it">
      <button className="host-main" onClick={ask} disabled={busy}>{busy ? "Reading..." : "Ask the AI"}</button>
      {error && <Status kind="error">{error}</Status>}
      {note && <p className="host-note">{note}</p>}
      {rows === undefined && <Status kind="loading">Loading...</Status>}
      {rows?.length === 0 && <Status kind="empty">Nobody got it wrong yet.</Status>}
      {rows && rows.length > 0 && (
        <table className="host-table">
          <thead><tr><th>Name</th><th>Team</th><th>Picked</th></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}><td>{r.name}</td><td><Team name={r.team} /></td><td>{r.choice}</td></tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}
