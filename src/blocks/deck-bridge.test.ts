// @vitest-environment node
// public/deck-bridge.js, run in a stand-in for the deck's browser tab: each page load runs the
// script once, and a reload runs it again with the same sessionStorage. There is no DOM and no
// network: every slide reads as a heading with no lines, and fetch only records what the bridge
// would send. Which lines a real slide sends (never speaker notes, never beats not shown yet) is
// the integrator's browser check with a local test deck.
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { frameSrc } from "../teams/checkin/stageLink";

const SOURCE = readFileSync(new URL("../../public/deck-bridge.js", import.meta.url), "utf8");
const DECK = "https://sam-t-g.github.io/rcc-gdg/decks/build-with-ai/";
const SITE = "https://sample-dev-123.convex.site"; // the deck's data-site
const KEY = "sample-bridge-key"; // stands in for DECK_BRIDGE_KEY
afterEach(() => vi.restoreAllMocks());

type Sent = { to: string; body: Record<string, unknown> };
// One browser tab: its sessionStorage outlives a reload, and `sent` collects every send made in it.
type Tab = { storage: Map<string, string>; sent: Sent[] };
const newTab = (storage = new Map<string, string>()): Tab => ({ storage, sent: [] });

// How the page load came about: "navigate" (a link, a typed address, an iframe given a new src) or
// "reload" (the browser's reload), as performance.getEntriesByType("navigation") reports it, and
// whether the deck sits in an iframe (the stage, #/checkin/stage).
// `down` lists the sites whose fetch rejects, as a typo'd deployment name or a DNS failure does.
// `now` stands in for the tab's clock (Date.now), for a test that runs the deck for an hour.
type Load = { how?: "navigate" | "reload"; framed?: boolean; down?: Set<string>; now?: () => number };

// Loads the deck at `href` in `tab`: runs the bridge the way its script tag does. `go` moves the
// deck and runs the bridge's next 300 ms check; `check` runs that check without moving.
function open(tab: Tab, href: string, { how = "navigate", framed = false, down = new Set<string>(), now = () => Date.now() }: Load = {}) {
  const url = new URL(href);
  const location = { href: url.href, pathname: url.pathname, search: url.search, hash: url.hash };
  const history = {
    state: null,
    replaceState(_state: unknown, _title: string, next: string) {
      const to = new URL(next, location.href);
      Object.assign(location, { href: to.href, pathname: to.pathname, search: to.search, hash: to.hash });
    },
  };
  const slide = { querySelectorAll: () => [], querySelector: () => ({ textContent: "Trees" }), getAttribute: () => null };
  const deck = { i: 0, b: 0 };
  let check: () => void = () => {};
  const win: Record<string, unknown> = { __deck: { state: () => ({ ...deck }) } };
  win.self = win;
  win.top = framed ? { stage: true } : win;
  runInNewContext(SOURCE, {
    document: {
      currentScript: { getAttribute: (name: string) => (name === "data-site" ? SITE : null) },
      querySelectorAll: () => [slide, slide, slide, slide, slide, slide],
    },
    location,
    history,
    sessionStorage: {
      getItem: (k: string) => tab.storage.get(k) ?? null,
      setItem: (k: string, v: string) => void tab.storage.set(k, String(v)),
      removeItem: (k: string) => void tab.storage.delete(k),
    },
    window: win,
    performance: { getEntriesByType: (type: string) => (type === "navigation" ? [{ type: how }] : []) },
    crypto: globalThis.crypto,
    Date: class extends Date {
      static now() {
        return now();
      }
    },
    fetch: (to: string, init: { body: string }) => {
      tab.sent.push({ to, body: JSON.parse(init.body) });
      if (down.has(new URL(to).hostname.split(".")[0])) return Promise.reject(new TypeError("Failed to fetch"));
      return Promise.resolve({ ok: true, status: 200 });
    },
    setInterval: (f: () => void) => {
      check = f;
      return 1;
    },
    console,
  });
  return {
    location,
    go(i: number, b = 0) {
      deck.i = i;
      deck.b = b;
      check();
    },
    check: () => check(),
  };
}

