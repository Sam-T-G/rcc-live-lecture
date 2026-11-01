// @vitest-environment node
// #/checkin/stage when the professor taps the card (F38.2 to F38.4, sweep2-checkin-6 and
// sweep2-tests-3): × hides the check-in card, "Show check-in" brings it back, and the deck gets
// focus when it loads and after every tap, so the arrow keys keep moving the slides. There is no
// browser DOM, so React's hooks are swapped for a stand-in that keeps state and refs between
// renders (effects don't run); each render calls Stage as a plain function, and a test calls the
// handlers on the elements it returns. Stage.test.ts checks the markup.
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const hooks = vi.hoisted(() => ({ slots: [] as unknown[], at: 0 }));
vi.mock("react", async (orig) => {
  const R = await orig<typeof import("react")>();
  function slot<T>(make: () => T): [unknown[], number] {
    const i = hooks.at++;
    if (!(i in hooks.slots)) hooks.slots[i] = make();
    return [hooks.slots, i];
  }
  return {
    ...R,
    useState: (init: unknown) => {
      const [list, i] = slot(() => (typeof init === "function" ? (init as () => unknown)() : init));
      return [list[i], (next: unknown) => (list[i] = typeof next === "function" ? (next as (v: unknown) => unknown)(list[i]) : next)];
    },
    useRef: (init: unknown) => {
      const [list, i] = slot(() => ({ current: init }));
      return list[i];
    },
    useEffect: () => {},
  };
});
vi.mock("convex/react", () => ({ useQuery: () => undefined }));
vi.mock("./LateBanner", () => ({ default: () => null }));
vi.mock("../../blocks/router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../blocks/router")>()),
  useHashParams: () => new URLSearchParams("deck=https://deck.example.com/d/"),
}));

const { default: Stage } = await import("./Stage");

type El = ReactElement<{ children?: ReactNode; className?: string; ref?: { current: unknown }; onClick?: () => void; onLoad?: () => void; onPointerUp?: () => void }>;
function elements(node: ReactNode): El[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement(node)) return [];
  const el = node as El;
  return [el, ...elements(el.props.children)];
}
function render() {
  hooks.at = 0;
  return elements(Stage());
}
const byClass = (els: El[], name: string) => els.find((e) => typeof e.type === "string" && e.props.className === name);

beforeEach(() => {
  hooks.slots = [];
  vi.stubGlobal("location", { hash: "#/checkin/stage", href: "https://x/#/checkin/stage", origin: "https://x", pathname: "/", protocol: "https:", search: "" });
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("#/checkin/stage, tapping the card", () => {
  it("F38.2 × hides the check-in card, and 'Show check-in' brings it back", () => {
    let els = render();
    expect(byClass(els, "stage__card")).toBeDefined();
    expect(byClass(els, "stage__show")).toBeUndefined();
    byClass(els, "stage__hide")!.props.onClick!();
    els = render();
    expect(byClass(els, "stage__card")).toBeUndefined();
    const show = byClass(els, "stage__show")!;
    expect(show.props.children).toBe("Show check-in");
    show.props.onClick!();
    els = render();
    expect(byClass(els, "stage__card")).toBeDefined();
    expect(byClass(els, "stage__show")).toBeUndefined();
  });

  it("F38.3 the deck gets focus when it loads and after every tap on the page", () => {
    const focus = vi.fn();
    let els = render();
    const frame = els.find((e) => e.type === "iframe")!;
    frame.props.ref!.current = { contentWindow: { focus } };
    frame.props.onLoad!();
    expect(focus).toHaveBeenCalledTimes(1);
    els = render();
    byClass(els, "stage")!.props.onPointerUp!();
    expect(focus).toHaveBeenCalledTimes(1); // after the tap's own handlers, on the next turn
    vi.runAllTimers();
    expect(focus).toHaveBeenCalledTimes(2);
  });
});
