// #/checkin/teacher: attendance on the professor's laptop, for professors and admins (StaffGate).
// Everything on it is for the class running now (convex/checkin/attendance.ts says what a class
// is). The laptop camera reads students' passes (makeQrReader in qrRead.ts: the browser's own
// reader in Chrome on a Mac, jsQR in Safari, Firefox and Chrome on Windows), or the professor
// types the code from a student's phone. The page lists who checked in, each with a Remove for a
// wrong check-in; the professor sets when class starts and how many minutes of grace come before
// "late"; and downloads attendance as a CSV for this class or any past one. End class, next to the
// status line, ends the class (the same End class, live.groups.endDay, as the Professor view's
// Points tab).
// The page: the staff bar (StaffGate), the count line and the status line, then the side column
// (the scanner card, the page's one raised card, and Class start) and the main column (This class
// and Past classes, each a list in a well). The side column comes first in the page, so it stays on
// top in one column; with two columns teacher.css puts the main column on the left.
import "./teacher.css";
import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type RefObject } from "react";
import { useConvex, useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Badge, Banner, Button, ConfirmButton, Field, Icon } from "../../blocks/kit";
import { Link } from "../../blocks/router";
import { Card, ErrorBoundary, Screen, Status } from "../../blocks/ui";
import { CHANNEL } from "../../blocks/deck";
import { useCamera } from "../../blocks/camera";
import { makeQrReader, scannerLoadFailed, SCANNER_DIDNT_LOAD } from "./qrRead";
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
import { END_CLASS_QUESTION, STILL_OPEN, clock, scanError, scanOpensAt, why } from "./util";

const MIN = 60_000;

export function Teacher() {
  return (
    <StaffGate title="Attendance" bar>
      <Scanner />
    </StaffGate>
  );
}

// Each part that reads its own data has its own ErrorBoundary, so a list that fails to load
// leaves the camera and the typed code working. The title is in the staff bar (StaffGate).
export function Scanner() {
  return (
    <div className="staff-page">
      <Screen wide>
        <div className="att-head">
          <ErrorBoundary label="The counts">
            <Counts />
          </ErrorBoundary>
          <Link to="checkin/quiz" className="link att-head__link">
            Start a quiz or a vote
            <Icon name="chevron-right" />
          </Link>
        </div>
        <div className="row att-status">
          <ErrorBoundary label="The class status">
            <ClassStatus />
          </ErrorBoundary>
          <ErrorBoundary label="The End class button">
            <EndClass />
          </ErrorBoundary>
        </div>
        <div className="desk att-desk">
          <div className="att-side">
            <ScanPasses />
            <ErrorBoundary label="The class start">
              <ClassStart />
            </ErrorBoundary>
          </div>
          <div className="att-main">
            <section className="att-sec">
              <h2>This class</h2>
              <ErrorBoundary label="This class's attendance">
                <Download />
                <Names />
              </ErrorBoundary>
            </section>
            <ErrorBoundary label="Past classes">
              <PastClasses />
            </ErrorBoundary>
          </div>
        </div>
      </Screen>
    </div>
  );
}

