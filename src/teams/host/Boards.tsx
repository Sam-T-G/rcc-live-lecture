// Scores: the three teams, the top students, and the AI note on who is missing the point.
import { useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Card, Status } from "../../blocks/ui";
import { CHANNEL } from "../../blocks/deck";
import { useProfKey } from "../checkin/prof";
import { TEAMS, Team, errorText } from "./Team";
import type { TeamName } from "./Team";

export function TeamBoard() {
  const key = useProfKey();
  const teams = useQuery(api.host.board.teams, { key, channel: CHANNEL });
  const reshuffle = useMutation(api.host.teams.reshuffle);
  const endDay = useMutation(api.host.points.endDay);
  const [message, setMessage] = useState("");

  async function end() {
    if (!window.confirm("End the day? The winning team gets extra credit and everyone is mixed into new teams.")) return;
    try {
      setMessage(await endDay({ key, channel: CHANNEL }));
    } catch (e) {
      setMessage(errorText(e));
    }
  }

  return (
    <Card title="Teams">
      {teams === undefined ? (
        <Status kind="loading">Loading...</Status>
      ) : (
        <table className="host-table">
          <thead><tr><th>Team</th><th>Students</th><th>Today</th><th>Total</th></tr></thead>
          <tbody>
            {teams.map((t, i) => (
              <tr key={t.team}><td><Team name={t.team} />{i === 0 && t.today > 0 ? " leading" : ""}</td><td>{t.students}</td><td>{t.today}</td><td>{t.total}</td></tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="row">
        <button onClick={end}>End day</button>
        <button className="host-ghost" onClick={() => { if (window.confirm("Mix everyone into new teams?")) void reshuffle({ key, channel: CHANNEL }); }}>Mix the teams</button>
      </div>
      {message && <Status kind="empty">{message}</Status>}
    </Card>
  );
}

// Every student with their points. Deduct buttons take 1 or 5 off; each one is kept as an event.
export function Roster() {
  const key = useProfKey();
  const rows = useQuery(api.host.board.students, { key, channel: CHANNEL });
  const adjust = useMutation(api.host.points.adjust);
  const [filter, setFilter] = useState<TeamName | "all">("all");
  const shown = rows?.filter((r) => filter === "all" || r.team === filter);

  return (
    <Card title="Students">
      <div className="row" style={{ marginBottom: 8 }}>
        {(["all", ...TEAMS] as const).map((t) => (
          <button key={t} className={filter === t ? "host-small" : "host-small host-ghost"} onClick={() => setFilter(t)}>{t === "all" ? "Everyone" : t}</button>
        ))}
      </div>
      {shown === undefined && <Status kind="loading">Loading...</Status>}
      {shown?.length === 0 && <Status kind="empty">No students yet.</Status>}
      {shown && shown.length > 0 && (
        <table className="host-table">
          <thead><tr><th>#</th><th>Name</th><th>Team</th><th>Today</th><th>Total</th><th /></tr></thead>
          <tbody>
            {shown.map((r, i) => (
              <tr key={r.user}>
                <td>{i + 1}</td><td>{r.name}</td><td><Team name={r.team} /></td><td>{r.today}</td><td>{r.total}</td>
                <td>
                  {[1, 5].map((n) => (
                    <button key={n} className="host-ghost host-small" aria-label={`Take ${n} off ${r.name}`} onClick={() => void adjust({ key, channel: CHANNEL, user: r.user, name: r.name, delta: -n })}>-{n}</button>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

export function Missing() {
  const key = useProfKey();
  const rows = useQuery(api.host.board.missing, { key, channel: CHANNEL });
  const feedback = useAction(api.host.ai.feedback);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function ask() {
    setBusy(true);
    setError("");
    try {
      setNote(await feedback({ key, channel: CHANNEL }));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Who is missing it">
      <button onClick={ask} disabled={busy}>{busy ? "Reading..." : "Ask the AI"}</button>
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
