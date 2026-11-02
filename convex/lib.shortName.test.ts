// lib.shortName: the name screens anyone can open show for a student (T1, 2026-11-01): the first
// word and the first letter of the last word, with a period ("Ivy Sample" -> "Ivy S."). The
// questions on #/live (live.questions.list) and the door iPad (checkin.pass.scan's `short`) use it;
// professor pages keep the full name.
import { describe, expect, it } from "vitest";
import { cleanName, shortName } from "./lib";

describe("T1 lib.shortName: first name and last initial", () => {
  it("T1 'Ivy Sample' is 'Ivy S.' and 'Mary Ann Lee' is 'Mary L.': the first word, the last word's first letter and a period", () => {
    expect(shortName("Ivy Sample")).toBe("Ivy S.");
    expect(shortName("Mary Ann Lee")).toBe("Mary L.");
    expect(shortName("Sample student 1")).toBe("Sample 1."); // the test students' names: a digit counts as the letter
  });

  it("T1 a one-word name stays as it is, and so do the fallbacks cleanName returns ('Student', 'Someone')", () => {
    expect(shortName("Ivy")).toBe("Ivy");
    expect(shortName("jdoe1234")).toBe("jdoe1234");
    expect(shortName("Student")).toBe("Student");
    expect(shortName("Someone")).toBe("Someone");
    expect(shortName(cleanName("   "))).toBe("Student");
    expect(shortName(cleanName(null, "Someone"))).toBe("Someone");
    expect(shortName("  Ivy  ")).toBe("Ivy");
  });

  it("T1 extra spaces, tabs, line breaks and no-break spaces between words count as one space", () => {
    expect(shortName("  Ivy   Sample  ")).toBe("Ivy S.");
    expect(shortName("Ivy\t\nSample")).toBe("Ivy S.");
    expect(shortName("Ivy Sample")).toBe("Ivy S.");
    expect(shortName("Mary   Ann \t Lee ")).toBe("Mary L.");
  });

  it("T1 hyphens: a hyphenated first name stays whole, and a hyphenated last name gives its first letter", () => {
    expect(shortName("Mary-Jane Watson-Parker")).toBe("Mary-Jane W.");
    expect(shortName("Jean-Luc O'Brien")).toBe("Jean-Luc O.");
    expect(shortName("Ivy Sample-Lee")).toBe("Ivy S.");
  });

  it("T1 accents: the initial keeps its accent, written as one character or as a letter plus a combining mark", () => {
    expect(shortName("Élodie Ñúñez")).toBe("Élodie Ñ.");
    expect(shortName("Zoë Ångström")).toBe("Zoë Å.");
    // The same names typed with combining marks (e + U+0308, A + U+030A).
    expect(shortName("Zoë Ångström")).toBe("Zoë Å.");
    expect(shortName("Иван Петров")).toBe("Иван П.");
    expect(shortName("김 민준")).toBe("김 민.");
  });

  it("T1 the initial is the last word's first letter or digit, past a bracket or quote; a last word with none leaves the first word", () => {
    expect(shortName("Ivy (Sample)")).toBe("Ivy S.");
    expect(shortName('Ivy "Sample"')).toBe("Ivy S.");
    expect(shortName("Ivy 🙂")).toBe("Ivy");
    expect(shortName("Ivy -")).toBe("Ivy");
  });
});