// How many checked in to this class, and how many of them late: the page's lead number, with the
// late count on its baseline. Each number is a still block until it loads.
function Counts() {
  const names = useQuery(api.checkin.read.names, { channel: CHANNEL });
  const sheet = useQuery(api.checkin.attendance.sheet, { channel: CHANNEL });
  const late = sheet?.filter((r) => r.lateMin !== null).length;
  const here = names?.length;
  const pending = <span className="skel skel--num" />;
  return (
    <p className={here ? "tally tally--accent staffhead att-count" : "tally staffhead att-count"} aria-busy={here === undefined || late === undefined || undefined}>
      <span className="tally__lead">{here ?? pending}</span>
      <span className="tally__w">checked in</span>
      <span className="tally__rest">
        <b>{late ?? pending}</b> late
      </span>
    </p>
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
        question={END_CLASS_QUESTION}
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

// n counts the results, so each one starts LastScan afresh; at is when a refusal came back.
type Result = ({ ok: true; name: string; email: string; already: boolean } | { ok: false; text: string; at: number }) & { n: number };

// The camera and the typed code. A pass the camera reads, or a code typed in, checks that
// student in to this class.
export function ScanPasses() {
  const scan = useMutation(api.checkin.pass.scan);
  const cam = useCamera();
  const [read] = useState(makeQrReader);
  const [noScanner, setNoScanner] = useState(false); // jsQR's file didn't load (qrRead.ts)
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
      setResult((was) => ({ ok: false, text: why(e), at: Date.now(), n: (was?.n ?? 0) + 1 }));
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
        setNoScanner(false);
        if (raw && raw.startsWith("RCC-")) await sendRef.current(raw);
      } catch (e) {
        // A frame that fails to read is skipped; a scanner that didn't load says so.
        if (scannerLoadFailed(e)) setNoScanner(true);
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

  // The scanner card: the camera well (the video stays mounted, so start() can hand it the
  // picture), the last scan's result under it, then the typed code.
  return (
    <section className="focal att-scan">
      <div className={cam.on ? "cam att-cam is-on" : cam.error ? "cam cam--off att-cam has-msg" : "cam cam--off att-cam"}>
        <video ref={cam.video} className={cam.on ? "scanner__video" : "scanner__video scanner__video--off"} muted playsInline />
        <span className="cam__corners" aria-hidden="true">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none">
            <polyline points="0 18 0 0 18 0" />
            <polyline points="82 0 100 0 100 18" />
            <polyline points="100 82 100 100 82 100" />
            <polyline points="18 100 0 100 0 82" />
          </svg>
        </span>
        <div className="att-cam__act">
          {cam.error && <Status kind="error">{cam.error}</Status>}
          <p className="row">
            {cam.on ? (
              <Button variant="neutral" onClick={cam.stop}>
                Stop camera
              </Button>
            ) : (
              <Button onClick={() => void cam.start()}>Start scanning</Button>
            )}
          </p>
        </div>
      </div>
      {cam.on && noScanner && <Status kind="error">{SCANNER_DIDNT_LOAD}</Status>}
      {result && (
        <ErrorBoundary key={result.n} label="The last check-in">
          <LastScan result={result} />
        </ErrorBoundary>
      )}
      <form className="att-code" onSubmit={sendTyped}>
        <Field label="Code on their phone">
          {(f) => (
            <input
              {...f}
              className="input input--code"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
            />
          )}
        </Field>
        <Button type="submit" variant="secondary">
          Check in
        </Button>
      </form>
    </section>
  );
}

// The last scan's result, while the class it was for is open. That class is the one open when the
// result first shows; when none was, a scan that checked someone in opened one, so it's the first
// class that opens after. Once that class ends (End class here or on #/host, or the 12-hour close)
// or another one opens, the result goes, so a name from last class never shows in this one. A
// refused scan opened nothing, so its error goes as soon as any class opens. A class opened the
// evening before by saving the next morning's start takes scans from 45 minutes before that start
// (convex/lib.ts notOpenYet): a scan refused before then says when, and its error goes at that
// time, re-rendering then as ClassStatus does.
function LastScan({ result }: { result: Result }) {
  const classes = useQuery(api.checkin.attendance.lectures, { channel: CHANNEL });
  const openRow = classes?.find((c) => c.open);
  const open = classes === undefined ? undefined : (openRow?.lecture ?? null);
  // The class this result belongs to: undefined until the list loads, null while none is open.
  const [own, setOwn] = useState<string | null | undefined>(undefined);
  const opens = scanOpensAt(openRow?.startsAt);
  const [, rerender] = useState(0);
  useEffect(() => {
    const wait = result.ok || opens === null ? 0 : opens - Date.now();
    if (wait <= 0) return;
    // setTimeout fires at once for a wait over 2^31 - 1 ms (about 24 days).
    const t = setTimeout(() => rerender((n) => n + 1), Math.min(wait, 2 ** 31 - 1));
    return () => clearTimeout(t);
  }, [result.ok, opens]);
  let mine = own;
  if (open !== undefined && (mine === undefined || (mine === null && open !== null && result.ok))) {
    setOwn(open);
    mine = open;
  }
  if (open !== undefined && open !== mine) return null;
  if (!result.ok && opens !== null && result.at < opens && Date.now() >= opens) return null;
  // One 120 panel for every result, so the code field under it holds its y: a check-in is the
  // st-in panel with the check, one already in is the waiting tone with the repeat glyph, a refusal
  // the stop tone with the warning glyph and the reason (role=alert). The headline, the name and
  // the reason each sit in a mask they rise through (teacher.css, staff-scan-in).
  return result.ok ? (
    <div className={result.already ? "scanres att-result att-result--again" : "scanres att-result"}>
      <Icon name={result.already ? "repeat" : "check"} />
      <Card>
        <div className="att-result__mask">
          <h2>{result.already ? "Already checked in" : "Checked in"}</h2>
        </div>
        <div className="att-result__mask">
          <p className="pass__name">{result.name}</p>
        </div>
        <p className="muted">{result.email}</p>
      </Card>
    </div>
  ) : (
    <div className="scanres att-result att-result--stop">
      <Icon name="warning" />
      <div className="att-result__mask">
        <p className="att-result__reason" role="alert">
          {scanError(result.text, openRow?.startsAt)}
        </p>
      </div>
    </div>
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
  const sheet = useQuery(api.checkin.attendance.sheet, { channel: CHANNEL });
  const set = useMutation(api.checkin.attendance.setClassStart);
  // What the professor typed; null shows the saved (or the last class's) value.
  const [time, setTime] = useState<string | null>(null);
  const [grace, setGrace] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  // The same time a day earlier, offered when the time typed is more than 12 hours away.
  const [offer, setOffer] = useState<number | null>(null);
  // The start the server refused because this class is still open (STILL_OPEN), offered again
  // with sameClass under "Save anyway".
  const [anyway, setAnyway] = useState<number | null>(null);

  const lastClass = classes?.find((c) => !c.open && c.startsAt !== null);
  const base = start ?? (lastClass && lastClass.startsAt !== null ? { startsAt: lastClass.startsAt, graceMin: lastClass.graceMin } : null);
  const shownTime = time ?? (base ? hhmm(base.startsAt) : "");
  const shownGrace = grace ?? String(base?.graceMin ?? 5);
  const now = Date.now();

  async function send(startsAt: number, sameClass?: true) {
    setOffer(null);
    setAnyway(null);
    const graceMin = Number(shownGrace);
    if (!shownGrace.trim() || !Number.isInteger(graceMin) || graceMin < 0 || graceMin > 60) {
      setErr("Late after has to be a whole number from 0 to 60.");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      await set(sameClass ? { channel: CHANNEL, startsAt, graceMin, sameClass } : { channel: CHANNEL, startsAt, graceMin });
      setTime(null);
      setGrace(null);
    } catch (x) {
      setErr(why(x));
      if (why(x) === STILL_OPEN && !sameClass) setAnyway(startsAt);
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

  // A section under the scanner card: the two fields side by side, the saved line and Save on one
  // row under them. On the page, not in a well, so its fields keep their edge while they wait (disabled).
  return (
    <section className="att-start-panel">
      <h2>Class start</h2>
      {/* noValidate: send() checks "Late after" and says what's wrong, in place of the browser's own bubble. */}
      <form onSubmit={save} noValidate>
        <fieldset className="att-start" disabled={start === undefined}>
          <Field label="Class starts" hint={start && !sameDay(start.startsAt, now) ? day(start.startsAt) : undefined}>
            {(f) => (
              <input
                {...f}
                className="input"
                type="time"
                value={shownTime}
                onChange={(e) => {
                  setTime(e.target.value);
                  setOffer(null);
                  setAnyway(null);
                  setErr("");
                }}
              />
            )}
          </Field>
          <Field label="Late after (minutes)">
            {(f) => <input {...f} className="input" type="number" min={0} max={60} step={1} inputMode="numeric" value={shownGrace} onChange={(e) => setGrace(e.target.value)} />}
          </Field>
          <div className="att-start__foot">
            {start !== undefined && (
              <p className="muted att-start__saved">
                {start ? `Late after ${timeOrDay(start.startsAt + start.graceMin * MIN, now)}` : "No start time yet, so nobody is late."}
              </p>
            )}
            <Button type="submit" variant="secondary" busy={busy}>
              Save
            </Button>
          </div>
        </fieldset>
      </form>
      {err && <Status kind="error">{anyway !== null ? stillOpen(anyway, sheet?.[0]) : err}</Status>}
      {anyway !== null && (
        <p className="row">
          <Button variant="secondary" small busy={busy} onClick={() => void send(anyway, true)}>
            Save anyway
          </Button>
        </p>
      )}
      {offer !== null && (
        <p className="row">
          <Button variant="secondary" small busy={busy} onClick={() => void send(offer)}>
            {`Save ${dayTime(offer)}`}
          </Button>
        </p>
      )}
    </section>
  );
}

// setClassStart refuses a start more than 45 minutes after the open class's first check-in, as the
// next class's start. That check-in can be a student who came early to this class (scans have no
// early limit while no start is saved), so this names them and when they came: Save anyway keeps
// the class open and saves the start; End class is for a start that really is the next class's.
function stillOpen(startsAt: number, first: { name: string; at: number } | undefined) {
  if (!first) return STILL_OPEN;
  return `This class is still open. Its first check-in, ${first.name} at ${clock(first.at)}, is more than 45 minutes before ${clock(startsAt)}. If ${first.name} is in this class, press Save anyway. If ${clock(startsAt)} is the next class's start, press End class, then save it.`;
}

// This class's attendance as a CSV, and how many were late, at the end of the This class heading.
export function Download() {
  const sheet = useQuery(api.checkin.attendance.sheet, { channel: CHANNEL });
  const classes = useQuery(api.checkin.attendance.lectures, { channel: CHANNEL });
  if (sheet === undefined) return null;
  const open = classes?.find((c) => c.open);
  const earlier = earlierOnly(classes);
  const late = sheet.filter((r) => r.lateMin !== null).length;
  return (
    <p className="row att-sec__act">
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

// Who checked in to this class, newest first, as rows in a well: the name, the time, and Remove.
// Remove takes a wrong check-in off, and that student's phone shows the pass again; their quiz
// and vote answers in this class go too (attendance.removeCheckin). It asks first, in a box that
// rises over its row. The check-ins from before the first class get no Remove. While the list
// loads, three rows of still blocks hold its place under the loading line.
function Names() {
  const names = useQuery(api.checkin.read.names, { channel: CHANNEL });
  const classes = useQuery(api.checkin.attendance.lectures, { channel: CHANNEL });
  const remove = useMutation(api.checkin.attendance.removeCheckin);
  const canRemove = classes !== undefined && earlierOnly(classes) === undefined;
  const list = useRef<HTMLUListElement>(null);
  useArrivals(list, names?.map((n) => n.id).join(" "));
  if (names === undefined)
    return (
      <div className="att-list-wrap" aria-busy="true">
        <Status kind="loading">Loading…</Status>
        <ul className="ruled ruled--well reg att-list" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <li key={i} className="ruled__row att-row">
              <span className="skel skel--line skel--w40" />
              <span className="skel skel--line" />
              <span />
            </li>
          ))}
        </ul>
      </div>
    );
  if (names.length === 0)
    return (
      <div className="state state--inline att-empty">
        <Status kind="empty">No one yet.</Status>
      </div>
    );
  return (
    <ul ref={list} className="ruled ruled--well reg att-list">
      {names.map((n) => (
        <li key={n.id} className="ruled__row att-row" data-row={n.id}>
          <span className="att-row__name">{n.name}</span>
          <span className="reg__time">{clock(n.at)}</span>
          <span className="att-row__action">
            {canRemove && (
              <ConfirmButton
                question={`Remove ${n.name} from this class? Their phone shows their pass again, and their quiz and vote answers in this class are removed.`}
                confirm="Remove"
                onConfirm={() => remove({ checkin: n.id })}
              >
                Remove<span className="sr-only"> {n.name}</span>
              </ConfirmButton>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

// staff-scan-in (design motion MOTION.md): a check-in that arrives while the list is showing keeps
// the kit's st-in tint (.is-new) for --hold-new, then fades on --fx-slow (.was-new). With the list
// at its top, the new row opens downward from its top edge while the rows below move down one row
// (a FLIP on transform), both on --sp-fast; with the list scrolled, scrollTop takes the new rows'
// height in the same frame, so the rows staff are reading stay put (teacher.css turns off the
// browser's own scroll anchoring, which Safari lacks). No movement under reduced motion, over 40
// rows, on the first load, or when more than 3 arrive at once (a class change, a reconnect).
// `key` is the row ids in order; the rows are read from the DOM by data-row. The classes are set
// on the DOM (React never changes a row's className), and the holds run from the arrival.
function useArrivals(list: RefObject<HTMLUListElement | null>, key: string | undefined) {
  // Each row's top inside the list's content (scroll-independent), at the last commit.
  const seen = useRef<Map<string, number> | null>(null);
  const timers = useRef<number[]>([]);
  useEffect(() => {
    const t = timers.current;
    return () => t.forEach(clearTimeout);
  }, []);
  useLayoutEffect(() => {
    if (key === undefined) return;
    const ul = list.current;
    const rows = ul ? [...ul.querySelectorAll<HTMLElement>(":scope > [data-row]")] : [];
    const top0 = ul ? ul.getBoundingClientRect().top - ul.scrollTop : 0;
    const now = new Map(rows.map((r) => [r.dataset.row!, r.getBoundingClientRect().top - top0]));
    const before = seen.current;
    seen.current = now;
    if (!ul || before === null) return;
    const fresh = rows.filter((r) => !before.has(r.dataset.row!));
    if (fresh.length === 0 || fresh.length > 3) return;
    const css = getComputedStyle(document.documentElement);
    const ms = (name: string, or: number) => {
      const v = parseFloat(css.getPropertyValue(name));
      return Number.isFinite(v) ? v : or;
    };
    const hold = ms("--hold-new", 4000);
    const out = ms("--fx-slow", 220);
    for (const r of fresh) {
      r.classList.add("is-new");
      timers.current.push(
        window.setTimeout(() => {
          r.classList.replace("is-new", "was-new");
          timers.current.push(window.setTimeout(() => r.classList.remove("was-new"), out));
        }, hold),
      );
    }
    if (matchMedia("(prefers-reduced-motion: reduce)").matches || rows.length > 40) return;
    const stay = rows.filter((r) => before.has(r.dataset.row!));
    if (ul.scrollTop > 0) {
      const anchor = stay[0];
      if (anchor) ul.scrollTop += now.get(anchor.dataset.row!)! - before.get(anchor.dataset.row!)!;
      return;
    }
    if (typeof ul.animate !== "function") return;
    const timing: KeyframeAnimationOptions = { duration: ms("--sp-fast", 200), easing: css.getPropertyValue("--ease").trim() || "ease", fill: "backwards" };
    for (const r of stay) {
      const was = before.get(r.dataset.row!)!;
      const step = was - now.get(r.dataset.row!)!;
      if (step !== 0 && was < ul.clientHeight) r.animate([{ transform: `translateY(${step}px)` }, { transform: "none" }], timing);
    }
    for (const r of fresh) r.animate([{ clipPath: "inset(0 0 100% 0)" }, { clipPath: "inset(0)" }], timing);
  }, [list, key]);
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

  // Rows in a well: the class and its date, how many checked in, and its CSV as a row action.
  return (
    <section className="att-sec">
      <h2>Past classes</h2>
      {shown === undefined ? (
        <div className="state state--inline att-empty">
          <Status kind="loading">Loading…</Status>
        </div>
      ) : shown.length === 0 ? (
        <div className="state state--inline att-empty">
          <Status kind="empty">No classes with check-ins yet.</Status>
        </div>
      ) : (
        <ul className="ruled ruled--well reg att-past">
          {shown.map((c) => (
            <li key={c.lecture} className="ruled__row att-row">
              <span className="att-row__name">
                {classLabel(c)} {c.open && <Badge tone="accent">This class</Badge>}
              </span>
              <span className="att-past__n">{c.count} checked in</span>
              <span className="att-row__action">
                <Button variant="ghost" busy={busy === c.lecture} onClick={() => void download(c)}>
                  Download CSV
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}
      {err && <Status kind="error">{err}</Status>}
    </section>
  );
}
