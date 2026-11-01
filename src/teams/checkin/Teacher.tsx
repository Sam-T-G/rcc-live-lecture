// #/checkin/teacher: attendance on the professor's laptop, for professors and admins (StaffGate).
// Everything on it is for the class running now (convex/checkin/attendance.ts says what a class
// is). The laptop camera reads students' passes (makeQrReader in qrRead.ts: the browser's own
// reader in Chrome on a Mac, jsQR in Safari, Firefox and Chrome on Windows), or the professor
// types the code from a student's phone. The page lists who checked in, each with a Remove for a
// wrong check-in; the professor sets when class starts and how many minutes of grace come before
// "late"; and downloads attendance as a CSV for this class or any past one. End class, next to the
// status line, ends the class (the same End class, live.groups.endDay, as the Professor view's
// Points tab).
import "./teacher.css";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useConvex, useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Badge, Banner, Button, ConfirmButton, Field, Stat } from "../../blocks/kit";
import { Link } from "../../blocks/router";
import { Card, ErrorBoundary, Screen, Status } from "../../blocks/ui";
import { CHANNEL } from "../../blocks/deck";
import { useCamera } from "../../blocks/camera";
import { makeQrReader } from "./qrRead";
import { StaffGate } from "./prof";
import {
  START_RANGE_MS,
  classDay,
  classFile,
  classLabel,
  dateFile,
  day,
  dayEarlier,
  dayTime,
  hhmm,
  nearestStart,
  sameDay,
  saveCsv,
  timeOrDay,
  type ClassRow,
} from "./sheet";
import { clock, why } from "./util";

const MIN = 60_000;

export function Teacher() {
  return (
    <StaffGate title="Attendance">
      <Scanner />
    </StaffGate>
  );
}

// Each part that reads its own data has its own ErrorBoundary, so a list that fails to load
// leaves the camera and the typed code working.
export function Scanner() {
  return (
    <Screen title="Attendance" wide>
      <div className="row att-status">
        <ErrorBoundary label="The class status">
          <ClassStatus />
        </ErrorBoundary>
        <ErrorBoundary label="The End class button">
          <EndClass />
        </ErrorBoundary>
      </div>
      <ErrorBoundary label="The counts">
        <Counts />
      </ErrorBoundary>
      <div className="scanner">
        <ScanPasses />
        <div>
          <ErrorBoundary label="The class start">
            <ClassStart />
          </ErrorBoundary>
          <Card title="This class">
            <ErrorBoundary label="This class's attendance">
              <Download />
              <Names />
            </ErrorBoundary>
          </Card>
          <ErrorBoundary label="Past classes">
            <PastClasses />
          </ErrorBoundary>
          <p>
            <Link to="checkin/quiz">Ask a question or start a vote</Link>
          </p>
        </div>
      </div>
    </Screen>
  );
}

// How many checked in to this class, and how many of them late.
function Counts() {
  const names = useQuery(api.checkin.read.names, { channel: CHANNEL });
  const sheet = useQuery(api.checkin.attendance.sheet, { channel: CHANNEL });
  const late = sheet?.filter((r) => r.lateMin !== null).length;
  return (
    <div className="att-stats">
      <Stat value={names?.length ?? "…"} label="checked in" accent />
      <Stat value={late ?? "…"} label="late" />
    </div>
  );
}

// Whether a class is running, and when it starts: its saved start (the time Past classes and
// "Late after" use), else when it opened. A start still ahead re-renders the line at that time,
// so "Class starts" turns to "Class started" even when no one checks in after it.
export function ClassStatus() {
  const classes = useQuery(api.checkin.attendance.lectures, { channel: CHANNEL });
  const open = classes?.find((c) => c.open);
  const at = open ? classDay(open) : null;
  const [, rerender] = useState(0);
  useEffect(() => {
    const wait = at === null ? 0 : at - Date.now();
    if (wait <= 0) return;
    // setTimeout fires at once for a wait over 2^31 - 1 ms (about 24 days).
    const t = setTimeout(() => rerender((n) => n + 1), Math.min(wait, 2 ** 31 - 1));
    return () => clearTimeout(t);
  }, [at]);
  if (classes === undefined) return <span>Loading…</span>;
  if (at === null) return <span>No class running.</span>;
  return <span>{`${at > Date.now() ? "Class starts" : "Class started"} ${dayTime(at)}`}</span>;
}

