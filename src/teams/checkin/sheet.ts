// The attendance CSV and the dates on the professor's attendance page (#/checkin/teacher,
// Teacher.tsx). Plain functions, so sheet.test.ts checks them without a browser.
import type { FunctionReturnType } from "convex/server";
import type { api } from "../../../convex/_generated/api";
import { CHANNEL } from "../../blocks/deck";
import { clock } from "./util";

export type ClassRow = FunctionReturnType<typeof api.checkin.attendance.lectures>[number];
export type SheetRow = FunctionReturnType<typeof api.checkin.attendance.sheet>[number];

const pad = (n: number) => String(n).padStart(2, "0");

// The local date, "2026-11-05", for file names. toISOString() gives the UTC date, which names an
// evening class's file for the next day.
export function localDate(ms: number) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// The local time of day, "14:30": what an <input type="time"> holds.
export function hhmm(ms: number) {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const sameDay = (a: number, b: number) => localDate(a) === localDate(b);

// "Thu Nov 5" in the browser's language. Tests pass a locale to pin it.
export function day(ms: number, locale?: string) {
  const d = new Date(ms);
  return `${d.toLocaleDateString(locale, { weekday: "short" })} ${d.toLocaleDateString(locale, { month: "short", day: "numeric" })}`;
}

// "Thu Nov 5, 2:28 PM".
export const dayTime = (ms: number, locale?: string) =>
  `${day(ms, locale)}, ${new Date(ms).toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" })}`;

// A time with its day in front when it isn't today: "2:35 PM", or "Wed Nov 4, 2:35 PM".
export const timeOrDay = (ms: number, now: number) => (sameDay(ms, now) ? clock(ms) : dayTime(ms));

// How long ago a start can be and still be today's: a professor correcting the start during
// class. A time that passed longer ago than this is the next day's.
const LOOK_BACK_MS = 6 * 3_600_000;

// setClassStart takes a start within 12 hours of now (START_RANGE_MS in convex/checkin/attendance.ts).
export const START_RANGE_MS = 12 * 3_600_000;

// The time of day `time` ("09:00") at its first moment from 6 hours ago on: yesterday, today or
// tomorrow. "14:30" saved at 2:40 PM is today; "09:00" saved at 9 PM, or at 3:30 PM, is tomorrow
// morning. A next-day start saved before 9 PM is then more than 12 hours away, so the form never
// quietly saves this morning's time: it says so and offers the same time a day earlier
// (dayEarlier), for a professor filling in this morning's start in the afternoon. Null when
// `time` isn't a time.
export function nearestStart(time: string, now: number): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(time);
  if (!m) return null;
  for (const shift of [-1, 0, 1]) {
    const d = new Date(now);
    d.setDate(d.getDate() + shift);
    d.setHours(Number(m[1]), Number(m[2]), 0, 0);
    if (d.getTime() >= now - LOOK_BACK_MS) return d.getTime();
  }
  return null;
}

// When `startsAt` (from nearestStart) is more than 12 hours away, the same time a day earlier,
// which is then 6 to 12 hours ago: "09:00" typed at 3:30 PM is tomorrow 9:00 (17.5 hours away)
// and this offers today's 9:00. Null when `startsAt` is within 12 hours, or the day earlier isn't.
export function dayEarlier(startsAt: number, now: number): number | null {
  if (startsAt - now <= START_RANGE_MS) return null;
  const d = new Date(startsAt);
  d.setDate(d.getDate() - 1);
  return Math.abs(d.getTime() - now) <= START_RANGE_MS ? d.getTime() : null;
}

// One CSV cell, quoted. Names are whatever a student typed at sign-in, so a cell that starts with
// = + - @, a tab or a carriage return gets a ' in front: a spreadsheet then shows it as text and
// never runs it as a formula.
export function csvCell(value: string) {
  const text = /^[=+\-@\t\r]/.test(value) ? "'" + value : value;
  return `"${text.replace(/"/g, '""')}"`;
}

// The attendance CSV: a UTF-8 byte order mark (so Excel reads "José Núñez" as UTF-8, not as
// "JosÃ© NÃºÃ±ez"), CRLF line ends, and one row per check-in with its local date and time. On-time
// rows show 0 minutes late.
export function csvText(rows: SheetRow[]) {
  const lines = [
    ["Name", "Email", "Checked in", "Minutes late"],
    ...rows.map((r) => [r.name, r.email, `${localDate(r.at)} ${hhmm(r.at)}`, String(r.lateMin ?? 0)]),
  ];
  return "\uFEFF" + lines.map((line) => line.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

// When a class happened: its saved start time, else when it opened.
export const classDay = (c: ClassRow) => c.startsAt ?? c.startedAt;

// attendance-gdg-2026-11-05-1430.csv: a class's file, named with its local date and 24-hour start
// time, so two classes on the same day save as two different files. The check-ins from before
// the first class get the dates of their first and last check-in.
export function classFile(c: ClassRow) {
  if (c.lecture !== "earlier") {
    const at = classDay(c);
    return `attendance-${CHANNEL}-${localDate(at)}-${hhmm(at).replace(":", "")}.csv`;
  }
  const [first, last] = [localDate(c.startedAt), localDate(c.endedAt ?? c.startedAt)];
  return `attendance-${CHANNEL}-${first === last ? first : `${first}-to-${last}`}.csv`;
}

// The file for attendance on the day of `ms`, when no class is running.
export const dateFile = (ms: number) => `attendance-${CHANNEL}-${localDate(ms)}.csv`;

// "Thu Nov 5, 2:30 PM" for a class; "Earlier check-ins, Oct 29" (or "Oct 29 to Oct 30") for the
// check-ins from before the first class.
export function classLabel(c: ClassRow, locale?: string) {
  if (c.lecture !== "earlier") return dayTime(classDay(c), locale);
  const date = (ms: number) => new Date(ms).toLocaleDateString(locale, { month: "short", day: "numeric" });
  const [first, last] = [date(c.startedAt), date(c.endedAt ?? c.startedAt)];
  return `Earlier check-ins, ${first === last ? first : `${first} to ${last}`}`;
}

// Saves the rows as a CSV file named `name` (a download in the browser).
export function saveCsv(rows: SheetRow[], name: string) {
  const url = URL.createObjectURL(new Blob([csvText(rows)], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  // Safari starts the download after this click returns, so the file's URL stays a while.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
