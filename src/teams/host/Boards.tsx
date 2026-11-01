// #/host Points: the teams students see on their phones (convex/live/groups.ts), every student
// checked in to this class with their points, the professor's point changes with Undo, End class,
// and the saved extra credit as a CSV. Page.tsx puts the page behind StaffGate.
import { useRef, useState } from "react";
import { useConvex, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../../convex/_generated/api";
import { CHANNEL } from "../../blocks/deck";
import { Card, Status } from "../../blocks/ui";
import { Badge, Banner, Button, ConfirmButton, Field, Segmented } from "../../blocks/kit";
import { TeamChip, errorText } from "./Team";
import { localDate } from "../checkin/sheet";
import { allResults, extraCreditCsv } from "./csv";
import "./points.css";

type Teams = FunctionReturnType<typeof api.live.groups.leaderboard>["teams"];
type TeamStatus = FunctionReturnType<typeof api.live.groups.status>;
type Student = FunctionReturnType<typeof api.live.groups.roster>[number];

const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;
// Extra credit: whole numbers as they are, a split place to one decimal.
const credit = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
const signed = (n: number) => (n > 0 ? `+${n}` : `−${-n}`);
const clock = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const SUFFIX: Record<number, string> = { 1: "st", 2: "nd", 3: "rd" };
const ordinal = (n: number) => n + (n % 100 >= 11 && n % 100 <= 13 ? "th" : (SUFFIX[n % 10] ?? "th"));

// Runs a change once per button: a second press while it's on its way does nothing, and the
// button shows it's busy. Keeps the last error for the card to show.
function useChanges() {
  const running = useRef(new Set<string>());
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState("");
  async function run(key: string, change: () => Promise<unknown>): Promise<boolean> {
    if (running.current.has(key)) return false;
    running.current.add(key);
    setBusy(new Set(running.current));
    setError("");
    try {
      await change();
      return true;
    } catch (e) {
      setError(errorText(e));
      return false;
    } finally {
      running.current.delete(key);
      setBusy(new Set(running.current));
    }
  }
  return { busy, error, run };
}

// The whole Points tab: Teams, Point changes and End of class on the left, Students on the right.
export function PointsTab() {
  const board = useQuery(api.live.groups.leaderboard, { channel: CHANNEL });
  const teams = board?.teams.filter((g) => g.members > 0);
  return (
    <div className="points">
      <div className="points__side">
        <TeamsCard teams={teams} />
        <ChangesCard />
        <EndCard />
      </div>
      <StudentsCard teams={teams} />
    </div>
  );
}

function lockLine(status: TeamStatus) {
  if (status.locked) return "Teams are final.";
  if (status.locksAt === null) return "Teams lock 5 minutes after the first check-in.";
  return `Teams lock at ${clock(status.locksAt)}.`;
}

// Team size, then every team with students: place, points, extra credit, and +1 and -1.
function TeamsCard({ teams }: { teams: Teams | undefined }) {
  const status = useQuery(api.live.groups.status, { channel: CHANNEL });
  const setSize = useMutation(api.live.groups.setSize);
  const adjust = useMutation(api.live.groups.adjust);
  const { busy, error, run } = useChanges();
  const size = status ? (String(status.size) as "3" | "4") : null;
  return (
    <Card title="Teams">
      <div className="row points-size">
        <Segmented
          label="Team size"
          hideLabel
          value={size}
          options={[
            { value: "3", label: "Teams of 3" },
            { value: "4", label: "Teams of 4" },
          ]}
          disabled={!status || busy.has("size")}
          onChange={(v) => void run("size", () => setSize({ channel: CHANNEL, size: Number(v) }))}
        />
        {status && <p className="muted points-size__lock">{lockLine(status)}</p>}
      </div>
      {teams === undefined ? (
        <Status kind="loading">Loading the teams…</Status>
      ) : teams.length === 0 ? (
        <Status kind="empty">No teams yet. Each student joins a team when they check in.</Status>
      ) : (
        <ol className="points-teams">
          {teams.map((g) => {
            const tied = teams.filter((x) => x.rank === g.rank).length > 1;
            const score = g.changes === 0 ? `${g.correct} right` : `${plural(g.points, "point")} (${g.correct} right, ${signed(g.changes)})`;
            return (
              <li key={g.team} className="points-team">
                <div className="points-team__main">
                  <p className="points-team__head">
                    <TeamChip color={g.color} label={g.label} />
                    <Badge tone={g.ec > 0 ? "accent" : "neutral"}>{ordinal(g.rank) + (tied ? ", tied" : "")}</Badge>
                  </p>
                  <p className="points-team__line">
                    {plural(g.members, "student")} · {score} · {g.perStudent.toFixed(1)} per student · +{credit(g.ec)} extra credit
                  </p>
                </div>
                <div className="points-act">
                  <Button small variant="secondary" busy={busy.has(`team ${g.team} +1`)} aria-label={`Give ${g.label} 1 point`} onClick={() => void run(`team ${g.team} +1`, () => adjust({ channel: CHANNEL, team: g.team, delta: 1 }))}>
                    +1
                  </Button>
                  <Button small variant="secondary" busy={busy.has(`team ${g.team} -1`)} aria-label={`Take 1 point off ${g.label}`} onClick={() => void run(`team ${g.team} -1`, () => adjust({ channel: CHANNEL, team: g.team, delta: -1 }))}>
                    −1
                  </Button>
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {error && <Status kind="error">{error}</Status>}
    </Card>
  );
}

// Every student checked in to this class, best first. A filter per team, and +1 and -1 per
// student with an optional reason.
function StudentsCard({ teams }: { teams: Teams | undefined }) {
  const rows = useQuery(api.live.groups.roster, { channel: CHANNEL });
  const adjust = useMutation(api.live.groups.adjust);
  const { busy, error, run } = useChanges();
  const [pick, setPick] = useState<number | "all">("all");
  const [reason, setReason] = useState("");
  const filter = pick !== "all" && teams?.some((g) => g.team === pick) ? pick : "all";
  const shown = rows?.filter((r) => filter === "all" || r.team?.team === filter);
  // Places go by points: students with the same points share a place.
  const place = (r: Student) => {
    const ahead = rows!.filter((x) => x.points > r.points).length;
    const tied = rows!.filter((x) => x.points === r.points).length > 1;
    return ordinal(ahead + 1) + (tied ? ", tied" : "");
  };
  async function change(r: Student, delta: number) {
    const why = reason.trim();
    const done = await run(`${r.checkin} ${delta}`, () => adjust({ channel: CHANNEL, checkin: r.checkin, delta, ...(why ? { reason: why } : {}) }));
    if (done && why) setReason("");
  }
  return (
    <Card title="Students">
      <div className="points-filter" role="group" aria-label="Students to show">
        <Button small variant="secondary" aria-pressed={filter === "all"} onClick={() => setPick("all")}>
          Everyone
        </Button>
        {teams?.map((g) => (
          <Button key={g.team} small variant="secondary" aria-pressed={filter === g.team} onClick={() => setPick(filter === g.team ? "all" : g.team)}>
            <TeamChip color={g.color} label={g.label} />
          </Button>
        ))}
      </div>
      <Field label="Reason (optional)" hint="Saved with the next +1 or −1 you give a student.">
        {(f) => <input {...f} type="text" value={reason} maxLength={80} onChange={(e) => setReason(e.target.value)} />}
      </Field>
      {shown === undefined ? (
        <Status kind="loading">Loading the students…</Status>
      ) : shown.length === 0 ? (
        <Status kind="empty">{filter === "all" ? "No students checked in to this class yet." : "Nobody on this team is checked in."}</Status>
      ) : (
        <div className="table-scroll">
          <table className="points-table">
            <thead>
              <tr>
                <th scope="col">Place</th>
                <th scope="col">Name</th>
                <th scope="col">Team</th>
                <th scope="col">Right</th>
                <th scope="col">Points</th>
                <th scope="col">Extra credit saved</th>
                <th scope="col">
                  <span className="sr-only">Change points</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.checkin}>
                  <td>{place(r)}</td>
                  <td>{r.name}</td>
                  <td>{r.team ? <TeamChip color={r.team.color} label={r.team.label} /> : <span className="muted">No team</span>}</td>
                  <td>{r.right}</td>
                  <td>{r.points}</td>
                  <td>{credit(r.ec)}</td>
                  <td>
                    <div className="points-act">
                      <Button small variant="secondary" busy={busy.has(`${r.checkin} 1`)} aria-label={`Give ${r.name} 1 point`} onClick={() => void change(r, 1)}>
                        +1
                      </Button>
                      <Button small variant="secondary" busy={busy.has(`${r.checkin} -1`)} aria-label={`Take 1 point off ${r.name}`} onClick={() => void change(r, -1)}>
                        −1
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {error && <Status kind="error">{error}</Status>}
    </Card>
  );
}

// This class's point changes, newest first, each with Undo.
function ChangesCard() {
  const log = useQuery(api.live.groups.pointLog, { channel: CHANNEL });
  const undo = useMutation(api.live.groups.removePoints);
  const { busy, error, run } = useChanges();
  return (
    <Card title="Point changes">
      {log === undefined ? (
        <Status kind="loading">Loading the point changes…</Status>
      ) : log.length === 0 ? (
        <Status kind="empty">No point changes in this class yet.</Status>
      ) : (
        <ul className="list points-log">
          {log.map((c) => {
            const who = c.name ?? (c.team ? c.team.label : "A student who isn't checked in now");
            return (
              <li key={c.id} className="points-log__row">
                <span className="points-log__delta">{signed(c.delta)}</span>
                <span className="points-log__what">
                  {c.name !== null && <span className="points-log__name">{c.name}</span>}
                  {c.team && <TeamChip color={c.team.color} label={c.team.label} />}
                  {c.name === null && !c.team && <span>{who}</span>}
                  <span className="muted points-log__why">
                    {c.reason} · {clock(c.at)}
                  </span>
                </span>
                <Button small variant="quiet" busy={busy.has(c.id)} aria-label={`Undo ${signed(c.delta)} for ${who}`} onClick={() => void run(c.id, () => undo({ id: c.id }))}>
                  Undo
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      {error && <Status kind="error">{error}</Status>}
    </Card>
  );
}

// End class (live.groups.endDay, the same as End class on #/checkin/teacher, with the same name and
// question), and the saved extra credit as a CSV. The line End day returns shows until the next
// class opens. Page.tsx keeps this tab mounted, so without that the line about last class would
// sit under this class's board.
function EndCard() {
  const classes = useQuery(api.checkin.attendance.lectures, { channel: CHANNEL });
  const endDay = useMutation(api.live.groups.endDay);
  // The class open when End class was pressed (null when none was, or the list hadn't loaded),
  // and the line End day returned.
  const [ended, setEnded] = useState<{ lecture: string | null; line: string } | null>(null);
  const open = classes?.find((c) => c.open);
  let line = ended?.line ?? "";
  // A class opened since then, so the line was about the class before it.
  if (ended && open && open.lecture !== ended.lecture) {
    setEnded(null);
    line = "";
  }
  return (
    <Card title="End of class">
      <div className="row">
        <ConfirmButton
          question="End this class? Each student gets their team's extra credit now. Next class, everyone checks in again and points start from 0. This can't be undone."
          confirm="End class"
          onConfirm={async () => {
            const lecture = open?.lecture ?? null;
            setEnded(null);
            setEnded({ lecture, line: await endDay({ channel: CHANNEL }) });
          }}
        >
          End class
        </ConfirmButton>
        <Download />
      </div>
      {line && <Banner tone="info">{line}</Banner>}
    </Card>
  );
}

// Saves the extra credit CSV as extra-credit-gdg-2026-11-05.csv, named with the local date (the
// UTC date names an evening class's file for the next day). Same steps as saveCsv in
// ../checkin/sheet.ts: Safari starts the download after the click returns, so the link goes on
// the page for the click and the file's URL stays a while.
export function saveExtraCredit(text: string, now = Date.now()) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `extra-credit-${CHANNEL}-${localDate(now)}.csv`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

// "Download extra credit (CSV)": every class's saved extra credit, read when pressed.
function Download() {
  const convex = useConvex();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ kind: "empty" | "error"; text: string } | null>(null);
  async function save() {
    setBusy(true);
    setNote(null);
    try {
      const rows = await allResults((cursor) => convex.query(api.live.groups.results, { channel: CHANNEL, paginationOpts: { numItems: 200, cursor } }));
      if (rows.length === 0) {
        setNote({ kind: "empty", text: "No extra credit saved yet. End class saves it." });
        return;
      }
      saveExtraCredit(extraCreditCsv(rows));
    } catch (e) {
      setNote({ kind: "error", text: errorText(e) });
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Button variant="secondary" busy={busy} onClick={() => void save()}>
        Download extra credit (CSV)
      </Button>
      {note && <Status kind={note.kind}>{note.text}</Status>}
    </>
  );
}
