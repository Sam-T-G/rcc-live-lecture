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
//
// Teams with the same points per student share a place, and before any quiz with a right answer
// ends every team is 1st. The block is for a team alone in 1st: when two or more share it, every
// team is a ledger row at the full width, so no team reads as the only winner, and the ledger's
// <ol> gets .board--tied. Past BIG_ROOMY the green top row in stageboard.css skips a
// .board--tied list too. StageBoard.test.ts, leaderboardCss.test.ts.
//
// When points change after a quiz (MOTION.md projector board-reorder, protos/projector-board-
// reorder.html), a changed numbers line swaps in place (Swap: the old one out, then the new one in,
// never both at once), then each team that changed place travels to its new row inside the ledger
// (useReorder: a FLIP on its chip, name and numbers; the place and the extra credit belong to the
// row's slot and stay still), and a 6 stage px ring marks each moved row for 2 s. Reduced motion:
// nothing travels, the moved team's words fade in at their new row, and the ring still shows.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { TeamChip, calm } from "../../blocks/kit";
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

// The motion tokens (tokens.css; MOTION.md), read when a move starts. Under reduced motion the
// --sp* ones are 0.
function ms(name: string): number {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const n = parseFloat(v);
  if (!Number.isFinite(n)) return 0;
  return v.endsWith("ms") ? n : v.endsWith("s") ? n * 1000 : n;
}
const ease = () => getComputedStyle(document.documentElement).getPropertyValue("--ease").trim() || "ease-out";
// --hold-mark (MOTION.md Holds): how long the moved-row ring stays before it fades.
const HOLD_MARK = 2000;
// One value per slot: when `text` changes, the old value leaves on --fx-fast and the new one
// arrives after it on --fx, both in one grid cell so nothing moves (stageboard.css .swap). Before
// any change, and once the new value's fade ends, it is just the text. The old value is already
// at opacity 0 when its fade ends, so a page whose animations never run shows only the new one.
function Swap({ text }: { text: string }) {
  const [shown, setShown] = useState(text);
  const [old, setOld] = useState<string | null>(null);
  if (text !== shown) {
    setOld(shown);
    setShown(text);
  }
  if (old === null) return <>{text}</>;
  return (
    <span className="swap" key={shown}>
      <span className="swap__old" aria-hidden="true">
        {old}
      </span>
      <span className="swap__new" onAnimationEnd={() => setOld(null)}>
        {text}
      </span>
    </span>
  );
}

