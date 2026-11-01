// @vitest-environment node
// util.ts keeps its own copies of the server's early-scan numbers and words (convex/lib.ts), so
// the client bundle doesn't pull in server code. This fails when the two drift apart, and checks
// how scanError puts the time in front of the refusal.
import { describe, expect, it, vi } from "vitest";
import * as server from "../../../convex/lib";
import * as attendance from "../../../convex/checkin/attendance";
import { EARLY_MS, EARLY_SCAN, STILL_OPEN, scanError, scanOpensAt } from "./util";

describe("LX-check-copy-1 the early-scan refusal", () => {
  it("util.ts's EARLY_MS and EARLY_SCAN match convex/lib.ts", () => {
    expect(EARLY_MS).toBe(server.EARLY_MS);
    expect(EARLY_SCAN).toBe(server.EARLY_SCAN);
  });

  it("sweep1-ledger-2 util.ts's STILL_OPEN matches setClassStart's refusal", () => {
    expect(STILL_OPEN).toBe(attendance.STILL_OPEN);
  });

  it("gets the time scanning opens in the browser's time zone; other refusals, or no saved start, stay as they are", () => {
    vi.stubEnv("TZ", "America/Los_Angeles");
    const nine = Date.UTC(2026, 10, 10, 17, 0); // Tue Nov 10, 9:00 AM Pacific
    expect(scanOpensAt(nine)).toBe(nine - 45 * 60_000);
    expect(scanOpensAt(null)).toBeNull();
    expect(scanError(EARLY_SCAN, nine)).toBe("Scanning opens at 8:15 AM, 45 minutes before class starts.");
    expect(scanError(EARLY_SCAN, null)).toBe(EARLY_SCAN);
    expect(scanError("That code is old.", nine)).toBe("That code is old.");
  });
});
