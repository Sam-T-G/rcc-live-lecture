// Browser stand-ins for door iPad scenarios, for a scenario's `setup` (they run before the app
// mounts): the screen wake lock, a camera that never finishes starting, and a camera that stops by
// itself. A pass in front of the camera is the scenario's `qr` field, and a typed code its `type`
// field. Nothing here reaches the network or a real camera.

type Setup = (w: Window) => void;

// Runs several setups in order.
export const both =
  (...steps: Setup[]): Setup =>
  (w) =>
    steps.forEach((s) => s(w));

// The browser grants the screen wake lock (Safari 16.4 and later), or has none at all.
export function wakeLock(mode: "granted" | "missing"): Setup {
  return (w) => {
    const lock = {
      request: async () => ({ released: false, release: async () => {}, addEventListener() {}, removeEventListener() {} }),
    };
    try {
      Object.defineProperty(w.navigator, "wakeLock", { value: mode === "granted" ? lock : undefined, configurable: true });
    } catch {
      /* read-only here: the browser's own answer stands */
    }
  };
}

// The camera prompt never answers, so Start check-in stays busy.
export function cameraHangs(): Setup {
  return (w) => {
    const md = w.navigator.mediaDevices as unknown as { getUserMedia: () => Promise<MediaStream> } | undefined;
    if (md) md.getUserMedia = () => new Promise<MediaStream>(() => {});
  };
}

// A scanner's sign-in on this device ran out at `at` (ms) while the tab was closed: DoorGate keeps
// that time in localStorage (door.tsx SCANNER_ENDS) and shows "Your sign-in ended." on the reload.
export function scannerSignInEnded(at: number): Setup {
  return (w) => w.localStorage.setItem("rcc-live:kiosk-scanner-ends", String(at));
}

// DoorGate signed this professor out on the paired iPad and waits for Open the scanner
// (door.tsx SIGNED_OUT, in sessionStorage so a reload keeps it).
export function staffSignedOutHere(email: string): Setup {
  return (w) => w.sessionStorage.setItem("rcc-live:door-signed-out", email);
}

// The camera's track ends on its own (another app took the camera) once the picture is on.
export function cameraEnds(): Setup {
  return (w) => {
    const t = w.setInterval(() => {
      const v = w.document.querySelector<HTMLVideoElement>("video.kiosk__video");
      const s = v?.srcObject as MediaStream | null | undefined;
      if (!s || v?.classList.contains("kiosk__video--off")) return;
      w.clearInterval(t);
      w.setTimeout(() => s.getTracks().forEach((track) => track.dispatchEvent(new Event("ended"))), 200);
    }, 100);
  };
}
