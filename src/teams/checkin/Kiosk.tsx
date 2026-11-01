// #/checkin/kiosk: an iPad at the classroom door. The front camera reads the QR pass on each
// student's phone and checks them in. Works in Safari (jsQR) and Chrome. DoorGate (prof.tsx)
// opens it for a paired iPad, which scans with its device token, and for a scanner who signs in;
// anyone else gets the pairing screen.
// What the line at the door sees: how many have checked in, and for 3 s after each scan that one
// student's name ("Checked in" or "Already checked in") or what went wrong (role=alert). There's
// no list of names: names go to professors only (contracts.md), and a paired iPad can only scan.
// A student whose pass the camera can't read types the code on it into "Code on your pass". When
// the QR reader's file won't load (a deploy replaced it), the page says "The scanner didn't load.
// Reload this page." and asks for the typed code (qrRead.ts).
// Staying on: Start check-in also asks the browser to keep the screen on (the Screen Wake Lock,
// in Safari 16.4 and later and in Chrome), so Auto-Lock doesn't put the iPad to sleep between
// arrivals, and asks again each time the page shows after being hidden. Where the browser can't,
// the page says to set Auto-Lock to Never. Stop camera lets the screen sleep again. If the camera
// stops without a tap on Stop camera (another app took it, the iPad was locked), Start check-in
// comes back with "The camera stopped. Tap Start check-in."
// The look (docs/design.md "kiosk", kiosk.css): one layout in every state. The bar holds the
// count and Stop camera; the panel under it is the status band over the camera window, and the
// typed code is the strip at the bottom. A result floods the whole panel for its 3 s (Checked in
// green, Already checked in pale green, a refusal red), and so does a camera that can't read
// passes, so nothing moves between states: only the fill, the glyph and the words change.
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Big, ErrorBoundary, Status } from "../../blocks/ui";
import { Button, Field } from "../../blocks/kit";
import { CHANNEL } from "../../blocks/deck";
import { useCamera } from "../../blocks/camera";
import { makeQrReader, scannerLoadFailed, SCANNER_DIDNT_LOAD } from "./qrRead";
import { DoorGate } from "./prof";
import { scanError, why } from "./util";
import "./kiosk.css";

// The route sets the door iPad's sizes (data-surface="kiosk": 56 targets, 22 body text) for every
// screen DoorGate shows, and has its own page boundary so "Something went wrong." with Reload and
// Go home also comes at the iPad's sizes. It acts as App's does.
export default function Kiosk() {
  return (
    <div className="kiosk-route" data-surface="kiosk">
      <ErrorBoundary page>
        <DoorGate>{(device) => <KioskScanner device={device} />}</DoorGate>
      </ErrorBoundary>
    </div>
  );
}

type Result = { kind: "ok" | "again" | "error"; text: string };

// The server words two refusals for the teacher scanner ("Ask them to open their pass again.",
// convex/checkin/pass.ts NOT_A_PASS and OLD). At the door the student reads them, so they get a
// step they can take: show the pass again, or type the code it shows now. Matched on the first
// sentence; any other refusal shows as the server words it.
function forStudent(text: string, typedIn: boolean) {
  if (text.startsWith("That code isn't a pass.")) {
    return typedIn ? "That code isn't a pass. Check the code on your pass and type it again." : "That code isn't a pass. Open your pass again and hold it up.";
  }
  if (text.startsWith("That code is old.")) {
    return typedIn ? "That code is old. Type the code your pass shows now." : "That code is old. Open your pass again and hold it up.";
  }
  return text;
}

// The front camera's id once the browser shows labels (after the first allow); before
// that, useCamera falls back to facingMode "user", which is also the front camera.
async function frontCamera() {
  try {
    const cams = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "videoinput");
    return cams.find((c) => /front/i.test(c.label))?.deviceId;
  } catch { return undefined; }
}