describe("public/deck-bridge.js", () => {
  it("core-backend-7 reads ?bridge= once, keeps it in sessionStorage and takes bridge and bridge-site out of the address bar; a reload still sends", () => {
    const tab = newTab();
    const deck = open(tab, `${DECK}?bridge=gdg.${KEY}&s=2#4`);
    expect(deck.location.href).toBe(`${DECK}?s=2#4`); // the deck's own parameters and slide stay
    deck.check();
    expect(tab.sent.map((s) => [s.to, s.body.channel, s.body.key])).toEqual([[`${SITE}/deck`, "gdg", KEY]]);

    const reload = open(tab, deck.location.href, { how: "reload" });
    reload.check();
    expect(tab.sent.map((s) => [s.to, s.body.channel, s.body.key])).toEqual([
      [`${SITE}/deck`, "gdg", KEY],
      [`${SITE}/deck`, "gdg", KEY],
    ]);
    expect(reload.location.href).toBe(`${DECK}?s=2#4`);
  });

  it("F7.4 &bridge-site= feeds several deployments, leaves the address bar too, and a reload still feeds every one", () => {
    const tab = newTab();
    const deck = open(tab, `${DECK}?bridge=gdg.${KEY}&bridge-site=quaint-swan-637,sample-dev-123`);
    expect(deck.location.href).toBe(DECK);
    open(tab, deck.location.href, { how: "reload" }).check();
    expect(tab.sent.map((s) => s.to)).toEqual(["https://quaint-swan-637.convex.site/deck", "https://sample-dev-123.convex.site/deck"]);
  });

  it("core-backend-14 each send carries the tab's run and a seq that goes up, only when the slide or press changes, and a reload keeps the run and keeps the seq going up", () => {
    const tab = newTab();
    const deck = open(tab, `${DECK}?bridge=gdg.${KEY}`);
    deck.check();
    deck.check(); // nothing moved: nothing sent
    deck.go(1);
    deck.go(1, 1);
    open(tab, deck.location.href, { how: "reload" }).go(1, 1); // a reload sends the slide it opens on
    const bodies = tab.sent.map((s) => s.body);
    expect(bodies.map((b) => [b.index, b.beat, b.count, b.title])).toEqual([
      [0, 0, 6, "Trees"],
      [1, 0, 6, "Trees"],
      [1, 1, 6, "Trees"],
      [1, 1, 6, "Trees"],
    ]);
    const run = bodies[0].run;
    expect(run).toMatch(/^[0-9a-f]{16}$/);
    expect(bodies.map((b) => b.run)).toEqual([run, run, run, run]);
    const seqs = bodies.map((b) => b.seq as number);
    expect(seqs.every((s) => Number.isSafeInteger(s) && s > 0)).toBe(true);
    expect(seqs.every((s, k) => k === 0 || s > seqs[k - 1])).toBe(true);

    // Another tab gets a run of its own.
    const other = newTab();
    open(other, `${DECK}?bridge=gdg.${KEY}`).check();
    expect(other.sent[0].body.run).not.toBe(run);
  });

  it("F7.4 ?view= windows send nothing, even with a copy of the main window's sessionStorage, and the key leaves their address bar too", () => {
    const tab = newTab();
    open(tab, `${DECK}?bridge=gdg.${KEY}`).check();
    expect(tab.sent).toHaveLength(1);
    // presenter.js opens the presenter window with window.open, which copies sessionStorage.
    const presenter = newTab(new Map(tab.storage));
    open(presenter, `${DECK}?view=presenter#1`).check();
    const typed = open(presenter, `${DECK}?bridge=gdg.${KEY}&view=presenter`);
    typed.check();
    expect(presenter.sent).toEqual([]);
    expect(typed.location.href).toBe(`${DECK}?view=presenter`);
  });

  it("core-backend-7 without ?bridge= a deck sends nothing and keeps nothing; ?bridge=off stops this tab; another deck page in the same tab never picks up the key", () => {
    const fresh = newTab();
    open(fresh, DECK).check();
    expect(fresh.sent).toEqual([]);
    expect(fresh.storage.size).toBe(0);

    const tab = newTab();
    open(tab, `${DECK}?bridge=gdg.${KEY}`).check();
    open(tab, "https://sam-t-g.github.io/rcc-gdg/decks/another-deck/").check();
    expect(tab.sent).toHaveLength(1);

    const off = open(tab, `${DECK}?bridge=off`);
    off.check();
    expect(off.location.href).toBe(DECK);
    open(tab, DECK).check();
    expect(tab.sent).toHaveLength(1);
  });

  it("DECK-access-2 once the key has left the address bar, only a reload of that same page keeps sending: opening the deck again without ?bridge= sends nothing and forgets the key", () => {
    const tab = newTab();
    open(tab, `${DECK}?bridge=gdg.${KEY}`).check();
    expect(tab.sent).toHaveLength(1);
    open(tab, DECK).check(); // the plain deck link again, in the same tab
    expect(tab.sent).toHaveLength(1);
    open(tab, DECK, { how: "reload" }).check(); // and a reload after that doesn't bring the key back
    expect(tab.sent).toHaveLength(1);
  });

  it("DECK-spec-2 on the stage, taking ?bridge=saved out of the link stops the slides: the deck in the iframe never reads a key it saved earlier", () => {
    const tab = newTab();
    const deck = new URL(DECK);
    open(tab, frameSrc(deck, `gdg.${KEY}`, "quaint-swan-637"), { framed: true }).check();
    expect(tab.sent.map((s) => s.to)).toEqual(["https://quaint-swan-637.convex.site/deck"]);
    // The professor removes bridge=saved: the stage gives the iframe the deck with bridge-site only,
    // or with neither when the link had no bridge-site.
    open(tab, frameSrc(deck, null, "quaint-swan-637"), { framed: true }).check();
    open(tab, frameSrc(deck, null, null), { framed: true }).check();
    // Reloading the stage reloads the iframe too.
    open(tab, frameSrc(deck, null, null), { how: "reload", framed: true }).check();
    expect(tab.sent).toHaveLength(1);
    // With bridge=saved still in the link, the stage hands the key over on every load.
    open(tab, frameSrc(deck, `gdg.${KEY}`, "quaint-swan-637"), { how: "reload", framed: true }).check();
    expect(tab.sent).toHaveLength(2);
  });

  it("DECK-fixcheck-2 in an iframe the bridge saves no key, so a reload of the iframe straight after a keyed load sends nothing", () => {
    const tab = newTab();
    const deck = new URL(DECK);
    open(tab, frameSrc(deck, `gdg.${KEY}`, "quaint-swan-637"), { framed: true }).check();
    expect(tab.sent).toHaveLength(1);
    expect([...tab.storage.keys()].filter((k) => k.endsWith(":link"))).toEqual([]);
    // No load in between: only the iframe guard keeps this reload from reading a saved key.
    open(tab, frameSrc(deck, null, null), { how: "reload", framed: true }).check();
    expect(tab.sent).toHaveLength(1);

    // The deck opened with the key in this tab first (so it saved it), then the tab went to the
    // stage, whose iframe shares the deck's sessionStorage: the iframe still never reads that key.
    const top = newTab();
    open(top, `${DECK}?bridge=gdg.${KEY}`).check();
    expect([...top.storage.keys()].filter((k) => k.endsWith(":link"))).toHaveLength(1);
    open(top, frameSrc(deck, null, null), { how: "reload", framed: true }).check();
    expect(top.sent).toHaveLength(1);
  });

  it("DECK-spec-1 &bridge-site= without ?bridge= sends nothing, even in a tab that saved a key, and stays in the address bar", () => {
    const tab = newTab();
    open(tab, `${DECK}?bridge=gdg.${KEY}`).check();
    expect(tab.sent.map((s) => s.to)).toEqual([`${SITE}/deck`]);
    for (const how of ["navigate", "reload"] as const) {
      const lone = open(tab, `${DECK}?bridge-site=quaint-swan-637`, { how });
      lone.check();
      expect(lone.location.href).toBe(`${DECK}?bridge-site=quaint-swan-637`);
    }
    expect(tab.sent).toHaveLength(1); // nothing more went to the script tag's site (prod, for a published deck)
  });

  // Lets each fetch's then/catch run before the next 300 ms check.
  const settle = () => new Promise((r) => setTimeout(r, 0));

  it("sweep1-core-1 when one bridge-site can't be reached, only that site gets the slide again, less and less often, and the sites that took it get nothing more", async () => {
    const tab = newTab();
    vi.spyOn(console, "warn").mockImplementation(() => {}); // "deck-bridge: offline" on each failed send
    const down = new Set(["broken-site-999"]);
    const deck = open(tab, `${DECK}?bridge=gdg.${KEY}&bridge-site=quaint-swan-637,broken-site-999`, { down });
    const to = (name: string) => tab.sent.filter((s) => s.to === `https://${name}.convex.site/deck`);
    deck.check();
    await settle();
    for (let k = 0; k < 20; k++) {
      deck.check(); // 20 checks (6 s) with the deck parked on slide 0
      await settle();
    }
    expect(to("quaint-swan-637")).toHaveLength(1);
    // The first send, then tries 1, 2, 4 and 8 checks after each failure: 1 + 4 in 20 checks.
    expect(to("broken-site-999")).toHaveLength(5);
    expect(new Set(to("broken-site-999").map((s) => s.body.seq))).toEqual(new Set([to("quaint-swan-637")[0].body.seq]));

    // The site comes back: its next try lands and nothing more goes to it.
    down.clear();
    for (let k = 0; k < 40; k++) {
      deck.check();
      await settle();
    }
    expect(to("broken-site-999")).toHaveLength(6);
    expect(to("quaint-swan-637")).toHaveLength(1);

    // A new slide goes to both once.
    deck.go(1);
    await settle();
    deck.check();
    await settle();
    expect(tab.sent.slice(-2).map((s) => [s.to, s.body.index])).toEqual([
      ["https://quaint-swan-637.convex.site/deck", 1],
      ["https://broken-site-999.convex.site/deck", 1],
    ]);
    expect(tab.sent).toHaveLength(9); // 1 + 6 for slide 0, 2 for slide 1
  });

  it("sweep1-core-1 a failed send of an older slide isn't tried again once a newer slide has gone out", async () => {
    const tab = newTab();
    vi.spyOn(console, "warn").mockImplementation(() => {}); // "deck-bridge: offline" on each failed send
    const down = new Set(["broken-site-999"]);
    const deck = open(tab, `${DECK}?bridge=gdg.${KEY}&bridge-site=broken-site-999`, { down });
    deck.check(); // slide 0 goes out
    deck.go(1); // slide 1 goes out before slide 0's failure comes back
    await settle();
    down.clear();
    for (let k = 0; k < 5; k++) {
      deck.check();
      await settle();
    }
    expect(tab.sent.map((s) => s.body.index)).toEqual([0, 1, 1]);
  });

  it("sweep1-core-fixcheck-2 a failed send stops being tried 2 minutes after it first went out, so a site back an hour later never gets the old slide", async () => {
    const tab = newTab();
    vi.spyOn(console, "warn").mockImplementation(() => {}); // "deck-bridge: offline" on each failed send
    const down = new Set(["broken-site-999"]);
    let t = Date.UTC(2026, 10, 1, 10);
    const deck = open(tab, `${DECK}?bridge=gdg.${KEY}&bridge-site=broken-site-999`, { down, now: () => t });
    deck.check(); // slide 0 goes out and fails
    await settle();
    const tries: number[] = [];
    for (let k = 0; k < 12_000; k++) {
      t += 300; // an hour of 300 ms checks with the deck parked on slide 0
      const before = tab.sent.length;
      deck.check();
      if (tab.sent.length > before) {
        tries.push(t);
        await settle(); // only a send has a then/catch to run
      }
    }
    expect(tries.length).toBeGreaterThan(3); // it did try again for a while
    expect(tries.at(-1)! - tries[0]).toBeLessThanOrEqual(2 * 60_000);

    down.clear(); // the site comes back
    const sent = tab.sent.length;
    for (let k = 0; k < 200; k++) {
      t += 300;
      const before = tab.sent.length;
      deck.check();
      if (tab.sent.length > before) await settle();
    }
    expect(tab.sent).toHaveLength(sent); // the old slide never lands

    deck.go(1); // the next slide goes out as usual
    await settle();
    expect(tab.sent.map((s) => s.body.index).slice(-2)).toEqual([0, 1]);
  });
});
