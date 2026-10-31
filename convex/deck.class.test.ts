// deck + check-in across packages: a student who scans at the door before the deck's first press
// is checked in to the class that press joins (DECK-risk-1, DECK-access-1). The scan opens the
// class (checkin.pass.scan calls lib.ensureLecture), so the press joins it instead of opening a
// later one that would leave the scan outside the window.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import { endLecture } from "./lib";
import { admin, at, checkIn, profEnv, setup, slide, typed } from "./test.helpers";

const CH = "gdg";
const T0 = at(2026, 11, 5, 17, 55);
const MIN = 60_000;
const WEEK = 7 * 24 * 60 * MIN;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  profEnv();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("DECK-access-1 a scan before the deck's first press counts for that class", () => {
  it("scan at the door, then the first press: I'm lost, a quiz answer, a question and an upvote all work; a rescan next class adds a check-in", async () => {
    const t = setup();
    const ana = typed(t, "Sample student 1", "student1@example.edu");
    const ben = typed(t, "Sample student 2", "student2@example.edu");
    expect(await checkIn(t, ana)).toMatchObject({ already: false });
    expect(await checkIn(t, ben)).toMatchObject({ already: false });

    // The deck sends slide 1 five minutes later. No lecture is opened by hand anywhere here.
    vi.setSystemTime(T0 + 5 * MIN);
    await slide(t, CH, 0, { title: "Welcome" });
    const classes = await t.run((ctx) => ctx.db.query("lectures").withIndex("by_channel", (q) => q.eq("channel", CH)).take(10));
    expect(classes).toHaveLength(1);
    expect(await ana.query(api.checkin.read.me, { channel: CH })).toBe(true);

    expect(await ana.mutation(api.live.lost.toggle, { channel: CH, index: 0 })).toBe(true);

    vi.setSystemTime(T0 + 6 * MIN);
    const poll = await admin(t).mutation(api.checkin.quiz.ask, { channel: CH, kind: "quiz", question: "2 + 2?", choices: ["3", "4"], correct: 1 });
    await ana.mutation(api.checkin.quiz.answer, { poll, choice: 1 });

    await ana.mutation(api.live.questions.ask, { channel: CH, index: 0, text: "What is a base case?", anonymous: false });
    const [q] = await ben.query(api.live.questions.list, { channel: CH, index: 0 });
    await ben.mutation(api.live.questions.vote, { question: q._id });
    expect((await ben.query(api.live.questions.list, { channel: CH, index: 0 }))[0].votes).toBe(1);

    // Next class: the old check-in doesn't count, and scanning again adds a new one.
    vi.setSystemTime(T0 + 60 * MIN);
    await t.run((ctx) => endLecture(ctx, CH));
    vi.setSystemTime(T0 + WEEK);
    expect(await checkIn(t, ana)).toMatchObject({ already: false });
    vi.setSystemTime(T0 + WEEK + 5 * MIN);
    await slide(t, CH, 0, { title: "Welcome back" });
    expect(await ana.mutation(api.live.lost.toggle, { channel: CH, index: 0 })).toBe(true);
  });
});