// Keeps the screen on from keep() until letGo() or the page closes. Safari grants the first
// wake lock only during a tap, so keep() runs inside the Start check-in tap; after that it grants
// one without a tap. The browser drops the lock whenever the page is hidden, so it's asked for
// again each time the page shows. `failed`: this browser has no wake lock, or refused it.
function useWakeLock() {
  const want = useRef(false);
  const lock = useRef<WakeLockSentinel | null>(null);
  const asking = useRef(false);
  const [failed, setFailed] = useState(false);

  const ask = useCallback(() => {
    if (!want.current || asking.current || (lock.current && !lock.current.released)) return;
    const wakeLock = (navigator as Partial<Navigator>).wakeLock;
    if (!wakeLock) {
      setFailed(true);
      return;
    }
    if (document.visibilityState !== "visible") return;
    asking.current = true;
    wakeLock.request("screen").then(
      (s) => {
        asking.current = false;
        if (!want.current) {
          s.release().catch(() => {});
          return;
        }
        lock.current = s;
        setFailed(false);
      },
      () => {
        asking.current = false;
        if (want.current) setFailed(true);
      },
    );
  }, []);

  const keep = useCallback(() => {
    want.current = true;
    ask();
  }, [ask]);

  const letGo = useCallback(() => {
    want.current = false;
    setFailed(false);
    const s = lock.current;
    lock.current = null;
    if (s && !s.released) s.release().catch(() => {});
  }, []);

  useEffect(() => {
    const onShow = () => {
      if (document.visibilityState === "visible") ask();
    };
    document.addEventListener("visibilitychange", onShow);
    return () => {
      document.removeEventListener("visibilitychange", onShow);
      letGo();
    };
  }, [ask, letGo]);

  return { keep, letGo, failed };
}

// How many have checked in, as one big number. Its own part, so a count that fails to load
// leaves the scanner working.
function Count() {
  const count = useQuery(api.checkin.read.count, { channel: CHANNEL });
  if (count === undefined) return <Status kind="loading">Loading the check-in count…</Status>;
  return <Big value={count} label="checked in" />;
}

