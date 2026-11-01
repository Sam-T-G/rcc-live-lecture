// @vitest-environment node
// SCAN: the door iPad's scanner (KioskScanner in Kiosk.tsx, #/checkin/kiosk once the iPad is
// paired). No browser here: React's hooks are swapped for a small stand-in (state kept between
// renders, an effect run after a render when its deps change, every cleanup run on unmount), the
// camera block for a fake the test turns on and off, and the server for stand-ins. Each render
// calls KioskScanner as a plain function; a test presses a button or submits the form by calling
// its handler, and reads what the line at the door sees by rendering the returned tree to HTML
// with react-dom/server, so the roles and words checked are the real markup.
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { getFunctionName, type FunctionReference } from "convex/server";
import { ConvexError } from "convex/values";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const hooks = vi.hoisted(() => ({
  slots: [] as unknown[],
  at: 0,
  effects: [] as (() => void)[],
  cleanups: new Map<number, () => void>(),
  dirty: false, // a state changed since the last render
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
        const v = typeof next === "function" ? (next as (v: unknown) => unknown)(hooks.slots[i]) : next;
        if (!Object.is(v, hooks.slots[i])) hooks.dirty = true;
        hooks.slots[i] = v;
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

// The server: checkin.read.count's answer is `count.value` (undefined while it loads), and
// checkin.pass.scan is `scan`. `asked` lists every query the page ran.
const count = { value: undefined as number | undefined };
// checkin.attendance.classStart's answer: this class's saved start, or null.
const classStart = { value: null as { startsAt: number; graceMin: number } | null };
const asked: string[] = [];
const scan = vi.fn(async (args: { channel: string; code: string; device?: string }) => {
  void args;
  return { name: "Ada Lovelace", email: "", already: false };
});
vi.mock("convex/react", () => ({
  useQuery: (ref: FunctionReference<"query">) => {
    asked.push(getFunctionName(ref));
    const name = getFunctionName(ref);
    return name === "checkin/read:count" ? count.value : name === "checkin/attendance:classStart" ? classStart.value : undefined;
  },
  useMutation: () => scan,
}));
// The camera block (camera.start.test.ts tests the real one): the test sets `on` and `error`.
const cam = {
  video: { current: null as unknown },
  on: false,
  error: null as string | null,
  start: vi.fn(async (deviceId?: string): Promise<void> => {
    void deviceId;
  }),
  stop: vi.fn(),
};
vi.mock("../../blocks/camera", () => ({ useCamera: () => cam }));
// What the QR reader sees on each frame.
const reader = vi.fn(async (v: unknown): Promise<string | null> => {
  void v;
  return null;
});
vi.mock("./qrRead", () => ({ makeQrReader: () => reader }));
vi.mock("./prof", () => ({ DoorGate: () => null }));

const { KioskScanner } = await import("./Kiosk");
// The two refusals the server words for the teacher scanner ("Ask them to ..."); the kiosk rewords them.
const { NOT_A_PASS, OLD } = await import("../../../convex/checkin/pass");

type El = ReactElement<Record<string, unknown> & { children?: ReactNode }>;
const TOKEN = "0123456789abcdef".repeat(4); // the paired iPad's device token

// The page's visibility, and the browser's screen wake lock. The browser drops a lock when the
// page is hidden; a test does that by setting the lock's `released`.
let visibility: "visible" | "hidden";
const onVisibility = new Set<() => void>();
function setVisibility(v: "visible" | "hidden") {
  visibility = v;
  onVisibility.forEach((f) => f());
}
type Lock = { released: boolean; release: ReturnType<typeof vi.fn> };
let locks: Lock[];
const requestLock = vi.fn(async (type: "screen") => {
  void type;
  const lock: Lock = {
    released: false,
    release: vi.fn(async () => {
      lock.released = true;
    }),
  };
  locks.push(lock);
  return lock;
});
const mediaDevices = { enumerateDevices: async () => [] };

// One render as React would do it: the component, the effects it queued, and again while those
// effects changed state.
function render(): El {
  let el: El;
  let rounds = 0;
  do {
    hooks.dirty = false;
    hooks.at = 0;
    el = KioskScanner({ device: TOKEN }) as El;
    const run = hooks.effects;
    hooks.effects = [];
    run.forEach((f) => f());
  } while (hooks.dirty && ++rounds < 5);
  return el;
}
function unmount() {
  for (const cleanup of hooks.cleanups.values()) cleanup();
  hooks.cleanups.clear();
}
const settle = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

// Every element in the tree, with what <Field>'s render function returns (the input).
function all(node: ReactNode, out: El[] = []): El[] {
  if (Array.isArray(node)) node.forEach((n) => all(n, out));
  else if (isValidElement(node)) {
    const el = node as El;
    out.push(el);
    const kids = el.props.children;
    all(typeof kids === "function" ? (kids as (f: object) => ReactNode)({ id: "code" }) : kids, out);
  }
  return out;
}
const button = (el: El, label: string) => all(el).find((e) => e.props.children === label && (e.props.onClick || e.props.type === "submit"));
const press = (el: El, label: string) => {
  const b = button(el, label);
  if (!b) throw new Error(`No "${label}" button on the page`);
  (b.props.onClick as () => void)();
};
const input = (el: El) => all(el).find((e) => e.type === "input")!;
const type = (el: El, text: string) => (input(el).props.onChange as (e: { target: { value: string } }) => void)({ target: { value: text } });
const submit = (el: El) => (all(el).find((e) => e.type === "form")!.props.onSubmit as (e: { preventDefault: () => void }) => Promise<void>)({ preventDefault: () => {} });
// What the line sees: the page's HTML, and its words without the tags.
const html = (el: El) => renderToStaticMarkup(el);
const words = (el: El) =>
  html(el)
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
// The words in the polite status line (role=status) that shows the prompt and each check-in.
const statusLine = (el: El) => /<div role="status">(.*?)<\/div>/.exec(html(el))?.[1] ?? "";

beforeEach(() => {
  hooks.slots = [];
  hooks.effects = [];
  hooks.cleanups.clear();
  count.value = 7;
  classStart.value = null;
  asked.length = 0;
  scan.mockReset();
  scan.mockImplementation(async () => ({ name: "Ada Lovelace", email: "", already: false }));
  Object.assign(cam, { on: false, error: null });
  cam.video.current = null;
  cam.start.mockReset();
  cam.start.mockImplementation(async () => {});
  cam.stop.mockReset();
  reader.mockReset();
  reader.mockImplementation(async () => null);
  visibility = "visible";
  onVisibility.clear();
  locks = [];
  requestLock.mockClear();
  vi.stubGlobal("navigator", { wakeLock: { request: requestLock }, mediaDevices });
  vi.stubGlobal("document", {
    get visibilityState() {
      return visibility;
    },
    addEventListener: (t: string, f: () => void) => t === "visibilitychange" && onVisibility.add(f),
    removeEventListener: (t: string, f: () => void) => t === "visibilitychange" && onVisibility.delete(f),
  });
  vi.useFakeTimers();
});
afterEach(() => {
  unmount();
  vi.useRealTimers();
});

describe("SCAN the door kiosk: what the line sees", () => {
  it("F12.4 the line sees how many have checked in as a Big number, a loading line until the count loads, and no names (checkin-backend-12, checkin-frontend-11)", () => {
    count.value = undefined;
    let el = render();
    expect(html(el)).toContain('<p class="status status--loading" role="status">Loading the check-in count…</p>');

    count.value = 12;
    el = render();
    const page = html(el);
    expect(page).toContain('<span class="big__value">12</span><span class="big__label">checked in</span>');
    expect(page).not.toMatch(/<(ul|ol|li)[\s>]/); // no list of who checked in
    expect(asked).toEqual(expect.arrayContaining(["checkin/read:count"]));
    expect(asked).not.toContain("checkin/read:names"); // names are for professors only
  });

  it("F12.2 a pass the server refuses shows its reason in role=alert, outside the status line, and the reason clears after 3 s", async () => {
    scan.mockRejectedValueOnce(new ConvexError(OLD));
    reader.mockResolvedValue("RCC-ZZZ999");
    cam.on = true;
    cam.video.current = { readyState: 4 };
    render();
    await vi.advanceTimersByTimeAsync(250); // the camera loop reads a frame
    await settle();
    let el = render();
    expect(scan).toHaveBeenCalledWith({ channel: "gdg", code: "RCC-ZZZ999", device: TOKEN });
    expect(html(el)).toContain('<p class="kiosk__error" role="alert">That code is old. Open your pass again and hold it up.</p>');
    expect(statusLine(el)).not.toContain("That code");

    vi.advanceTimersByTime(3000);
    el = render();
    expect(html(el)).not.toContain("That code is old.");
    expect(statusLine(el)).toContain("Hold your pass up to the camera");
  });

  it("sweep1-tests-4 F12.3 a pass held up to the camera is sent once per 4 s, though the camera reads it 4 times a second", async () => {
    reader.mockResolvedValue("RCC-ABC234");
    cam.on = true;
    cam.video.current = { readyState: 4 };
    render();
    for (let i = 0; i < 15; i++) {
      await vi.advanceTimersByTimeAsync(250); // 15 frames: 3.75 s
      await settle();
    }
    expect(reader.mock.calls.length).toBeGreaterThanOrEqual(15);
    expect(scan).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 2; i++) {
      await vi.advanceTimersByTimeAsync(250); // past 4 s since the first send
      await settle();
    }
    expect(scan).toHaveBeenCalledTimes(2);
    expect(scan).toHaveBeenLastCalledWith({ channel: "gdg", code: "RCC-ABC234", device: TOKEN });
  });

  it("SCAN-check-1 a pass held up to the camera that the server refuses ('Ask them to ...', worded for the teacher scanner) tells the student to show their pass again", async () => {
    const alert = (el: El) => /<p class="kiosk__error" role="alert">(.*?)<\/p>/.exec(html(el))?.[1].replace(/&#x27;/g, "'");

    reader.mockResolvedValue("RCC-ZZZ999");
    cam.on = true;
    cam.video.current = { readyState: 4 };
    scan.mockRejectedValueOnce(new ConvexError(NOT_A_PASS));
    render();
    await vi.advanceTimersByTimeAsync(250);
    await settle();
    expect(alert(render())).toBe("That code isn't a pass. Open your pass again and hold it up.");
    expect(words(render())).not.toContain("Ask them");
  });

  it("SCAN-risk-1 a code typed into 'Code on your pass' that the server refuses gets a line the student can act on, with no 'Ask them'", async () => {
    const alert = (el: El) => /<p class="kiosk__error" role="alert">(.*?)<\/p>/.exec(html(el))?.[1].replace(/&#x27;/g, "'");
    const typed = async (error: string) => {
      scan.mockRejectedValueOnce(new ConvexError(error));
      const el = render();
      (input(el).props.ref as { current: unknown }).current = { blur: () => {} };
      type(el, "abc234");
      await submit(render());
      return alert(render());
    };
    expect(await typed(NOT_A_PASS)).toBe("That code isn't a pass. Check the code on your pass and type it again.");
    vi.advanceTimersByTime(3000);
    expect(await typed(OLD)).toBe("That code is old. Type the code your pass shows now.");
    vi.advanceTimersByTime(3000);

    // Any other refusal shows as the server words it.
    expect(await typed("No code.")).toBe("No code.");
    expect(words(render())).not.toContain("Ask them");
  });

  it("LX-check-copy-1 a pass refused for being early says when scanning opens, in the iPad's time zone", async () => {
    vi.stubEnv("TZ", "America/Los_Angeles");
    const alert = (el: El) => /<p class="kiosk__error" role="alert">(.*?)<\/p>/.exec(html(el))?.[1];
    const { EARLY_SCAN } = await import("../../../convex/lib");
    classStart.value = { startsAt: Date.UTC(2026, 10, 10, 17, 0), graceMin: 5 }; // Tue Nov 10, 9:00 AM Pacific
    scan.mockRejectedValueOnce(new ConvexError(EARLY_SCAN));
    const el = render();
    (input(el).props.ref as { current: unknown }).current = { blur: () => {} };
    type(el, "abc234");
    await submit(render());
    expect(alert(render())).toBe("Scanning opens at 8:15 AM, 45 minutes before class starts.");
  });

  it("rt-24 a student types the code on their pass: it checks them in with this iPad's device token, shows 'Checked in' and their name for 3 s, and empties the field", async () => {
    let el = render();
    expect(button(el, "Check in")).toBeDefined();
    expect(button(el, "Check in")!.props.disabled).toBe(true); // nothing typed yet
    const blur = vi.fn();
    (input(el).props.ref as { current: unknown }).current = { blur };
    type(el, " abc234 ");
    el = render();
    expect(button(el, "Check in")!.props.disabled).toBe(false);
    await submit(el);
    expect(scan).toHaveBeenCalledTimes(1);
    expect(scan).toHaveBeenCalledWith({ channel: "gdg", code: "abc234", device: TOKEN });
    expect(blur).toHaveBeenCalled(); // the iPad's keyboard goes away, so the result shows
    el = render();
    expect(input(el).props.value).toBe("");
    expect(statusLine(el)).toContain('<p class="kiosk__label">Checked in</p><p class="kiosk__name">Ada Lovelace</p>');

    vi.advanceTimersByTime(2999);
    expect(words(render())).toContain("Ada Lovelace");
    vi.advanceTimersByTime(1);
    expect(words(render())).not.toContain("Ada Lovelace");

    // The same code typed again goes again, where the camera waits 4 s before resending a code.
    scan.mockResolvedValueOnce({ name: "Ada Lovelace", email: "", already: true });
    el = render();
    type(el, "abc234");
    await submit(render());
    expect(scan).toHaveBeenCalledTimes(2);
    expect(statusLine(render())).toContain("Already checked in");
  });
});

describe("SCAN the door kiosk: the camera and the screen stay on", () => {
  it("F12.6 a double tap on Start check-in starts the camera once, and the button stays busy until the camera answers", async () => {
    let answer!: () => void;
    cam.start.mockImplementationOnce(() => new Promise<void>((r) => (answer = r)));
    let el = render();
    press(el, "Start check-in");
    press(el, "Start check-in"); // the second tap lands before the busy button is drawn
    await settle();
    expect(cam.start).toHaveBeenCalledTimes(1);
    el = render();
    expect(button(el, "Start check-in")!.props.busy).toBe(true);
    answer();
    await settle();
    el = render();
    expect(button(el, "Start check-in")!.props.busy).toBe(false);
  });

  it("checkin-frontend-9 Start check-in asks for a screen wake lock during the tap, again each time the page shows after being hidden, and Stop camera lets it go", async () => {
    let el = render();
    press(el, "Start check-in");
    expect(requestLock).toHaveBeenCalledTimes(1); // inside the tap: Safari grants the first lock only then
    expect(requestLock).toHaveBeenCalledWith("screen");
    await settle();
    cam.on = true;
    el = render();

    setVisibility("visible"); // still held: nothing new to ask for
    expect(requestLock).toHaveBeenCalledTimes(1);
    locks[0].released = true; // the iPad locks: the browser drops the lock and hides the page
    setVisibility("hidden");
    expect(requestLock).toHaveBeenCalledTimes(1);
    setVisibility("visible");
    expect(requestLock).toHaveBeenCalledTimes(2);
    await settle();

    press(el, "Stop camera");
    expect(cam.stop).toHaveBeenCalledTimes(1);
    expect(locks[1].release).toHaveBeenCalledTimes(1);
    setVisibility("hidden");
    setVisibility("visible");
    expect(requestLock).toHaveBeenCalledTimes(2); // after Stop camera the iPad may sleep
  });

  it("checkin-frontend-9 leaving the kiosk lets the wake lock go and stops asking for it", async () => {
    press(render(), "Start check-in");
    await settle();
    expect(requestLock).toHaveBeenCalledTimes(1);
    unmount();
    expect(locks[0].release).toHaveBeenCalledTimes(1);
    locks[0].released = true;
    setVisibility("hidden");
    setVisibility("visible");
    expect(requestLock).toHaveBeenCalledTimes(1);
  });

  it("checkin-frontend-9 a browser that can't keep the screen on says to set Auto-Lock to Never", async () => {
    const line = "This browser can't keep the screen on. Set Auto-Lock to Never in Settings, under Display & Brightness.";
    // A browser that grants the lock says nothing.
    press(render(), "Start check-in");
    await settle();
    expect(words(render())).not.toContain(line);
    unmount();

    // Safari before 16.4 has no navigator.wakeLock.
    hooks.slots = [];
    vi.stubGlobal("navigator", { mediaDevices });
    press(render(), "Start check-in");
    await settle();
    expect(words(render())).toContain(line);
    unmount();

    // A browser that refuses the lock (Low Power Mode, for one) says the same.
    hooks.slots = [];
    vi.stubGlobal("navigator", { wakeLock: { request: () => Promise.reject(new Error("NotAllowedError")) }, mediaDevices });
    press(render(), "Start check-in");
    await settle();
    expect(words(render())).toContain(line);
  });

  it("checkin-frontend-9 when the camera stops on its own, Start check-in comes back with 'The camera stopped. Tap Start check-in.' in role=alert; after a tap on Stop camera it doesn't", async () => {
    let el = render();
    press(el, "Start check-in");
    await settle();
    cam.on = true;
    el = render();
    expect(words(el)).toContain("Hold your pass up to the camera");

    cam.on = false; // the browser ended the camera, and useCamera turned `on` off
    el = render();
    expect(html(el)).toContain('<p class="status status--error" role="alert">The camera stopped. Tap Start check-in.</p>');
    expect(button(el, "Start check-in")).toBeDefined();
    expect(statusLine(el)).toContain("Type the code on your pass"); // the camera can't read passes now

    press(el, "Start check-in");
    await settle();
    el = render();
    expect(html(el)).not.toContain("The camera stopped.");

    cam.on = true;
    el = render();
    press(el, "Stop camera");
    cam.on = false;
    el = render();
    expect(html(el)).not.toContain("The camera stopped.");
  });
});
