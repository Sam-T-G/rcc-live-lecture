// @vitest-environment node
// #/checkin/stage, rendered to HTML with made-up query results (no backend), and the link helpers
// in stageLink.ts. The late banner is a stand-in that prints its name and each ErrorBoundary prints
// its label, so a test can see where they sit. useHashParams is the real one unless a test hands
// the stage its own parameters.
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { getFunctionName, type FunctionReference } from "convex/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Stage from "./Stage";
import { deckAddress, takeBridge } from "./stageLink";

const results: Record<string, unknown> = {};
vi.mock("convex/react", () => ({
  useQuery: (ref: FunctionReference<"query">) => results[getFunctionName(ref)],
}));
vi.mock("./LateBanner", () => ({ default: () => "[late banner]" }));
// The QR as a figure that prints the address it encodes.
vi.mock("../../blocks/qr", async () => {
  const { createElement: h } = await import("react");
  return { QR: ({ value }: { value: string }) => h("figure", { className: "qr", "data-value": value }) };
});
vi.mock("../../blocks/ui", async (importOriginal) => {
  const { createElement: h } = await import("react");
  return {
    ...(await importOriginal<typeof import("../../blocks/ui")>()),
    ErrorBoundary: ({ label, children }: { label?: string; children?: ReactNode }) => h("div", { "data-boundary": label }, children),
  };
});
const given = vi.hoisted(() => ({ params: null as URLSearchParams | null }));
vi.mock("../../blocks/router", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../blocks/router")>();
  return {
    ...real,
    useHashParams: () => {
      const read = real.useHashParams();
      return given.params ?? read;
    },
  };
});

const OPEN = { question: "Which route shows the board?", choices: ["A", "B"], open: true, answered: 1 };
const DECK = "https://deck.example.com/d/";

function at(hash: string, pathname = "/", protocol = "http:") {
  const origin = protocol + "//x";
  vi.stubGlobal("location", { hash, href: origin + pathname + hash, origin, pathname, protocol, search: "" });
}

function open(hash: string, protocol?: string) {
  at(hash, "/", protocol);
  return renderToStaticMarkup(createElement(Stage));
}

const decode = (s: string) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, "&");

// The iframe's address, or null when the page shows no deck.
function frame(html: string) {
  const m = /<iframe[^>]* src="([^"]*)"/.exec(html);
  return m ? new URL(decode(m[1])) : null;
}

// What the page says, without its tags.
const words = (html: string) => decode(html.replace(/<[^>]+>/g, ""));

// A sessionStorage stand-in. `refuse` makes setItem throw, as a browser with storage blocked does.
function stubStorage(refuse = false) {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => {
      if (refuse) throw new Error("QuotaExceededError");
      m.set(k, v);
    },
    values: () => [...m.values()],
  };
}

// A history stand-in whose replaceState moves the stubbed location, as the browser's does.
function stubHistory() {
  const replaceState = vi.fn((_state: unknown, _title: string, url: string) => {
    location.hash = url.slice(url.indexOf("#"));
  });
  vi.stubGlobal("history", { state: { from: "app" }, replaceState });
  return replaceState;
}

beforeEach(() => {
  for (const k of Object.keys(results)) delete results[k];
  Object.assign(results, { "checkin/read:count": 12, "checkin/quiz:current": OPEN });
  given.params = null;
  at("#/checkin/stage");
});

