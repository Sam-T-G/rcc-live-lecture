// @vitest-environment node
// sweep1-checkin-fixcheck-1: jsQR loads with import() (qrRead.ts). After a deploy the old jsQR
// file is gone from the site, so that import fails on every frame until the page reloads. The
// reader says so after 3 failed loads in a row (scannerLoadFailed), so the scanner pages can show
// "The scanner didn't load. Reload this page." instead of skipping every frame. Here jsqr's import
// throws while `jsqr.broken` is set; no BarcodeDetector exists (Safari on the door iPad).
import { beforeEach, describe, expect, it, vi } from "vitest";

const jsqr = vi.hoisted(() => ({ broken: true, loads: 0 }));
vi.mock("jsqr", async (orig) => {
  jsqr.loads++;
  if (jsqr.broken) throw new TypeError("Failed to fetch dynamically imported module: /assets/jsQR-old.js");
  return orig();
});

const { makeQrReader, scannerLoadFailed, SCANNER_DIDNT_LOAD } = await import("./qrRead");
const video = { videoWidth: 1280, videoHeight: 720 } as HTMLVideoElement;
const ctx = { drawImage: () => {}, getImageData: (_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }) };

beforeEach(() => {
  vi.stubGlobal("BarcodeDetector", undefined);
  vi.stubGlobal("document", { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) });
});

describe("sweep1-checkin-fixcheck-1 a jsQR file that won't load", () => {
  it("the first 2 failed loads are tried again quietly; from the 3rd in a row the reader rejects with the scanner-didn't-load error", async () => {
    jsqr.broken = true;
    jsqr.loads = 0;
    const read = makeQrReader();
    const errors: unknown[] = [];
    for (let i = 0; i < 4; i++) errors.push(await read(video).catch((e: unknown) => e));
    expect(jsqr.loads).toBe(4); // each frame tries the load again
    expect(errors.map(scannerLoadFailed)).toEqual([false, false, true, true]);
    expect((errors[2] as Error).message).toBe(SCANNER_DIDNT_LOAD);
    expect(SCANNER_DIDNT_LOAD).toBe("The scanner didn't load. Reload this page.");
  });

  it("a load that works again reads frames", async () => {
    jsqr.broken = true;
    const read = makeQrReader();
    for (let i = 0; i < 3; i++) await read(video).catch(() => {});
    jsqr.broken = false;
    expect(await read(video)).toBeNull(); // a blank frame, read with jsQR
    expect(scannerLoadFailed(new Error("a frame that didn't read"))).toBe(false);
    expect(scannerLoadFailed(undefined)).toBe(false);
  });
});
