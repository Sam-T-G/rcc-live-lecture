// The extra credit End day saved, as a CSV the professor hands to the instructor of record: one
// row per student per class. It starts with a UTF-8 byte-order mark, so Excel reads accented
// names right. Names come from what students typed, so a text cell that starts with = + - @, a
// tab or a carriage return gets a ' in front: a spreadsheet then shows it as text instead of
// running it as a formula. Numbers come from the server and go in as they are.

export type SavedCredit = {
  endedAt: number;
  name: string;
  email: string | null;
  team: { label: string };
  rank: number;
  points: number;
  ec: number;
};

const FORMULA = /^[=+\-@\t\r]/;

// One cell: text in double quotes (inner quotes doubled), numbers bare.
export function csvCell(value: string | number): string {
  if (typeof value === "number") return String(value);
  const text = FORMULA.test(value) ? "'" + value : value;
  return `"${text.replace(/"/g, '""')}"`;
}

const when = (ms: number) => new Date(ms).toLocaleString();

export function extraCreditCsv(rows: SavedCredit[], date: (ms: number) => string = when): string {
  const head = ["Class ended", "Name", "Email", "Team", "Place", "Team points", "Extra credit"];
  const body = rows.map((r) => [date(r.endedAt), r.name, r.email ?? "", r.team.label, r.rank, r.points, Math.round(r.ec * 100) / 100]);
  return "\uFEFF" + [head, ...body].map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

type Page<R> = { page: R[]; isDone: boolean; continueCursor: string };

// Every saved row, read a page at a time (live.groups.results returns at most 200 per call),
// oldest class first, then place, team number and name.
export async function allResults<R extends SavedCredit & { team: { team: number } }>(read: (cursor: string | null) => Promise<Page<R>>): Promise<R[]> {
  const rows: R[] = [];
  let cursor: string | null = null;
  for (;;) {
    const res: Page<R> = await read(cursor);
    rows.push(...res.page);
    if (res.isDone) break;
    cursor = res.continueCursor;
  }
  return rows.sort((a, b) => a.endedAt - b.endedAt || a.rank - b.rank || a.team.team - b.team.team || a.name.localeCompare(b.name));
}
