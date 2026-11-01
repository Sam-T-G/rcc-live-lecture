// @vitest-environment node
// Paging on #/portal (Slides in Page.tsx), driven the way a student drives it: ← Back, Next →
// and Back to live pressed, ArrowLeft and ArrowRight sent to the window, and a swipe sent to the
// slide's touch handlers. paging.test.ts tests the rules in paging.ts; this file tests that
// Page.tsx wires them to the right buttons, keys and swipe directions, and that it runs settle
// on every render (sweep2-ios-1). No DOM here, so the test calls Slides as a function with
// stand-in hooks, finds the elements it returns, and calls their handlers. Each render runs
// again until the state settles, the way React re-renders after a set during render.
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { getFunctionName, type FunctionReference } from "convex/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Slides } from "./Page";

const state = vi.hoisted(() => ({
  slots: [] as unknown[], // useState and useRef values, in hook order
  next: 0,
  changed: false, // a set ran since the last render
  keydown: null as ((e: unknown) => void) | null, // the listener Slides added to the window
  live: null as unknown, // deck.current
  shown: [] as unknown, // deck.slides
}));

vi.mock("react", async (importOriginal) => {
  const real = await importOriginal<typeof import("react")>();
  const useState = (init: unknown) => {
    const i = state.next++;
    if (!(i in state.slots)) state.slots[i] = typeof init === "function" ? (init as () => unknown)() : init;
    const set = (value: unknown) => {
      const v = typeof value === "function" ? (value as (old: unknown) => unknown)(state.slots[i]) : value;
      if (!Object.is(v, state.slots[i])) state.changed = true;
      state.slots[i] = v;
    };
    return [state.slots[i], set];
  };
  const useRef = (init: unknown) => {
    const i = state.next++;
    if (!(i in state.slots)) state.slots[i] = { current: init };
    return state.slots[i];
  };
  // Slides' one effect has no deps, so it runs once, on the first render.
  const useEffect = (effect: () => void) => {
    const i = state.next++;
    if (!(i in state.slots)) {
      state.slots[i] = true;
      effect();
    }
  };
  const hooks = { useState, useRef, useEffect };
  return { ...real, ...hooks, default: { ...real, ...hooks } };
});
vi.mock("convex/react", () => ({
  useQuery: (ref: FunctionReference<"query">) => (getFunctionName(ref) === "deck:slides" ? state.shown : undefined),
}));
vi.mock("../blocks/deck", () => ({ CHANNEL: "gdg", useDeckSlide: () => state.live }));
vi.mock("../teams/checkin/LateBanner", () => ({ default: () => null }));

type El = ReactElement<Record<string, unknown> & { children?: ReactNode }>;
const slide = (index: number, deck = "A") => ({ index, beat: 0, title: `${deck}${index + 1}`, lines: [], at: 0 });
// The deck tab `deck` is on slide `index + 1` of 10, and deck.slides lists `shown` (0-based).
function deckOn(index: number, shown: number[], deck = "A") {
  state.live = { ...slide(index, deck), count: 10 };
  state.shown = shown.map((i) => slide(i, deck));
}
const upTo = (index: number) => Array.from({ length: index + 1 }, (_, i) => i);

function render(): El {
  let tree: El;
  let rounds = 0;
  do {
    state.changed = false;
    state.next = 0;
    tree = Slides({ channel: "gdg" }) as El;
  } while (state.changed && ++rounds < 5);
  return tree;
}
function all(node: ReactNode, out: El[] = []): El[] {
  if (Array.isArray(node)) for (const n of node) all(n, out);
  else if (isValidElement(node)) {
    const el = node as El;
    out.push(el);
    all(el.props.children, out);
  }
  return out;
}
const text = (node: ReactNode): string =>
  Array.isArray(node) ? node.map(text).join("") : typeof node === "string" || typeof node === "number" ? String(node) : isValidElement(node) ? text((node as El).props.children) : "";

// What the phone shows: the slide's title, the notice when the professor moved on, and the buttons.
function screen() {
  const els = all(render());
  const title = els.find((el) => el.type === "h1");
  const notice = els.find((el) => el.props.className === "portal__notice");
  const buttons = els.filter((el) => el.type === "button").map((el) => text(el.props.children));
  return { title: title ? text(title.props.children) : null, notice: notice ? text(notice.props.children) : null, buttons };
}
function button(label: string) {
  const el = all(render()).find((e) => e.type === "button" && text(e.props.children) === label);
  if (!el) throw new Error(`no ${label} button`);
  return el;
}
function press(label: string) {
  const el = button(label);
  expect(el.props.disabled, `${label} is disabled`).toBeFalsy();
  (el.props.onClick as () => void)();
}
type Held = { altKey?: boolean; ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean };
// A key press with nothing held pages, so its default action is blocked. With a modifier held
// (Shift+ArrowLeft selects text, Cmd+ArrowLeft goes back in Safari) the page leaves it alone.
function key(name: string, held: Held = {}) {
  render();
  if (!state.keydown) throw new Error("no keydown listener on the window");
  const e = { key: name, altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, ...held, preventDefault: vi.fn() };
  state.keydown(e);
  if (Object.values(held).some(Boolean)) expect(e.preventDefault).not.toHaveBeenCalled();
  else expect(e.preventDefault).toHaveBeenCalled();
}
// A swipe on the slide that starts at (200, 300) and lifts dx pixels sideways (negative is toward
// the left edge) and dy pixels down, with `fingers` on the glass when it starts.
function swipe(dx: number, dy = 0, fingers = 1) {
  const main = render();
  expect(main.type).toBe("main");
  const touches = Array.from({ length: fingers }, (_, i) => ({ clientX: 200 + i * 80, clientY: 300 }));
  (main.props.onTouchStart as (e: unknown) => void)({ touches });
  (main.props.onTouchEnd as (e: unknown) => void)({ changedTouches: [{ clientX: 200 + dx, clientY: 300 + dy }] });
}

