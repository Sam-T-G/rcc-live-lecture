// Reads one QR code from a <video>. Chrome and Edge have BarcodeDetector built in; Safari
// (iPad) and Firefox don't, so those draw the frame to a canvas and run jsQR on it.
// Frames stay on the device.
import jsQR from "jsqr";

type Detector = { detect: (src: HTMLVideoElement) => Promise<{ rawValue: string }[]> };
type Reader = (v: HTMLVideoElement) => Promise<string | null>;

const WIDTH = 640; // jsQR is slow on full frames; 640 px wide still reads a phone held up close

export function makeQrReader(): Reader {
  const BD = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
  if (BD) {
    const d = new BD({ formats: ["qr_code"] });
    return async (v) => (await d.detect(v))[0]?.rawValue ?? null;
  }
  const canvas = document.createElement("canvas");
  const g = canvas.getContext("2d", { willReadFrequently: true });
  return async (v) => {
    if (!g || !v.videoWidth) return null;
    const scale = Math.min(1, WIDTH / v.videoWidth);
    const w = Math.round(v.videoWidth * scale), h = Math.round(v.videoHeight * scale);
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    g.drawImage(v, 0, 0, w, h);
    const img = g.getImageData(0, 0, w, h);
    return jsQR(img.data, w, h, { inversionAttempts: "dontInvert" })?.data ?? null;
  };
}
