// @vitest-environment node
// The attendance CSV and the dates on #/checkin/teacher (sheet.ts). Every test runs in Pacific
// time, where RCC is, so a class at 5:30 PM is already the next day in UTC. People are samples.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { classFile, classLabel, csvCell, csvText, dateFile, dayTime, hhmm, localDate, nearestStart, timeOrDay, type ClassRow } from "./sheet";

// A Pacific wall-clock time as ms. November 2026 is PST (UTC-8), late October PDT (UTC-7).
const pst = (mo: number, d: number, h: number, mi = 0) => Date.UTC(2026, mo - 1, d, h + 8, mi);
const pdt = (mo: number, d: number, h: number, mi = 0) => Date.UTC(2026, mo - 1, d, h + 7, mi);
const HOUR = 3_600_000;

beforeEach(() => {
  vi.stubEnv("TZ", "America/Los_Angeles");
});

const row = (name: string, email: string, at: number, lateMin: number | null) => ({ name, email, at, lateMin });
const aClass = (o: Partial<ClassRow>): ClassRow => ({
  lecture: "k17abc" as ClassRow["lecture"],
  open: false,
  startedAt: pst(11, 5, 14, 20),
  startsAt: pst(11, 5, 14, 30),
  graceMin: 5,
  endedAt: pst(11, 5, 16, 0),
  count: 2,
  ...o,
});

describe("F14 the attendance CSV", () => {
  it("F14.5 checkin-frontend-18 the CSV starts with a UTF-8 byte order mark, ends every line with CRLF, keeps 'José Núñez' intact and opens '=2+3 Test' as text", () => {
    const text = csvText([
      row("José Núñez", "student1@example.edu", pst(11, 5, 14, 28), null),
      row("=2+3 Test", "student2@example.edu", pst(11, 5, 14, 41), 11),
    ]);
    expect(text.startsWith("\uFEFF")).toBe(true);
    expect(new TextEncoder().encode(text).slice(0, 3)).toEqual(new Uint8Array([0xef, 0xbb, 0xbf]));
    expect(text.slice(1).split("\r\n")).toEqual([
      '"Name","Email","Checked in","Minutes late"',
      '"José Núñez","student1@example.edu","2026-11-05 14:28","0"',
      `"'=2+3 Test","student2@example.edu","2026-11-05 14:41","11"`,
      "",
    ]);
    expect(text.replace(/\r\n/g, "")).not.toContain("\n");
  });

  it("F14.5 rt-13 a cell that starts with = + - @, a tab or a carriage return gets a ' in front; quotes are doubled", () => {
    for (const lead of ["=", "+", "-", "@", "\t", "\r"]) expect(csvCell(lead + "HYPERLINK(1)")).toBe(`"'${lead}HYPERLINK(1)"`);
    expect(csvCell('=HYPERLINK("https://example.invalid/?"&B3,"Ana")')).toBe(`"'=HYPERLINK(""https://example.invalid/?""&B3,""Ana"")"`);
    expect(csvCell('Ana "AJ" Lopez')).toBe('"Ana ""AJ"" Lopez"');
    expect(csvCell("Ana Lopez, Jr.")).toBe('"Ana Lopez, Jr."');
    expect(csvCell("Ana = Lopez")).toBe('"Ana = Lopez"');
  });

  it("rt-18 the file is named with the class's local date and start time, not the UTC date", () => {
    // 5:30 PM PDT on Oct 30 is Oct 31 in UTC.
    const evening = pdt(10, 30, 17, 30);
    expect(new Date(evening).toISOString().slice(0, 10)).toBe("2026-10-31");
    expect(dateFile(evening)).toBe("attendance-gdg-2026-10-30.csv");
    expect(classFile(aClass({ startsAt: evening }))).toBe("attendance-gdg-2026-10-30-1730.csv");
    // No saved start: the day and time the class opened.
    expect(classFile(aClass({ startsAt: null, startedAt: pst(11, 12, 18, 0) }))).toBe("attendance-gdg-2026-11-12-1800.csv");
    // The check-ins from before the first class: the dates of their first and last check-in.
    const earlier = { lecture: "earlier" as const, startsAt: null, graceMin: 0 };
    expect(classFile(aClass({ ...earlier, startedAt: pdt(10, 29, 15, 0), endedAt: pdt(10, 30, 17, 30) }))).toBe("attendance-gdg-2026-10-29-to-2026-10-30.csv");
    expect(classFile(aClass({ ...earlier, startedAt: pdt(10, 29, 15, 0), endedAt: pdt(10, 29, 15, 40) }))).toBe("attendance-gdg-2026-10-29.csv");
  });

  it("E2E-3 back-to-back classes on one day get different files, each named with its start time", () => {
    const first = classFile(aClass({ startsAt: pst(11, 5, 9, 5), startedAt: pst(11, 5, 9, 0) }));
    const second = classFile(aClass({ startsAt: pst(11, 5, 10, 30), startedAt: pst(11, 5, 10, 25) }));
    expect(first).toBe("attendance-gdg-2026-11-05-0905.csv");
    expect(second).toBe("attendance-gdg-2026-11-05-1030.csv");
    // 9:59 PM: the hour is 24-hour, so an evening class never reads as a morning one.
    expect(classFile(aClass({ startsAt: pdt(10, 31, 21, 59) }))).toBe("attendance-gdg-2026-10-31-2159.csv");
  });
});

