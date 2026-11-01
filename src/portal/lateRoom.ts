// How much room #/portal leaves at the bottom for the late banner (--late-room in portal.css),
// kept apart from Page.tsx so the tests can run it with a stand-in banner box, window and
// ResizeObserver.
// The banner is fixed 16px above the screen's bottom edge, so the room is its height plus 16px,
// or 0 while no banner shows. The room is bottom padding, which moves Back, Next and the two
// links up only while the page fits on the screen. When the page is taller than the screen
// (a long slide, or two banners on a 320x568 phone), the padding grows below the links and they
// stay under the banner. So when the room grows while the student is at the bottom of the page
// (which is always true when the page fits), Page.tsx scrolls to the new bottom after the
// padding is applied, and the links end up just above the banner. A student who scrolled up to
// read stays where they are.

export const LATE_GAP = 16;

export function roomFor(bannerHeight: number): number {
  return bannerHeight > 0 ? bannerHeight + LATE_GAP : 0;
}

export type PageWindow = {
  scrollY: number;
  innerHeight: number;
  document: { documentElement: { scrollHeight: number } };
  scrollTo(x: number, y: number): void;
};

// Within 2px of the bottom counts, for phones that scroll to fractions of a pixel.
export function atBottom(win: PageWindow): boolean {
  return win.scrollY + win.innerHeight >= win.document.documentElement.scrollHeight - 2;
}

export function scrollToBottom(win: PageWindow): void {
  win.scrollTo(0, win.document.documentElement.scrollHeight);
}

type Observer = { observe(el: never): void; disconnect(): void };
export type ObserverClass = new (callback: () => void) => Observer;

// Watches the banner's box and calls setRoom(px, keepBottom) each time the room changes.
// keepBottom is true when the room grew while the page was at its bottom: the caller scrolls to
// the bottom once the new padding is on the page. Returns the function that stops watching.
export function watchLateRoom(
  banner: { offsetHeight: number },
  win: PageWindow,
  Resize: ObserverClass,
  setRoom: (px: number, keepBottom: boolean) => void,
): () => void {
  let room = 0;
  const measure = () => {
    const next = roomFor(banner.offsetHeight);
    if (next === room) return;
    const keepBottom = next > room && atBottom(win);
    room = next;
    setRoom(next, keepBottom);
  };
  const ro = new Resize(measure);
  ro.observe(banner as never);
  measure();
  return () => ro.disconnect();
}
