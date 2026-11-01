// #/portal's paging rules, kept apart from Page.tsx so the tests can run them without a browser
// (the same split as lateRoom.ts). The iOS app's Follow (ios/RCCLivePortal/DeckView.swift) and
// #/live (src/teams/live/Page.tsx) follow the same rules.

export type Shown = { index: number; title: string; lines: string[] };

// Where the phone is. viewing: null follows the live slide; a number is the slide the student
// paged to. liveAtBrowse: the live slide when the student left it, to tell when the professor
// moves on.
export type Browse = { viewing: number | null; liveAtBrowse: number | null };
export const FOLLOW: Browse = { viewing: null, liveAtBrowse: null };

// The slides a student can open, by index: every slide shown so far up to the live one, plus the
// live one as it is on screen right now. Never a slide past the live one, so a professor who went
// back from slide 6 to slide 3 doesn't let a student open slides 4 to 6.
export function pages(shown: Shown[] | undefined, live: Shown | null | undefined): Map<number, Shown> {
  const byIndex = new Map<number, Shown>();
  if (!live) return byIndex;
  for (const s of shown ?? []) if (s.index <= live.index) byIndex.set(s.index, s);
  byIndex.set(live.index, live);
  return byIndex;
}

export type Place = {
  following: boolean; // on the live slide
  at: number | null; // the slide on screen, null before the slides start
  prev: number | null; // what ← Back, ArrowLeft and a swipe right open
  next: number | null; // what Next →, ArrowRight and a swipe left open
  moved: boolean; // the professor moved since the student paged away: "The professor is on slide N now."
};

export function place(byIndex: Map<number, Shown>, liveIndex: number | null, b: Browse): Place {
  const order = [...byIndex.keys()].sort((x, y) => x - y);
  const following = b.viewing === null || b.viewing === liveIndex || !byIndex.has(b.viewing);
  const at = following ? liveIndex : b.viewing;
  const pos = at === null ? -1 : order.indexOf(at);
  return {
    following,
    at,
    prev: pos > 0 ? order[pos - 1] : null,
    next: pos >= 0 && pos < order.length - 1 ? order[pos + 1] : null,
    moved: !following && b.liveAtBrowse !== null && liveIndex !== b.liveAtBrowse,
  };
}

// The phone follows live again when the professor lands on (or goes back past) the slide the
// student is reading, and when that slide is no longer one they can open: another deck tab took
// over, or the deck stopped. Without the second rule, a phone that paged back to deck A's slide 2
// would jump back to it when the professor returns to deck A's tab after showing deck B. Returns
// `b` itself when nothing changes.
export function settle(b: Browse, liveIndex: number | null, byIndex: Map<number, Shown>): Browse {
  if (b.viewing === null) return b;
  if (liveIndex === null || b.viewing >= liveIndex || !byIndex.has(b.viewing)) return FOLLOW;
  return b;
}

// The student opens slide `index` (← Back, Next →, an arrow key, a swipe, or Back to live).
export function open(b: Browse, index: number | null, liveIndex: number | null, following: boolean): Browse {
  if (index === null) return b;
  if (index === liveIndex) return FOLLOW;
  return { viewing: index, liveAtBrowse: following ? liveIndex : b.liveAtBrowse };
}

// A finished one-finger swipe: at least 50px sideways and mostly sideways. A swipe left (the
// finger moves toward the left edge) opens the next slide, a swipe right the one before.
export function swipe(dx: number, dy: number): "prev" | "next" | null {
  if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return null;
  return dx < 0 ? "next" : "prev";
}
