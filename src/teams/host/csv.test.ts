// @vitest-environment node
// The extra credit CSV that #/host Points downloads (csv.ts).
import { describe, expect, it } from "vitest";
import { csvCell, extraCreditCsv, type SavedCredit } from "./csv";

const row = (name: string, o: Partial<SavedCredit> = {}): SavedCredit => ({
  endedAt: Date.UTC(2026, 10, 5, 23, 0),
  name,
  email: "student1@example.edu",
  team: { label: "Red" },
  rank: 1,
  points: 6,
  ec: 5,
  ...o,
});

describe("Download extra credit (CSV)", () => {
  it("F29.5 starts with a UTF-8 byte-order mark, then a header and one row per saved result", () => {
    const csv = extraCreditCsv([row("Sample student 1"), row("Sample student 2", { team: { label: "Blue" }, rank: 2, points: 4, ec: 4 / 3 })], () => "Nov 5");
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv.slice(1).split("\r\n")).toEqual([
      '"Class ended","Name","Email","Team","Place","Team points","Points per student","Extra credit"',
      '"Nov 5","Sample student 1","student1@example.edu","Red",1,6,6,5',
      '"Nov 5","Sample student 2","student1@example.edu","Blue",2,4,4,1.33',
      "",
    ]);
  });

  it("sweep2-host-6 a 'Points per student' column shows why a team with fewer points can place higher (D6)", () => {
    // Blue: 2 students, 4 points (2.0 each). Red: 3 students, 5 points (1.7 each). Blue places 1st.
    const blue = { team: { label: "Blue" }, rank: 1, points: 4, ec: 5 };
    const red = { team: { label: "Red" }, rank: 2, points: 5, ec: 3 };
    const later = { endedAt: Date.UTC(2026, 10, 12, 23, 0) };
    const csv = extraCreditCsv(
      [
        row("Sample student 1", blue),
        row("Sample student 2", blue),
        row("Sample student 3", red),
        row("Sample student 4", red),
        row("Sample student 5", red),
        // The next class: Red alone, 1 student. Each class counts its own team sizes.
        row("Sample student 3", { ...red, ...later, rank: 1, points: 2 }),
      ],
      (ms) => (ms === later.endedAt ? "Nov 12" : "Nov 5"),
    );
    const lines = csv.slice(1).split("\r\n");
    expect(lines[0]).toBe('"Class ended","Name","Email","Team","Place","Team points","Points per student","Extra credit"');
    expect(lines.slice(1, 7).map((l) => l.split(",").slice(3).join(","))).toEqual([
      '"Blue",1,4,2,5',
      '"Blue",1,4,2,5',
      '"Red",2,5,1.7,3',
      '"Red",2,5,1.7,3',
      '"Red",2,5,1.7,3',
      '"Red",1,2,2,3',
    ]);
  });

  it("F29.5 a ' goes before any text cell that starts with = + - @, a tab or a carriage return; quotes are doubled; numbers stay numbers", () => {
    expect(["=SUM(A1)", "+1", "-1", "@x", "\tx", "\rx"].map(csvCell)).toEqual(['"\'=SUM(A1)"', '"\'+1"', '"\'-1"', '"\'@x"', '"\'\tx"', '"\'\rx"']);
    expect(csvCell('Ann "Ace" Lee')).toBe('"Ann ""Ace"" Lee"');
    expect(csvCell("Ann = Lee")).toBe('"Ann = Lee"');
    expect(csvCell(-2)).toBe("-2");
    const csv = extraCreditCsv([row("=HYPERLINK(\"http://x\")", { email: null, points: -2, ec: 0 })], () => "Nov 5");
    expect(csv).toContain('"\'=HYPERLINK(""http://x"")",""');
    expect(csv).toContain('"Red",1,-2,-2,0');
  });
});
