// The Points tab: the three teams and every student's points. Tap a team to show only its students.
import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Card, Status } from "../../blocks/ui";
import { CHANNEL } from "../../blocks/deck";
import { TEAMS, Team, errorText } from "./Team";
import type { TeamName } from "./Team";

type Pick = TeamName | "all";

// The whole Points tab. It keeps which team the roster shows, so the tab's two cards agree.
export function PointsTab() {
  const [team, setTeam] = useState<Pick>("all");
  return (
    <div className="host-grid">
      <TeamBoard team={team} onTeam={setTeam} />
      <Roster team={team} onTeam={setTeam} />
    </div>
  );
}

// Tap a team to show only its students. Tap it again to show everyone.
export function TeamBoard({ team, onTeam }: { team: Pick; onTeam: (t: Pick) => void }) {
  const teams = useQuery(api.host.board.teams, { channel: CHANNEL });
  const reshuffle = useMutation(api.host.teams.reshuffle);
  const endDay = useMutation(api.host.points.endDay);
  const [message, setMessage] = useState("");

  async function end() {
    if (!window.confirm("End the day? The winning team gets extra credit and everyone is mixed into new teams.")) return;
    try {
      setMessage(await endDay({ channel: CHANNEL }));
    } catch (e) {
      setMessage(errorText(e));
    }
  }

  const most = Math.max(1, ...(teams ?? []).map((t) => t.today));
  return (
    <Card title="Teams today">
      {teams === undefined ? (
        <Status kind="loading">Loading...</Status>
      ) : (
        <div className="host-teams">
          {teams.map((t, i) => (
            <button key={t.team} className="host-teamrow" aria-pressed={team === t.team} onClick={() => onTeam(team === t.team ? "all" : t.team)}>
              <span><Team name={t.team} /><small>{t.students} students{i === 0 && t.today > 0 ? " · leading" : ""}</small></span>
              <span className="host-teamrow__bar"><span className={"host-teamrow__fill host-teamrow__fill--" + t.team} style={{ width: `${Math.max(0, (t.today / most) * 100)}%` }} /></span>
              <span className="host-teamrow__n">{t.today}</span>
            </button>
          ))}
        </div>
      )}
      <div className="row">
        <button className="host-main" onClick={end}>End day</button>
        <button className="host-quiet" onClick={() => { if (window.confirm("Mix everyone into new teams?")) void reshuffle({ channel: CHANNEL }); }}>Mix the teams</button>
      </div>
      {message && <Status kind="empty">{message}</Status>}
    </Card>
  );
}

// Every student with their points. Tap -1 or -5 to take points off; each one is kept as an event.
export function Roster({ team, onTeam }: { team: Pick; onTeam: (t: Pick) => void }) {
  const rows = useQuery(api.host.board.students, { channel: CHANNEL });
  const adjust = useMutation(api.host.points.adjust);
  const ranked = rows?.map((r, i) => ({ ...r, rank: i + 1 }));
  const shown = ranked?.filter((r) => team === "all" || r.team === team);

  return (
    <Card title="Students">
      <div className="host-filter">
        {(["all", ...TEAMS] as const).map((t) => (
          <button key={t} className="host-small" aria-pressed={team === t} onClick={() => onTeam(t)}>{t === "all" ? "Everyone" : t}</button>
        ))}
      </div>
      {shown === undefined && <Status kind="loading">Loading...</Status>}
      {shown?.length === 0 && <Status kind="empty">No students yet.</Status>}
      {shown && shown.length > 0 && (
        <table className="host-table">
          <thead><tr><th>#</th><th>Name</th><th>Team</th><th>Today</th><th>Total</th><th /></tr></thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.user}>
                <td className="host-rank">{r.rank}</td><td>{r.name}</td><td><Team name={r.team} /></td><td>{r.today}</td><td>{r.total}</td>
                <td className="host-act">
                  {[1, 5].map((n) => (
                    <button key={n} className="host-small host-quiet" aria-label={`Take ${n} off ${r.name}`} onClick={() => void adjust({ channel: CHANNEL, user: r.user, name: r.name, delta: -n })}>-{n}</button>
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
