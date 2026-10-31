// The team leaderboard. <Leaderboard /> is the card on the phone page and <GroupBadge /> tells a
// student their team. #/live/leaderboard shows it big for the projector. The professor picks the
// team size on #/host (Points), so neither has a professor button.
import { useEffect } from "react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../../convex/_generated/api";
import { CHANNEL } from "../../blocks/deck";
import { useGoogleUser } from "../../blocks/auth";
import { Card, Status } from "../../blocks/ui";
import "./leaderboard.css";

// "You're on Green." Also puts a student who checked in before their team was dealt onto one.
// join waits for Convex to confirm the sign-in: right after a sign-in the tab has the user while
// Convex still sends the old token, and join would fail with "Sign in first.".
export function GroupBadge() {
  const { user } = useGoogleUser();
  const { isAuthenticated } = useConvexAuth();
  const team = useQuery(api.live.groups.mine, { channel: CHANNEL });
  const join = useMutation(api.live.groups.join);
  useEffect(() => {
    if (user && isAuthenticated && team === null) join({ channel: CHANNEL }).catch((e: unknown) => console.error("Couldn't put this student on a team:", e));
  }, [user, isAuthenticated, team, join]);
  if (!team) return null;
  return <p className={"group-badge group--" + team.color}>You’re on {team.label}</p>;
}

type Row = FunctionReturnType<typeof api.live.groups.leaderboard>["teams"][number];

const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;
// Extra credit as the board shows it: whole numbers as they are, a split place to one decimal
// (three teams tied for 2nd get 4 / 3 each: "+1.3").
const credit = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

// One team: place, color and name, extra credit, then right answers (or points, once the
// professor has changed them), points per student, and students. The projector leaves out the
// number of students so the line fits.
function TeamRow({ g, mine, big }: { g: Row; mine: boolean; big?: boolean }) {
  const score = g.changes === 0 ? `${g.correct} right` : plural(g.points, "point");
  const parts = [score, `${g.perStudent.toFixed(1)} per student`, ...(big ? [] : [plural(g.members, "student")])];
  return (
    <li className={"board__row group--" + g.color + (mine ? " board__row--mine" : "")}>
      <span className="board__rank">{g.rank}</span>
      <span className="board__name">{g.label}{mine && " (you)"}</span>
      <span className="board__ec">+{credit(g.ec)} <small>extra credit</small></span>
      <span className="board__members muted">{parts.join(" · ")}</span>
    </li>
  );
}

// "Teams are final." or when they will be.
function LockNote() {
  const status = useQuery(api.live.groups.status, { channel: CHANNEL });
  if (!status) return null;
  if (status.locked) return <p className="muted">Teams are final.</p>;
  if (status.locksAt === null) return <p className="muted">Teams lock 5 minutes after the first check-in.</p>;
  const t = new Date(status.locksAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return <p className="muted">Teams are still forming. They lock at {t}.</p>;
}

// The projector (#/live/leaderboard) fits up to BIG_MAX teams on one 1920 x 1080 screen: two
// columns of two-line rows up to BIG_ROOMY teams, then one-line rows without the numbers line.
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
// room sees it, so it has no professor buttons and no fold nobody can open from the seats. Teams
// with nobody checked in to this class are left off.
export function Leaderboard({ big }: { big?: boolean }) {
  const board = useQuery(api.live.groups.leaderboard, { channel: CHANNEL });
  const me = useQuery(api.live.groups.mine, { channel: CHANNEL });
  const teams = (board?.teams ?? []).filter((g) => g.members > 0);
  const many = big && teams.length > BIG_ROOMY;
  const cls = "board" + (big ? " board--big" : " board--card") + (many ? " board--many" : "");
  const projector = bigRows(teams, me?.team);
  const top = big ? projector.shown : teams.slice(0, 3);
  const rest = big ? [] : teams.slice(3);
  const mineBelow = rest.find((g) => g.team === me?.team);
  const body = (
    <>
      <LockNote />
      {board === undefined ? (
        <Status kind="loading">Loading the scores…</Status>
      ) : teams.length === 0 ? (
        <Status kind="empty">No teams yet. Each student joins a team when they check in.</Status>
      ) : (
        <>
          <ol className={cls}>
            {top.map((g) => <TeamRow key={g.team} g={g} big={big} mine={g.team === me?.team} />)}
            {mineBelow && <TeamRow g={mineBelow} mine />}
          </ol>
          {big && projector.more > 0 && (
            <p className="board__more">Plus {projector.more} more {projector.more === 1 ? "team" : "teams"}. Your phone shows your team’s place.</p>
          )}
          {rest.length > 0 && (
            <details>
              <summary>All {teams.length} teams</summary>
              <ol className={cls} style={{ marginTop: 10 }}>
                {rest.map((g) => <TeamRow key={g.team} g={g} mine={g.team === me?.team} />)}
              </ol>
            </details>
          )}
          <p className="muted">
            {board.questions === 0 ? "No quiz has ended yet." : `After ${plural(board.questions, "quiz", "quizzes")}.`} Teams rank by points per
            student: 1st place gets 5 extra credit, 2nd gets 3, 3rd gets 1.
          </p>
        </>
      )}
    </>
  );
  return big ? body : <Card title="Team leaderboard">{body}</Card>;
}
