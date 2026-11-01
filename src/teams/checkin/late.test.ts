// @vitest-environment node
// The late banner's lines and which arrivals it shows (late.ts, used by LateBanner.tsx).
// LateBanner.test.ts checks that the banner itself uses newArrivals that way.
import { describe, expect, it } from "vitest";
import { lateLine, newArrivals, type Late, type Seen } from "./late";

const row = (id: string, at: number): Late => ({ id, first: "Sample", lateMin: 10, at });
const ids = (rows: Late[]) => rows.map((r) => r.id);

describe("F16 the late banner shows each late arrival once, and only ones after the page opened", () => {
  it("checkin-frontend-15 an older arrival that comes back into the list of 5 (someone ticks or unticks the opt-out) never shows; a new one shows once", () => {
    // The 5 newest late arrivals when the page opens: E, D, C, B, A. F is older and cut off.
    let r = newArrivals([row("e", 50), row("d", 40), row("c", 30), row("b", 20), row("a", 10)], null);
    expect(r.fresh).toEqual([]);
    // E ticks the opt-out, so F comes back into the list.
    r = newArrivals([row("d", 40), row("c", 30), row("b", 20), row("a", 10), row("f", 5)], r.seen);
    expect(r.fresh).toEqual([]);
    // E unticks it: E is back.
    r = newArrivals([row("e", 50), row("d", 40), row("c", 30), row("b", 20), row("a", 10)], r.seen);
    expect(r.fresh).toEqual([]);
    // G walks in late: it shows, once.
    const withG = [row("g", 60), row("e", 50), row("d", 40), row("c", 30), row("b", 20)];
    r = newArrivals(withG, r.seen);
    expect(ids(r.fresh)).toEqual(["g"]);
    r = newArrivals(withG, r.seen);
    expect(r.fresh).toEqual([]);
    // G ticks and unticks the opt-out: G doesn't show again.
    r = newArrivals(withG.slice(1), r.seen);
    r = newArrivals(withG, r.seen);
    expect(r.fresh).toEqual([]);
  });

  it("checkin-frontend-15 two arrivals scanned in the same millisecond both show, each once", () => {
    let r = newArrivals([row("a", 10)], null);
    r = newArrivals([row("g", 60), row("a", 10)], r.seen);
    expect(ids(r.fresh)).toEqual(["g"]);
    r = newArrivals([row("h", 60), row("g", 60), row("a", 10)], r.seen);
    expect(ids(r.fresh)).toEqual(["h"]);
    expect(r.seen).toEqual({ at: 60, ids: ["g", "h"] } satisfies Seen);
    expect(newArrivals([row("h", 60), row("g", 60), row("a", 10)], r.seen).fresh).toEqual([]);
  });

  it("F16.2 with no late arrivals when the page opens, the first one after shows", () => {
    let r = newArrivals([], null);
    expect(r.fresh).toEqual([]);
    r = newArrivals([row("a", 10)], r.seen);
    expect(ids(r.fresh)).toEqual(["a"]);
  });
});

describe("D7 the late banner's lines", () => {
  it("D7 the breakfast line is gone and '⏰ {name} walked in {m} min late.' is one of the five; the same arrival always gets the same line", () => {
    const lines = new Set(Array.from({ length: 200 }, (_, i) => lateLine({ id: "checkin" + i, first: "Sample", lateMin: 7 })));
    expect(lines.size).toBe(5);
    expect(lines).toContain("⏰ Sample walked in 7 min late.");
    expect([...lines].filter((l) => /breakfast/.test(l))).toEqual([]);
    const one = { id: "checkin42", first: "Sample", lateMin: 7 };
    expect(lateLine(one)).toBe(lateLine({ ...one }));
  });
});
