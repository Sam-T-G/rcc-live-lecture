// The team leaderboard on the projector (#/live/leaderboard, inside <Projector>, which gives the
// title; BoardPage.tsx). <Leaderboard big /> draws this too. The room sees it, so it has no
// professor buttons and no fold nobody can open from the seats. Its stage sizes are in
// stageboard.css.
import { Status } from "../../blocks/ui";
import { BoardNote, LockNote, TeamRow, useBoard } from "./Leaderboard";
import "./stageboard.css";

// The projector fits up to BIG_MAX teams on one 1920 x 1080 screen: two columns of two-line rows
// up to BIG_ROOMY teams, then one-line rows without the numbers line. Past BIG_MAX it lists
// BIG_MAX teams and says how many more there are; each student's phone shows their own team's
// place.
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

export function StageBoard() {
  const { board, me, teams } = useBoard();
  const many = teams.length > BIG_ROOMY;
  const cls = "board board--big" + (many ? " board--many" : "");
  const { shown, more } = bigRows(teams, me?.team);
  return (
    <>
      <LockNote />
      {board === undefined ? (
        <Status kind="loading">Loading the scores…</Status>
      ) : teams.length === 0 ? (
        <Status kind="empty">No teams yet. Each student joins a team when they check in.</Status>
      ) : (
        <>
          <ol className={cls}>
            {shown.map((g) => <TeamRow key={g.team} g={g} big mine={g.team === me?.team} />)}
          </ol>
          {more > 0 && <p className="board__more">Plus {more} more {more === 1 ? "team" : "teams"}. Your phone shows your team’s place.</p>}
          <BoardNote questions={board.questions} />
        </>
      )}
    </>
  );
}
