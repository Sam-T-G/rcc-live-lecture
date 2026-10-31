// @vitest-environment node
// When the pass page asks for a new code and when it hides the one it has (passTiming.ts, used by
// Student.tsx). window and document are plain EventTargets here.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { askForCodes, codeIsOld, msUntilNewCode } from "./passTiming";

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("checkin-frontend-10 checkin-backend-7 the pass page keeps its code new", () => {
  it("F11.5 asks on mount, every 5 s, when the page turns visible, on focus, when the connection comes back and when the browser restores the page; not when the page hides; never after it stops", () => {
    const win = new EventTarget();
    const doc = Object.assign(new EventTarget(), { visibilityState: "visible" });
    const ask = vi.fn();
    const stop = askForCodes(ask, win, doc);
    expect(ask).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(4_999);
    expect(ask).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(ask).toHaveBeenCalledTimes(2);

    // The phone locks: the page hides, and nothing asks.
    doc.visibilityState = "hidden";
    doc.dispatchEvent(new Event("visibilitychange"));
    expect(ask).toHaveBeenCalledTimes(2);
    // The phone wakes: the page turns visible and asks at once, without waiting for the 5 s.
    doc.visibilityState = "visible";
    doc.dispatchEvent(new Event("visibilitychange"));
    expect(ask).toHaveBeenCalledTimes(3);
    for (const [i, e] of ["focus", "online", "pageshow"].entries()) {
      win.dispatchEvent(new Event(e));
      expect(ask).toHaveBeenCalledTimes(4 + i);
    }

    stop();
    vi.advanceTimersByTime(60_000);
    doc.dispatchEvent(new Event("visibilitychange"));
    for (const e of ["focus", "online", "pageshow"]) win.dispatchEvent(new Event(e));
    expect(ask).toHaveBeenCalledTimes(6);
  });

  it("F11.5 hides a code over 25 s old by this phone's clock, and asks again just after the code turns 20 s old", () => {
    const got = 1_000_000;
    expect(codeIsOld(got, got)).toBe(false);
    expect(codeIsOld(got, got + 25_000)).toBe(false);
    expect(codeIsOld(got, got + 25_001)).toBe(true);
    expect(codeIsOld(got, got + 90_000)).toBe(true); // the phone slept for 90 s
    expect(msUntilNewCode(got, got)).toBe(20_250);
    expect(msUntilNewCode(got, got + 5_000)).toBe(15_250);
    expect(msUntilNewCode(got, got + 30_000)).toBe(0);
  });
});