// device: the paired iPad's token, or undefined when a scanner is signed in.
export function KioskScanner({ device }: { device: string | undefined }) {
  const scan = useMutation(api.checkin.pass.scan);
  // This class's saved start, so a scan refused for being early says when scanning opens.
  const start = useQuery(api.checkin.attendance.classStart, { channel: CHANNEL });
  const cam = useCamera();
  const awake = useWakeLock();
  const [read] = useState(makeQrReader);
  const [noScanner, setNoScanner] = useState(false); // jsQR's file didn't load (qrRead.ts)
  const [result, setResult] = useState<Result | null>(null);
  const last = useRef({ code: "", at: 0 });
  const [starting, setStarting] = useState(false);
  const startingNow = useRef(false); // set in the tap itself, before React draws the busy button
  const [stopped, setStopped] = useState(false); // the camera turned off without a tap on Stop camera
  const tappedStop = useRef(false);
  const wasOn = useRef(false);
  const [typed, setTyped] = useState("");
  const [sending, setSending] = useState(false);
  const sendingNow = useRef(false);
  const field = useRef<HTMLInputElement>(null);

  async function send(code: string, typedIn = false) {
    // The camera sees the same pass many times a second; send each code once per 4 s. A typed
    // code always goes.
    const now = Date.now();
    if (!typedIn && code === last.current.code && now - last.current.at < 4000) return;
    last.current = { code, at: now };
    try {
      const r = await scan({ channel: CHANNEL, code, device });
      setResult({ kind: r.already ? "again" : "ok", text: r.name });
    } catch (e) {
      setResult({ kind: "error", text: forStudent(scanError(why(e), start?.startsAt), typedIn) });
    }
  }
  const sendRef = useRef(send);
  useEffect(() => { sendRef.current = send; });

  // Clear the result 3 s after it shows.
  useEffect(() => {
    if (!result) return;
    const t = setTimeout(() => setResult(null), 3000);
    return () => clearTimeout(t);
  }, [result]);

  // Read the camera about 4 times a second while it's on.
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

  // The camera went from on to off: say so, unless it was a tap on Stop camera.
  useEffect(() => {
    if (cam.on) {
      wasOn.current = true;
      return;
    }
    if (wasOn.current && !tappedStop.current) setStopped(true);
    wasOn.current = false;
    tappedStop.current = false;
  }, [cam.on]);

  // Start check-in: the screen lock first, while the tap still counts (Safari), then the camera.
  async function begin() {
    if (startingNow.current) return;
    startingNow.current = true;
    setStarting(true);
    setStopped(false);
    awake.keep();
    try {
      await cam.start(await frontCamera());
    } finally {
      startingNow.current = false;
      setStarting(false);
    }
  }

  function end() {
    tappedStop.current = true;
    awake.letGo();
    cam.stop();
  }

  async function checkInTyped(e: FormEvent) {
    e.preventDefault();
    const code = typed.trim();
    if (!code || sendingNow.current) return;
    sendingNow.current = true;
    setTyped("");
    field.current?.blur(); // the iPad's keyboard goes away, so the result shows
    setSending(true);
    try {
      await send(code, true);
    } finally {
      sendingNow.current = false;
      setSending(false);
    }
  }

  // What fills the panel: a result for its 3 s, else a camera that can't read passes (its line
  // shows in the band), else nothing. The camera lines stay in the page during a result; kiosk.css
  // hides them under the result's fill and they show again when it ends.
  const reading = cam.on && !noScanner;
  const problem = !!cam.error || (cam.on && noScanner) || (stopped && !cam.on);
  const fill = result ? { ok: "in", again: "already", error: "stop" }[result.kind] : problem ? "stop" : null;
  const panel = ["door__panel", "kiosk__result", fill && `door__panel--${fill}`, result ? `kiosk__result--${result.kind}` : problem && "kiosk__result--camera"]
    .filter(Boolean)
    .join(" ");

  return (
    <main className="kiosk door">
      <header className="k-bar kiosk__bar">
        <div className="kiosk__total">
          <ErrorBoundary label="The check-in count"><Count /></ErrorBoundary>
        </div>
        {cam.on && <Button variant="secondary" className="kiosk__stop" onClick={end}>Stop camera</Button>}
      </header>
      <div className={panel}>
        <div className="door__status kiosk__band">
          {cam.error && <Status kind="error">{cam.error}</Status>}
          {cam.on && noScanner && <Status kind="error">{SCANNER_DIDNT_LOAD}</Status>}
          {stopped && !cam.on && <Status kind="error">The camera stopped. Tap Start check-in.</Status>}
          <div role="status">
            {!result && (
              <p className={reading ? "kiosk__prompt door__prompt kiosk__prompt--lead" : "kiosk__prompt door__prompt"}>
                {reading ? "Hold your pass up to the camera" : "Type the code on your pass"}
              </p>
            )}
            {result && result.kind !== "error" && (
              <>
                <p className="kiosk__label">{result.kind === "ok" ? "Checked in" : "Already checked in"}</p>
                <p className="kiosk__name">{result.text}</p>
              </>
            )}
          </div>
          {result?.kind === "error" && <p className="kiosk__error" role="alert">{result.text}</p>}
          {awake.failed && (
            <p className="muted kiosk__awake">This browser can't keep the screen on. Set Auto-Lock to Never in Settings, under Display &amp; Brightness.</p>
          )}
        </div>
        <div className="door__cam kiosk__cam">
          <video ref={cam.video} className={cam.on ? "kiosk__video" : "kiosk__video kiosk__video--off"} muted playsInline autoPlay />
          {cam.on && (
            <span className="target" aria-hidden="true">
              <svg viewBox="0 0 100 100" focusable="false">
                <polyline points="0 22 0 0 22 0" />
                <polyline points="78 0 100 0 100 22" />
                <polyline points="100 78 100 100 78 100" />
                <polyline points="22 100 0 100 0 78" />
              </svg>
            </span>
          )}
          {!cam.on && (
            <Button className="kiosk__start camstart" busy={starting} onClick={() => void begin()}>Start check-in</Button>
          )}
        </div>
      </div>
      <form className="door__strip codein kiosk__type" onSubmit={checkInTyped}>
        <Field label="Code on your pass">
          {(f) => (
            <input
              {...f}
              ref={field}
              className="input input--code"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoCapitalize="characters"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="go"
            />
          )}
        </Field>
        <Button type="submit" variant="secondary" busy={sending} disabled={!typed.trim()}>Check in</Button>
      </form>
    </main>
  );
}
