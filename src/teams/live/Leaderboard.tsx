// The team leaderboard. <Leaderboard /> is the card on the phone page and <GroupBadge /> tells a
// student their team. #/live/leaderboard shows it big for the projector.
import { useEffect } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { CHANNEL } from "../../blocks/deck";
import { useGoogleUser } from "../../blocks/auth";
import { Card, Status } from "../../blocks/ui";
import { useProfKey } from "../checkin/prof";

// "You're on Green." Also puts a student who checked in earlier onto a team.
export function GroupBadge() {
  const { user } = useGoogleUser();
  const team = useQuery(api.live.groups.mine, { channel: CHANNEL });
  const join = useMutation(api.live.groups.join);
  useEffect(() => {
    if (user && team === null) join({ channel: CHANNEL }).catch(() => {});
  }, [user, team, join]);
  if (!team) return null;
  return <p className={"group-badge group--" + team.color}>You’re on {team.label}</p>;
}

// Hosts only: choose teams of 3 or 4. Everyone else sees nothing.
function TeamSize() {
  const key = useProfKey();
  const host = useQuery(api.checkin.pass.amHost, { key });
  const status = useQuery(api.live.groups.status, { channel: CHANNEL });
  const set = useMutation(api.live.groups.setSize);
  if (!host || status === undefined) return null;
  return (
    <div className="qa__tabs" role="group" aria-label="Students per team">
      {[3, 4].map((n) => (
        <button key={n} type="button" aria-pressed={status.size === n} onClick={() => void set({ key, channel: CHANNEL, size: n })}>
          Teams of {n}
        </button>
      ))}
    </div>
  );
}

type Row = { team: number; color: string; label: string; members: number; correct: number; rank: number; ec: number };

function TeamRow({ g, mine }: { g: Row; mine: boolean }) {
  return (
    <li className={"board__row group--" + g.color + (mine ? " board__row--mine" : "")}>
      <span className="board__rank">{g.rank}</span>
      <span className="board__name">{g.label}{mine && " (you)"}</span>
      <span className="board__score">{g.correct} <small>right</small></span>
      <span className="board__ec">+{g.ec} <small>EC</small></span>
      <span className="board__members muted">{g.members} {g.members === 1 ? "student" : "students"}</span>
    </li>
  );
}

// "Teams are final." or when they will be.
function LockNote() {
  const status = useQuery(api.live.groups.status, { channel: CHANNEL });
  if (!status) return null;
  if (status.locked) return <p className="muted">Teams are final.</p>;
  if (status.locksAt === null) return <p className="muted">Teams lock 5 minutes after class starts.</p>;
  const t = new Date(status.locksAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return <p className="muted">Teams are still forming. They lock at {t}.</p>;
}

export function Leaderboard({ big }: { big?: boolean }) {
  const board = useQuery(api.live.groups.leaderboard, { channel: CHANNEL });
  const me = useQuery(api.live.groups.mine, { channel: CHANNEL });
  const cls = "board" + (big ? " board--big" : "");
  const top = board?.teams.slice(0, 3) ?? [];
  const rest = board?.teams.slice(3) ?? [];
  const mineBelow = rest.find((g) => g.team === me?.team);
  return (
    <Card title="Team leaderboard">
      <TeamSize />
      <LockNote />
      {board === undefined ? (
        <Status kind="loading">Loading the scores…</Status>
      ) : (
        <>
          <ol className={cls}>
            {top.map((g) => <TeamRow key={g.team} g={g} mine={g.team === me?.team} />)}
            {mineBelow && <TeamRow g={mineBelow} mine />}
          </ol>
          {rest.length > 0 && (
            <details>
              <summary>All {board.teams.length} teams</summary>
              <ol className={cls} style={{ marginTop: 10 }}>
                {rest.map((g) => <TeamRow key={g.team} g={g} mine={g.team === me?.team} />)}
              </ol>
            </details>
          )}
          <p className="muted">
            {board.questions === 0
              ? "No quiz questions have ended yet."
              : `After ${board.questions} ${board.questions === 1 ? "question" : "questions"}. First place earns 5 extra credit, second 3, third 1.`}
          </p>
        </>
      )}
    </Card>
  );
}
