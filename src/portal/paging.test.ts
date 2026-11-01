// @vitest-environment node
// #/portal's paging rules (paging.ts), F35.2 to F35.4: which slides a student can open, where ←
// Back, Next →, the arrow keys and a swipe go, when the phone follows live again, and when "The
// professor is on slide N now." shows. Page.test.ts checks the words on the page.
import { describe, expect, it } from "vitest";
import { FOLLOW, open, pages, place, settle, swipe, type Browse, type Shown } from "./paging";

const slide = (index: number, deck = "A"): Shown => ({ index, title: `${deck}${index + 1}`, lines: [] });
const upTo = (index: number, deck = "A") => Array.from({ length: index + 1 }, (_, i) => slide(i, deck));

// A phone driven like the page drives it: the deck moves (deck), the student opens a slide
// (press), and settle runs after each change, the way Page.tsx runs it on every render.
function phone() {
  let shown: Shown[] = [];
  let live: Shown | null = null;
  let b: Browse = FOLLOW;
  const liveIndex = () => (live ? live.index : null);
  const now = () => {
    const byIndex = pages(shown, live);
    b = settle(b, liveIndex(), byIndex);
    return { byIndex, ...place(byIndex, liveIndex(), b) };
  };
  return {
    deck(index: number | null, list: Shown[], deck = "A") {
      live = index === null ? null : slide(index, deck);
      shown = list;
      return now();
    },
    press(which: "prev" | "next" | "live") {
      const p = now();
      b = open(b, which === "live" ? liveIndex() : p[which], liveIndex(), p.following);
      return now();
    },
    get title() {
      const p = now();
      return p.at === null ? null : p.byIndex.get(p.at)!.title;
    },
  };
}

describe("#/portal paging", () => {
  it("F35.2 Back and Next step through the shown slides one at a time, and Next from the slide before live follows live", () => {
    const p = phone();
    p.deck(5, upTo(5));
    expect(p.title).toBe("A6");
    expect(p.press("prev")).toMatchObject({ at: 4, following: false, moved: false });
    p.press("prev");
    expect(p.title).toBe("A4");
    expect(p.press("next")).toMatchObject({ at: 4, prev: 3, next: 5 });
    expect(p.press("next")).toMatchObject({ at: 5, following: true, next: null });
  });

  it("sweep2-tests-4 F35.4 after the professor goes back from slide 6 to slide 3, nobody can open slides 4 to 6", () => {
    const p = phone();
    p.deck(5, upTo(5));
    const back = p.deck(2, upTo(5)); // deck.slides still lists 1 to 6
    expect([...back.byIndex.keys()].sort()).toEqual([0, 1, 2]);
    expect(back).toMatchObject({ at: 2, next: null, prev: 1 });
    expect(pages(upTo(5), slide(2)).has(3)).toBe(false);
  });

  it("sweep2-tests-4 the phone follows live again when the professor lands on the student's slide, not one slide before", () => {
    const p = phone();
    p.deck(5, upTo(5));
    p.press("prev");
    p.press("prev"); // on slide 4
    expect(p.deck(6, upTo(6))).toMatchObject({ at: 3, following: false, moved: true });
    expect(settle({ viewing: 3, liveAtBrowse: 5 }, 4, pages(upTo(4), slide(4)))).toEqual({ viewing: 3, liveAtBrowse: 5 });
    expect(p.deck(3, upTo(6))).toMatchObject({ at: 3, following: true, moved: false }); // lands on 4
    expect(settle({ viewing: 3, liveAtBrowse: 5 }, 3, pages(upTo(3), slide(3)))).toBe(FOLLOW);
    expect(settle({ viewing: 3, liveAtBrowse: 5 }, 2, pages(upTo(2), slide(2)))).toBe(FOLLOW); // went back past it
  });

  it("sweep2-tests-4 'The professor is on slide N now.' shows only once the professor moves on from where the student left", () => {
    const p = phone();
    p.deck(5, upTo(5));
    expect(p.press("prev")).toMatchObject({ moved: false });
    expect(p.deck(6, upTo(6))).toMatchObject({ moved: true });
    expect(p.press("prev")).toMatchObject({ at: 3, moved: true }); // still counted from slide 6
    expect(p.press("live")).toMatchObject({ following: true, moved: false });
  });

  it("sweep2-ios-1 a phone paged back to deck A's slide 2 follows deck B, and stays live when the professor goes back to deck A's tab", () => {
    const p = phone();
    p.deck(5, upTo(5));
    for (let i = 0; i < 4; i++) p.press("prev");
    expect(p.title).toBe("A2");
    p.deck(7, [slide(7, "B")], "B"); // deck B opens on its slide 8 in another tab
    expect(p.title).toBe("B8");
    expect(p.deck(6, upTo(6))).toMatchObject({ at: 6, following: true, moved: false }); // deck A's tab, slide 7
    expect(p.title).toBe("A7");
  });

  it("the deck stopping (End day) puts the phone back to following, so the next class starts live", () => {
    const p = phone();
    p.deck(5, upTo(5));
    p.press("prev");
    expect(p.deck(null, [])).toMatchObject({ at: null, following: true });
    expect(p.deck(2, upTo(2))).toMatchObject({ at: 2, following: true });
  });

  it("sweep2-tests-4 a swipe left opens the next slide and a swipe right the one before; short or mostly up-and-down swipes do nothing", () => {
    expect(swipe(-80, 0)).toBe("next");
    expect(swipe(80, 10)).toBe("prev");
    expect(swipe(-49, 0)).toBeNull();
    expect(swipe(-60, 50)).toBeNull();
  });
});
