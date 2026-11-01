// @vitest-environment node
// The camera on #/checkin/teacher (ScanPasses in Teacher.tsx): the camera reads a frame 4 times a
// second and sees the same pass on many of them, so each code goes to the server once per 4 s.
// No browser here: React's hooks are swapped for a small stand-in (state kept between renders, an
// effect run after a render when its deps change), the camera block for a fake that is on, and
// the QR reader for one that sees the same pass on every frame. Each render calls ScanPasses as a
// plain function.
import { type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const hooks = vi.hoisted(() => ({ slots: [] as unknown[], at: 0, effects: [] as (() => void)[], cleanups: new Map<number, () => void>() }));
vi.mock("react", async (orig) => {
  const R = await orig<typeof import("react")>();
  function slot<T>(make: () => T): T {
    const i = hooks.at++;
    if (!(i in hooks.slots)) hooks.slots[i] = make();
    return hooks.slots[i] as T;
  }
  const changed = (a: unknown[] | undefined, b: unknown[] | undefined) => !a || !b || a.length !== b.length || a.some((x, k) => !Object.is(x, b[k]));
  return {
    ...R,
    useState: (init: unknown) => {
      const i = hooks.at;
      const value = slot(() => (typeof init === "function" ? (init as () => unknown)() : init));
      const set = (next: unknown) => {
        hooks.slots[i] = typeof next === "function" ? (next as (v: unknown) => unknown)(hooks.slots[i]) : next;
      };
      return [value, set];
    },
    useRef: (init: unknown) => slot(() => ({ current: init })),
    useEffect: (fn: () => void | (() => void), deps?: unknown[]) => {
      const i = hooks.at;
      const s = slot(() => ({ ran: false, deps: undefined as unknown[] | undefined }));
      if (s.ran && !changed(s.deps, deps)) return;
      Object.assign(s, { ran: true, deps });
      hooks.effects.push(() => {
        hooks.cleanups.get(i)?.();
        hooks.cleanups.delete(i);
        const cleanup = fn();
        if (typeof cleanup === "function") hooks.cleanups.set(i, cleanup);
      });
    },
  };
});

const scan = vi.fn(async (args: { channel: string; code: string }) => {
  void args;
  return { name: "Sample student 1", email: "student1@example.edu", already: false };
});
vi.mock("convex/react", () => ({ useMutation: () => scan, useQuery: () => undefined }));
const cam = { on: true, error: "", video: { current: { readyState: 4 } as unknown }, start: async () => {}, stop: () => {} };
vi.mock("../../blocks/camera", () => ({ useCamera: () => cam }));
const reader = vi.fn(async (v: unknown): Promise<string | null> => {
  void v;
  return "RCC-ABC234";
});
vi.mock("./qrRead", async (orig) => ({ ...(await orig<typeof import("./qrRead")>()), makeQrReader: () => reader }));
vi.mock("./prof", () => ({ StaffGate: () => null }));

const { ScanPasses } = await import("./Teacher");

function render() {
  hooks.at = 0;
  const el = ScanPasses();
  const run = hooks.effects;
  hooks.effects = [];
  run.forEach((f) => f());
  return el;
}
// What the professor sees: the section's HTML.
const html = () => renderToStaticMarkup(render() as ReactElement);
const settle = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};
const frames = async (n: number) => {
  for (let i = 0; i < n; i++) {
    await vi.advanceTimersByTimeAsync(250);
    await settle();
  }
};

beforeEach(() => {
  hooks.slots = [];
  hooks.effects = [];
  hooks.cleanups.clear();
  scan.mockClear();
  reader.mockReset();
  reader.mockImplementation(async () => "RCC-ABC234");
  vi.useFakeTimers();
});
afterEach(() => {
  for (const c of hooks.cleanups.values()) c();
  vi.useRealTimers();
});

describe("sweep1-tests-4 the teacher scanner's camera", () => {
  it("F12.3 a pass held up to the laptop camera is sent once per 4 s, though the camera reads it 4 times a second", async () => {
    render();
    await frames(15); // 3.75 s
    expect(reader.mock.calls.length).toBeGreaterThanOrEqual(15);
    expect(scan).toHaveBeenCalledTimes(1);
    expect(scan).toHaveBeenCalledWith({ channel: "gdg", code: "RCC-ABC234" });
    await frames(2); // past 4 s since the first send
    expect(scan).toHaveBeenCalledTimes(2);
  });

  it("a different pass goes at once", async () => {
    render();
    await frames(1);
    reader.mockResolvedValue("RCC-XYZ789");
    await frames(1);
    expect(scan.mock.calls.map(([a]) => a.code)).toEqual(["RCC-ABC234", "RCC-XYZ789"]);
  });

  it("sweep1-checkin-fixcheck-1 a scanner that didn't load (jsQR gone after a deploy) says to reload the page in role=alert; it clears once frames read again", async () => {
    const real = await vi.importActual<typeof import("./qrRead")>("./qrRead");
    vi.stubGlobal("BarcodeDetector", undefined);
    vi.doMock("jsqr", () => {
      throw new TypeError("Failed to fetch dynamically imported module");
    });
    const broken = real.makeQrReader();
    const reads: Promise<unknown>[] = [];
    reader.mockImplementation((v) => {
      const p = broken(v as HTMLVideoElement);
      reads.push(p.catch(() => {}));
      return p;
    });
    // One frame, waiting for its failed load to come back before the next one.
    const frame = async () => {
      await vi.advanceTimersByTimeAsync(250);
      await Promise.all(reads);
      await settle();
    };
    render();
    await frame();
    await frame();
    expect(html()).not.toContain("Reload this page"); // a failed load is tried again
    await frame();
    expect(reads).toHaveLength(3);
    expect(html()).toContain(`<p class="status status--error" role="alert">The scanner didn&#x27;t load. Reload this page.</p>`);
    expect(scan).not.toHaveBeenCalled();

    reader.mockImplementation(async () => null);
    await frames(1);
    expect(html()).not.toContain("Reload this page");
    vi.doUnmock("jsqr");
    vi.unstubAllGlobals();
  });
});
