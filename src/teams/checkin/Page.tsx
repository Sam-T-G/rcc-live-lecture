// Check-in team. Two portals:
//   #/checkin/student (also #/checkin/join): sign in, and the phone shows your QR pass.
//   #/checkin/teacher (also #/checkin/kiosk): hosts only. The laptop camera reads passes
//   and the list of who's here fills in live.
//   #/checkin/quiz: hosts only. Ask the room a quiz question or a vote (Quiz.tsx).
import { useEffect, useRef, useState, type FormEvent } from "react";
import "./checkin.css";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Link, useRoute } from "../../blocks/router";
import { Big, Card, Screen, Status } from "../../blocks/ui";
import { QR } from "../../blocks/qr";
import { CHANNEL } from "../../blocks/deck";
import { SignInButton, useGoogleUser } from "../../blocks/auth";
import { useCamera } from "../../blocks/vision";
import LateBanner from "./LateBanner";
import Kiosk from "./Kiosk";
import Stage from "./Stage";
import { ProfGate, useProfKey } from "./prof";
import { Professor, QuizCard } from "./Quiz";

// The words a ConvexError carries, or a plain fallback.
function why(e: unknown) {
  const x = e as { data?: unknown };
  return typeof x?.data === "string" ? x.data : "Something went wrong. Try again.";
}

export default function CheckinPage() {
  const [, part = "student"] = useRoute();
  if (part === "kiosk") return <Kiosk />;
  if (part === "stage") return <Stage />;
  if (part === "quiz") return <Professor />;
  return part === "teacher" ? <Teacher /> : <Student />;
}

// ---------- Student portal ----------

function Student() {
  const { user } = useGoogleUser();
  if (!user)
    return (
      <Screen title="Your check-in pass">
        <p>Sign in with Google to get your pass.</p>
        <SignInButton />
      </Screen>
    );
  return <StudentPass />;
}

function StudentPass() {
  const pass = useQuery(api.checkin.pass.mine);
  const here = useQuery(api.checkin.read.me, { channel: CHANNEL });
  const refresh = useMutation(api.checkin.pass.refresh);
  const [err, setErr] = useState("");

  // Ask for a new code every 5 s; the server only changes it once the old one is 20 s old.
  useEffect(() => {
    if (here) return;
    const tick = () => refresh().then(() => setErr("")).catch((e) => setErr(why(e)));
    tick();
    const t = setInterval(tick, 5000);
    return () => clearInterval(t);
  }, [here, refresh]);

  if (here)
    return (
      <Screen title="You’re checked in.">
        <QuizCard />
        <p><Link to="live">Follow the slides</Link></p>
        <HideLate />
        <LateBanner />
      </Screen>
    );
  if (err) return <Screen title="Your check-in pass"><Status kind="error">{err}</Status></Screen>;
  if (!pass) return <Screen title="Your check-in pass"><Status kind="loading">Making your pass…</Status></Screen>;
  return (
    <Screen title="Show this to your teacher">
      <div className="pass">
        <QR value={"RCC-" + pass.code} size={280} />
        <p className="pass__name">{pass.name}</p>
        <p className="muted">{pass.email}</p>
        <p className="pass__code">{pass.code}</p>
        <p className="muted">The code changes every 20 seconds, so a screenshot won’t work.</p>
        <HideLate />
      </div>
      <LateBanner />
    </Screen>
  );
}

const clock = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

// The host sets when class starts and the grace minutes. Check-ins after that are late.
function ClassStart() {
  const start = useQuery(api.checkin.attendance.classStart, { channel: CHANNEL });
  const key = useProfKey();
  const set = useMutation(api.checkin.attendance.setClassStart);
  const [time, setTime] = useState("14:30");
  const [grace, setGrace] = useState("5");
  const [err, setErr] = useState("");

  function save(e: FormEvent) {
    e.preventDefault();
    const [h, m] = time.split(":").map(Number);
    const d = new Date();
    d.setHours(h, m, 0, 0);
    set({ channel: CHANNEL, key, startsAt: d.getTime(), graceMin: Number(grace) || 0 }).then(() => setErr("")).catch((x) => setErr(why(x)));
  }

  return (
    <form className="row" onSubmit={save}>
      <label>Class starts <input type="time" value={time} onChange={(e) => setTime(e.target.value)} required /></label>
      <label>Late after <input type="number" min={0} max={60} value={grace} onChange={(e) => setGrace(e.target.value)} className="late__grace" /> min</label>
      <button type="submit" className="quiet">Save</button>
      <span className="muted">
        {start ? `Late after ${clock(start.startsAt + start.graceMin * 60_000)}` : "No start time yet, so nobody is late."}
      </span>
      {err && <Status kind="error">{err}</Status>}
    </form>
  );
}

