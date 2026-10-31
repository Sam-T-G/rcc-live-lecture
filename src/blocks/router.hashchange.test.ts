// @vitest-environment node
// useHashParams (router.tsx) reads the hash again on every hashchange, so a stage already open on
// the projector picks up a new ?deck= or ?bridge= pasted into the address bar. Node has no DOM to
// render into, so this file swaps React's useState, useEffect and useMemo for a one-component
// stand-in that keeps state between calls and runs effects when the test says, and fires real
// hashchange Events on an EventTarget standing in for window. router.test.ts covers the first read.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useHashParams } from "./router";

const hooks = vi.hoisted(() => ({
  state: [] as unknown[],
  effects: [] as (() => void | (() => void))[],
  next: 0,
}));

vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useState: (init: unknown) => {
    const at = hooks.next++;
    if (!(at in hooks.state)) hooks.state[at] = typeof init === "function" ? (init as () => unknown)() : init;
    return [hooks.state[at], (v: unknown) => (hooks.state[at] = v)];
  },
  useEffect: (effect: () => void | (() => void)) => {
    hooks.effects.push(effect);
  },
  useMemo: (make: () => unknown) => make(),
}));

// One render of a component that calls useHashParams, as the stage does.
function Stage() {
  hooks.next = 0;
  hooks.effects = [];
  return useHashParams();
}

function setHash(hash: string) {
  location.hash = hash;
  window.dispatchEvent(new Event("hashchange"));
}

beforeEach(() => {
  hooks.state = [];
  vi.stubGlobal("window", new EventTarget());
  vi.stubGlobal("location", { hash: "#/checkin/stage?deck=https://one.example.com/&bridge=gdg.k1" });
});

describe("useHashParams on hashchange", () => {
  it("reads ?deck= and ?bridge= again after the hash changes, and stops once the page closes", () => {
    expect(Stage().get("deck")).toBe("https://one.example.com/");
    const cleanups = hooks.effects.map((effect) => effect());

    setHash("#/checkin/stage?deck=https://two.example.com/&bridge=gdg.k2");
    const params = Stage();
    expect(params.get("deck")).toBe("https://two.example.com/");
    expect(params.get("bridge")).toBe("gdg.k2");

    for (const cleanup of cleanups) cleanup?.();
    setHash("#/checkin/stage?deck=https://three.example.com/");
    expect(Stage().get("deck")).toBe("https://two.example.com/");
  });
});
