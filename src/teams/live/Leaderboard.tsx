// The team leaderboard. <Leaderboard /> is the card on the phone page and <GroupBadge /> tells a
// student their team. #/live/leaderboard shows it big for the projector: <Leaderboard big /> draws
// StageBoard.tsx, which BoardPage.tsx puts on the stage. useBoard() reads what both show. The
// professor picks the team size on #/host (Points), so neither has a professor button.
import { useEffect } from "react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../../convex/_generated/api";
import { CHANNEL } from "../../blocks/deck";
import { useGoogleUser } from "../../blocks/auth";
import { Status } from "../../blocks/ui";
import { StageBoard } from "./StageBoard";
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
  // The team line (kit .teamline): the team's one 16 swatch and "You're on Green", no pill.
  return (
    <p className={"teamline group-badge group--" + team.color}>
      <span className="team__chip" aria-hidden="true" />
      You’re on {team.label}
    </p>
  );
}

export type Row = FunctionReturnType<typeof api.live.groups.leaderboard>["teams"][number];

// The board and the viewer's team as the server sends them, and the teams the board lists:
// teams with nobody checked in to this class are left off. `board` and `me` are undefined while
// they load.
export function useBoard() {
  const board = useQuery(api.live.groups.leaderboard, { channel: CHANNEL });
  const me = useQuery(api.live.groups.mine, { channel: CHANNEL });
  const teams = (board?.teams ?? []).filter((g) => g.members > 0);
  return { board, me, teams };
}

export const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;
// Extra credit as the board shows it: whole numbers as they are, a split place to one decimal
// (three teams tied for 2nd get 4 / 3 each: "+1.3").
const credit = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

// One team: place, color and name, extra credit, then right answers (or points, once the
// professor has changed them), points per student, and students. The projector leaves out the
// number of students so the line fits, and puts the numbers in .board__score, which stays on
// screen with 7 or more teams (.board--many hides only .board__members).
export function TeamRow({ g, mine, big }: { g: Row; mine: boolean; big?: boolean }) {
  const score = g.changes === 0 ? `${g.correct} right` : plural(g.points, "point");
  const parts = [score, `${g.perStudent.toFixed(1)} per student`, ...(big ? [] : [plural(g.members, "student")])];
  // The phone card puts the team's swatch before its name (the projector's rows stay as they are).
  const name = <span className="board__name">{g.label}{mine && " (you)"}</span>;
  return (
    <li className={"board__row group--" + g.color + (mine ? " board__row--mine" : "")}>
      <span className="board__rank">{g.rank}</span>
      {big ? (
        name
      ) : (
        <span className="board__team">
          <span className="team__chip" aria-hidden="true" />
          {name}
        </span>
      )}
      <span className="board__ec">+{credit(g.ec)} <small>extra credit</small></span>
      <span className={big ? "board__score muted" : "board__members muted"}>{parts.join(" · ")}</span>
    </li>
  );
}

// "Teams are final." or when they will be.
export function LockNote() {
  const status = useQuery(api.live.groups.status, { channel: CHANNEL });
  if (!status) return null;
  if (status.locked) return <p className="muted">Teams are final.</p>;
  if (status.locksAt === null) return <p className="muted">Teams lock 5 minutes after the first check-in.</p>;
  const t = new Date(status.locksAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return <p className="muted">Teams are still forming. They lock at {t}.</p>;
}

// How the board ranks, under the rows on the phone card and the projector alike.
export function BoardNote({ questions }: { questions: number }) {
  return (
    <p className="muted">
      {questions === 0
        ? "No quiz with a right answer has ended yet."
        : `After ${plural(questions, "quiz", "quizzes")} with a right answer.`} Teams rank by points per
      student: 1st place gets 5 extra credit, 2nd gets 3, 3rd gets 1.
    </p>
  );
}

// big: the projector version (#/live/leaderboard, inside <Projector>, which gives the title):
// StageBoard.tsx. The room sees it, so it has no professor buttons and no fold nobody can open
// from the seats.
export function Leaderboard({ big }: { big?: boolean }) {
  return big ? <StageBoard /> : <BoardCard />;
}

// The phone card shows the first 3 rows, and every other team tied for a place that earns extra
// credit (a 3-way tie for 2nd shows all three). Teams tied with no points stay in the fold. It is
// a section on the page, not a card: its heading with the lock line, then ruled rows, two lines
// each (live.css, leaderboard.css). While the scores load, three rows hold the rows' place.
function BoardCard() {
  const { board, me, teams } = useBoard();
  const cls = "board board--card";
  const top = teams.filter((g, i) => i < 3 || g.ec > 0);
  const rest = teams.filter((g) => !top.includes(g));
  const mineBelow = rest.find((g) => g.team === me?.team);
  return (
    <section className="plane ph-board">
      <div className="ph-board__head">
        <h2>Team leaderboard</h2>
        <LockNote />
      </div>
      {board === undefined ? (
        <>
          <Status kind="loading">Loading the scores…</Status>
          <ol className="board board--card board--wait" aria-hidden="true">
            {[1, 2, 3].map((n) => (
              <li key={n} className="board__row">
                <span className="board__rank">{n}</span>
                <span className="skel skel--w40" />
                <span className="skel skel--num" />
              </li>
            ))}
          </ol>
        </>
      ) : teams.length === 0 ? (
        <Status kind="empty">No teams yet. Each student joins a team when they check in.</Status>
      ) : (
        <>
          <ol className={cls}>
            {top.map((g) => <TeamRow key={g.team} g={g} mine={g.team === me?.team} />)}
            {mineBelow && <TeamRow g={mineBelow} mine />}
          </ol>
          {rest.length > 0 && (
            <details>
              <summary>All {teams.length} teams</summary>
              <ol className={cls}>
                {rest.map((g) => <TeamRow key={g.team} g={g} mine={g.team === me?.team} />)}
              </ol>
            </details>
          )}
          <BoardNote questions={board.questions} />
        </>
      )}
    </section>
  );
}