// The attendance sheet for the professor: name, email, time in, minutes late.
function Download() {
  const key = useProfKey();
  const sheet = useQuery(api.checkin.attendance.sheet, { channel: CHANNEL, key });
  if (!sheet) return null;
  function save() {
    const cell = (x: string) => `"${x.replace(/"/g, '""')}"`;
    const rows = [["Name", "Email", "Checked in", "Minutes late"], ...sheet!.map((r) => [r.name, r.email, new Date(r.at).toLocaleString(), r.lateMin === null ? "0" : String(r.lateMin)])];
    const blob = new Blob([rows.map((r) => r.map(cell).join(",")).join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `attendance-${CHANNEL}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }
  const late = sheet.filter((r) => r.lateMin !== null).length;
  return (
    <p className="row">
      <button onClick={save} disabled={sheet.length === 0}>Download attendance (CSV)</button>
      <span className="muted">{late} late</span>
    </p>
  );
}

// Late check-ins put your first name on everyone's slides. This turns that off for you.
function HideLate() {
  const hide = useQuery(api.checkin.attendance.myHideLate);
  const set = useMutation(api.checkin.attendance.setHideLate);
  if (hide === undefined) return null;
  return (
    <label className="row muted">
      <input type="checkbox" checked={hide} onChange={(e) => set({ hide: e.target.checked }).catch(() => {})} />
      Don’t put my name on the slides if I’m late
    </label>
  );
}

// ---------- Teacher portal ----------

function Teacher() {
  return <ProfGate title="Teacher check-in"><Scanner /></ProfGate>;
}

type Result = { ok: true; name: string; email: string; already: boolean } | { ok: false; text: string };

// Chrome and Edge read QR codes on their own (BarcodeDetector). Safari and Firefox don't,
// so those get the typed code only.
type Detector = { detect: (src: HTMLVideoElement) => Promise<{ rawValue: string }[]> };
function makeDetector(): Detector | null {
  const BD = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
  return BD ? new BD({ formats: ["qr_code"] }) : null;
}

function Scanner() {
  const count = useQuery(api.checkin.read.count, { channel: CHANNEL });
  const key = useProfKey();
  const names = useQuery(api.checkin.read.names, { channel: CHANNEL, key });
  const scan = useMutation(api.checkin.pass.scan);
  const cam = useCamera();
  const [detector] = useState(makeDetector);
  const [result, setResult] = useState<Result | null>(null);
  const [typed, setTyped] = useState("");
  const last = useRef({ code: "", at: 0 });

  async function send(code: string) {
    // The camera sees the same pass many times a second; send each code once per 4 s.
    const now = Date.now();
    if (code === last.current.code && now - last.current.at < 4000) return;
    last.current = { code, at: now };
    try {
      setResult({ ok: true, ...(await scan({ channel: CHANNEL, code, key })) });
    } catch (e) {
      setResult({ ok: false, text: why(e) });
    }
  }
  const sendRef = useRef(send);
  useEffect(() => { sendRef.current = send; });

  // Read the camera 4 times a second while it's on.
  useEffect(() => {
    if (!cam.on || !detector) return;
    let busy = false;
    const t = setInterval(async () => {
      const v = cam.video.current;
      if (busy || !v || v.readyState < 2) return;
      busy = true;
      try {
        const found = await detector.detect(v);
        const raw = found.find((f) => f.rawValue.startsWith("RCC-"))?.rawValue;
        if (raw) await sendRef.current(raw);
      } catch { /* a frame that fails to read is skipped */ }
      busy = false;
    }, 250);
    return () => clearInterval(t);
  }, [cam.on, cam.video, detector]);

  return (
    <Screen title="Teacher check-in" wide>
      <div className="scanner">
        <div>
          <video ref={cam.video} className={cam.on ? "scanner__video" : "scanner__video scanner__video--off"} muted playsInline />
          <p className="row">
            {cam.on
              ? <button className="quiet" onClick={cam.stop}>Stop camera</button>
              : <button onClick={() => cam.start()} disabled={!detector}>Start scanning</button>}
          </p>
          {!detector && <Status kind="empty">This browser can’t read QR codes. Open this page in Chrome, or type the code below.</Status>}
          {cam.error && <Status kind="error">{cam.error}</Status>}
          <form className="row" onSubmit={(e) => { e.preventDefault(); if (typed.trim()) { last.current.code = ""; send(typed); setTyped(""); } }}>
            <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Code on their phone" aria-label="Code on their phone" autoCapitalize="characters" />
            <button type="submit" className="quiet">Check in</button>
          </form>
          {result && (result.ok
            ? <Card title={result.already ? "Already checked in" : "Checked in"}><p className="pass__name">{result.name}</p><p className="muted">{result.email}</p></Card>
            : <Status kind="error">{result.text}</Status>)}
        </div>
        <div>
          <ClassStart />
          <p className="row"><Link to="checkin/quiz">Ask a question or start a vote</Link></p>
          <Big value={count ?? "…"} label="checked in" />
          <Download />
          {names && names.length === 0 && <Status kind="empty">No one yet.</Status>}
          <ul className="scanner__names">
            {(names ?? []).map((n) => <li key={n.at + n.name}>{n.name} <span className="muted">{new Date(n.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span></li>)}
          </ul>
        </div>
      </div>
    </Screen>
  );
}
