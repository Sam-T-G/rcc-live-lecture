// @vitest-environment node
// public/deck-bridge.js, run in a stand-in for the deck's browser tab: each page load runs the
// script once, and a reload runs it again with the same sessionStorage. There is no DOM and no
// network: every slide reads as a heading with no lines, and fetch only records what the bridge
// would send. Which lines a real slide sends (never speaker notes, never beats not shown yet) is
// the integrator's browser check with a local test deck.
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

const SOURCE = readFileSync(new URL("../../public/deck-bridge.js", import.meta.url), "utf8");
const DECK = "https://sam-t-g.github.io/rcc-gdg/decks/build-with-ai/";
const SITE = "https://sample-dev-123.convex.site"; // the deck's data-site
const KEY = "sample-bridge-key"; // stands in for DECK_BRIDGE_KEY

type Sent = { to: string; body: Record<string, unknown> };
// One browser tab: its sessionStorage outlives a reload, and `sent` collects every send made in it.
type Tab = { storage: Map<string, string>; sent: Sent[] };
const newTab = (storage = new Map<string, string>()): Tab => ({ storage, sent: [] });

// Loads the deck at `href` in `tab`: runs the bridge the way its script tag does. `go` moves the
// deck and runs the bridge's next 300 ms check; `check` runs that check without moving.
function open(tab: Tab, href: string) {
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
    window: { __deck: { state: () => ({ ...deck }) } },
    crypto: globalThis.crypto,
    fetch: (to: string, init: { body: string }) => {
      tab.sent.push({ to, body: JSON.parse(init.body) });
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

    const reload = open(tab, deck.location.href);
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
    open(tab, deck.location.href).check();
    expect(tab.sent.map((s) => s.to)).toEqual(["https://quaint-swan-637.convex.site/deck", "https://sample-dev-123.convex.site/deck"]);
  });

  it("core-backend-14 each send carries the tab's run and a seq that goes up, only when the slide or press changes, and a reload keeps the run and keeps the seq going up", () => {
    const tab = newTab();
    const deck = open(tab, `${DECK}?bridge=gdg.${KEY}`);
    deck.check();
    deck.check(); // nothing moved: nothing sent
    deck.go(1);
    deck.go(1, 1);
    open(tab, deck.location.href).go(1, 1); // a reload sends the slide it opens on
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
});
