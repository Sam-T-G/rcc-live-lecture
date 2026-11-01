// Block: the camera, started from a button press. This file doesn't import MediaPipe, so the
// teacher scanner and the door kiosk can read QR codes without putting the vision library (about
// 156 kB) in the bundle every student phone downloads; only #/lab's Vision panel loads it, through
// vision.ts, which re-exports useCamera. A team that uses the camera says so in TEAM.md under
// "What it sees" (AGENTS.md, Privacy).
//   const cam = useCamera();
//   <video ref={cam.video} muted playsInline />
//   <button onClick={() => cam.start()}>Start</button>   // cam.on, cam.error, cam.stop()
// The camera is on only between start() and stop(), and one hook never holds two cameras:
// - start() does nothing while an earlier start is still waiting on the browser (a double tap, or
//   the permission prompt is up) or the camera is already on. To switch cameras, stop() first.
// - A camera the browser hands over after stop(), or after the page closed (someone left while
//   the permission prompt was up), is turned off at once, and a start() after the page closed
//   asks for nothing.
// - When the camera ends on its own (unplugged, the iPad locks, another app takes it, the
//   permission is taken back), `on` goes back to false, so the page's Start button comes back.
// - A page opened over plain http has no camera, so error says to open it over https.
// stop() also clears the picture from the <video>.
import { useCallback, useEffect, useRef, useState } from "react";

// An iPhone or iPad camera (Continuity Camera on a Mac), by the name the browser gives it.
const isPhone = (label: string) => /iphone|ipad|continuity/i.test(label);

// On a Mac it skips an iPhone (Continuity Camera) and uses the built-in camera; pass a deviceId
// to start() to pick another. Until the page has camera permission the browser lists cameras
// without names, so on the first start the browser opens its default camera; when that is an
// iPhone and another camera exists, start() closes the iPhone's camera at once and opens the
// other one, so the iPhone's camera turns on for about a second that first time.
export function useCamera() {
  const video = useRef<HTMLVideoElement>(null);
  const [on, setOn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const starting = useRef(false);
  const mounted = useRef(false);
  // Goes up on every start(), stop() and unmount, so a start that finishes after one of those
  // knows it was overtaken and lets its camera go.
  const turn = useRef(0);

  // Turns off the camera this page holds, if any, overtakes any start still waiting on the
  // browser, and clears the picture.
  const drop = useCallback(() => {
    turn.current++;
    starting.current = false;
    const s = stream.current;
    stream.current = null;
    s?.getTracks().forEach((t) => t.stop());
    if (video.current) video.current.srcObject = null;
  }, []);

  const stop = useCallback(() => {
    drop();
    setOn(false);
  }, [drop]);

  const start = useCallback(
    async (deviceId?: string) => {
      if (!mounted.current || starting.current || stream.current) return;
      if (globalThis.isSecureContext === false) {
        setError("The camera needs https. Open the live site or localhost.");
        return;
      }
      const mine = ++turn.current;
      starting.current = true;
      setError(null);
      const cameras = async () => (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "videoinput");
      const open = (id?: string) =>
        navigator.mediaDevices.getUserMedia({
          video: id ? { deviceId: { exact: id }, width: 1280 } : { facingMode: "user", width: 1280 },
          audio: false,
        });
      // The camera this start opened and hasn't handed to `stream` yet, so a failure lets it go.
      let s: MediaStream | null = null;
      const letGo = () => {
        s?.getTracks().forEach((t) => t.stop());
        s = null;
      };
      try {
        if (!deviceId) {
          deviceId = (await cameras()).find((c) => c.label && !isPhone(c.label))?.deviceId;
          if (mine !== turn.current) return;
        }
        s = await open(deviceId);
        if (mine !== turn.current) return letGo();
        // No camera had a name before permission, so the browser picked its default. If that is
        // an iPhone, the names are there now: switch to a camera that isn't one.
        if (!deviceId && isPhone(s.getVideoTracks()[0]?.label ?? "")) {
          const other = (await cameras()).find((c) => c.label && !isPhone(c.label));
          if (mine !== turn.current) return letGo();
          if (other) {
            letGo();
            s = await open(other.deviceId);
            if (mine !== turn.current) return letGo();
          }
        }
        // From here `stream` holds it, and stop() or drop() turns it off.
        const opened: MediaStream = s;
        s = null;
        stream.current = opened;
        // A track that ends on its own fires "ended"; one this page stops doesn't.
        for (const t of opened.getTracks())
          t.addEventListener("ended", () => {
            if (stream.current === opened) stop();
          });
        if (video.current) {
          video.current.srcObject = opened;
          await video.current.play();
        }
        if (mine !== turn.current) return; // stop() ran while the picture was starting, and turned it off
        setOn(true);
      } catch (e) {
        letGo(); // a camera opened before listing the cameras again failed
        if (mine !== turn.current) return; // stopped or closed meanwhile: nothing is open, nothing to say
        drop(); // a camera whose picture wouldn't play
        setError(e instanceof Error && e.name === "NotAllowedError" ? "Camera blocked. Allow it in the browser's address bar." : "Couldn't start the camera.");
      } finally {
        if (mine === turn.current) starting.current = false;
      }
    },
    [drop, stop],
  );

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      drop();
    };
  }, [drop]);

  return { video, on, error, start, stop };
}
