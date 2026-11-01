// @vitest-environment node
// SCAN: useCamera (src/blocks/camera.ts), the camera behind Start check-in on the door iPad
// (#/checkin/kiosk), Start scanning on #/checkin/teacher and #/lab's Vision panel. It opens at
// most one camera, only between start() and stop(), and never leaves one running after the page
// closes. These tests have no browser, so React's hooks are swapped for a small stand-in that
// keeps state between renders, runs an effect after a render when its deps change (the old
// cleanup first) and runs every cleanup on unmount, the way React would. The browser's camera is
// a fake: getUserMedia waits until the test answers it, the way the permission prompt waits for a
// tap, and each answer hands over one video track the test can see is live or stopped.
import { beforeEach, describe, expect, it, vi } from "vitest";

const hooks = vi.hoisted(() => ({
  slots: [] as unknown[],
  at: 0,
  effects: [] as (() => void)[],
  cleanups: new Map<number, () => void>(),
}));
vi.mock("react", async (orig) => {
  const R = await orig<typeof import("react")>();
  function slot<T>(make: () => T): T {
    const i = hooks.at++;
    if (!(i in hooks.slots)) hooks.slots[i] = make();
    return hooks.slots[i] as T;
  }
  const changed = (a: unknown[] | undefined, b: unknown[] | undefined) =>
    !a || !b || a.length !== b.length || a.some((x, k) => !Object.is(x, b[k]));
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
    useCallback: (fn: unknown, deps: unknown[]) => {
      const s = slot(() => ({ fn, deps: undefined as unknown[] | undefined }));
      if (changed(s.deps, deps)) Object.assign(s, { fn, deps });
      return s.fn;
    },
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

// Called as a plain function under the stand-in hooks, so it gets a name without "use".
const runCamera = (await import("./camera")).useCamera;

// A camera's video track. stop() is the page turning it off, which fires no "ended" (Media
// Capture and Streams); endOnItsOwn() is the browser ending it (unplugged, another app took it).
class Track {
  readyState: "live" | "ended" = "live";
  label = "FaceTime HD Camera";
  private onEnded = new Set<() => void>();
  addEventListener(type: string, fn: () => void) {
    if (type === "ended") this.onEnded.add(fn);
  }
  removeEventListener(type: string, fn: () => void) {
    if (type === "ended") this.onEnded.delete(fn);
  }
  stop() {
    this.readyState = "ended";
  }
  endOnItsOwn() {
    this.readyState = "ended";
    this.onEnded.forEach((f) => f());
  }
}

let tracks: Track[]; // every track the browser handed over
// getUserMedia calls waiting on an answer. allow(label) hands over the camera with that name.
let prompts: { allow: (label?: string) => Track; deny: (name: string) => void }[];
const getUserMedia = vi.fn<(constraints?: MediaStreamConstraints) => Promise<unknown>>(
  () =>
    new Promise((resolve, reject) => {
      prompts.push({
        allow: (label?: string) => {
          const t = new Track();
          if (label) t.label = label;
          tracks.push(t);
          resolve({ getTracks: () => [t], getVideoTracks: () => [t] });
          return t;
        },
        deny: (name) => reject(Object.assign(new Error(name), { name })),
      });
    }),
);
const enumerateDevices = vi.fn(async () => [{ kind: "videoinput", label: "FaceTime HD Camera", deviceId: "mac-camera" }]);
const video = { srcObject: null as unknown, play: vi.fn(async () => {}) };
const live = () => tracks.filter((t) => t.readyState === "live").length;

// One render: the hook runs, then the effects that render queued (the first one mounts it).
function render() {
  hooks.at = 0;
  const cam = runCamera();
  const run = hooks.effects;
  hooks.effects = [];
  run.forEach((f) => f());
  return cam;
}
function mount() {
  const cam = render();
  cam.video.current = video as unknown as HTMLVideoElement;
  return cam;
}
// The page closes (a hash change to another page).
function unmount() {
  for (const cleanup of hooks.cleanups.values()) cleanup();
  hooks.cleanups.clear();
}
// Lets every promise that's ready run, as the browser would between taps.
const settle = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

beforeEach(() => {
  hooks.slots = [];
  hooks.effects = [];
  hooks.cleanups.clear();
  tracks = [];
  prompts = [];
  getUserMedia.mockClear();
  enumerateDevices.mockClear();
  video.srcObject = null;
  video.play.mockReset();
  video.play.mockImplementation(async () => {});
  vi.stubGlobal("isSecureContext", true);
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia, enumerateDevices } });
});