// End class, while a class is running: End day (live.groups.endDay) saves each team's extra credit
// and ends the class, so the next scan, deck press, saved start or quiz opens a new one and every
// student's phone shows the pass again. It asks first. The line End day returns shows in place of
// the button until the next class opens. When End day refuses (a quiz or vote is still open), the
// question box says why and the class stays open.
export function EndClass() {
  const classes = useQuery(api.checkin.attendance.lectures, { channel: CHANNEL });
  const endDay = useMutation(api.live.groups.endDay);
  // The class this page ended, and the line End day returned for it.
  const [ended, setEnded] = useState<{ lecture: string; line: string } | null>(null);
  const open = classes?.find((c) => c.open);
  let line = ended?.line ?? null;
  // A class opened since then, so the line was about the class before it.
  if (ended && open && open.lecture !== ended.lecture) {
    setEnded(null);
    line = null;
  }
  // Right after End day the list can still show the class open for a moment; the line shows then.
  if (open && open.lecture !== ended?.lecture)
    return (
      <ConfirmButton
        question="End this class? Each student gets their team's extra credit now. Next class, everyone checks in again and points start from 0. This can't be undone."
        confirm="End class"
        onConfirm={async () => setEnded({ lecture: open.lecture, line: await endDay({ channel: CHANNEL }) })}
      >
        End class
      </ConfirmButton>
    );
  return line ? <Banner tone="info">{line}</Banner> : null;
}

// The check-ins from before the first class ever ("earlier" in lectures) when they are what
// read.names and sheet list as this class: no class in the list, open or past. They are that
// day's record, so they download under their own date and get no Remove.
function earlierOnly(classes: ClassRow[] | undefined) {
  if (!classes || classes.some((c) => c.lecture !== "earlier")) return undefined;
  return classes.find((c) => c.lecture === "earlier");
}

// n counts the results, so each one starts LastScan afresh.
type Result = ({ ok: true; name: string; email: string; already: boolean } | { ok: false; text: string }) & { n: number };

// The camera and the typed code. A pass the camera reads, or a code typed in, checks that
// student in to this class.
function ScanPasses() {
  const scan = useMutation(api.checkin.pass.scan);
  const cam = useCamera();
  const [read] = useState(makeQrReader);
  const [result, setResult] = useState<Result | null>(null);
  const [typed, setTyped] = useState("");
  const last = useRef({ code: "", at: 0 });

  async function send(code: string) {
    // The camera sees the same pass many times a second; send each code once per 4 s.
    const now = Date.now();
    if (code === last.current.code && now - last.current.at < 4000) return;
    last.current = { code, at: now };
    try {
      const r = await scan({ channel: CHANNEL, code });
      setResult((was) => ({ ok: true, ...r, n: (was?.n ?? 0) + 1 }));
    } catch (e) {
      setResult((was) => ({ ok: false, text: why(e), n: (was?.n ?? 0) + 1 }));
    }
  }
  const sendRef = useRef(send);
  useEffect(() => {
    sendRef.current = send;
  });

  // Read the camera 4 times a second while it's on.
  useEffect(() => {
    if (!cam.on) return;
    let busy = false;
    const t = setInterval(async () => {
      const v = cam.video.current;
      if (busy || !v || v.readyState < 2) return;
      busy = true;
      try {
        const raw = await read(v);
        if (raw && raw.startsWith("RCC-")) await sendRef.current(raw);
      } catch {
        /* a frame that fails to read is skipped */
      }
      busy = false;
    }, 250);
    return () => clearInterval(t);
  }, [cam.on, cam.video, read]);

  function sendTyped(e: FormEvent) {
    e.preventDefault();
    if (!typed.trim()) return;
    last.current.code = "";
    void send(typed);
    setTyped("");
  }

  return (
    <section>
      <video ref={cam.video} className={cam.on ? "scanner__video" : "scanner__video scanner__video--off"} muted playsInline />
      <p className="row">
        {cam.on ? (
          <Button variant="secondary" onClick={cam.stop}>
            Stop camera
          </Button>
        ) : (
          <Button onClick={() => void cam.start()}>Start scanning</Button>
        )}
      </p>
      {cam.error && <Status kind="error">{cam.error}</Status>}
      <form className="att-code" onSubmit={sendTyped}>
        <Field label="Code on their phone">
          {(f) => (
            <input {...f} value={typed} onChange={(e) => setTyped(e.target.value)} autoCapitalize="characters" autoComplete="off" spellCheck={false} />
          )}
        </Field>
        <Button type="submit" variant="secondary">
          Check in
        </Button>
      </form>
      {result && (
        <ErrorBoundary key={result.n} label="The last check-in">
          <LastScan result={result} />
        </ErrorBoundary>
      )}
    </section>
  );
}