describe("#/checkin/stage", () => {
  it("the check-in card is light whatever the laptop's theme, like the deck under it", () => {
    const html = renderToStaticMarkup(createElement(Stage));
    expect(html).toMatch(/<aside class="stage__card" data-theme="light">/);
  });

  it("each ended choice's words are in .stage__label, which stops at 2 lines (DCHK-1)", () => {
    results["checkin/quiz:current"] = {
      question: "Which of these four things does the card show to the room?",
      choices: ["The QR code", "Bars", "The right answer", "Names"],
      open: false,
      answered: 1,
      results: { counts: [0, 1, 0, 0], correct: 1 },
    };
    const html = renderToStaticMarkup(createElement(Stage));
    expect(html.match(/<span class="stage__label"><span class="letter">[A-D]<\/span> [^<]+<\/span><b>\d+<\/b>/g)).toHaveLength(4);
  });

  it("open and ended rows start with the kit's letter tile, the same A to D the phones show (DS-PROJECTOR-design-3)", () => {
    const tiles = (html: string) => [...html.matchAll(/<span class="stage__label"><span class="letter">([A-D])<\/span> /g)].map((m) => m[1]);
    results["checkin/quiz:current"] = { question: "Pick one", choices: ["useMemo", "useEffect", "useRef"], open: true, answered: 2 };
    expect(tiles(renderToStaticMarkup(createElement(Stage)))).toEqual(["A", "B", "C"]);
    results["checkin/quiz:current"] = {
      question: "Pick one",
      choices: ["useMemo", "useEffect", "useRef", "useId"],
      open: false,
      answered: 3,
      results: { counts: [1, 2, 0, 0], correct: 1 },
    };
    const html = renderToStaticMarkup(createElement(Stage));
    expect(tiles(html)).toEqual(["A", "B", "C", "D"]);
    // The words read the same with the tags taken out.
    expect(words(html)).toContain("A useMemo");
  });

  it("F38.1 a deck address typed without https:// loads with https:// added (rt-17)", () => {
    expect(frame(open("#/checkin/stage?deck=slides.example.com/deck"))?.href).toBe("https://slides.example.com/deck");
    expect(frame(open("#/checkin/stage?deck=" + encodeURIComponent(DECK)))?.href).toBe(DECK);
    expect(frame(open("#/checkin/stage?deck=http://localhost:8000/deck.html"))?.href).toBe("http://localhost:8000/deck.html");
  });

  it("F38.1 a deck link that can't load says 'That deck link didn't work.' instead of a blank page (rt-17, checkin-frontend-20)", () => {
    for (const bad of [":::", "decks/week9/", "./decks/week9/", "../rcc-gdg/decks/week9/", "javascript:alert(1)", "ftp://files.example.com/deck"]) {
      const html = open("#/checkin/stage?deck=" + encodeURIComponent(bad));
      expect(frame(html), bad).toBeNull();
      expect(words(html), bad).toContain("That deck link didn't work.");
      expect(words(html), bad).toContain("Put your deck's address after ?deck= in this page's link.");
      expect(html, bad).toContain('<aside class="stage__card"');
    }
  });

  it("F38.1 with no ?deck= the stage says to add one and opens no deck, the 10-29 one included (rt-21)", () => {
    for (const hash of ["#/checkin/stage", "#/checkin/stage?deck=", "#/checkin/stage?bridge=gdg.k1"]) {
      const html = open(hash);
      expect(frame(html), hash).toBeNull();
      expect(html, hash).not.toContain("build-with-ai");
      expect(words(html), hash).toContain("Add ?deck=<your deck's address> to this page's link.");
      expect(html, hash).toContain('<aside class="stage__card"');
    }
  });

  it("F38.1 ?bridge= and ?bridge-site= both go to the deck, so a deck sending to the dev backend feeds dev phones", () => {
    const src = frame(open(`#/checkin/stage?bridge=gdg.k1&bridge-site=quaint-swan-637&deck=${DECK}`));
    expect(src?.origin + (src?.pathname ?? "")).toBe("https://deck.example.com/d/");
    expect(src?.searchParams.get("bridge")).toBe("gdg.k1");
    expect(src?.searchParams.get("bridge-site")).toBe("quaint-swan-637");
  });

  it("F38.1 the stage reads ?deck=, ?bridge= and ?bridge-site= from useHashParams (router.hashchange.test.ts tests the re-read on hashchange)", () => {
    given.params = new URLSearchParams("deck=https://two.example.com/&bridge=gdg.k2&bridge-site=quaint-swan-637");
    const src = frame(open("#/checkin/stage?deck=https://one.example.com/"));
    expect(src?.host).toBe("two.example.com");
    expect(src?.searchParams.get("bridge")).toBe("gdg.k2");
    expect(src?.searchParams.get("bridge-site")).toBe("quaint-swan-637");
  });

  it("F38.2 an ended quiz marks the right choice '✓ right answer' next to its bar, even when nobody picked it", () => {
    const ended = (counts: number[], correct: number | null) => ({
      question: "Which page shows the board?",
      choices: ["#/live", "#/host"],
      open: false,
      answered: counts.reduce((a, b) => a + b, 0),
      results: { counts, correct },
    });
    const bars = (): [string, string] => {
      const found = renderToStaticMarkup(createElement(Stage)).match(/<li class="stage__bar[^"]*">[\s\S]*?<\/li>/g) ?? [];
      expect(found).toHaveLength(2);
      return [found[0] ?? "", found[1] ?? ""];
    };

    results["checkin/quiz:current"] = ended([3, 0], 1);
    let [a, b] = bars();
    expect(words(b)).toContain("✓ right answer");
    expect(b).toContain('style="width:0%"');
    expect(words(a)).not.toContain("right answer");

    results["checkin/quiz:current"] = ended([0, 0], 0);
    [a, b] = bars();
    expect(words(a)).toContain("✓ right answer");
    expect(words(b)).not.toContain("right answer");

    results["checkin/quiz:current"] = ended([2, 1], null);
    expect(bars().map(words).join(" ")).not.toContain("right answer");
  });

  it("F38.2 'No quiz or vote yet.' when the channel has no quiz or vote yet", () => {
    results["checkin/quiz:current"] = null;
    expect(words(renderToStaticMarkup(createElement(Stage)))).toContain("No quiz or vote yet.");
    results["checkin/quiz:current"] = undefined;
    expect(words(renderToStaticMarkup(createElement(Stage)))).not.toContain("No quiz or vote yet.");
    results["checkin/quiz:current"] = OPEN;
    expect(words(renderToStaticMarkup(createElement(Stage)))).not.toContain("No quiz or vote yet.");
  });

  it("F38.3 the deck can't go full screen inside the page, so its F key can't cover the card", () => {
    const html = open(`#/checkin/stage?deck=${DECK}`);
    expect(html).toMatch(/<iframe[^>]* allow="fullscreen &#x27;none&#x27;"/);
    expect(html).not.toMatch(/allowfullscreen/i);
  });

  it("F38.5 the late banner shows on the stage, outside the check-in card (checkin-backend-5, rt-6)", () => {
    const html = open(`#/checkin/stage?deck=${DECK}`);
    expect(html).toContain('<div class="stage__late" data-theme="light"><div data-boundary="The late banner">[late banner]</div></div>');
    expect(html.indexOf("[late banner]")).toBeLessThan(html.indexOf('<aside class="stage__card"'));
  });

  it("F38 the count, the quiz and the late banner each sit in an ErrorBoundary, so a failing query never blanks the deck or the QR", () => {
    const html = open(`#/checkin/stage?deck=${DECK}`);
    expect(html).toMatch(/^<div class="stage"><iframe /);
    expect(html).toMatch(/<\/button><figure class="qr"[^>]*>[\s\S]*?<\/figure><div data-boundary="The check-in count"><p class="stage__count">/);
    expect(html).toContain('</p></div><p class="stage__hint">Scan to check in</p><div data-boundary="The quiz"><div class="stage__poll">');
    expect(html).toContain('<div data-boundary="The late banner">[late banner]</div>');
  });

  // sweep2-checkin-6 / sweep2-tests-3 / sweep2-ledger-8: the real QR draws only SVG paths, so the
  // stand-in above prints the address it's given.
  it("F38.2 the card's QR goes to the student pass page, #/checkin/student on this site", () => {
    const html = open(`#/checkin/stage?deck=${DECK}`, "https:");
    expect(decode(html.match(/<figure class="qr" data-value="([^"]*)"/)![1])).toBe("https://x/#/checkin/student");
  });

  it("F38.2 F38.4 the card shows the live count and, while a quiz is open, how many answered", () => {
    const html = open(`#/checkin/stage?deck=${DECK}`);
    expect(html).toContain('<p class="stage__count"><b>12</b> checked in</p>');
    expect(html).toContain('<p class="stage__answered"><b>1</b> answered</p>');
    results["checkin/read:count"] = 30;
    results["checkin/quiz:current"] = { ...OPEN, answered: 17 };
    const later = open(`#/checkin/stage?deck=${DECK}`);
    expect(later).toContain('<p class="stage__count"><b>30</b> checked in</p>');
    expect(later).toContain('<p class="stage__answered"><b>17</b> answered</p>');
  });

  it("F38.6 a reload in the same tab still hands the saved bridge key to the deck (?bridge=saved)", () => {
    vi.stubGlobal("sessionStorage", stubStorage());
    stubHistory();
    at(`#/checkin/stage?bridge=gdg.k1&bridge-site=quaint-swan-637&deck=${DECK}`, "/rcc-live-lecture/");
    expect(takeBridge()).toBe("gdg.k1");

    const src = frame(open(`#/checkin/stage?bridge=saved&bridge-site=quaint-swan-637&deck=${DECK}`));
    expect(src?.searchParams.get("bridge")).toBe("gdg.k1");
    expect(src?.searchParams.get("bridge-site")).toBe("quaint-swan-637");
  });

  it("sweep1-checkin-4 the saved key goes only to a deck on the origin it came with; any other deck gets none and the stage says the phones aren't getting the slides", () => {
    const LINE = "Phones aren't getting these slides. Open this page from the full link again.";
    vi.stubGlobal("sessionStorage", stubStorage());
    stubHistory();
    at(`#/checkin/stage?bridge=gdg.k1&deck=${DECK}`);
    expect(takeBridge()).toBe("gdg.k1");

    // Same origin, another deck on it: the key goes.
    let html = open("#/checkin/stage?bridge=saved&deck=https://deck.example.com/week10/");
    expect(frame(html)?.searchParams.get("bridge")).toBe("gdg.k1");
    expect(words(html)).not.toContain(LINE);

    // Another host, the same host over http, or another port: no key.
    for (const other of ["https://other.example.net/d/", "http://deck.example.com/d/", "https://deck.example.com:8443/d/", "https://evil.deck.example.com/d/"]) {
      html = open(`#/checkin/stage?bridge=saved&deck=${other}`);
      expect(frame(html)?.searchParams.has("bridge"), other).toBe(false);
      expect(words(html), other).toContain(LINE);
    }
  });

  // sweep1-checkin-fixcheck-8 (replaces the sweep1-checkin-4 no-deck test and the fixcheck-3 test,
  // which left the key in the address bar on the projector): a key in a link with no deck, or a
  // deck that doesn't load, leaves the address bar at once and waits in this tab for a deck. The
  // first ?deck= that loads gets it (fixcheck-3: adding ?deck= as the stage says still works), and
  // from then on only a deck on that origin does (sweep1-checkin-4).
  it("sweep1-checkin-fixcheck-8 a key in a link with no deck leaves the address bar at once; the first deck that loads in this tab gets it, then only decks on that origin", () => {
    const LINE = "Phones aren't getting these slides. Open this page from the full link again.";
    const store = stubStorage();
    vi.stubGlobal("sessionStorage", store);
    const replace = stubHistory();
    for (const hash of ["#/checkin/stage?bridge=gdg.k1", "#/checkin/stage?bridge=gdg.k1&deck=decks/week9/"]) {
      at(hash);
      expect(takeBridge(), hash).toBe("gdg.k1");
      expect(location.hash, hash).not.toContain("gdg.k1");
      expect(location.hash, hash).toContain("bridge=saved");
    }
    expect(replace).toHaveBeenCalledTimes(2);
    expect(store.values()).toEqual([JSON.stringify({ key: "gdg.k1", origin: null })]);

    // The stage says to add a deck, with no "phones aren't getting" line: the key is waiting.
    let html = open("#/checkin/stage?bridge=saved");
    expect(words(html)).toContain("Add ?deck=<your deck's address> to this page's link.");
    expect(words(html)).not.toContain(LINE);
    html = open("#/checkin/stage?bridge=saved&deck=decks/week9/");
    expect(words(html)).toContain("That deck link didn't work.");
    expect(words(html)).not.toContain(LINE);
    expect(html).not.toContain("gdg.k1");

    // The professor adds the deck: its first draw already hands the key to the deck, and the
    // hash change saves the key with that deck's origin.
    html = open(`#/checkin/stage?bridge=saved&deck=${DECK}`);
    expect(frame(html)?.searchParams.get("bridge")).toBe("gdg.k1");
    expect(words(html)).not.toContain(LINE);
    at(`#/checkin/stage?bridge=saved&deck=${DECK}`);
    expect(takeBridge()).toBe("gdg.k1");
    expect(store.values()).toEqual([JSON.stringify({ key: "gdg.k1", origin: "https://deck.example.com" })]);

    // After that, a deck on another origin gets none.
    at("#/checkin/stage?bridge=saved&deck=https://other.example.net/d/");
    expect(takeBridge()).toBeNull();
    expect(store.values()).toEqual([JSON.stringify({ key: "gdg.k1", origin: "https://deck.example.com" })]);
    html = open("#/checkin/stage?bridge=saved&deck=https://other.example.net/d/");
    expect(frame(html)?.searchParams.has("bridge")).toBe(false);
    expect(words(html)).toContain(LINE);
    expect(frame(open(`#/checkin/stage?bridge=saved&deck=${DECK}`))?.searchParams.get("bridge")).toBe("gdg.k1");
  });

  it("F38.6 a new tab with ?bridge=saved has no key, so it hands the deck none (never the word 'saved')", () => {
    vi.stubGlobal("sessionStorage", stubStorage());
    const src = frame(open(`#/checkin/stage?bridge=saved&deck=${DECK}`));
    expect(src?.searchParams.has("bridge")).toBe(false);
  });

  it("F38.6 a ?bridge=saved link in a tab with no saved key says the phones aren't getting the slides (STAGE-risk-1, STAGE-spec-3)", () => {
    const LINE = "Phones aren't getting these slides. Open this page from the full link again.";
    vi.stubGlobal("sessionStorage", stubStorage());
    for (const hash of [`#/checkin/stage?bridge=saved&deck=${DECK}`, "#/checkin/stage?bridge=saved"]) {
      const html = open(hash);
      expect(words(html), hash).toContain(LINE);
      expect(html, hash).toMatch(/<p class="stage__warn" data-theme="light" role="alert">/);
    }
    // No line with a key in the link, with no ?bridge= at all, or once this tab has the key saved.
    expect(words(open(`#/checkin/stage?bridge=gdg.k1&deck=${DECK}`))).not.toContain(LINE);
    expect(words(open(`#/checkin/stage?deck=${DECK}`))).not.toContain(LINE);
    stubHistory();
    at(`#/checkin/stage?bridge=gdg.k1&deck=${DECK}`);
    expect(takeBridge()).toBe("gdg.k1");
    expect(words(open(`#/checkin/stage?bridge=saved&deck=${DECK}`))).not.toContain(LINE);
  });

  it("F38.6 a key added after ?bridge=saved or an empty ?bridge= goes to the deck (STAGE-risk-2)", () => {
    vi.stubGlobal("sessionStorage", stubStorage());
    for (const first of ["saved", ""]) {
      const src = frame(open(`#/checkin/stage?bridge=${first}&deck=${DECK}&bridge=gdg.k2`));
      expect(src?.searchParams.getAll("bridge"), first).toEqual(["gdg.k2"]);
    }
  });

  it("F38.1 on the https site an http deck loads over https, so the browser doesn't block it as mixed content (STAGE-spec-2)", () => {
    expect(frame(open("#/checkin/stage?deck=http://slides.example.com/deck", "https:"))?.href).toBe("https://slides.example.com/deck");
    expect(frame(open("#/checkin/stage?deck=http://localhost:8000/deck.html", "https:"))?.href).toBe("http://localhost:8000/deck.html");
    expect(frame(open("#/checkin/stage?deck=http://slides.example.com/deck", "http:"))?.href).toBe("http://slides.example.com/deck");
  });
});

describe("the stage's link (stageLink.ts)", () => {
  it("F38.6 the bridge key leaves the address bar for this tab's sessionStorage (core-backend-7)", () => {
    const store = stubStorage();
    vi.stubGlobal("sessionStorage", store);
    const replace = stubHistory();
    at(`#/checkin/stage?bridge=gdg.k1&bridge-site=quaint-swan-637&deck=${DECK}`, "/rcc-live-lecture/");

    expect(takeBridge()).toBe("gdg.k1");
    expect(store.values()).toEqual([JSON.stringify({ key: "gdg.k1", origin: "https://deck.example.com" })]);
    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith(
      { from: "app" },
      "",
      `/rcc-live-lecture/#/checkin/stage?bridge=saved&bridge-site=quaint-swan-637&deck=${DECK}`,
    );
    expect(location.hash).not.toContain("gdg.k1");

    // The address bar now says ?bridge=saved: nothing more to take.
    expect(takeBridge()).toBeNull();
    expect(replace).toHaveBeenCalledTimes(1);

    // The full link pasted in again: the key leaves again, and the other parameters stay as typed.
    at(`#/checkin/stage?deck=${DECK}&bridge=gdg.k2`, "/rcc-live-lecture/");
    expect(takeBridge()).toBe("gdg.k2");
    expect(replace).toHaveBeenLastCalledWith({ from: "app" }, "", `/rcc-live-lecture/#/checkin/stage?deck=${DECK}&bridge=saved`);
    expect(store.values()).toEqual([JSON.stringify({ key: "gdg.k2", origin: "https://deck.example.com" })]);
  });

  it("F38.6 a key added after ?bridge=saved or an empty ?bridge= leaves the address bar too (STAGE-risk-2)", () => {
    const store = stubStorage();
    vi.stubGlobal("sessionStorage", store);
    const replace = stubHistory();
    for (const first of ["saved", ""]) {
      at(`#/checkin/stage?bridge=${first}&deck=${DECK}&bridge=gdg.k2`, "/rcc-live-lecture/");
      expect(takeBridge(), first).toBe("gdg.k2");
      expect(replace, first).toHaveBeenLastCalledWith({ from: "app" }, "", `/rcc-live-lecture/#/checkin/stage?bridge=saved&deck=${DECK}`);
      expect(location.hash, first).not.toContain("gdg.k2");
    }
    expect(store.values()).toEqual([JSON.stringify({ key: "gdg.k2", origin: "https://deck.example.com" })]);
  });

  it("F38.6 when the browser won't store the key, the key stays in the address bar, so a reload still feeds the phones", () => {
    vi.stubGlobal("sessionStorage", stubStorage(true));
    const replace = stubHistory();
    at(`#/checkin/stage?bridge=gdg.k1&deck=${DECK}`);
    expect(takeBridge()).toBe("gdg.k1");
    expect(replace).not.toHaveBeenCalled();
    expect(location.hash).toContain("bridge=gdg.k1");
  });

  it("F38.6 a link with no key, or another page's link, changes nothing", () => {
    const store = stubStorage();
    vi.stubGlobal("sessionStorage", store);
    const replace = stubHistory();
    for (const hash of ["#/checkin/stage", `#/checkin/stage?deck=${DECK}`, "#/checkin/stage?bridge=saved", "#/checkin/stage?bridge=", "#/live?bridge=gdg.k1", "#/checkin/student?bridge=gdg.k1"]) {
      at(hash);
      expect(takeBridge(), hash).toBeNull();
    }
    expect(replace).not.toHaveBeenCalled();
    expect(store.values()).toEqual([]);
  });

  it("F38.1 ?deck= loads only an http or https address with a real host, adding https:// when it's missing (rt-17, checkin-frontend-20)", () => {
    expect(deckAddress("slides.example.com/deck")?.href).toBe("https://slides.example.com/deck");
    expect(deckAddress("  sam-t-g.github.io/rcc-gdg/decks/first-meeting/ ")?.href).toBe("https://sam-t-g.github.io/rcc-gdg/decks/first-meeting/");
    expect(deckAddress("//slides.example.com/deck")?.href).toBe("https://slides.example.com/deck");
    expect(deckAddress("HTTPS://Slides.Example.com/Deck")?.href).toBe("https://slides.example.com/Deck");
    expect(deckAddress("http://localhost:8000/deck.html")?.href).toBe("http://localhost:8000/deck.html");
    expect(deckAddress("http://127.0.0.1:8000/")?.href).toBe("http://127.0.0.1:8000/");
    expect(deckAddress("https://slides.example.com./deck")?.href).toBe("https://slides.example.com./deck");
    expect(deckAddress("slides.example.com.")?.href).toBe("https://slides.example.com./");
    for (const bad of ["", " ", ":::", "decks/week9/", "./decks/week9/", "../x/", "..", "a..b/deck", ".example.com/deck", "javascript:alert(1)", "javascript://%0aalert(1)", "data:text/html,hi", "ftp://files.example.com/deck", "slides example.com", "slides.example.com..", "example."]) {
      expect(deckAddress(bad), bad).toBeNull();
    }
  });

  it("F38.1 on an https page an http deck becomes https, except localhost, *.localhost, 127.x.x.x and [::1] (STAGE-spec-2, STAGE-fixcheck-2)", () => {
    expect(deckAddress("http://slides.example.com/deck", true)?.href).toBe("https://slides.example.com/deck");
    expect(deckAddress("http://slides.example.com/deck", false)?.href).toBe("http://slides.example.com/deck");
    expect(deckAddress("http://slides.example.com/deck")?.href).toBe("http://slides.example.com/deck");
    for (const local of ["http://localhost:8000/deck.html", "http://127.0.0.1:8000/", "http://[::1]:8000/", "http://deck.localhost:5173/", "http://127.0.0.2:8000/"]) {
      expect(deckAddress(local, true)?.href, local).toBe(local);
    }
    expect(deckAddress("http://127.example.com/deck", true)?.href).toBe("https://127.example.com/deck");
    expect(deckAddress("http://localhost.example.com/deck", true)?.href).toBe("https://localhost.example.com/deck");
  });
});

// TK-COPY (Sam's call T14): each presenter note on the stage starts with "For the presenter:" on
// its own line after the warning glyph, as comps projector-stage-setup and
// projector-stage-setup--no-deck draw it, so the room can tell which lines are for whoever runs
// the screen. The note's own words stay as they were.
describe("TK-COPY the stage's presenter notes start with 'For the presenter:'", () => {
  const WHO = '<span class="pnote__who">For the presenter:</span> ';
  // The warning glyph, then the note's words, which open with the label.
  const OPENS = /<svg class="icon"[^>]*>(?:(?!<\/svg>).)*<\/svg><span><span class="pnote__who">For the presenter:<\/span> /g;

  it("TK-COPY no ?deck=, a deck link that can't load, and a ?bridge=saved link with no saved key each open their note with the label", () => {
    vi.stubGlobal("sessionStorage", stubStorage());
    const cases: [hash: string, line: string, notes: number][] = [
      ["#/checkin/stage", "For the presenter: Add ?deck=<your deck's address> to this page's link.", 1],
      ["#/checkin/stage?deck=decks/week9/", "For the presenter: That deck link didn't work. Put your deck's address after ?deck= in this page's link.", 1],
      [`#/checkin/stage?bridge=saved&deck=${DECK}`, "For the presenter: Phones aren't getting these slides. Open this page from the full link again.", 1],
      ["#/checkin/stage?bridge=saved", "For the presenter: Phones aren't getting these slides. Open this page from the full link again.", 2],
    ];
    for (const [hash, line, notes] of cases) {
      const html = open(hash);
      expect(words(html), hash).toContain(line);
      expect(html.split(WHO).length - 1, hash).toBe(notes);
      expect(html.match(OPENS)?.length, hash).toBe(notes);
    }
  });

  it("TK-COPY a stage whose deck loads shows no note and no label", () => {
    vi.stubGlobal("sessionStorage", stubStorage());
    expect(open(`#/checkin/stage?deck=${DECK}`)).not.toContain("For the presenter:");
    expect(open(`#/checkin/stage?bridge=gdg.k1&deck=${DECK}`)).not.toContain("For the presenter:");
  });
});
