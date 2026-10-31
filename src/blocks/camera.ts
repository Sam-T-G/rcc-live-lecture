// Block: the camera, started from a button press. This file doesn't import MediaPipe, so the
// teacher scanner and the door kiosk can read QR codes without putting the vision library (about
// 156 kB) in the bundle every student phone downloads; only #/lab's Vision panel loads it, through
// vision.ts, which re-exports useCamera. A team that uses the camera says so in TEAM.md under
// "What it sees" (AGENTS.md, Privacy).
//   const cam = useCamera();
//   <video ref={cam.video} muted playsInline />
//   <button onClick={() => cam.start()}>Start</button>   // cam.on, cam.error, cam.stop()
import { useCallback, useEffect, useRef, useState } from "react";

// On a Mac it skips an iPhone (Continuity Camera) and uses the built-in camera; pass a deviceId
// to start() to pick another.
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
