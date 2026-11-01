// Browser stand-ins, installed before the app loads: the clock, Google's sign-in script, the
// camera and the QR reader. Nothing here reaches the network.

let offset = 0;

// Starts the page clock at `iso` and lets it run on from there (Date.now and new Date()).
export function pinTime(iso: string) {
  const target = Date.parse(iso);
  if (Number.isNaN(target)) throw new Error(`Lab: bad "now" ${iso}`);
  const Real = Date;
  offset = target - Real.now();
  const now = () => Real.now() + offset;
  function LabDate(this: unknown, ...a: unknown[]) {
    if (!new.target) return new Real(now()).toString();
    return a.length === 0 ? new Real(now()) : new (Real as unknown as new (...x: unknown[]) => Date)(...a);
  }
  LabDate.prototype = Real.prototype;
  LabDate.now = now;
  LabDate.parse = Real.parse;
  LabDate.UTC = Real.UTC;
  (globalThis as unknown as { Date: unknown }).Date = LabDate;
}

// Moves the pinned clock `ms` forward (tickMs). Timers already set still fire on real time; a
// page that reads Date.now() on a repeating tick sees the jump at its next tick.
export function tick(ms: number) {
  offset += ms;
}

const GSI = "https://accounts.google.com/";

// A stand-in for Google's "Continue with Google" button. Google draws its button in a frame, so
// this one is a frame too: the page's own checks skip it the way they skip Google's.
function drawButton(el: HTMLElement) {
  el.replaceChildren();
  const f = document.createElement("iframe");
  f.title = "Sign in with Google Button";
  f.style.cssText = "border:0;width:240px;height:44px;display:block;color-scheme:light";
  f.srcdoc = `<!doctype html><html><body style="margin:0;padding:2px 0;background:transparent">
<div style="box-sizing:border-box;height:40px;width:236px;border:1px solid #dadce0;border-radius:20px;background:#fff;display:flex;align-items:center;gap:10px;padding:0 12px;font:500 14px 'Google Sans',Roboto,Arial,sans-serif;color:#3c4043">
<svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.6 13.3l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 7l7.4 5.7c4.3-4 6.9-9.9 6.9-17.2z"/><path fill="#FBBC05" d="M10.5 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.6 10.7l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.5 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.6 42.6 14.6 48 24 48z"/></svg>
<span style="flex:1;text-align:center">Continue with Google</span></div></body></html>`;
  el.appendChild(f);
}

// window.google with the calls the app makes, and Google's script tag answered with a load event
// without fetching it. "failed": the script tag gets an error event instead, as when the
// connection is down or a blocker stops it, and window.google never appears.
export function stubGoogle(mode?: "failed") {
  if (mode !== "failed")
    window.google = {
      accounts: {
        id: {
          initialize() {},
          renderButton: (el: HTMLElement) => drawButton(el),
          prompt() {},
          disableAutoSelect() {},
          cancel() {},
        },
      },
    };
  const head = document.head;
  const append = head.appendChild.bind(head);
  head.appendChild = function <T extends Node>(node: T): T {
    if (node instanceof HTMLScriptElement && node.src.startsWith(GSI)) {
      setTimeout(() => (mode === "failed" ? node.onerror?.(new Event("error")) : node.onload?.(new Event("load"))), 0);
      return node;
    }
    return append(node);
  };
}

// The camera: "fake" gives a still gray frame from a canvas; "denied" refuses like a blocked
// permission prompt. Never a real camera.
export function stubCamera(mode: "fake" | "denied") {
  const devices = {
    async enumerateDevices() {
      return [{ kind: "videoinput", label: "Lab camera", deviceId: "lab-camera", groupId: "lab", toJSON() { return this; } }] as unknown as MediaDeviceInfo[];
    },
    async getUserMedia(): Promise<MediaStream> {
      if (mode === "denied") throw new DOMException("Permission denied", "NotAllowedError");
      const c = document.createElement("canvas");
      c.width = 1280;
      c.height = 720;
      const g = c.getContext("2d")!;
      const grad = g.createLinearGradient(0, 0, 0, 720);
      grad.addColorStop(0, "#5f6368");
      grad.addColorStop(1, "#3c4043");
      g.fillStyle = grad;
      g.fillRect(0, 0, 1280, 720);
      g.fillStyle = "rgba(255,255,255,0.5)";
      g.font = "500 40px sans-serif";
      g.textAlign = "center";
      g.fillText("Lab camera", 640, 370);
      const capture = (c as HTMLCanvasElement & { captureStream?: (fps?: number) => MediaStream }).captureStream;
      if (!capture) throw new DOMException("No camera", "NotFoundError");
      return capture.call(c, 5);
    },
    addEventListener() {},
    removeEventListener() {},
  };
  try {
    Object.defineProperty(navigator, "mediaDevices", { value: devices, configurable: true });
  } catch {
    /* read-only in this browser: the camera stays as it is */
  }
}

// A pass held up to the camera: a stand-in BarcodeDetector that reads `code` off every frame.
// src/teams/checkin/qrRead.ts uses the browser's detector when it lists "qr_code", so the scanners
// read this instead of drawing frames for jsQR (the lab's camera shows no real QR code).
export function stubQr(code: string) {
  class LabDetector {
    static async getSupportedFormats() {
      return ["qr_code"];
    }
    async detect() {
      return [{ rawValue: code }];
    }
  }
  (globalThis as { BarcodeDetector?: unknown }).BarcodeDetector = LabDetector;
}
