// @vitest-environment node
// public/deck-bridge.js, run in a stand-in for the deck's browser tab: each page load runs the
// script once, and a reload runs it again with the same sessionStorage. There is no network:
// fetch only records what the bridge would send and answers with the status a test picks. The
// slides are a small stand-in DOM (El below) with the browser rules that decide which text
// reaches the phones; by default each slide is a heading with no lines.
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { frameSrc } from "../teams/checkin/stageLink";

// --- A stand-in DOM: only what read() in public/deck-bridge.js touches. -------------------------
// It keeps the browser rules the bridge depends on: an element that is display:none, or inside
// one, isn't rendered, so its innerText is its textContent (the HTML innerText getter);
// visibility:hidden is inherited unless a child sets visible again, and innerText leaves that text
// out; checkVisibility({ visibilityProperty: true }) is false for both; a block child's text is
// on a line of its own in innerText.
type Style = { display?: string; visibility?: string };
type Attrs = { [name: string]: string | Style | undefined; $style?: Style };
const BLOCK_TAGS = new Set(["SECTION", "DIV", "P", "LI", "OL", "UL", "H1", "H2", "ASIDE"]);

// An element, then each of its parents up to the top.
function* selfAndUp(el: El) {
  for (let e: El | null = el; e; e = e.parentElement) yield e;
}

class Txt {
  readonly nodeType = 3;
  parentElement: El | null = null;
  readonly textContent: string;
  constructor(text: string) {
    this.textContent = text;
  }
}

