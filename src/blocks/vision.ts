// Block: computer vision in the browser (MediaPipe Tasks, pinned 1.1.1; 1.2.0 was two days old on 2026-10-29). Every model runs on
// the device: frames never leave it, no key, works offline once the model has loaded.
//   const hands = await loadVision("gestures");          // load once (a few MB), then reuse
//   const s = hands.run(video);                          // each frame: { count, labels, raw }
//   s.labels → ["Thumb_Up", "Open_Palm"]                 // what it saw, ready to count or send
// Camera: useCamera() below, started from a button press. A team that uses the camera says so
// in TEAM.md under "What it sees" (AGENTS.md, Privacy). BLOCKS.md has the recipes.
import {
  DrawingUtils,
  FaceDetector,
  FaceLandmarker,
  FilesetResolver,
  GestureRecognizer,
  HandLandmarker,
  ImageClassifier,
  ObjectDetector,
  PoseLandmarker,
  type NormalizedLandmark,
} from "@mediapipe/tasks-vision";
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

const WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.1/wasm";
const M = "https://storage.googleapis.com/mediapipe-models/";

// What each kind finds, and its model (Google's published files).
export const VISION = {
  faces: { what: "faces and where they are", model: M + "face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite" },
  faceMesh: { what: "478 points per face, plus expressions (smile, blink, mouth open)", model: M + "face_landmarker/face_landmarker/float16/1/face_landmarker.task" },
  hands: { what: "21 points per hand, and left or right", model: M + "hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task" },
  gestures: { what: "hand gestures: Thumb_Up, Thumb_Down, Open_Palm, Closed_Fist, Pointing_Up, Victory, ILoveYou", model: M + "gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task" },
  pose: { what: "33 body points per person (shoulders, wrists, hips)", model: M + "pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task" },
  objects: { what: "everyday objects with boxes (person, cell phone, laptop, cup, book...)", model: M + "object_detector/efficientdet_lite0/int8/1/efficientdet_lite0.tflite" },
  classify: { what: "what the whole picture is, top guesses", model: M + "image_classifier/efficientnet_lite0/int8/1/efficientnet_lite0.tflite" },
} as const;
export type VisionKind = keyof typeof VISION;
export type Mode = "VIDEO" | "IMAGE";

// Every run returns the same shape, so a team can switch models without rewriting its page.
export type Seen = { count: number; labels: string[]; raw: unknown };
export type Runner = { kind: VisionKind; run: (src: HTMLVideoElement | HTMLImageElement, at?: number) => Seen; close: () => void };

let files: ReturnType<typeof FilesetResolver.forVisionTasks> | null = null;
const cache = new Map<string, Promise<Runner>>();

// Loads a model once per page (and per mode); later calls get the same one. GPU when the
// browser has it, CPU if that fails.
export function loadVision(kind: VisionKind, mode: Mode = "VIDEO"): Promise<Runner> {
  const id = kind + ":" + mode;
  if (!cache.has(id)) cache.set(id, build(kind, mode).catch((e) => { cache.delete(id); throw e; }));
  return cache.get(id)!;
}

async function build(kind: VisionKind, mode: Mode): Promise<Runner> {
  files ??= FilesetResolver.forVisionTasks(WASM);
  const fs = await files;
  const make = async (delegate: "GPU" | "CPU") => {
    const base = { baseOptions: { modelAssetPath: VISION[kind].model, delegate }, runningMode: mode };
    switch (kind) {
      case "faces": return FaceDetector.createFromOptions(fs, base);
      case "faceMesh": return FaceLandmarker.createFromOptions(fs, { ...base, numFaces: 4, outputFaceBlendshapes: true });
      case "hands": return HandLandmarker.createFromOptions(fs, { ...base, numHands: 4 });
      case "gestures": return GestureRecognizer.createFromOptions(fs, { ...base, numHands: 4 });
      case "pose": return PoseLandmarker.createFromOptions(fs, { ...base, numPoses: 4 });
      case "objects": return ObjectDetector.createFromOptions(fs, { ...base, scoreThreshold: 0.4, maxResults: 10 });
      case "classify": return ImageClassifier.createFromOptions(fs, { ...base, maxResults: 3 });
    }
  };
  // The two int8 models (objects, classify) only run right on the CPU; the rest try the GPU first.
  const cpuOnly = kind === "objects" || kind === "classify";
  let task;
  if (cpuOnly) task = await make("CPU");
  else try { task = await make("GPU"); } catch { task = await make("CPU"); }
  return wrap(kind, mode, task);
}

type Cat = { categoryName?: string; displayName?: string; score?: number };
const name = (c: Cat) => c.categoryName || c.displayName || "";