describe("SCAN useCamera: one camera, only between start and stop", () => {
  it("F12.6 a double tap on Start makes one getUserMedia call, and Stop camera then leaves no live track (checkin-frontend-8, blocks-frontend-10)", async () => {
    const cam = mount();
    expect(Object.keys(cam).sort()).toEqual(["error", "on", "start", "stop", "video"]);
    const first = cam.start("mac-camera");
    const second = cam.start("mac-camera"); // the second tap, while the permission prompt is up
    await settle();
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    prompts[0].allow();
    await Promise.all([first, second]);
    let now = render();
    expect(now.on).toBe(true);
    expect(video.srcObject).not.toBe(null);

    now.stop();
    now = render();
    expect(now.on).toBe(false);
    expect(live()).toBe(0);
    expect(video.srcObject).toBe(null); // the last picture doesn't stay on screen
  });

  it("F12.6 start() while the camera is on opens no second camera", async () => {
    const cam = mount();
    const p = cam.start("mac-camera");
    await settle();
    prompts[0].allow();
    await p;
    void render().start("mac-camera");
    await settle();
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(live()).toBe(1);
    expect(render().on).toBe(true);
  });

  it("F12.6 a camera the browser hands over after stop() is turned off at once, and on stays false", async () => {
    const cam = mount();
    const p = cam.start("mac-camera");
    await settle();
    cam.stop(); // before the browser answers
    prompts[0].allow();
    await p;
    const now = render();
    expect(now.on).toBe(false);
    expect(now.error).toBe(null);
    expect(live()).toBe(0);
    expect(video.srcObject).toBe(null);
  });

  it("F12.6 leaving the page while the permission prompt is up leaves no live track (blocks-frontend-10)", async () => {
    const cam = mount();
    const p = cam.start("mac-camera");
    await settle();
    unmount();
    prompts[0].allow();
    await p;
    expect(live()).toBe(0);
    expect(video.play).not.toHaveBeenCalled();
  });

  it("F12.6 a start() after the page closed, or one overtaken while the browser lists its cameras, asks for no camera", async () => {
    // The kiosk looks up the front camera before it calls start(), so a hash change can land
    // in between.
    const closed = mount();
    unmount();
    void closed.start("mac-camera");
    await settle();
    expect(getUserMedia).not.toHaveBeenCalled();

    hooks.slots = [];
    const cam = mount();
    void cam.start(); // no deviceId: it lists the cameras first
    unmount();
    await settle();
    expect(enumerateDevices).toHaveBeenCalledTimes(1);
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it("F12.6 after a failed start the camera is let go, the page says why, and the next tap asks again", async () => {
    // The picture won't play: the camera it opened is turned off, not left running behind the error.
    video.play.mockRejectedValueOnce(new Error("The play() request was interrupted"));
    const cam = mount();
    let p = cam.start("mac-camera");
    await settle();
    prompts[0].allow();
    await p;
    let now = render();
    expect(now.on).toBe(false);
    expect(now.error).toBe("Couldn't start the camera.");
    expect(live()).toBe(0);
    expect(video.srcObject).toBe(null);

    // The prompt is denied: the error says so, and nothing is left waiting.
    p = now.start("mac-camera");
    await settle();
    prompts[1].deny("NotAllowedError");
    await p;
    now = render();
    expect(now.error).toBe("Camera blocked. Allow it in the browser's address bar.");

    p = now.start("mac-camera");
    await settle();
    expect(getUserMedia).toHaveBeenCalledTimes(3);
    prompts[2].allow();
    await p;
    now = render();
    expect(now.on).toBe(true);
    expect(now.error).toBe(null);
    expect(live()).toBe(1);
  });

  it("checkin-frontend-9 when the camera ends on its own, on goes back to false and the picture clears, so the page's Start button comes back", async () => {
    const cam = mount();
    const p = cam.start("mac-camera");
    await settle();
    const track = prompts[0].allow();
    await p;
    expect(render().on).toBe(true);

    track.endOnItsOwn(); // another app took the camera
    const now = render();
    expect(now.on).toBe(false);
    expect(video.srcObject).toBe(null);

    const again = now.start("mac-camera");
    await settle();
    expect(getUserMedia).toHaveBeenCalledTimes(2);
    prompts[1].allow();
    await again;
    expect(render().on).toBe(true);
  });

  // A Mac whose default camera is an iPhone (Continuity Camera). Before the page has camera
  // permission, browsers list cameras with no names, so the first start can't tell which is the
  // iPhone and the browser opens its default; after that the names are there.
  function macWithIPhone({ builtIn = true } = {}) {
    let allowed = false;
    const named = [
      { kind: "videoinput", label: "Sam’s iPhone Camera", deviceId: "iphone" },
      ...(builtIn ? [{ kind: "videoinput", label: "FaceTime HD Camera", deviceId: "mac-camera" }] : []),
    ];
    enumerateDevices.mockImplementation(async () => (allowed ? named : named.map((d) => ({ ...d, label: "", deviceId: "" }))));
    return {
      allow(label: string) {
        allowed = true;
        return prompts.at(-1)!.allow(label);
      },
    };
  }
  const asked = () => getUserMedia.mock.calls.map((c) => (c[0]?.video as { deviceId?: { exact: string }; facingMode?: string }));

  it("sweep1-blocks-5 on the first start, before the browser names its cameras, an iPhone the browser opens is swapped for the built-in camera", async () => {
    const mac = macWithIPhone();
    const cam = mount();
    const p = cam.start();
    await settle();
    const iphone = mac.allow("Sam’s iPhone Camera"); // the browser's default camera
    await settle();
    expect(iphone.readyState).toBe("ended");
    mac.allow("FaceTime HD Camera");
    await p;
    expect(asked()).toEqual([
      { facingMode: "user", width: 1280 },
      { deviceId: { exact: "mac-camera" }, width: 1280 },
    ]);
    expect(tracks.filter((t) => t.readyState === "live").map((t) => t.label)).toEqual(["FaceTime HD Camera"]);
    expect(render().on).toBe(true);
  });

  it("sweep1-blocks-5 when the iPhone is the only camera, the first start keeps it", async () => {
    const mac = macWithIPhone({ builtIn: false });
    const cam = mount();
    const p = cam.start();
    await settle();
    mac.allow("Sam’s iPhone Camera");
    await p;
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(live()).toBe(1);
    expect(render().on).toBe(true);
  });

  it("sweep1-blocks-5 Stop while the built-in camera is being opened in the iPhone's place leaves no live track", async () => {
    const mac = macWithIPhone();
    const cam = mount();
    const p = cam.start();
    await settle();
    mac.allow("Sam’s iPhone Camera");
    await settle();
    cam.stop();
    mac.allow("FaceTime HD Camera");
    await p;
    expect(live()).toBe(0);
    expect(render().on).toBe(false);
  });

  it("sweep1-blocks-5 if listing the cameras fails after the iPhone opened, the iPhone is let go and the page says why", async () => {
    const mac = macWithIPhone();
    const cam = mount();
    const p = cam.start();
    await settle();
    enumerateDevices.mockImplementationOnce(async () => {
      throw new Error("listing failed");
    });
    mac.allow("Sam’s iPhone Camera");
    await p;
    expect(live()).toBe(0);
    expect(render().error).toBe("Couldn't start the camera.");
  });

  it("blocks-frontend-16 on a page opened over plain http, start() says 'The camera needs https. Open the live site or localhost.' and asks for no camera", async () => {
    vi.stubGlobal("isSecureContext", false);
    vi.stubGlobal("navigator", {}); // an http page has no navigator.mediaDevices
    const cam = mount();
    await cam.start();
    const now = render();
    expect(now.error).toBe("The camera needs https. Open the live site or localhost.");
    expect(now.on).toBe(false);
  });
});
