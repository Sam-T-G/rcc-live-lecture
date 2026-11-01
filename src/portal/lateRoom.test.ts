// @vitest-environment node
// The room #/portal leaves for the late banner (lateRoom.ts), run with a stand-in banner box,
// window and ResizeObserver, so the measuring runs without a browser. The PORTAL browser check
// covers the real page: at 390x844 and 320x568 the bottom of .portal__links stays above the top
// of .late while banners show.
import { describe, expect, it } from "vitest";
import { atBottom, roomFor, scrollToBottom, watchLateRoom, type PageWindow } from "./lateRoom";

function fakeWindow(scrollY: number, innerHeight: number, scrollHeight: number) {
  const win = {
    scrollY,
    innerHeight,
    document: { documentElement: { scrollHeight } },
    scrolledTo: [] as number[],
    scrollTo(_x: number, y: number) {
      win.scrolledTo.push(y);
    },
  };
  return win satisfies PageWindow;
}

// A ResizeObserver stand-in: resize() runs the callback the way a browser does when the box changes.
function fakeObserver() {
  const made: { callback: () => void; observed: unknown[]; disconnected: boolean }[] = [];
  class Resize {
    entry: (typeof made)[number];
    constructor(callback: () => void) {
      this.entry = { callback, observed: [], disconnected: false };
      made.push(this.entry);
    }
    observe(el: unknown) {
      this.entry.observed.push(el);
    }
    disconnect() {
      this.entry.disconnected = true;
    }
  }
  return { Resize, made, resize: () => made.forEach((m) => !m.disconnected && m.callback()) };
}

describe("#/portal late room", () => {
  it("PORTAL-fixcheck-1: the room is the banner's height plus 16px, and 0 with no banner", () => {
    expect(roomFor(0)).toBe(0);
    expect(roomFor(60)).toBe(76);
    expect(roomFor(196)).toBe(212);
  });

  it("PORTAL-fixcheck-1: --late-room follows the banner: 0, then 76px while a 60px banner shows, then 0 when it hides; it stops watching on cleanup", () => {
    const banner = { offsetHeight: 0 };
    const win = fakeWindow(0, 844, 844);
    const { Resize, made, resize } = fakeObserver();
    const calls: [number, boolean][] = [];
    const stop = watchLateRoom(banner, win, Resize, (px, keep) => calls.push([px, keep]));
    expect(made).toHaveLength(1);
    expect(made[0].observed).toEqual([banner]);
    expect(calls).toEqual([]); // no banner yet: the room stays 0

    banner.offsetHeight = 60;
    resize();
    banner.offsetHeight = 0;
    resize();
    expect(calls).toEqual([
      [76, true],
      [0, false],
    ]);

    stop();
    expect(made[0].disconnected).toBe(true);
  });

  it("PORTAL-check-r2-1 / PORTAL-fixcheck-2: when the room grows with the page at its bottom (a page that fits, or a long slide scrolled to the end), the page is told to scroll to the new bottom", () => {
    // 320x568, two banners: the page fit the screen before the second banner came.
    const fits = fakeWindow(0, 568, 568);
    const two = { offsetHeight: 98 };
    const a = fakeObserver();
    const fitsCalls: [number, boolean][] = [];
    watchLateRoom(two, fits, a.Resize, (px, keep) => fitsCalls.push([px, keep]));
    two.offsetHeight = 196;
    a.resize();
    expect(fitsCalls).toEqual([
      [114, true],
      [212, true],
    ]);

    // 390x844, a long slide scrolled to the end (fractions of a pixel count as the end).
    const end = fakeWindow(1153.5, 844, 1998);
    const b = fakeObserver();
    const endCalls: [number, boolean][] = [];
    watchLateRoom({ offsetHeight: 61 }, end, b.Resize, (px, keep) => endCalls.push([px, keep]));
    expect(endCalls).toEqual([[77, true]]);
  });

  it("PORTAL-fixcheck-2: a student scrolled up on a long slide is not moved when a banner shows", () => {
    const up = fakeWindow(0, 844, 1998);
    const { Resize } = fakeObserver();
    const calls: [number, boolean][] = [];
    watchLateRoom({ offsetHeight: 61 }, up, Resize, (px, keep) => calls.push([px, keep]));
    expect(calls).toEqual([[77, false]]);
  });

  it("atBottom and scrollToBottom read and set the window's scroll", () => {
    expect(atBottom(fakeWindow(0, 568, 568))).toBe(true);
    expect(atBottom(fakeWindow(1000, 844, 1846))).toBe(true);
    expect(atBottom(fakeWindow(990, 844, 1846))).toBe(false);
    const win = fakeWindow(0, 568, 647);
    scrollToBottom(win);
    expect(win.scrolledTo).toEqual([647]);
  });
});
