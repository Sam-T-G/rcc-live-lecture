// @vitest-environment node
// calm() and onCalmChange() (kit.tsx): reduced motion for scripted moves (a FLIP, a WAAPI
// animation), read when a move is about to run, so a setting changed while the page is open
// counts on the next move (MOTION.md "Reduced motion"). These tests have no browser, so each one
// hands the module a stand-in window.matchMedia.
import { afterEach, describe, expect, it, vi } from "vitest";
import { calm, onCalmChange } from "./kit";

type Change = { matches: boolean };

// window.matchMedia with one live answer per query, like the browser's MediaQueryList: `set`
// changes the device's reduced-motion setting and tells every "change" listener.
function device(reduced: boolean) {
  const asked: string[] = [];
  const listeners = new Set<(e: Change) => void>();
  let matches = reduced;
  const query = {
    get matches() {
      return matches;
    },
    addEventListener: (_type: "change", fn: (e: Change) => void) => void listeners.add(fn),
    removeEventListener: (_type: "change", fn: (e: Change) => void) => void listeners.delete(fn),
  };
  vi.stubGlobal("window", {
    matchMedia: (q: string) => {
      asked.push(q);
      return query;
    },
  });
  return {
    asked,
    listeners,
    set(next: boolean) {
      matches = next;
      for (const fn of [...listeners]) fn({ matches: next });
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("calm", () => {
  it("off a browser (tests, the server) it says false and listening does nothing", () => {
    expect(calm()).toBe(false);
    const stop = onCalmChange(() => {
      throw new Error("no setting to hear");
    });
    expect(stop).toBeTypeOf("function");
    stop();
  });

  it("asks for prefers-reduced-motion: reduce and says what the device is set to", () => {
    const on = device(true);
    expect(calm()).toBe(true);
    expect(on.asked).toEqual(["(prefers-reduced-motion: reduce)"]);
    device(false);
    expect(calm()).toBe(false);
  });

  it("reads the setting each time it is asked, so a change while the page is open counts on the next move", () => {
    const on = device(false);
    expect(calm()).toBe(false);
    on.set(true);
    expect(calm()).toBe(true);
    on.set(false);
    expect(calm()).toBe(false);
  });

  it("onCalmChange hears each change of the setting until the function it returns is called", () => {
    const on = device(false);
    const heard: boolean[] = [];
    const stop = onCalmChange((reduced) => heard.push(reduced));
    expect(on.listeners.size).toBe(1);
    on.set(true);
    on.set(false);
    expect(heard).toEqual([true, false]);
    stop();
    expect(on.listeners.size).toBe(0);
    on.set(true);
    expect(heard).toEqual([true, false]);
  });
});
