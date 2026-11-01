// @vitest-environment node
// The late banner never shows an arrival from before its page opened (late.ts newArrivals with the
// time the page got its first feed). The rows are what checkin.attendance.lateFeed returns in each
// case; `at` is the scan time by the server's clock.
import { describe, expect, it } from "vitest";
import { newArrivals, type Late } from "./late";

const MIN = 60_000;
const T = Date.UTC(2026, 10, 5, 21, 30); // 21:30
const row = (id: string, at: number, lateMin = 10): Late => ({ id, first: id, lateMin, at });
const ids = (rows: Late[]) => rows.map((r) => r.id);

describe("F16.2 the late banner shows only arrivals after its page opened", () => {
  it("CKP-spec-1 an arrival from before the page opened doesn't show when it comes into the feed later (she unticks the opt-out)", () => {
    // Xena is scanned 10 min late at 21:40 with the opt-out ticked. Yuri opens #/live at 21:42: the feed is empty.
    let r = newArrivals([], null, T + 12 * MIN);
    expect(r.fresh).toEqual([]);
    // At 21:48 Xena unticks it, so the feed has her row again.
    r = newArrivals([row("xena", T + 10 * MIN)], r.seen, T + 18 * MIN);
    expect(r.fresh).toEqual([]);
    // Zed walks in late at 21:50: he shows, once.
    r = newArrivals([row("zed", T + 20 * MIN), row("xena", T + 10 * MIN)], r.seen, T + 20 * MIN + 500);
    expect(ids(r.fresh)).toEqual(["zed"]);
    expect(newArrivals([row("zed", T + 20 * MIN), row("xena", T + 10 * MIN)], r.seen, T + 21 * MIN).fresh).toEqual([]);
  });

  it("CKP-spec-1 the same when the first feed holds only older arrivals", () => {
    let r = newArrivals([row("ana", T + 2 * MIN)], null, T + 12 * MIN);
    r = newArrivals([row("xena", T + 10 * MIN), row("ana", T + 2 * MIN)], r.seen, T + 18 * MIN);
    expect(r.fresh).toEqual([]);
  });

  it("CKP-fixcheck-1 an arrival scanned under a minute before the page opened that comes into the feed later doesn't show", () => {
    // Xena is scanned late at 21:29:30 with the opt-out ticked. Yuri opens #/live at 21:30:00: the feed is empty.
    let r = newArrivals([], null, T);
    expect(r.seen).toEqual({ at: T, ids: [] });
    // At 21:30:20 Xena unticks it. Her row is 50 s old, so the one-minute rule alone would let it through.
    r = newArrivals([row("xena", T - 30_000)], r.seen, T + 20_000);
    expect(r.fresh).toEqual([]);
  });

  it("CKP-check-1 CKP-risk-3 a class start saved after students arrived doesn't replay them on a page opened after they arrived", () => {
    // No start saved: Ana and Ben are scanned at 21:31 and 21:33, and lateFeed is empty. A phone opens #/live at 21:34.
    let r = newArrivals([], null, T + 4 * MIN);
    // At 21:36 the professor saves start 21:30 with grace 0, and lateFeed now counts both as late.
    r = newArrivals([row("ben", T + 3 * MIN, 3), row("ana", T + 1 * MIN, 1)], r.seen, T + 6 * MIN);
    expect(r.fresh).toEqual([]);
  });

  it("CKP-risk-3 a class start saved after students arrived doesn't show them on a page opened before they arrived either: only arrivals scanned in the last minute are new", () => {
    // The projector opens at 21:25. Ana and Ben are scanned at 21:31 and 21:33 with no start saved.
    let r = newArrivals([], null, T - 5 * MIN);
    // At 21:36 the professor saves start 21:30 with grace 0.
    r = newArrivals([row("ben", T + 3 * MIN, 3), row("ana", T + 1 * MIN, 1)], r.seen, T + 6 * MIN);
    expect(r.fresh).toEqual([]);
    // Cy walks in at 21:37 and the feed brings her 2 s later: she shows. Ana and Ben stay quiet.
    r = newArrivals([row("cy", T + 7 * MIN, 7), row("ben", T + 3 * MIN, 3), row("ana", T + 1 * MIN, 1)], r.seen, T + 7 * MIN + 2_000);
    expect(ids(r.fresh)).toEqual(["cy"]);
    // An arrival exactly a minute old still shows; one a millisecond older doesn't.
    expect(ids(newArrivals([row("dee", T + 8 * MIN)], r.seen, T + 9 * MIN).fresh)).toEqual(["dee"]);
    expect(newArrivals([row("dee", T + 8 * MIN)], r.seen, T + 9 * MIN + 1).fresh).toEqual([]);
  });

  it("an arrival with a scan time just after the phone's clock at open (the server's clock runs ahead) counts as seen, not new", () => {
    let r = newArrivals([row("ana", T + 2_000)], null, T);
    expect(r.fresh).toEqual([]);
    r = newArrivals([row("ana", T + 2_000)], r.seen, T + 5_000);
    expect(r.fresh).toEqual([]);
  });

  it("two arrivals scanned in the same millisecond after the page opened both show, each once", () => {
    let r = newArrivals([], null, T);
    r = newArrivals([row("g", T + MIN)], r.seen, T + MIN);
    expect(ids(r.fresh)).toEqual(["g"]);
    r = newArrivals([row("h", T + MIN), row("g", T + MIN)], r.seen, T + MIN);
    expect(ids(r.fresh)).toEqual(["h"]);
    expect(newArrivals([row("h", T + MIN), row("g", T + MIN)], r.seen, T + 2 * MIN).fresh).toEqual([]);
  });
});
