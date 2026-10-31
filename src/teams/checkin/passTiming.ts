// When the pass page (Student.tsx) asks the server for a new code, and when it stops showing the
// code it has. convex/checkin/pass.ts has the server's side: a new code once the current one is
// 20 s old, and how long each code scans.

export const ASK_EVERY_MS = 5_000; // the page asks this often while the pass shows
export const NEW_CODE_MS = 20_000; // the server makes a new code once the current one is this old
// A code older than this on screen means the page's asks stopped getting through (the phone slept
// or lost its connection), so the page shows "Getting a new code…" in place of the QR.
export const OLD_CODE_MS = 25_000;

// What the page listens to: window and document in the browser, plain EventTargets in tests.
type Target = Pick<EventTarget, "addEventListener" | "removeEventListener">;
const WINDOW_EVENTS = ["focus", "online", "pageshow"] as const;

// Asks now, every 5 s, and each time the phone comes back to the page: the page turns visible
// (the phone wakes, or the student switches back to the tab), the window gets focus, the
// connection comes back, or the browser restores the page from its back-forward cache. Returns
// the function that stops it.
export function askForCodes(ask: () => void, win: Target, doc: Target & { visibilityState: string }): () => void {
  const onVisible = () => {
    if (doc.visibilityState === "visible") ask();
  };
  ask();
  const timer = setInterval(ask, ASK_EVERY_MS);
  doc.addEventListener("visibilitychange", onVisible);
  for (const e of WINDOW_EVENTS) win.addEventListener(e, ask);
  return () => {
    clearInterval(timer);
    doc.removeEventListener("visibilitychange", onVisible);
    for (const e of WINDOW_EVENTS) win.removeEventListener(e, ask);
  };
}

// Whether the code on screen is too old to show. `gotAt` is when this phone got the code, by its
// own clock. The server's `at` (pass.mine) says when the code was made by the server's clock, but
// a phone's clock can be off by more than 25 s, which would hide every code on that phone.
export function codeIsOld(gotAt: number, now: number) {
  return now - gotAt > OLD_CODE_MS;
}

// How long to wait before asking again so the server replaces the code as it turns 20 s old,
// well before it looks old: the 5 s asks alone can land just under 20 s and leave a code up for
// 25 s. A quarter second over, so the code is 20 s old when the ask reaches the server.
export function msUntilNewCode(gotAt: number, now: number) {
  return Math.max(0, gotAt + NEW_CODE_MS + 250 - now);
}
