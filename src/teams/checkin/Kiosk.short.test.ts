// @vitest-environment node
// T1 (2026-11-01): the door iPad shows each scanned student as first name and last initial, the
// `short` that checkin.pass.scan returns ("Ivy S."), never the full `name`, also when a staff
// member is signed in on the kiosk (KioskScanner gets no device token then, and a professor's
// reply carries the email too). A server from before `short` (Convex rolled back while this page
// stays open) sends only `name`, and the door shows that, as it did before.
// The harness is Kiosk.test.ts's: React's hooks are swapped for a small stand-in, the camera
// block for a fake, and the server for a stand-in; each render calls KioskScanner as a plain
// function and the returned tree is rendered to HTML with react-dom/server.
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { getFunctionName, type FunctionReference } from "convex/server";
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

// The server: checkin.read.count answers 7, checkin.attendance.classStart null, and
// checkin.pass.scan is `scan`.
type Reply = { name: string; short?: string; email: string; already: boolean };
const scan = vi.fn(async (args: { channel: string; code: string; device?: string }): Promise<Reply> => {
  void args;
  return { name: "Ivy Sample", short: "Ivy S.", email: "", already: false };
});
vi.mock("convex/react", () => ({
  useQuery: (ref: FunctionReference<"query">) => (getFunctionName(ref) === "checkin/read:count" ? 7 : getFunctionName(ref) === "checkin/attendance:classStart" ? null : undefined),
  useMutation: () => scan,
}));
// The camera block: the test turns it on.
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
vi.mock("./qrRead", async (orig) => ({ ...(await orig<typeof import("./qrRead")>()), makeQrReader: () => reader }));
vi.mock("./prof", () => ({ DoorGate: () => null }));

const { KioskScanner } = await import("./Kiosk");

type El = ReactElement<Record<string, unknown> & { children?: ReactNode }>;
const TOKEN = "0123456789abcdef".repeat(4); // the paired iPad's device token

// One render as React would do it: the component, the effects it queued, and again while those
// effects changed state. A paired iPad passes its device token; a staff member signed in on the
// kiosk passes none.
type Who = "iPad" | "staff";
function render(who: Who = "iPad"): El {
  let el: El;
  let rounds = 0;
  do {
    hooks.dirty = false;
    hooks.at = 0;
    el = KioskScanner({ device: who === "iPad" ? TOKEN : undefined }) as El;
    const run = hooks.effects;
    hooks.effects = [];
    run.forEach((f) => f());
  } while (hooks.dirty && ++rounds < 5);
  return el;
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
const input = (el: El) => all(el).find((e) => e.type === "input")!;
const type = (el: El, text: string) => (input(el).props.onChange as (e: { target: { value: string } }) => void)({ target: { value: text } });
const submit = (el: El) => (all(el).find((e) => e.type === "form")!.props.onSubmit as (e: { preventDefault: () => void }) => Promise<void>)({ preventDefault: () => {} });
const html = (el: El) => renderToStaticMarkup(el);
// The words in the polite status line (role=status) that shows each check-in.
const statusLine = (el: El) => /<div role="status">(.*?)<\/div>/.exec(html(el))?.[1] ?? "";

// A student types the code on their pass, the way Kiosk.test.ts's rt-24 does.
async function typeCode(who: Who, code: string) {
  const el = render(who);
  (input(el).props.ref as { current: unknown }).current = { blur: () => {} };
  type(el, code);
  await submit(render(who));
}

beforeEach(() => {
  hooks.slots = [];
  hooks.effects = [];
  hooks.cleanups.clear();
  scan.mockReset();
  scan.mockImplementation(async () => ({ name: "Ivy Sample", short: "Ivy S.", email: "", already: false }));
  Object.assign(cam, { on: false, error: null });
  cam.video.current = null;
  reader.mockReset();
  reader.mockImplementation(async () => null);
  vi.stubGlobal("navigator", { mediaDevices: { enumerateDevices: async () => [] } });
  vi.stubGlobal("document", { visibilityState: "visible", addEventListener: () => {}, removeEventListener: () => {} });
  vi.useFakeTimers();
});
afterEach(() => {
  for (const cleanup of hooks.cleanups.values()) cleanup();
  hooks.cleanups.clear();
  vi.useRealTimers();
});

describe("T1 the door shows the first name and last initial", () => {
  it("T1 a pass the paired iPad's camera reads shows 'Checked in' and `short` for 3 s, never the full name", async () => {
    reader.mockResolvedValue("RCC-ABC234");
    cam.on = true;
    cam.video.current = { readyState: 4 };
    render();
    await vi.advanceTimersByTimeAsync(250); // the camera loop reads a frame
    await settle();
    const el = render();
    expect(scan).toHaveBeenCalledWith({ channel: "gdg", code: "RCC-ABC234", device: TOKEN });
    expect(statusLine(el)).toContain('<p class="kiosk__label">Checked in</p><p class="kiosk__name">Ivy S.</p>');
    expect(html(el)).not.toContain("Sample");

    vi.advanceTimersByTime(2999);
    expect(statusLine(render())).toContain("Ivy S.");
    vi.advanceTimersByTime(1);
    expect(statusLine(render())).not.toContain("Ivy S.");
  });

  it("T1 with a staff member signed in on the kiosk (no device token, the reply has the email) the door still shows `short`, and no email", async () => {
    scan.mockResolvedValueOnce({ name: "Mary Ann Lee", short: "Mary L.", email: "student2@example.edu", already: true });
    await typeCode("staff", "abc234");
    expect(scan).toHaveBeenCalledWith({ channel: "gdg", code: "abc234", device: undefined });
    expect(scan.mock.calls[0][0].device).toBeUndefined();
    const el = render("staff");
    expect(statusLine(el)).toContain('<p class="kiosk__label">Already checked in</p><p class="kiosk__name">Mary L.</p>');
    const page = html(el);
    for (const hidden of ["Mary Ann Lee", "Lee", "student2@example.edu"]) expect(page).not.toContain(hidden);
  });

  it("T1 a reply with no `short` (a server from before it) shows `name`, as the door did before", async () => {
    scan.mockResolvedValueOnce({ name: "Ivy Sample", email: "", already: false });
    await typeCode("iPad", "abc234");
    expect(statusLine(render())).toContain('<p class="kiosk__label">Checked in</p><p class="kiosk__name">Ivy Sample</p>');
  });
});
