// @vitest-environment node
// Paging on #/live (LiveSlides in Page.tsx), pressed: ← Back, Next → and Back to live (F19.2), and
// what the phone does when the deck moves or another deck tab takes over. No DOM here, so the test
// calls LiveSlides as a function with a stand-in useState, finds the slide's title and the kit
// Buttons in the elements it returns, and calls a Button's onClick the way a tap would. Each
// render runs again until the state settles, the way React re-renders after a set during render.
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { getFunctionName, type FunctionReference } from "convex/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Button } from "../../blocks/kit";
import { LiveSlides } from "./Page";

const state = vi.hoisted(() => ({
  slots: [] as unknown[], // useState values, in hook order
  next: 0,
  changed: false, // a set ran since the last render
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
  return { ...real, useState, default: { ...real, useState } };
});
vi.mock("convex/react", () => ({
  useQuery: (ref: FunctionReference<"query">) => (getFunctionName(ref) === "deck:slides" ? state.shown : undefined),
  useMutation: () => async () => null,
}));
vi.mock("../../blocks/deck", () => ({ CHANNEL: "gdg", useDeckSlide: () => state.live }));
vi.mock("../../blocks/auth", () => ({ useGoogleUser: () => ({ user: null }), SignedInAs: () => null, StudentSignIn: () => null }));

type El = ReactElement<Record<string, unknown> & { children?: ReactNode }>;
const slide = (index: number, deck = "A") => ({ index, beat: 0, title: `${deck}${index + 1}`, lines: [], at: 0 });
// The deck tab `deck` is on slide `index + 1` of 10, and deck.slides lists `shown` (0-based).
function deckOn(index: number, shown: number[], deck = "A") {
  state.live = { ...slide(index, deck), count: 10 };
  state.shown = shown.map((i) => slide(i, deck));
}
const upTo = (index: number) => Array.from({ length: index + 1 }, (_, i) => i);

let pin: number | null = null;
function render(): El {
  let tree: El;
  let rounds = 0;
  do {
    state.changed = false;
    state.next = 0;
    tree = LiveSlides({ pin }) as El;
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

// What the phone shows: the slide's title, the professor's slide when paged back, and the buttons.
function screen() {
  const els = all(render());
  const title = els.find((el) => el.props.className === "slide__title");
  const notice = els.find((el) => el.props.className === "slide__live muted");
  const buttons = els.filter((el) => el.type === Button).map((el) => text(el.props.children));
  return { title: title ? text(title.props.children) : null, notice: notice ? text(notice.props.children) : null, buttons };
}
function press(label: string) {
  const el = all(render()).find((e) => e.type === Button && text(e.props.children) === label);
  if (!el) throw new Error(`no ${label} button`);
  expect(el.props.disabled, `${label} is disabled`).toBeFalsy();
  (el.props.onClick as () => void)();
}
const disabled = (label: string) => all(render()).find((e) => e.type === Button && text(e.props.children) === label)?.props.disabled;

beforeEach(() => {
  state.slots = [];
  pin = null;
});

describe("#/live paging, pressed (F19.2)", () => {
  it("sweep2-tests-5 sweep2-ledger-6 ← Back opens the shown slide just before the one on screen, Next → the one after, then live", () => {
    deckOn(5, upTo(5)); // slides 1 to 6 shown, the professor on 6
    expect(screen()).toMatchObject({ title: "A6", notice: null });
    expect(disabled("Next →")).toBe(true); // nothing ahead of the professor

    press("← Back");
    // Back to live sits in the slide card, above the action bar's ← Back and Next → (DS-PHONE-design-2).
    expect(screen()).toEqual({ title: "A5", notice: "The professor is on slide 6 now.", buttons: ["Back to live", "← Back", "Next →"] });
    press("← Back");
    press("← Back");
    expect(screen().title).toBe("A3");
    press("Next →");
    expect(screen()).toMatchObject({ title: "A4", notice: "The professor is on slide 6 now." });
    press("Next →");
    expect(screen().title).toBe("A5");
    press("Next →"); // the next shown slide is the live one: follow live again
    expect(screen()).toEqual({ title: "A6", notice: null, buttons: ["← Back", "Next →"] });
  });

  it("← Back skips slides the deck never showed, and Back to live returns to the professor's slide", () => {
    deckOn(6, [0, 2, 6]); // the professor showed slides 1, 3 and 7
    press("← Back");
    expect(screen().title).toBe("A3");
    press("← Back");
    expect(screen().title).toBe("A1");
    expect(disabled("← Back")).toBe(true);
    press("Next →");
    expect(screen().title).toBe("A3");
    press("Back to live");
    expect(screen()).toMatchObject({ title: "A7", notice: null });
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
});
