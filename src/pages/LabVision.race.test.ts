// @vitest-environment node
// #/lab's vision panel (LabVision.tsx): a model still loading when the Model select changes. No
// browser DOM and no MediaPipe: React's state hooks are a small stand-in that keeps each hook's
// value between renders (as in Lab.test.ts), loadVision waits until the test hands it a model,
// and the camera only counts its starts.
import { createElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const hooks = vi.hoisted(() => ({ slots: [] as unknown[], at: 0 }));
vi.mock("react", async (orig) => {
  const R = await orig<typeof import("react")>();
  function slot<T>(make: () => T): T {
    const i = hooks.at++;
    if (!(i in hooks.slots)) hooks.slots[i] = make();
    return hooks.slots[i] as T;
  }
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
    useCallback: (fn: unknown) => fn,
    useEffect: () => {},
  };
});

const models = vi.hoisted(() => ({ waiting: [] as ((r: unknown) => void)[], starts: 0, runners: [] as unknown[] }));
vi.mock("../blocks/vision", () => ({
  VISION: { gestures: { what: "hand gestures" }, pose: { what: "33 body points" } },
  drawSeen: () => {},
  loadVision: () => new Promise((r) => models.waiting.push(r)),
  useCamera: () => ({ video: { current: null }, on: false, error: null, start: async () => void models.starts++, stop: () => {} }),
  useVisionLoop: (_video: unknown, runner: unknown) => void models.runners.push(runner),
}));
const { default: Vision } = await import("./LabVision");

type El = ReactElement<{ children?: ReactNode; onChange?: (e: object) => unknown; onClick?: () => unknown; "aria-label"?: string; ref?: { current: unknown } }>;
function all(node: ReactNode, out: El[] = []): El[] {
  if (Array.isArray(node)) node.forEach((n) => all(n, out));
  else if (isValidElement(node)) {
    out.push(node as El);
    all((node as El).props.children, out);
  }
  return out;
}
const tree = () => {
  hooks.at = 0;
  return all(Vision() as ReactNode);
};
const html = () => {
  hooks.at = 0;
  return renderToStaticMarkup(createElement(Vision));
};
const modelSelect = () => tree().find((e) => e.type === "select" && e.props["aria-label"] === undefined)!;
const sampleSelect = () => tree().find((e) => e.type === "select" && e.props["aria-label"] === "Sample picture")!;
const GESTURES = { run: () => ({ count: 1, labels: ["Thumb_Up"], raw: {} }) };

beforeEach(() => {
  hooks.slots = [];
  models.waiting = [];
  models.starts = 0;
  models.runners = [];
});

describe("LabVision: changing the model while one loads", () => {
  it("sweep1-blocks-2 a sample picture's run drops the old model's result once the Model select changes", async () => {
    tree().find((e) => e.type === "img")!.props.ref!.current = { decode: async () => {}, naturalWidth: 10, naturalHeight: 10 };
    const running = sampleSelect().props.onChange!({ target: { value: "Thumbs up" } }) as Promise<void>;
    modelSelect().props.onChange!({ target: { value: "pose" } });
    models.waiting[0](GESTURES); // the gestures model arrives after the switch
    await running;
    const out = html();
    expect(out).toContain('<option value="pose" selected="">');
    expect(out).not.toContain("Thumb_Up");
    expect(out).not.toContain("Loaded in");
  });

  it("sweep1-blocks-2 Use the camera drops the old model and doesn't start the camera once the Model select changes", async () => {
    const button = tree().find((e) => e.type === "button" && e.props.children === "Use the camera")!;
    const starting = button.props.onClick!() as Promise<void>;
    modelSelect().props.onChange!({ target: { value: "pose" } });
    models.waiting[0](GESTURES);
    await starting;
    html();
    expect(models.starts).toBe(0);
    expect(models.runners.at(-1)).toBeNull();
    expect(html()).not.toContain("Loaded in");
  });

  it("sweep1-blocks-2 without a switch, the camera and the sample picture still run", async () => {
    tree().find((e) => e.type === "img")!.props.ref!.current = { decode: async () => {}, naturalWidth: 10, naturalHeight: 10 };
    const running = sampleSelect().props.onChange!({ target: { value: "Thumbs up" } }) as Promise<void>;
    models.waiting[0](GESTURES);
    await running;
    expect(html()).toContain("Thumb_Up");

    const starting = tree().find((e) => e.type === "button" && e.props.children === "Use the camera")!.props.onClick!() as Promise<void>;
    models.waiting[1](GESTURES);
    await starting;
    html();
    expect(models.starts).toBe(1);
    expect(models.runners.at(-1)).toBe(GESTURES);
  });
});