// The ledger's rows by team, and the move when their order changes. `order` is the teams' ids in
// the ledger's order; the returned function gives each row its ref. After a render whose order
// changed, each team that left its slot travels from where its row was (a FLIP on transform), the
// rising team over a plate in its row's tone (a span added to the row for the move only) so the
// falling one (40 ms behind) never shows through its words, then its row gets .pledger__row--moved
// for HOLD_MARK. A team that moves between the two columns, or into or out of the ledger, doesn't
// travel: travel stays inside one column. Holds are timers from the change, never transitionend.
function useReorder(order: number[]) {
  const rows = useRef(new Map<number, HTMLLIElement>());
  const was = useRef<{ order: number[]; at: Map<number, { x: number; y: number }> } | null>(null);
  const timers = useRef<number[]>([]);
  const key = order.join(",");
  useLayoutEffect(() => {
    const now = key ? key.split(",").map(Number) : [];
    const at = new Map<number, { x: number; y: number }>();
    rows.current.forEach((el, team) => {
      const list = el.parentElement;
      at.set(team, { x: el.offsetLeft - (list?.offsetLeft ?? 0), y: el.offsetTop - (list?.offsetTop ?? 0) });
    });
    const before = was.current;
    was.current = { order: now, at };
    if (!before || before.order.join(",") === key) return;
    const quiet = calm();
    const fast = ms("--fx-fast");
    const fx = ms("--fx");
    const sp = ms("--sp");
    const curve = ease();
    const LAG = 40;
    // Full motion: the ring lands 80 ms before the lagging row does. Reduced: as the words arrive.
    const ringAt = quiet || sp === 0 ? fast : fx + LAG + sp - 80;
    now.forEach((team, i) => {
      if (before.order[i] === team) return;
      const el = rows.current.get(team);
      const from = before.at.get(team);
      const to = at.get(team);
      if (!el || !from || !to) return;
      const dy = from.y - to.y;
      const cells = [...el.querySelectorAll<HTMLElement>(":scope > .team, :scope > .board__score")];
      // A move that comes before the last one ended starts from the row's new spot.
      cells.forEach((c) => c.getAnimations().forEach((a) => a.cancel()));
      el.querySelectorAll(":scope > .pledger__plate").forEach((p) => p.remove());
      if (!quiet && sp > 0 && from.x === to.x && dy !== 0) {
        const rising = dy > 0;
        const delay = fx + (rising ? 0 : LAG);
        const move = [{ transform: `translateY(${dy}px)` }, { transform: "translateY(0)" }];
        if (rising) {
          // The plate: one band in the row's own tone (the page's --lift on a plain row, the field on
          // the leader's green row) behind the rising team's words, from its chip to the extra
          // credit column, there only while the rows pass: in over the first 15% of the move, out over the last 20%.
          const tone = getComputedStyle(el).backgroundColor;
          const clear = !tone || tone === "transparent" || /^rgba\(.*,\s*0\)$/.test(tone);
          const plate = document.createElement("span");
          plate.setAttribute("aria-hidden", "true");
          plate.className = "pledger__plate";
          // From the chip to the extra credit column, which stays with its row and never hides.
          const credit = el.querySelector<HTMLElement>(":scope > .board__ec");
          plate.style.left = `${cells[0]?.offsetLeft ?? 0}px`;
          if (credit) plate.style.right = `${el.clientWidth - credit.offsetLeft}px`;
          plate.style.background = clear ? getComputedStyle(el).getPropertyValue("--lift").trim() : tone;
          el.append(plate);
          const lift = plate.animate(
            [
              { transform: `translateY(${dy}px)`, opacity: 0 },
              { opacity: 1, offset: 0.15 },
              { opacity: 1, offset: 0.8 },
              { transform: "translateY(0)", opacity: 0 },
            ],
            { duration: sp, delay, easing: curve, fill: "backwards" },
          );
          lift.finished.then(() => plate.remove(), () => plate.remove());
        }
        cells.forEach((c) => {
          c.style.willChange = "transform";
          if (rising) {
            c.style.position = "relative";
            c.style.zIndex = "2";
          }
          const done = () => {
            c.style.willChange = "";
            c.style.position = "";
            c.style.zIndex = "";
          };
          c.animate(move, { duration: sp, delay, easing: curve, fill: "backwards" }).finished.then(done, done);
        });
      } else {
        // Nothing travels: the team's words arrive at their new row, after the slot's old words left.
        cells.forEach((c) => c.animate([{ opacity: 0 }, { opacity: 1 }], { duration: fx, delay: fast, easing: curve, fill: "backwards" }));
      }
      timers.current.push(window.setTimeout(() => el.classList.add("pledger__row--moved"), ringAt));
      timers.current.push(window.setTimeout(() => el.classList.remove("pledger__row--moved"), ringAt + HOLD_MARK));
    });
  }, [key]);
  useEffect(() => {
    const list = timers.current;
    return () => list.forEach((t) => clearTimeout(t));
  }, []);
  return (team: number) => (el: HTMLLIElement | null) => {
    if (el) rows.current.set(team, el);
    else rows.current.delete(team);
  };
}

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
        <span className="board__score">
          <Swap text={numbers(g)} />
        </span>
      </p>
    </div>
  );
}

// One ledger row: the place, the team, its extra credit, and its numbers under the name.
function LedgerRow({ g, mine, row }: { g: Row; mine: boolean; row?: (el: HTMLLIElement | null) => void }) {
  return (
    <li className="pledger__row" ref={row}>
      <span className="pledger__place n">{g.rank}</span>
      <TeamChip color={g.color} label={<Name g={g} mine={mine} />} />
      <Credit g={g} />
      <span className="board__score">
        <Swap text={numbers(g)} />
      </span>
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
  // A team alone in 1st (ranks come sorted from the server, so ties for 1st come first).
  const alone = top !== undefined && shown.filter((g) => g.rank === top.rank).length === 1;
  const ledger = many || !alone ? shown : rest;
  const row = useReorder(board === undefined ? [] : ledger.map((g) => g.team));
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
          {/* With no 1st place block the ledger takes the block's column too. */}
          <div className="lbgrid stageboard" style={!many && !alone ? { gridTemplateColumns: "minmax(0, 1fr)" } : undefined}>
            {!many && alone && <First g={top} mine={top.team === me?.team} />}
            <div className="pledger">
              <ol className={alone ? cls : cls + " board--tied"}>
                {ledger.map((g) => (
                  <LedgerRow key={g.team} g={g} mine={g.team === me?.team} row={row(g.team)} />
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