describe("F15 the class start form's times", () => {
  it("checkin-frontend-7 the times read 'Thu Nov 5, 2:28 PM', and a time shows its day only when it isn't today", () => {
    expect(dayTime(pst(11, 5, 14, 28), "en-US")).toMatch(/^Thu Nov 5, 2:28\sPM$/);
    expect(localDate(pst(11, 5, 23, 59))).toBe("2026-11-05");
    expect(hhmm(pst(11, 5, 9, 5))).toBe("09:05");
    const now = pst(11, 5, 14, 40);
    expect(timeOrDay(pst(11, 5, 14, 35), now)).not.toContain("Nov");
    expect(timeOrDay(pst(11, 4, 14, 35), now)).toBe(dayTime(pst(11, 4, 14, 35)));
    expect(classLabel(aClass({}), "en-US")).toMatch(/^Thu Nov 5, 2:30\sPM$/);
    expect(classLabel(aClass({ lecture: "earlier", startedAt: pdt(10, 29, 15, 0), endedAt: pdt(10, 30, 17, 0) }), "en-US")).toBe("Earlier check-ins, Oct 29 to Oct 30");
    expect(classLabel(aClass({ lecture: "earlier", startedAt: pdt(10, 29, 15, 0), endedAt: pdt(10, 29, 16, 0) }), "en-US")).toBe("Earlier check-ins, Oct 29");
  });

  it("checkin-backend-4 a time saved for class is its first moment from 6 hours ago on: '09:00' saved at 9 PM is tomorrow morning (CKA-spec-1: sheet.start.test.ts)", () => {
    expect(nearestStart("09:00", pst(11, 4, 21, 0))).toBe(pst(11, 5, 9, 0));
    expect(nearestStart("14:30", pst(11, 5, 14, 40))).toBe(pst(11, 5, 14, 30));
    expect(nearestStart("23:50", pst(11, 5, 0, 10))).toBe(pst(11, 4, 23, 50));
    expect(nearestStart("00:10", pst(11, 5, 23, 50))).toBe(pst(11, 6, 0, 10));
    for (let h = 0; h < 24; h++) {
      const now = pst(11, 5, h, 17);
      for (const time of ["00:00", "06:45", "12:00", "17:30", "23:59"]) {
        const t = nearestStart(time, now)! - now;
        expect(t).toBeGreaterThanOrEqual(-6 * HOUR);
        expect(t).toBeLessThan(18 * HOUR);
      }
    }
    expect(nearestStart("", pst(11, 5, 12))).toBeNull();
    expect(nearestStart("soon", pst(11, 5, 12))).toBeNull();
  });
});
