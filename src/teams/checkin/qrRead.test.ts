// @vitest-environment node
// makeQrReader (qrRead.ts) picks the browser's BarcodeDetector only when it reads QR codes, and
// jsQR otherwise. The browser parts are stand-ins: a detector class that says which formats it
// reads, and a canvas that hands back a blank frame (jsQR finds no code in it).
import { describe, expect, it, vi } from "vitest";
import { makeQrReader } from "./qrRead";

const video = { videoWidth: 1280, videoHeight: 720 } as HTMLVideoElement;

// A BarcodeDetector stand-in that reads `formats` and finds a pass in every frame.
function detector(formats: string[] | Error) {
  const detect = vi.fn(async () => [{ rawValue: "RCC-ABC234" }]);
  const made = vi.fn();
  class BarcodeDetector {
    static getSupportedFormats = async () => {
      if (formats instanceof Error) throw formats;
      return formats;
    };
    constructor(o: { formats: string[] }) {
      made(o);
    }
    detect = detect;
  }
  return { BarcodeDetector, detect, made };
}

// A canvas stand-in for jsQR: counts the frames drawn to it.
function canvas() {
  const drawImage = vi.fn();
  const ctx = { drawImage, getImageData: (_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }) };
  vi.stubGlobal("document", { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) });
  return drawImage;
}

describe("checkin-frontend-4 the QR reader works in every browser", () => {
  it("checkin-frontend-4 makeQrReader uses BarcodeDetector only when getSupportedFormats() includes 'qr_code'", async () => {
    const d = detector(["ean_13", "qr_code"]);
    vi.stubGlobal("BarcodeDetector", d.BarcodeDetector);
    const drawn = canvas();
    const read = makeQrReader();
    expect(await read(video)).toBe("RCC-ABC234");
    expect(await read(video)).toBe("RCC-ABC234");
    expect(d.made).toHaveBeenCalledTimes(1);
    expect(d.made).toHaveBeenCalledWith({ formats: ["qr_code"] });
    expect(d.detect).toHaveBeenCalledTimes(2);
    expect(drawn).not.toHaveBeenCalled();
  });

  it("checkin-frontend-4 jsQR reads the frame when BarcodeDetector reads no QR codes (Chrome on Windows), can't start, or doesn't exist (Safari, Firefox)", async () => {
    for (const formats of [[], ["ean_13", "code_128"], new Error("NotSupportedError")]) {
      const d = detector(formats);
      vi.stubGlobal("BarcodeDetector", d.BarcodeDetector);
      const drawn = canvas();
      const read = makeQrReader();
      expect(await read(video)).toBeNull(); // a blank frame
      expect(drawn).toHaveBeenCalledTimes(1);
      expect(d.detect).not.toHaveBeenCalled();
      vi.unstubAllGlobals();
    }
    vi.stubGlobal("BarcodeDetector", undefined);
    const drawn = canvas();
    expect(await makeQrReader()(video)).toBeNull();
    expect(drawn).toHaveBeenCalledTimes(1);
  });

  it("makeQrReader touches no browser API until the first frame, so a page can make it while it renders", () => {
    vi.stubGlobal("BarcodeDetector", undefined);
    vi.stubGlobal("document", undefined);
    expect(typeof makeQrReader()).toBe("function");
  });
});