beforeEach(() => {
  state.slots = [];
  state.keydown = null;
  vi.stubGlobal("window", {
    addEventListener: (type: string, fn: (e: unknown) => void) => {
      if (type === "keydown") state.keydown = fn;
    },
    removeEventListener: () => {},
  });
});

describe("#/portal paging, pressed, typed and swiped (sweep2-live-fixcheck-1, sweep2-tests-4-wiring)", () => {
  it("← Back opens the shown slide before the one on screen, Next → the one after, and Next → from the slide before live follows live", () => {
    deckOn(5, upTo(5)); // slides 1 to 6 shown, the professor on 6
    expect(screen()).toEqual({ title: "A6", notice: null, buttons: ["← Back", "Next →"] });
    expect(button("Next →").props.disabled).toBe(true);

    press("← Back");
    expect(screen()).toEqual({ title: "A5", notice: null, buttons: ["Back to live", "← Back", "Next →"] });
    press("← Back");
    expect(screen().title).toBe("A4");
    press("Next →");
    expect(screen().title).toBe("A5");
    press("Next →");
    expect(screen()).toEqual({ title: "A6", notice: null, buttons: ["← Back", "Next →"] });

    press("← Back");
    press("← Back");
    expect(screen()).toEqual({ title: "A4", notice: null, buttons: ["Back to live", "← Back", "Next →"] });
    press("Back to live"); // the one in the bar, while the professor is still on slide 6
    expect(screen()).toEqual({ title: "A6", notice: null, buttons: ["← Back", "Next →"] });
  });

  it("ArrowLeft opens the slide before, ArrowRight the one after", () => {
    deckOn(5, upTo(5));
    key("ArrowLeft");
    expect(screen().title).toBe("A5");
    key("ArrowLeft");
    expect(screen().title).toBe("A4");
    key("ArrowRight");
    expect(screen().title).toBe("A5");
    key("ArrowRight");
    expect(screen().title).toBe("A6");
  });

  it("ArrowLeft after the professor moves on opens the slide before the new live one", () => {
    deckOn(5, upTo(5)); // the student follows live on slide 6
    expect(screen().title).toBe("A6");
    deckOn(6, upTo(6)); // the professor moves to slide 7
    expect(screen().title).toBe("A7");
    key("ArrowLeft");
    expect(screen().title).toBe("A6");
  });

  it("an arrow key with Shift, Ctrl, Alt or Cmd held doesn't page and keeps its default action", () => {
    deckOn(5, upTo(5));
    key("ArrowLeft", { shiftKey: true });
    expect(screen().title).toBe("A6");
    key("ArrowLeft", { metaKey: true });
    key("ArrowLeft", { ctrlKey: true });
    key("ArrowLeft", { altKey: true });
    expect(screen().title).toBe("A6");
    press("← Back");
    key("ArrowRight", { shiftKey: true });
    expect(screen().title).toBe("A5");
  });

  it("a mostly up-and-down drag (scrolling a long slide) and a two-finger touch don't page", () => {
    deckOn(5, upTo(5));
    swipe(60, 200); // 60px sideways while scrolling 200px down
    expect(screen().title).toBe("A6");
    swipe(-60, -200);
    expect(screen().title).toBe("A6");
    swipe(120, 0, 2); // a pinch that ends 120px to the side
    expect(screen().title).toBe("A6");
    swipe(120); // the same move with one finger pages
    expect(screen().title).toBe("A5");
  });

  it("a swipe right (finger toward the right edge) opens the slide before, a swipe left the one after, and a short one does nothing", () => {
    deckOn(5, upTo(5));
    swipe(120);
    expect(screen().title).toBe("A5");
    swipe(120);
    expect(screen().title).toBe("A4");
    swipe(-30); // under 50px
    expect(screen().title).toBe("A4");
    swipe(-120);
    expect(screen().title).toBe("A5");
  });

  it("Back to live and the notice: the professor moves on while the student reads slide 4", () => {
    deckOn(5, upTo(5));
    press("← Back");
    press("← Back");
    deckOn(6, upTo(6));
    expect(screen()).toMatchObject({ title: "A4", notice: "The professor is on slide 7 now.Back to live" });
    press("Back to live");
    expect(screen()).toEqual({ title: "A7", notice: null, buttons: ["← Back", "Next →"] });
  });

  it("sweep2-ios-1 a phone paged back to deck A's slide 2 follows live through deck B, and stays live when the professor goes back to deck A's tab", () => {
    deckOn(5, upTo(5)); // deck A on slide 6
    for (let i = 0; i < 4; i++) press("← Back");
    expect(screen().title).toBe("A2");
    deckOn(7, [7], "B"); // the professor opens deck B on its slide 8 in another tab
    expect(screen()).toMatchObject({ title: "B8", notice: null });
    deckOn(6, upTo(6)); // back to deck A's tab, on to slide 7
    expect(screen()).toEqual({ title: "A7", notice: null, buttons: ["← Back", "Next →"] });
  });

  it("a phone paged to slide 4 follows live when the professor goes back to slide 3, and stays live when they go on to slide 5", () => {
    deckOn(5, upTo(5));
    press("← Back");
    press("← Back");
    expect(screen().title).toBe("A4");
    deckOn(2, upTo(5)); // the professor goes back to slide 3
    expect(screen()).toMatchObject({ title: "A3", notice: null });
    deckOn(4, upTo(5)); // and on to slide 5
    expect(screen()).toEqual({ title: "A5", notice: null, buttons: ["← Back", "Next →"] });
  });
});
