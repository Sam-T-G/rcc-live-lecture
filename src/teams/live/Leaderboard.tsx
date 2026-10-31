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

// The projector (#/live/leaderboard) fits up to BIG_MAX teams on one 1920 x 1080 screen: two
// columns of two-line rows up to BIG_ROOMY teams, then one-line rows without "3 students".
// Past BIG_MAX it lists BIG_MAX teams and says how many more there are; each student's phone
// shows their own team's place.
const BIG_ROOMY = 6;
const BIG_MAX = 10;

// The teams the projector lists: the top BIG_MAX, or, when the viewer's team is lower down (as on
// the phone card), the top BIG_MAX - 1 and the viewer's team.
function bigRows<T extends { team: number }>(teams: T[], mine?: number): { shown: T[]; more: number } {
  if (teams.length <= BIG_MAX) return { shown: teams, more: 0 };
  const me = teams.slice(BIG_MAX).find((g) => g.team === mine);
  const shown = me ? [...teams.slice(0, BIG_MAX - 1), me] : teams.slice(0, BIG_MAX);
  return { shown, more: teams.length - shown.length };
}

// big: the projector version (#/live/leaderboard, inside <Projector>, which gives the title). The
// room sees it, so it has no professor buttons and no fold nobody can open from the seats.
export function Leaderboard({ big }: { big?: boolean }) {
  const board = useQuery(api.live.groups.leaderboard, { channel: CHANNEL });
  const me = useQuery(api.live.groups.mine, { channel: CHANNEL });
  const teams = board?.teams ?? [];
  const many = big && teams.length > BIG_ROOMY;
  const cls = "board" + (big ? " board--big" : "") + (many ? " board--many" : "");
  const projector = bigRows(teams, me?.team);
  const top = big ? projector.shown : teams.slice(0, 3);
  const rest = big ? [] : teams.slice(3);
  const mineBelow = rest.find((g) => g.team === me?.team);
  const body = (
    <>
      {!big && <TeamSize />}
      <LockNote />
      {board === undefined ? (
        <Status kind="loading">Loading the scores…</Status>
      ) : (
        <>
          <ol className={cls}>
            {top.map((g) => <TeamRow key={g.team} g={g} mine={g.team === me?.team} />)}
            {mineBelow && <TeamRow g={mineBelow} mine />}
          </ol>
          {big && projector.more > 0 && (
            <p className="board__more">Plus {projector.more} more {projector.more === 1 ? "team" : "teams"}. Your phone shows your team’s place.</p>
          )}
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
    </>
  );
  return big ? body : <Card title="Team leaderboard">{body}</Card>;
}