// The last scan's result, while the class it was for is open. That class is the one open when the
// result first shows; when none was, a scan that checked someone in opened one, so it's the first
// class that opens after. Once that class ends (End class here or on #/host, or the 12-hour close)
// or another one opens, the result goes, so a name from last class never shows in this one. A
// refused scan opened nothing, so its error goes as soon as any class opens.
function LastScan({ result }: { result: Result }) {
  const classes = useQuery(api.checkin.attendance.lectures, { channel: CHANNEL });
  const open = classes === undefined ? undefined : (classes.find((c) => c.open)?.lecture ?? null);
  // The class this result belongs to: undefined until the list loads, null while none is open.
  const [own, setOwn] = useState<string | null | undefined>(undefined);
  let mine = own;
  if (open !== undefined && (mine === undefined || (mine === null && open !== null && result.ok))) {
    setOwn(open);
    mine = open;
  }
  if (open !== undefined && open !== mine) return null;
  return result.ok ? (
    <Card title={result.already ? "Already checked in" : "Checked in"}>
      <p className="pass__name">{result.name}</p>
      <p className="muted">{result.email}</p>
    </Card>
  ) : (
    <Status kind="error">{result.text}</Status>
  );
}

// When this class starts and how many minutes of grace come before "late". The fields show the
// saved start; with none saved, the last class's time of day, ready to save for this one. Before
// the first class ever, the saved start can be an old day's (the classStarts row), so Save then
// uses its time of day nearest now: setClassStart refuses a start more than 12 hours away. A time
// that passed more than 6 hours ago is the next day's (nearestStart); when that is more than 12
// hours away, Save sends nothing and offers the same time a day earlier ("Save Thu Nov 5, 9:00
// AM"), for this morning's start filled in during the afternoon.
export function ClassStart() {
  const start = useQuery(api.checkin.attendance.classStart, { channel: CHANNEL });
  const classes = useQuery(api.checkin.attendance.lectures, { channel: CHANNEL });
  const set = useMutation(api.checkin.attendance.setClassStart);
  // What the professor typed; null shows the saved (or the last class's) value.
  const [time, setTime] = useState<string | null>(null);
  const [grace, setGrace] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  // The same time a day earlier, offered when the time typed is more than 12 hours away.
  const [offer, setOffer] = useState<number | null>(null);

  const lastClass = classes?.find((c) => !c.open && c.startsAt !== null);
  const base = start ?? (lastClass && lastClass.startsAt !== null ? { startsAt: lastClass.startsAt, graceMin: lastClass.graceMin } : null);
  const shownTime = time ?? (base ? hhmm(base.startsAt) : "");
  const shownGrace = grace ?? String(base?.graceMin ?? 5);
  const now = Date.now();

  async function send(startsAt: number) {
    setOffer(null);
    const graceMin = Number(shownGrace);
    if (!shownGrace.trim() || !Number.isInteger(graceMin) || graceMin < 0 || graceMin > 60) {
      setErr("Late after has to be a whole number from 0 to 60.");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      await set({ channel: CHANNEL, startsAt, graceMin });
      setTime(null);
      setGrace(null);
    } catch (x) {
      setErr(why(x));
    } finally {
      setBusy(false);
    }
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    // An unchanged time keeps the saved start's own day when setClassStart takes it.
    const at = Date.now();
    const keep = time === null && start && Math.abs(start.startsAt - at) <= START_RANGE_MS;
    const startsAt = keep ? start.startsAt : nearestStart(shownTime, at);
    if (startsAt === null) {
      setOffer(null);
      setErr("Pick the time class starts.");
      return;
    }
    const earlier = dayEarlier(startsAt, at);
    if (earlier !== null) {
      setOffer(earlier);
      setErr(`${dayTime(startsAt)} is more than 12 hours away.`);
      return;
    }
    await send(startsAt);
  }

  return (
    <Card title="Class start">
      <form onSubmit={save}>
        <fieldset className="att-start" disabled={start === undefined}>
          <Field label="Class starts" hint={start && !sameDay(start.startsAt, now) ? day(start.startsAt) : undefined}>
            {(f) => (
              <input
                {...f}
                type="time"
                value={shownTime}
                onChange={(e) => {
                  setTime(e.target.value);
                  setOffer(null);
                }}
              />
            )}
          </Field>
          <Field label="Late after (minutes)">
            {(f) => <input {...f} type="number" min={0} max={60} step={1} inputMode="numeric" value={shownGrace} onChange={(e) => setGrace(e.target.value)} />}
          </Field>
          <Button type="submit" variant="secondary" busy={busy}>
            Save
          </Button>
        </fieldset>
      </form>
      {start !== undefined && (
        <p className="muted att-start__saved">
          {start ? `Late after ${timeOrDay(start.startsAt + start.graceMin * MIN, now)}` : "No start time yet, so nobody is late."}
        </p>
      )}
      {err && <Status kind="error">{err}</Status>}
      {offer !== null && (
        <p className="row">
          <Button variant="secondary" small busy={busy} onClick={() => void send(offer)}>
            {`Save ${dayTime(offer)}`}
          </Button>
        </p>
      )}
    </Card>
  );
}

