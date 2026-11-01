// live/lost: "I'm lost" on a slide (F20, F21, F8). A checked-in student taps it on #/live for the
// slide on their phone, the live one or one they paged back to, and a second tap takes it back.
// Each class keeps its own taps, so a new class starts with nobody lost.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../_generated/api";
import { endLecture, ensureLecture } from "../lib";
import { at, type Caller, checkIn, profEnv, setup, slide, type T, TYPED_ISSUER, typed } from "../test.helpers";

const CH = "gdg";
const T0 = at(2026, 11, 5, 21, 30); // the first class opens
const MIN = 60_000;
const DAY = 24 * 60 * MIN;

const student = (t: T, n: number) => typed(t, `Sample student ${n}`, `student${n}@example.edu`);
// What typed() signs in as: the `user` on the student's lost rows.
const userOf = (n: number) => `${TYPED_ISSUER}|student${n}@example.edu`;

// A class opens on the professor's first action (a deck press, a scan, a quiz). These tests open
// and end it themselves, so they don't depend on which action does it.
const openClass = (t: T) => t.run((ctx) => ensureLecture(ctx, CH));
const endClass = (t: T) => t.run((ctx) => endLecture(ctx, CH));
// The clock jumps ahead without running the 12-hour close job each class schedules.
const later = (ms: number) => vi.setSystemTime(Date.now() + ms);
// The deck shows slides 0 to `last` in order, the way POST /deck does it.
async function showSlides(t: T, last: number) {
  for (let i = 0; i <= last; i++) await slide(t, CH, i);
}
// A student's check-in for their second class, written straight to the table, so these tests
// don't depend on how pass.scan treats a student it already checked in once.
const checkInRow = (t: T, n: number) =>
  t.run((ctx) => ctx.db.insert("checkins", { channel: CH, user: userOf(n), name: `Sample student ${n}`, at: Date.now() }));

const toggle = (as: Caller, index: number) => as.mutation(api.live.lost.toggle, { channel: CH, index });
const mine = (as: Caller, index: number) => as.query(api.live.read.mine, { channel: CH, index });
// Every lost row on the channel, from every class, oldest first.
const rows = (t: T) => t.run((ctx) => ctx.db.query("lost").withIndex("by_channel", (q) => q.eq("channel", CH)).collect());

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  profEnv(); // checkIn scans as the admin
});
afterEach(() => {
  vi.useRealTimers();
});

describe("F20 I'm lost on a slide", () => {
  it("F20.1 a checked-in student's tap writes one row and mine is true", async () => {
    const t = setup();
    await openClass(t);
    await showSlides(t, 2);
    const s = student(t, 1);
    await checkIn(t, s);

    expect(await mine(s, 2)).toBe(false);
    expect(await toggle(s, 2)).toBe(true);
    expect(await rows(t)).toEqual([expect.objectContaining({ channel: CH, index: 2, user: userOf(1) })]);
    expect(await mine(s, 2)).toBe(true);
    expect(await mine(s, 1)).toBe(false); // another slide
    expect(await mine(student(t, 2), 2)).toBe(false); // another student

    // A slide the student paged back to takes a tap the same way.
    later(MIN);
    expect(await toggle(s, 0)).toBe(true);
    expect(await mine(s, 0)).toBe(true);
    expect((await rows(t)).map((r) => r.index)).toEqual([2, 0]);
  });

  it("F20.2 a second tap removes it; never two rows for one student and slide", async () => {
    const t = setup();
    await openClass(t);
    await showSlides(t, 2);
    const s = student(t, 1);
    await checkIn(t, s);

    const answers: boolean[] = [];
    for (let i = 0; i < 5; i++) {
      answers.push(await toggle(s, 2));
      expect((await rows(t)).filter((r) => r.user === userOf(1) && r.index === 2).length).toBeLessThanOrEqual(1);
      later(1000);
    }
    expect(answers).toEqual([true, false, true, false, true]);
    expect(await rows(t)).toHaveLength(1);
    expect(await mine(s, 2)).toBe(true);

    expect(await toggle(s, 2)).toBe(false);
    expect(await rows(t)).toEqual([]);
    expect(await mine(s, 2)).toBe(false);
  });
});

