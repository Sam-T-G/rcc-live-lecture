// @vitest-environment node
// CKA-spec-1: the class start time the form sends (sheet.ts nearestStart). A time that passed
// today more than 6 hours ago is tomorrow's, so a next-day start saved in the afternoon or evening
// never turns into this morning's: the server then refuses one more than 12 hours away ("Pick a
// time within 12 hours of now."), and the professor sees why. Pacific time, like sheet.test.ts.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { nearestStart } from "./sheet";

const pst = (mo: number, d: number, h: number, mi = 0) => Date.UTC(2026, mo - 1, d, h + 8, mi);
const HOUR = 3_600_000;

beforeEach(() => {
  vi.stubEnv("TZ", "America/Los_Angeles");
});

describe("CKA-spec-1 nearestStart never moves a next-day start to this morning", () => {
  it("'09:00' saved at 8 PM is tomorrow 9 AM (13 hours away, which the server refuses), never this morning", () => {
    expect(nearestStart("09:00", pst(11, 5, 20, 0))).toBe(pst(11, 6, 9, 0));
    expect(nearestStart("08:00", pst(11, 5, 14, 30))).toBe(pst(11, 6, 8, 0));
  });

  it("a time up to 6 hours ago is today's (a start corrected during class); a time ahead is the next one", () => {
    expect(nearestStart("14:30", pst(11, 5, 14, 40))).toBe(pst(11, 5, 14, 30));
    expect(nearestStart("09:00", pst(11, 5, 15, 0))).toBe(pst(11, 5, 9, 0));
    expect(nearestStart("09:00", pst(11, 5, 15, 1))).toBe(pst(11, 6, 9, 0));
    expect(nearestStart("23:50", pst(11, 5, 0, 10))).toBe(pst(11, 4, 23, 50));
    expect(nearestStart("09:00", pst(11, 4, 21, 0))).toBe(pst(11, 5, 9, 0));
  });

  it("every time of day lands from 6 hours ago to 18 hours ahead, at the first such moment", () => {
    for (let h = 0; h < 24; h++) {
      const now = pst(11, 5, h, 17);
      for (const time of ["00:00", "06:45", "12:00", "17:30", "23:59"]) {
        const t = nearestStart(time, now)!;
        expect(t - now).toBeGreaterThanOrEqual(-6 * HOUR);
        expect(t - now).toBeLessThan(18 * HOUR);
      }
    }
  });
});
