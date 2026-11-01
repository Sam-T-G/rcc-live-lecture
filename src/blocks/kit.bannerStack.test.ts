// @vitest-environment node
// <BannerStack> (kit.tsx) itself: its layout effect measures the stack and puts
// --banner-stack-space on <html>, which pads the bottom of the page (sweep1-core-check-1) and
// lifts the late banner above the sign-in warning (sweep1-core-fixcheck-1). stackSpace.test.ts
// checks the math and the stylesheets; this checks that BannerStack runs them, so a BannerStack
// that goes back to a plain <div className="banner-stack"> fails here. There's no browser DOM:
// React's hooks are swapped for stand-ins that hand the test the ref and the layout effect, and
// the element, <html>, window and ResizeObserver are small fakes.
import { isValidElement, type ReactElement, type RefObject } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STACK_SPACE } from "./stackSpace";

const hooks = vi.hoisted(() => ({ refs: [] as { current: unknown }[], layoutEffects: [] as (() => void | (() => void))[] }));
vi.mock("react", async (orig) => {
  const R = await orig<typeof import("react")>();
  return {
    ...R,
    useRef: (init: unknown) => {
      const ref = { current: init };
      hooks.refs.push(ref);
      return ref;
    },
    // useEffect too: measuring in a plain effect would still set the variable in a browser.
    useLayoutEffect: (effect: () => void | (() => void)) => void hooks.layoutEffects.push(effect),
    useEffect: (effect: () => void | (() => void)) => void hooks.layoutEffects.push(effect),
  };
});

const { BannerStack } = await import("./kit");

// The check's numbers: on an 844 px tall phone the fixed stack's top sat at y=664.
let rect: { top: number; height: number };
let position: string;
let listeners: Map<string, () => void>;
let observed: { callback: () => void; target?: object; disconnected: boolean }[];
let props: Map<string, string>;
const el = { getBoundingClientRect: () => rect };

beforeEach(() => {
  hooks.refs = [];
  hooks.layoutEffects = [];
  rect = { top: 664, height: 164 };
  position = "fixed";
  listeners = new Map();
  observed = [];
  props = new Map();
  vi.stubGlobal("document", {
    documentElement: { style: { setProperty: (k: string, v: string) => void props.set(k, v), removeProperty: (k: string) => (props.delete(k), "") } },
  });
  vi.stubGlobal("window", {
    innerHeight: 844,
    addEventListener: (type: string, fn: () => void) => void listeners.set(type, fn),
    removeEventListener: (type: string, fn: () => void) => listeners.get(type) === fn && listeners.delete(type),
  });
  vi.stubGlobal("getComputedStyle", (target: object) => ({ position: target === el ? position : "static" }));
  vi.stubGlobal(
    "ResizeObserver",
    class {
      entry: (typeof observed)[number];
      constructor(callback: () => void) {
        this.entry = { callback, disconnected: false };
        observed.push(this.entry);
      }
      observe(target: object) {
        this.entry.target = target;
      }
      disconnect() {
        this.entry.disconnected = true;
      }
    },
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
});

// Renders BannerStack once, attaches the fake element to the ref on the div it returns, and runs
// its layout effects the way React would after the commit. Returns the cleanups.
function mount() {
  const out = BannerStack({ children: "Your sign-in ends in 5 minutes." }) as ReactElement<{ className?: string; ref?: RefObject<unknown> }>;
  expect(isValidElement(out)).toBe(true);
  expect(out.props.className).toBe("banner-stack");
  const ref = out.props.ref;
  expect(ref, "the banner-stack div has no ref, so nothing measures it").toBeDefined();
  expect(hooks.refs).toContain(ref);
  ref!.current = el;
  expect(hooks.layoutEffects.length, "BannerStack runs no effect, so --banner-stack-space is never set").toBeGreaterThan(0);
  return hooks.layoutEffects.map((effect) => effect()).filter((c): c is () => void => typeof c === "function");
}

describe("BannerStack", () => {
  it("sweep1-core-fixcheck-1 puts the fixed stack's space on <html> when it shows and takes it off when it goes", () => {
    const cleanups = mount();
    expect(props.get(STACK_SPACE)).toBe("180px");
    for (const cleanup of cleanups) cleanup();
    expect(props.has(STACK_SPACE)).toBe(false);
  });

  it("sweep1-core-fixcheck-1 measures again when the stack changes size or the window resizes, and stops listening after", () => {
    const cleanups = mount();
    expect(observed.map((o) => o.target)).toEqual([el]);

    rect = { top: 600, height: 228 }; // a second line wrapped in the warning
    observed[0].callback();
    expect(props.get(STACK_SPACE)).toBe("244px");

    rect = { top: 210, height: 164 }; // turned to landscape: 390 px tall
    vi.stubGlobal("window", { ...window, innerHeight: 390 });
    listeners.get("resize")!();
    expect(props.get(STACK_SPACE)).toBe("180px");

    for (const cleanup of cleanups) cleanup();
    expect(observed[0].disconnected).toBe(true);
    expect(listeners.has("resize")).toBe(false);
    expect(props.has(STACK_SPACE)).toBe(false);
  });

  it("sweep1-core-fixcheck-1 a stack shown in place (#/ui, not fixed) puts nothing on <html>", () => {
    position = "static";
    const cleanups = mount();
    expect(props.has(STACK_SPACE)).toBe(false);
    for (const cleanup of cleanups) cleanup();
  });
});