describe("F21 only checked-in students tap I'm lost", () => {
  it("F21.1 signed out -> 'Sign in first.'; not checked in this class -> 'Check in first.'", async () => {
    const t = setup();
    await openClass(t);
    await showSlides(t, 2);
    await expect(t.mutation(api.live.lost.toggle, { channel: CH, index: 2 })).rejects.toThrow("Sign in first.");
    // Signed in, never checked in.
    await expect(toggle(student(t, 1), 2)).rejects.toThrow("Check in first.");

    // Checked in to the class before this one.
    const s = student(t, 2);
    await checkIn(t, s);
    expect(await toggle(s, 2)).toBe(true);
    later(60 * MIN);
    await endClass(t);
    await expect(toggle(s, 1)).rejects.toThrow("Check in first."); // between classes
    later(DAY);
    await openClass(t);
    await showSlides(t, 2);
    await expect(toggle(s, 2)).rejects.toThrow("Check in first.");
    await expect(toggle(s, 1)).rejects.toThrow("Check in first.");
    expect((await rows(t)).map((r) => r.user)).toEqual([userOf(2)]); // only last class's tap
  });

  it("a slide not shown in this class, a negative or fractional index are refused", async () => {
    const t = setup();
    await openClass(t);
    await showSlides(t, 5); // last class reached slide 6
    later(60 * MIN);
    await endClass(t);
    later(DAY);
    await openClass(t);
    await showSlides(t, 2); // this class is on slide 3
    const s = student(t, 1);
    await checkIn(t, s);

    for (const index of [3, 5, 99, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      await expect(toggle(s, index), `index ${index}`).rejects.toThrow("That slide hasn't been shown yet.");
    }
    expect(await rows(t)).toEqual([]);
    // Every slide this class has shown takes a tap.
    for (const index of [0, 1, 2]) expect(await toggle(s, index)).toBe(true);
    expect(await rows(t)).toHaveLength(3);
  });

  it("LIVE-risk-5 a class that opens before the deck sends refuses last class's live slide", async () => {
    const t = setup();
    await openClass(t);
    await showSlides(t, 5); // last class ended on slide 6
    later(60 * MIN);
    await endClass(t);
    later(DAY);
    await openClass(t); // a scan or a quiz opens this class; the deck hasn't sent anything yet
    const s = student(t, 1);
    await checkIn(t, s);

    expect(await t.query(api.deck.current, { channel: CH })).toBeNull(); // the phone waits for the slides
    for (const index of [5, 0]) {
      await expect(toggle(s, index), `index ${index}`).rejects.toThrow("That slide hasn't been shown yet.");
    }
    expect(await rows(t)).toEqual([]);
  });

  it("the slide the deck is on counts as shown, even when last class showed it with more presses", async () => {
    const t = setup();
    await openClass(t);
    await slide(t, CH, 3, { beat: 2 }); // last class showed slide 4 through its 3rd press
    later(60 * MIN);
    await endClass(t);
    later(DAY);
    await openClass(t);
    await slide(t, CH, 3); // this class's deck opens on slide 4, first press
    const s = student(t, 1);
    await checkIn(t, s);
    expect(await toggle(s, 3)).toBe(true);
    expect(await mine(s, 3)).toBe(true);
  });

  it("LIVE-fixcheck-1 a slide shown with fewer presses than last class, then left, still takes a tap and shows on page-back", async () => {
    const t = setup();
    await openClass(t);
    await slide(t, CH, 3, { beat: 2 }); // last class showed slide 4 through its 3rd press
    later(60 * MIN);
    await endClass(t);
    later(DAY);
    await showSlides(t, 4); // the deck opens this class and shows slides 1 to 5, first press each
    const s = student(t, 1);
    await checkIn(t, s);

    // Slide 4's stored press is this class's, so page-back lists it although the deck moved on.
    const shown = await t.query(api.deck.slides, { channel: CH });
    expect(shown.map((r) => r.index)).toContain(3);
    expect(shown.find((r) => r.index === 3)).toMatchObject({ beat: 0 });
    expect(await toggle(s, 3)).toBe(true);
    expect(await mine(s, 3)).toBe(true);
  });
});

describe("F8 I'm lost in each class", () => {
  it("F8 a student lost on slide 3 in class 1 taps slide 3 in class 2: a second row is written (on: true), class 1's row stays, and read.mine returns true without a unique() error", async () => {
    const t = setup();
    await openClass(t);
    await showSlides(t, 3);
    const s = student(t, 1);
    await checkIn(t, s);
    expect(await toggle(s, 3)).toBe(true);
    const [first] = await rows(t);

    later(60 * MIN);
    await endClass(t);
    later(7 * DAY);
    await openClass(t);
    await showSlides(t, 3);
    await checkInRow(t, 1);
    expect(await mine(s, 3)).toBe(false); // a new class starts with nobody lost

    expect(await toggle(s, 3)).toBe(true);
    const both = await rows(t);
    expect(both).toHaveLength(2);
    expect(both[0]._id).toBe(first._id);
    expect(await mine(s, 3)).toBe(true);

    // A second tap in class 2 takes back class 2's row only.
    later(MIN);
    expect(await toggle(s, 3)).toBe(false);
    expect((await rows(t)).map((r) => r._id)).toEqual([first._id]);
    expect(await mine(s, 3)).toBe(false);
  });
});