// This class's attendance as a CSV, and how many were late.
export function Download() {
  const sheet = useQuery(api.checkin.attendance.sheet, { channel: CHANNEL });
  const classes = useQuery(api.checkin.attendance.lectures, { channel: CHANNEL });
  if (sheet === undefined) return null;
  const open = classes?.find((c) => c.open);
  const earlier = earlierOnly(classes);
  const late = sheet.filter((r) => r.lateMin !== null).length;
  return (
    <p className="row">
      <Button
        variant="secondary"
        small
        disabled={sheet.length === 0 || classes === undefined}
        onClick={() => saveCsv(sheet, open ? classFile(open) : earlier ? classFile(earlier) : dateFile(Date.now()))}
      >
        Download attendance (CSV)
      </Button>
      <span className="muted">{late} late</span>
    </p>
  );
}

// Who checked in to this class, newest first. Remove takes a wrong check-in off, and that
// student's phone shows the pass again. The check-ins from before the first class get no Remove.
function Names() {
  const names = useQuery(api.checkin.read.names, { channel: CHANNEL });
  const classes = useQuery(api.checkin.attendance.lectures, { channel: CHANNEL });
  const remove = useMutation(api.checkin.attendance.removeCheckin);
  const canRemove = classes !== undefined && earlierOnly(classes) === undefined;
  if (names === undefined) return <Status kind="loading">Loading…</Status>;
  if (names.length === 0) return <Status kind="empty">No one yet.</Status>;
  return (
    <ul className="list">
      {names.map((n) => (
        <li key={n.id} className="att-row">
          <span className="att-row__main">
            <span className="att-row__name">{n.name}</span> <span className="muted">{clock(n.at)}</span>
          </span>
          {canRemove && (
            <span className="att-row__action">
              <ConfirmButton
                question={`Remove ${n.name} from this class? Their phone shows their pass again.`}
                confirm="Remove"
                onConfirm={() => remove({ checkin: n.id })}
              >
                Remove<span className="sr-only"> {n.name}</span>
              </ConfirmButton>
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

// Every class with check-ins, this one included, each with its own CSV.
function PastClasses() {
  const classes = useQuery(api.checkin.attendance.lectures, { channel: CHANNEL });
  const convex = useConvex();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const shown = classes?.filter((c) => c.count > 0);

  async function download(c: ClassRow) {
    setBusy(c.lecture);
    setErr("");
    try {
      saveCsv(await convex.query(api.checkin.attendance.sheet, { channel: CHANNEL, lecture: c.lecture }), classFile(c));
    } catch (e) {
      setErr(why(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card title="Past classes">
      {shown === undefined ? (
        <Status kind="loading">Loading…</Status>
      ) : shown.length === 0 ? (
        <Status kind="empty">No classes with check-ins yet.</Status>
      ) : (
        <ul className="list">
          {shown.map((c) => (
            <li key={c.lecture} className="att-row">
              <span className="att-row__main">
                <span className="att-row__name">{classLabel(c)}</span> {c.open && <Badge tone="accent">This class</Badge>}
                <br />
                <span className="muted">{c.count} checked in</span>
              </span>
              <span className="att-row__action">
                <Button variant="secondary" small busy={busy === c.lecture} onClick={() => void download(c)}>
                  Download CSV
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}
      {err && <Status kind="error">{err}</Status>}
    </Card>
  );
}
