// Lab panel for the vision block: pick a model, then run it on a sample picture or the camera.
import { useCallback, useRef, useState } from "react";
import { VISION, drawSeen, loadVision, useCamera, useVisionLoop, type Runner, type Seen, type VisionKind } from "../blocks/vision";

const BASE = "https://storage.googleapis.com/mediapipe-tasks/";
const SAMPLES: Record<string, string> = {
  "Two hands": BASE + "hand_landmarker/woman_hands.jpg",
  "Thumbs up": BASE + "gesture_recognizer/thumbs_up.jpg",
  "Victory sign": BASE + "gesture_recognizer/victory.jpg",
  "Cat and dog": BASE + "object_detector/cat_and_dog.jpg",
  "Burger": BASE + "image_classifier/burger.jpg",
};

function say(s: Seen) {
  return s.labels.length ? `${s.count} · ${s.labels.join(", ")}` : String(s.count);
}

export default function Vision() {
  const [kind, setKind] = useState<VisionKind>("gestures");
  const [status, setStatus] = useState("");
  const [seen, setSeen] = useState("");
  const [runner, setRunner] = useState<Runner | null>(null);
  const cam = useCamera();
  const canvas = useRef<HTMLCanvasElement>(null);
  const img = useRef<HTMLImageElement>(null);
  const [sample, setSample] = useState("");
  const pick = useRef(0);

  const onSeen = useCallback((s: Seen) => {
    setSeen(say(s));
    const v = cam.video.current;
    if (canvas.current && v) drawSeen(canvas.current, kind, s, v.videoWidth, v.videoHeight);
  }, [kind, cam.video]);
  useVisionLoop(cam.video, runner, cam.on, onSeen);

  async function load(mode: "VIDEO" | "IMAGE") {
    setStatus("Loading the model…");
    const t = performance.now();
    const r = await loadVision(kind, mode);
    setStatus(`Loaded in ${Math.round(performance.now() - t)} ms.`);
    return r;
  }
  async function camera() {
    if (cam.on) { cam.stop(); return; }
    try { setRunner(await load("VIDEO")); await cam.start(); } catch { setStatus("The model didn't load. Check the connection."); }
  }
  async function picture(label: string) {
    setSample(label); setSeen("");
    const mine = ++pick.current; // a newer pick replaces this one; its result and errors are dropped
    if (!label) return;
    try {
      const r = await load("IMAGE");
      const el = img.current!;
      el.crossOrigin = "anonymous";
      el.src = SAMPLES[label];
      await el.decode();
      if (mine !== pick.current) return;
      const s = r.run(el);
      setSeen(say(s));
      if (canvas.current) drawSeen(canvas.current, kind, s, el.naturalWidth, el.naturalHeight);
    } catch { if (mine === pick.current) setStatus("That didn't run. Check the connection."); }
  }

  return (
    <section className="panel">
      <h2>Vision (on the device)</h2>
      <label>
        Model
        <select value={kind} onChange={(e) => { cam.stop(); setRunner(null); setSeen(""); setSample(""); setKind(e.target.value as VisionKind); }}>
          {(Object.keys(VISION) as VisionKind[]).map((k) => <option key={k} value={k}>{k}: {VISION[k].what}</option>)}
        </select>
      </label>
      <p className="row">
        <button onClick={camera}>{cam.on ? "Stop the camera" : "Use the camera"}</button>
        <select aria-label="Sample picture" value={sample} onChange={(e) => picture(e.target.value)}>
          <option value="">Or try a sample picture…</option>
          {Object.keys(SAMPLES).map((k) => <option key={k}>{k}</option>)}
        </select>
      </p>
      {status && <p className="muted">{status}</p>}
      {cam.error && <p className="error">{cam.error}</p>}
      <div className="vision">
        <video ref={cam.video} playsInline muted hidden={!cam.on} />
        <img ref={img} alt={sample ? "Sample: " + sample : ""} hidden={cam.on || !sample} />
        <canvas ref={canvas} />
      </div>
      {seen && <p><b>Saw:</b> <span data-seen>{seen}</span></p>}
    </section>
  );
}
