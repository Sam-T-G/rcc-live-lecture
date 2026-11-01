// The team leaderboard on the projector (#/live/leaderboard, inside <Projector>, which gives the
// title; BoardPage.tsx). <Leaderboard big /> draws this too. The room sees it, so it has no
// professor buttons and no fold nobody can open from the seats.
//
// The lock line sits on the title's row. Up to BIG_ROOMY teams, the top team gets the 1st place
// block (the kit's .first, the green field) on the left, and the rest are the ranked ledger on the
// right (the kit's .pledger: ruled rows with the place, the team's chip and name and its extra
// credit, and its numbers under the name). Past BIG_ROOMY the ledger takes the full width in two
// columns of tighter rows and the top team's row is the field. The scoring line sits under the
// board. stageboard.css sizes and places it all for the stage.
import type { ReactNode } from "react";
import { TeamChip } from "../../blocks/kit";
import { Status } from "../../blocks/ui";
import { BoardNote, LockNote, plural, useBoard, type Row } from "./Leaderboard";
import "./stageboard.css";

// The projector fits up to BIG_MAX teams on one 1920 x 1080 screen: the 1st place block beside one
// column of rows up to BIG_ROOMY teams, then two columns of tighter rows. Past BIG_MAX it lists
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

// Extra credit as the phone card prints it (Leaderboard.tsx): whole numbers as they are, a split
// place to one decimal (three teams tied for 2nd get 4 / 3 each: "+1.3").
const credit = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

// Right answers (or points, once the professor has changed them) and points per student, as the
// phone card says them. The projector leaves out the number of students so the line fits.
const numbers = (g: Row) => [g.changes === 0 ? `${g.correct} right` : plural(g.points, "point"), `${g.perStudent.toFixed(1)} per student`].join(" · ");

function Name({ g, mine }: { g: Row; mine: boolean }) {
  return (
    <span className="board__name">
      {g.label}
      {mine && " (you)"}
    </span>
  );
}

// "+5 extra credit". No credit ("+0") is quiet, so only the places that earn some stand out.
function Credit({ g }: { g: Row }) {
  return (
    <span className={g.ec === 0 ? "board__ec board__ec--zero" : "board__ec"}>
      +{credit(g.ec)} <small>extra credit</small>
    </span>
  );
}

// The top team's block: its place at 160, its chip and name at 92, its extra credit, then its
// numbers at the foot.
function First({ g, mine }: { g: Row; mine: boolean }) {
  return (
    <div className="first">
      <p className="first__rank">{g.rank}</p>
      <p className={"first__team group--" + g.color}>
        <span className="team__chip" aria-hidden="true" />
        <Name g={g} mine={mine} />
      </p>
      <p className="first__credit">
        <Credit g={g} />
      </p>
      <p className="first__line">
        <span className="board__score">{numbers(g)}</span>
      </p>
    </div>
  );
}

// One ledger row: the place, the team, its extra credit, and its numbers under the name.
function LedgerRow({ g, mine }: { g: Row; mine: boolean }) {
  return (
    <li className="pledger__row">
      <span className="pledger__place n">{g.rank}</span>
      <TeamChip color={g.color} label={<Name g={g} mine={mine} />} />
      <Credit g={g} />
      <span className="board__score">{numbers(g)}</span>
    </li>
  );
}

// Before the board has teams: the 1st place block's frame with the step in it. While the scores
// load, still blocks stand in the ledger where the places, names and credit will land; with no
// teams yet there is nothing to stand in for, so the ledger stays empty.
function Waiting({ loading, children }: { loading?: boolean; children: ReactNode }) {
  return (
    <div className="lbgrid stageboard">
      <div className="first first--wait">{children}</div>
      {loading && (
        <div className="pledger" aria-hidden="true">
          {[2, 3, 4, 5, 6].map((n) => (
            <div key={n} className="pledger__row stageboard__skel">
              <span className="skel skel--num" />
              <span className="skel" />
              <span className="skel" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function StageBoard() {
  const { board, me, teams } = useBoard();
  const many = teams.length > BIG_ROOMY;
  const cls = "board board--big" + (many ? " board--many" : "");
  const { shown, more } = bigRows(teams, me?.team);
  const [top, ...rest] = shown;
  const ledger = many ? shown : rest;
  return (
    <>
      <div className="stageboard__lock">
        <LockNote />
      </div>
      {board === undefined ? (
        <Waiting loading>
          <Status kind="loading">Loading the scores…</Status>
        </Waiting>
      ) : teams.length === 0 ? (
        <Waiting>
          <Status kind="empty">No teams yet. Each student joins a team when they check in.</Status>
        </Waiting>
      ) : (
        <>
          <div className="lbgrid stageboard">
            {!many && <First g={top} mine={top.team === me?.team} />}
            <div className="pledger">
              <ol className={cls}>
                {ledger.map((g) => (
                  <LedgerRow key={g.team} g={g} mine={g.team === me?.team} />
                ))}
              </ol>
            </div>
          </div>
          <div className="lbfoot">
            {more > 0 && <p className="board__more">Plus {more} more {more === 1 ? "team" : "teams"}. Your phone shows your team’s place.</p>}
            <BoardNote questions={board.questions} />
          </div>
        </>
      )}
    </>
  );
}
