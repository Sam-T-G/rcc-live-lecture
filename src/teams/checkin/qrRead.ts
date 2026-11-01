// Reads one QR code from a <video>, for the professor's scanner (#/checkin/teacher) and the door
// iPad (#/checkin/kiosk). The browser's own BarcodeDetector is used only when it says it reads QR
// codes (BarcodeDetector.getSupportedFormats() includes "qr_code": Chrome and Edge on macOS,
// ChromeOS and Android). Everywhere else (Safari, Firefox, and Chrome or Edge on Windows, where
// BarcodeDetector exists but reads no QR codes) the frame is drawn to a canvas and read with jsQR.
// Frames stay on the device.
//
// getSupportedFormats() answers later (a Promise), so the reader picks on its first frame.
// makeQrReader() itself touches no browser API, so a page can call it while it renders:
//   const [read] = useState(makeQrReader);
//   const text = await read(video); // the QR's text, or null when the frame has none
// jsQR (130 kB) loads with import() only when the reader picks it, so it stays out of the main
// bundle every student phone downloads (src/blocks/camera.test.ts checks).

type Detector = { detect: (src: HTMLVideoElement) => Promise<{ rawValue: string }[]> };
type DetectorClass = { new (o: { formats: string[] }): Detector; getSupportedFormats?: () => Promise<string[]> };
export type QrReader = (v: HTMLVideoElement) => Promise<string | null>;

const WIDTH = 640; // jsQR is slow on full frames; 640 px wide still reads a phone held up close

export function makeQrReader(): QrReader {
  let reader: Promise<QrReader> | null = null;
  return async (v) => {
    // A jsQR download that fails (the connection dropped) is tried again on the next frame.
    reader ??= pickReader().catch((e: unknown) => {
      reader = null;
      throw e;
    });
    return (await reader)(v);
  };
}

// The browser's detector when it reads QR codes, else jsQR.
async function pickReader(): Promise<QrReader> {
  const BD = (globalThis as { BarcodeDetector?: DetectorClass }).BarcodeDetector;
  try {
    const formats = BD?.getSupportedFormats ? await BD.getSupportedFormats() : [];
    if (BD && formats.includes("qr_code")) {
      const d = new BD({ formats: ["qr_code"] });
      return async (v) => (await d.detect(v))[0]?.rawValue ?? null;
    }
  } catch {
    /* the browser's detector won't start: read with jsQR */
  }
  return await jsqrReader();
}

async function jsqrReader(): Promise<QrReader> {
  const { default: jsQR } = await import("jsqr");
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