// A compound selector (tag, .class, [attr], [attr="v"], [attr$="v"], [attr*="v"]) or a comma list
// of them. read() uses no combinators.
function matchesSelector(el: El, selector: string): boolean {
  return selector.split(",").some((one) => {
    const s = one.trim();
    const tag = /^[a-z0-9]+/i.exec(s)?.[0];
    if (tag && el.tagName !== tag.toUpperCase()) return false;
    const classes = (el.attrs.class ?? "").split(/\s+/);
    for (const [, c] of s.matchAll(/\.([\w-]+)/g)) if (!classes.includes(c)) return false;
    for (const [, name, op, value] of s.matchAll(/\[([\w-]+)(?:([$*]?=)"([^"]*)")?\]/g)) {
      const have = el.attrs[name];
      if (have === undefined) return false;
      if (op === "=" && have !== value) return false;
      if (op === "$=" && !have.endsWith(value)) return false;
      if (op === "*=" && !have.includes(value)) return false;
    }
    return true;
  });
}

class El {
  readonly nodeType = 1;
  parentElement: El | null = null;
  readonly tagName: string;
  readonly attrs: Record<string, string> = {};
  readonly style: Style;
  readonly childNodes: (El | Txt)[];
  constructor(tag: string, attrs: Attrs, kids: (El | Txt)[]) {
    this.tagName = tag.toUpperCase();
    this.style = attrs.$style ?? {};
    for (const [name, value] of Object.entries(attrs)) if (typeof value === "string") this.attrs[name] = value;
    this.childNodes = kids;
    for (const k of kids) k.parentElement = this;
  }
  get textContent(): string {
    return this.childNodes.map((k) => k.textContent).join("");
  }
  getAttribute(name: string) {
    return this.attrs[name] ?? null;
  }
  matches(selector: string) {
    return matchesSelector(this, selector);
  }
  closest(selector: string) {
    for (const e of selfAndUp(this)) if (e.matches(selector)) return e;
    return null;
  }
  contains(other: El | Txt | null) {
    for (let e: El | Txt | null = other; e; e = e.parentElement) if (e === this) return true;
    return false;
  }
  querySelectorAll(selector: string): El[] {
    const out: El[] = [];
    const walk = (e: El) =>
      e.childNodes.forEach((k) => {
        if (!(k instanceof El)) return;
        if (k.matches(selector)) out.push(k);
        walk(k);
      });
    walk(this);
    return out;
  }
  querySelector(selector: string) {
    return this.querySelectorAll(selector)[0] ?? null;
  }
  rendered() {
    for (const e of selfAndUp(this)) if (e.style.display === "none") return false;
    return true;
  }
  visibility(): string {
    for (const e of selfAndUp(this)) if (e.style.visibility) return e.style.visibility;
    return "visible";
  }
  checkVisibility(opts?: { visibilityProperty?: boolean }) {
    return this.rendered() && !(opts?.visibilityProperty && this.visibility() !== "visible");
  }
  getClientRects() {
    return this.rendered() ? [{}] : [];
  }
  shownText(): string {
    const own = this.visibility() === "visible";
    return this.childNodes
      .map((k) => {
        if (k instanceof Txt) return own ? k.textContent : "";
        if (k.style.display === "none") return "";
        const t = k.shownText();
        return BLOCK_TAGS.has(k.tagName) || k.style.display === "block" ? `\n${t}\n` : t;
      })
      .join("");
  }
  get innerText(): string {
    return this.rendered() ? this.shownText() : this.textContent;
  }
}

// h("li", { class: "x", $style: { visibility: "hidden" } }, "text", h(...)) builds an element.
function h(tag: string, attrs: Attrs = {}, ...kids: (El | Txt | string)[]) {
  return new El(tag, attrs, kids.map((k) => (typeof k === "string" ? new Txt(k) : k)));
}
const slideOf = (attrs: Attrs, ...kids: (El | string)[]) => h("section", { class: "slide", ...attrs }, ...kids);

// Takes checkVisibility away from every element, as a browser without it (Safari before 17.4).
function withoutCheckVisibility<T extends El>(el: T): T {
  Object.defineProperty(el, "checkVisibility", { value: undefined });
  el.childNodes.forEach((k) => k instanceof El && withoutCheckVisibility(k));
  return el;
}

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
// `status` is the HTTP status each site that can be reached answers with (200 when left out).
// `slides` are the deck's slides. When `presenting` (deck.js at 700 px wide and up, the projector)
// the beats not shown yet on the current slide are visibility:hidden, as deck-kit's is-pending
// class makes them; in stacked mode (a narrow window) deck.js shows every beat.
type Load = {
  how?: "navigate" | "reload";
  framed?: boolean;
  down?: Set<string>;
  now?: () => number;
  status?: (site: string) => number;
  slides?: El[];
  presenting?: boolean;
};

const trees = () => Array.from({ length: 6 }, () => slideOf({}, h("h1", {}, "Trees")));

// Loads the deck at `href` in `tab`: runs the bridge the way its script tag does. `go` moves the
// deck and runs the bridge's next 300 ms check; `check` runs that check without moving.
function open(
  tab: Tab,
  href: string,
  {
    how = "navigate",
    framed = false,
    down = new Set<string>(),
    now = () => Date.now(),
    status = () => 200,
    slides = trees(),
    presenting = true,
  }: Load = {},
) {
  const url = new URL(href);
  const location = { href: url.href, pathname: url.pathname, search: url.search, hash: url.hash };
  const history = {
    state: null,
    replaceState(_state: unknown, _title: string, next: string) {
      const to = new URL(next, location.href);
      Object.assign(location, { href: to.href, pathname: to.pathname, search: to.search, hash: to.hash });
    },
  };
  const deck = { i: 0, b: 0 };
  const pend = () => {
    if (!presenting) return;
    slides[deck.i]?.querySelectorAll("[data-beat]").forEach((el, k) => {
      if (k >= deck.b) el.style.visibility = "hidden";
      else delete el.style.visibility;
    });
  };
  pend();
  let check: () => void = () => {};
  const win: Record<string, unknown> = { __deck: { state: () => ({ ...deck }) } };
  win.self = win;
  win.top = framed ? { stage: true } : win;
  runInNewContext(SOURCE, {
    document: {
      currentScript: { getAttribute: (name: string) => (name === "data-site" ? SITE : null) },
      querySelectorAll: (selector: string) => (selector === "main.deck > section.slide" ? slides : []),
    },
    getComputedStyle: (el: El) => ({ visibility: el.visibility() }),
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
      const site = new URL(to).hostname.split(".")[0];
      if (down.has(site)) return Promise.reject(new TypeError("Failed to fetch"));
      const code = status(site);
      return Promise.resolve({ ok: code >= 200 && code < 300, status: code });
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
      pend();
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

  it("sweep2-core-3 a 500 or 503 answer is tried again like a site that can't be reached, and a 4xx answer is not", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {}); // "deck-bridge: <site> 500"
    for (const [code, sends] of [
      [500, 6],
      [503, 6],
      [403, 1],
      [400, 1],
    ] as const) {
      const tab = newTab();
      let answer: number = code;
      const deck = open(tab, `${DECK}?bridge=gdg.${KEY}`, { status: () => answer });
      deck.check();
      await settle();
      for (let k = 0; k < 40; k++) {
        deck.check(); // 40 checks (12 s) with the deck parked on slide 0
        await settle();
      }
      // The first send, then tries 1, 2, 4, 8 and 16 checks after each failure.
      expect([code, tab.sent.length]).toEqual([code, sends]);
      expect(new Set(tab.sent.map((s) => s.body.seq)).size).toBe(1); // the same send each time
      answer = 200; // the backend is fine again: the next try lands and nothing more goes out
      for (let k = 0; k < 40; k++) {
        deck.check();
        await settle();
      }
      expect([code, tab.sent.length]).toEqual([code, code >= 500 ? sends + 1 : 1]);
    }
  });

  // What the phones get for each send: the title and the lines.
  const shown = (tab: Tab) => tab.sent.map((s) => [s.body.beat, s.body.title, s.body.lines]);

  it("sweep2-tests-2 F7.4 speaker notes and .notice text never go out, and beats go out only once the professor shows them, even in stacked mode where deck.js shows every beat", () => {
    const steps = () =>
      slideOf(
        { "aria-label": "Steps" },
        h("h2", {}, "Three steps"),
        h("p", { class: "sub" }, "Bring a laptop"),
        h(
          "ol",
          { class: "beats" },
          h("li", { "data-beat": "" }, "Plug in the board"),
          h(
            "li",
            { "data-beat": "" },
            h("span", { class: "body", $style: { display: "block" } }, "Upload the sketch"),
            h("span", { class: "detail", $style: { display: "block" } }, "Arduino IDE, top left"),
          ),
          h("li", { "data-beat": "" }, "Watch the LED blink"),
        ),
        h("div", { class: "notice" }, h("p", { class: "label" }, "Room code 4417")),
        h("aside", { class: "notes" }, h("h2", {}, "Say this"), h("ul", {}, h("li", {}, "The answer is B"))),
      );
    const expected = [
      [0, "Three steps", ["Bring a laptop"]],
      [1, "Three steps", ["Bring a laptop", "Plug in the board"]],
      [2, "Three steps", ["Bring a laptop", "Plug in the board", "Upload the sketch Arduino IDE, top left"]],
      [3, "Three steps", ["Bring a laptop", "Plug in the board", "Upload the sketch Arduino IDE, top left", "Watch the LED blink"]],
    ];
    for (const presenting of [false, true]) {
      const tab = newTab();
      const deck = open(tab, `${DECK}?bridge=gdg.${KEY}`, { slides: [steps()], presenting });
      for (const b of [0, 1, 2, 3]) deck.go(0, b);
      expect(shown(tab)).toEqual(expected);
    }
  });

  it("sweep2-tests-2 a beat inside a line sends only the part shown; a list inside a list item is part of its line; each line goes once, at most 12, and a slide with no heading sends its aria-label", () => {
    const tab = newTab();
    const wiring = slideOf(
      {},
      h("h2", {}, "Wiring"),
      h(
        "ul",
        {},
        h("li", {}, "Red wire to 5V", h("span", { "data-beat": "" }, " (the pin by the USB port)")),
        h("li", {}, "Parts", h("ul", {}, h("li", {}, "Board"), h("li", {}, "Cable"))),
        h("li", {}, "Red wire to 5V"),
      ),
    );
    const parts = ["Board", "Cable", "Board", "LED", "Button", "Servo", "Fan", "Diode", "Resistor", "Transistor", "Battery", "Switch", "Buzzer", "Motor"];
    const list = slideOf({ "aria-label": "Fourteen parts" }, h("ul", {}, ...parts.map((p) => h("li", {}, p))));
    const deck = open(tab, `${DECK}?bridge=gdg.${KEY}`, { slides: [wiring, list] });
    deck.go(0, 0);
    deck.go(0, 1);
    deck.go(1, 0);
    expect(shown(tab)).toEqual([
      [0, "Wiring", ["Red wire to 5V", "Parts Board Cable"]],
      [1, "Wiring", ["Red wire to 5V (the pin by the USB port)", "Parts Board Cable", "Red wire to 5V"]],
      [0, "Fourteen parts", ["Board", "Cable", "LED", "Button", "Servo", "Fan", "Diode", "Resistor", "Transistor", "Battery", "Switch", "Buzzer"]],
    ]);
  });

  // The 10-29 deck's scene slides, as deck-kit draws them (expressive.css, scenes.js, deck.js).
  const card = (label: string, line: string, off = false) =>
    h(
      "div",
      { class: "strip__card", $style: off ? { visibility: "hidden" } : {} }, // scenes.js hides a card wholly off the stage
      h("p", { class: "label" }, label),
      h("p", { class: "strip__min" }, h("span", {}, "8"), h("small", {}, "min")),
      h("p", { class: "strip__line" }, line),
    );
  const sceneSlides = () => [
    // A drawn flow scene: its source list is display:none, the stops are SVG text the bridge doesn't read.
    slideOf(
      { "data-kind": "scene" },
      h("h2", {}, "How it fits together"),
      h(
        "div",
        { "data-scene": "flow", class: "is-drawn" },
        h("ol", { class: "flow-src", $style: { display: "none" } }, ...["Slide", "Phone", "Server", "Big screen"].map((t) => h("li", {}, t))),
        h("svg", {}, h("text", { class: "sc-label" }, "Slide")),
      ),
    ),
    // A flow scene before it draws: its source list is still rendered.
    slideOf(
      { "data-kind": "scene" },
      h("h2", {}, "Before the scene draws"),
      h("div", { "data-scene": "flow" }, h("ol", { class: "flow-src" }, h("li", {}, "Slide"), h("li", {}, "Phone"))),
    ),
    // A strip: one card on the stage, one wholly off it.
    slideOf(
      { "data-kind": "scene" },
      h("h2", {}, "The 45 minutes"),
      h(
        "div",
        { "data-scene": "strip", class: "is-drawn" },
        h("ol", { class: "strip-src", $style: { display: "none" } }, h("li", { "data-label": "Sprint 0" }, "Set the target."), h("li", { "data-label": "Sprint 1" }, "Build it.")),
        h("div", { class: "strip" }, h("div", { class: "strip__track" }, card("Sprint 0", "Set the target."), card("Sprint 1", "Build it.", true))),
      ),
    ),
    // A compress slide: deck.css clips its source list to 1 px, so it stays rendered.
    slideOf(
      {},
      h("h2", {}, "Say it shorter"),
      h("ol", { class: "compress-src" }, h("li", { "data-label": "40 words" }, "A long first version"), h("li", { "data-label": "8 words" }, "Short")),
    ),
    // A heading the room can't see comes before the one it can.
    slideOf({}, h("h2", { $style: { display: "none" } }, "Answer: 42"), h("h1", {}, "Quiz"), h("p", { class: "sub" }, "Pick one")),
  ];

  it("sweep2-core-1 F19 scene, strip and compress slides send only what the projector shows: no source list, no card off the stage, no hidden heading; the same without checkVisibility", () => {
    for (const legacy of [false, true]) {
      const tab = newTab();
      const slides = sceneSlides().map((s) => (legacy ? withoutCheckVisibility(s) : s));
      const deck = open(tab, `${DECK}?bridge=gdg.${KEY}`, { slides });
      deck.go(0, 0);
      deck.go(0, 2); // a scene steps without data-beat
      for (const i of [1, 2, 3, 4]) deck.go(i, 0);
      expect(shown(tab)).toEqual([
        [0, "How it fits together", []],
        [2, "How it fits together", []],
        [0, "Before the scene draws", []],
        [0, "The 45 minutes", ["Sprint 0"]],
        [0, "Say it shorter", []],
        [0, "Quiz", ["Pick one"]],
      ]);
    }
  });

  it("sweep2-core-2 a figure sends its end value, not the number on its way there, and the count running doesn't send again", () => {
    const tab = newTab();
    const num = (from: string, to: string) => h("span", { class: "figure__num", "data-from": from, "data-to": to, $style: { display: "inline-block" } }, from);
    const figure = (n: El, unit: string) => slideOf({ "data-kind": "figure" }, h("p", { class: "figure", $style: { display: "flex" } }, n, h("span", { class: "figure__unit" }, unit)));
    const minutes = num("0", "30");
    const deck = open(tab, `${DECK}?bridge=gdg.${KEY}`, { slides: [figure(minutes, "minutes"), figure(num("0", "44000"), "RCC alumni")] });
    deck.go(0);
    (minutes.childNodes as Txt[])[0] = new Txt("12"); // deck.js counting up
    deck.check();
    (minutes.childNodes as Txt[])[0] = new Txt("30");
    deck.check();
    deck.go(1);
    expect(tab.sent.map((s) => s.body.lines)).toEqual([["30 minutes"], ["44,000 RCC alumni"]]);
  });

  it("sweep2-core-1 a line that shows up while a press's animation runs goes out again within 3 s of the press, and later changes don't", () => {
    const tab = newTab();
    let t = Date.UTC(2026, 10, 1, 10);
    const later = card("Sprint 1", "Build it.", true);
    const evenLater = card("Sprint 2", "Show it.", true);
    const strip = slideOf({}, h("h2", {}, "The 45 minutes"), h("div", { class: "strip__track" }, card("Sprint 0", "Set the target."), later, evenLater));
    const deck = open(tab, `${DECK}?bridge=gdg.${KEY}`, { slides: [strip], now: () => t });
    deck.go(0);
    t += 300;
    deck.check(); // nothing changed: nothing sent
    delete later.style.visibility; // the card scrolls onto the stage
    t += 300;
    deck.check();
    t += 3000;
    delete evenLater.style.visibility; // a resize, long after the press
    deck.check();
    expect(tab.sent.map((s) => [s.body.index, s.body.beat, s.body.lines])).toEqual([
      [0, 0, ["Sprint 0"]],
      [0, 0, ["Sprint 0", "Sprint 1"]],
    ]);
    expect((tab.sent[1].body.seq as number) > (tab.sent[0].body.seq as number)).toBe(true);
  });
});
