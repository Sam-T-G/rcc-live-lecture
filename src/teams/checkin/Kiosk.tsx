// #/checkin/kiosk: an iPad at the classroom door. The front camera reads the QR pass on each
// student's phone and checks them in. Works in Safari (jsQR) and Chrome. DoorGate (prof.tsx)
// opens it for a paired iPad, which scans with its device token, and for anyone on the staff list
// who signs in; anyone else gets the pairing screen. A paired iPad can only scan, so this page
// reads no names (checkin.read.names is for professors).
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Status } from "../../blocks/ui";
import { CHANNEL } from "../../blocks/deck";
import { useCamera } from "../../blocks/camera";
import { makeQrReader } from "./qrRead";
import { DoorGate } from "./prof";

function why(e: unknown) {
  const x = e as { data?: unknown };
  return typeof x?.data === "string" ? x.data : "Something went wrong. Try again.";
}

export default function Kiosk() {
  return <DoorGate>{(device) => <KioskScanner device={device} />}</DoorGate>;
}

type Result = { kind: "ok" | "again" | "error"; text: string };

// The front camera's id once the browser shows labels (after the first allow); before
// that, useCamera falls back to facingMode "user", which is also the front camera.
async function frontCamera() {
  try {
    const cams = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "videoinput");
    return cams.find((c) => /front/i.test(c.label))?.deviceId;
  } catch { return undefined; }
}

// device: the paired iPad's token, or undefined when someone on the staff list is signed in.
function KioskScanner({ device }: { device: string | undefined }) {
  const count = useQuery(api.checkin.read.count, { channel: CHANNEL });
  const scan = useMutation(api.checkin.pass.scan);
  const cam = useCamera();
  const [read] = useState(makeQrReader);
  const [result, setResult] = useState<Result | null>(null);
  const last = useRef({ code: "", at: 0 });

  async function send(code: string) {
    // The camera sees the same pass many times a second; send each code once per 4 s.
    const now = Date.now();
    if (code === last.current.code && now - last.current.at < 4000) return;
    last.current = { code, at: now };
    try {
      const r = await scan({ channel: CHANNEL, code, device });
      setResult(r.already ? { kind: "again", text: r.name } : { kind: "ok", text: r.name });
    } catch (e) {
      setResult({ kind: "error", text: why(e) });
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
        if (raw && raw.startsWith("RCC-")) await sendRef.current(raw);
      } catch { /* a frame that fails to read is skipped */ }
      busy = false;
    }, 250);
    return () => clearInterval(t);
  }, [cam.on, cam.video, read]);

  return (
    <main className="kiosk">
      <div className="kiosk__left">
        <video ref={cam.video} className={cam.on ? "kiosk__video" : "kiosk__video kiosk__video--off"} muted playsInline autoPlay />
        {!cam.on && (
          <button className="kiosk__start" onClick={async () => cam.start(await frontCamera())}>Start check-in</button>
        )}
        {cam.error && <Status kind="error">{cam.error}</Status>}
      </div>
      <div className="kiosk__right">
        <div className={"kiosk__result" + (result ? " kiosk__result--" + result.kind : "")} role="status" aria-live="polite">
          {!result && <p className="kiosk__prompt">Hold your pass up to the camera</p>}
          {result?.kind === "ok" && <><p className="kiosk__label">Checked in</p><p className="kiosk__name">{result.text}</p></>}
          {result?.kind === "again" && <><p className="kiosk__label">Already checked in</p><p className="kiosk__name">{result.text}</p></>}
          {result?.kind === "error" && <p className="kiosk__error">{result.text}</p>}
        </div>
        <p className="kiosk__count"><span>{count ?? "…"}</span> checked in</p>
        {cam.on && <button className="quiet kiosk__stop" onClick={cam.stop}>Stop camera</button>}
      </div>
    </main>
  );
}