function wrap(kind: VisionKind, mode: Mode, task: object): Runner {
  // Each MediaPipe task names its call differently; this picks the right one for the mode.
  const t = task as Record<string, (src: unknown, at?: number) => unknown> & { close: () => void };
  const call = (verb: string, src: unknown, at: number) => (mode === "VIDEO" ? t[verb + "ForVideo"](src, at) : t[verb](src));
  return {
    kind,
    close: () => t.close(),
    run(src, at = performance.now()) {
      switch (kind) {
        case "faces": case "objects": {
          const r = call("detect", src, at) as { detections: { categories: Cat[] }[] };
          return { count: r.detections.length, labels: r.detections.map((d) => name(d.categories[0] ?? {})).filter(Boolean), raw: r };
        }
        case "faceMesh": {
          const r = call("detect", src, at) as { faceLandmarks: unknown[]; faceBlendshapes?: { categories: Cat[] }[] };
          // The strongest expressions per face, like "mouthSmileLeft" or "eyeBlinkRight".
          const labels = (r.faceBlendshapes ?? []).flatMap((b) => b.categories.filter((c) => (c.score ?? 0) > 0.5).map(name));
          return { count: r.faceLandmarks.length, labels, raw: r };
        }
        case "hands": {
          const r = call("detect", src, at) as { landmarks: unknown[]; handedness: Cat[][] };
          return { count: r.landmarks.length, labels: r.handedness.map((h) => name(h[0] ?? {})), raw: r };
        }
        case "gestures": {
          const r = call("recognize", src, at) as { landmarks: unknown[]; gestures: Cat[][] };
          return { count: r.landmarks.length, labels: r.gestures.map((g) => name(g[0] ?? {})).filter((l) => l && l !== "None"), raw: r };
        }
        case "pose": {
          const r = call("detect", src, at) as { landmarks: NormalizedLandmark[][] };
          return { count: r.landmarks.length, labels: r.landmarks.map((p) => (handsUp(p) ? "hand up" : "")).filter(Boolean), raw: r };
        }
        case "classify": {
          const r = call("classify", src, at) as { classifications: { categories: Cat[] }[] };
          const cats = r.classifications[0]?.categories ?? [];
          return { count: cats.length, labels: cats.map(name), raw: r };
        }
      }
    },
  };
}

// Pose: is either wrist above its shoulder? (y grows downward.) For counting raised hands.
export function handsUp(p: NormalizedLandmark[]) {
  const [ls, rs, lw, rw] = [p[11], p[12], p[15], p[16]];
  return !!(ls && lw && lw.y < ls.y - 0.05) || !!(rs && rw && rw.y < rs.y - 0.05);
}

// Draw what a run found over the picture: points and lines for hands, bodies, and faces,
// boxes for faces and objects. The canvas sits on top of the video at the same size.
export function drawSeen(canvas: HTMLCanvasElement, kind: VisionKind, seen: Seen, w: number, h: number) {
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  const g = canvas.getContext("2d")!;
  g.clearRect(0, 0, w, h);
  const d = new DrawingUtils(g);
  const raw = seen.raw as Record<string, unknown>;
  const green = "#34a853", dark = "#00732d", white = "#ffffff";   // dark lines, light-ringed points: readable on any picture
  if (kind === "hands" || kind === "gestures") for (const l of (raw.landmarks as NormalizedLandmark[][]) ?? []) {
    d.drawConnectors(l, HandLandmarker.HAND_CONNECTIONS, { color: dark, lineWidth: 4 });
    d.drawLandmarks(l, { color: white, fillColor: green, lineWidth: 2, radius: 5 });
  }
  if (kind === "pose") for (const l of (raw.landmarks as NormalizedLandmark[][]) ?? []) {
    d.drawConnectors(l, PoseLandmarker.POSE_CONNECTIONS, { color: dark, lineWidth: 4 });
    d.drawLandmarks(l, { color: white, fillColor: green, lineWidth: 2, radius: 4 });
  }
  if (kind === "faceMesh") for (const l of (raw.faceLandmarks as NormalizedLandmark[][]) ?? [])
    d.drawConnectors(l, FaceLandmarker.FACE_LANDMARKS_TESSELATION, { color: "rgba(255,255,255,0.5)", lineWidth: 1 });
  if (kind === "faces" || kind === "objects") {
    g.lineWidth = 4; g.strokeStyle = green; g.fillStyle = green; g.font = "600 20px system-ui";
    for (const det of (raw.detections as { boundingBox?: { originX: number; originY: number; width: number; height: number }; categories: Cat[] }[]) ?? []) {
      const b = det.boundingBox; if (!b) continue;
      g.strokeRect(b.originX, b.originY, b.width, b.height);
      const label = name(det.categories[0] ?? {}); if (label) g.fillText(label, b.originX + 6, b.originY + 22);
    }
  }
}

// The camera, started from a button press. On a Mac it skips an iPhone (Continuity Camera)
// and uses the built-in camera; pass a deviceId to pick another.
export function useCamera() {
  const video = useRef<HTMLVideoElement>(null);
  const [on, setOn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stream = useRef<MediaStream | null>(null);

  const stop = useCallback(() => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    setOn(false);
  }, []);

  const start = useCallback(async (deviceId?: string) => {
    setError(null);
    try {
      if (!deviceId) {
        const cams = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "videoinput");
        deviceId = cams.find((c) => c.label && !/iphone|ipad|continuity/i.test(c.label))?.deviceId;
      }
      const s = await navigator.mediaDevices.getUserMedia({ video: deviceId ? { deviceId: { exact: deviceId }, width: 1280 } : { facingMode: "user", width: 1280 }, audio: false });
      stream.current = s;
      if (video.current) { video.current.srcObject = s; await video.current.play(); }
      setOn(true);
    } catch (e) {
      setError(e instanceof Error && e.name === "NotAllowedError" ? "Camera blocked. Allow it in the browser's address bar." : "Couldn't start the camera.");
    }
  }, []);

  useEffect(() => stop, [stop]);
  return { video, on, error, start, stop };
}

// Run a model on the camera, `fps` times a second, while `on`. onSeen gets each result.
export function useVisionLoop(video: RefObject<HTMLVideoElement | null>, runner: Runner | null, on: boolean, onSeen: (s: Seen) => void, fps = 15) {
  const cb = useRef(onSeen);
  useEffect(() => { cb.current = onSeen; }, [onSeen]);
  useEffect(() => {
    if (!on || !runner) return;
    let raf = 0, last = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const v = video.current;
      if (!v || v.readyState < 2 || now - last < 1000 / fps) return;
      last = now;
      cb.current(runner.run(v, now));
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [video, runner, on, fps]);
}
