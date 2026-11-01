// @vitest-environment node
// #/host (Page.tsx), rendered with made-up query results and the staff gate open. Each card file
// (AskRoom, Missing, Boards, QA) is swapped for a stand-in that prints its name, and ErrorBoundary
// for a <section> that carries its label, so the test checks only what Page.tsx decides: the
// header (its link and the "Lost by slide" line), the tab buttons, and which panel shows inside
// which boundary. The cards' own headings belong to the files that own those cards.
import { createElement, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { getFunctionName, type FunctionReference } from "convex/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AskRoom from "./AskRoom";
import { PointsTab } from "./Boards";
import { Missing } from "./Missing";
import HostPage, { Dashboard, tabKey, type Tab } from "./Page";
import QA from "./QA";

// sweep2-host-fixcheck-1: a stand-in for useState and useRef, on only while `hooks.on`, so a test
// can call Dashboard as a plain function, press a key on a tab button and call Dashboard again
// with the state the press left (the same idea as AskRoom.submit.test.ts). Off, both are React's.
const hooks = vi.hoisted(() => ({ on: false, slots: [] as unknown[], at: 0 }));
vi.mock("react", async (orig) => {
  const R = await orig<typeof import("react")>();
  // React's own hooks, under names the hooks lint rule doesn't read as a call inside a component.
  const reactState = R.useState as (init: unknown) => unknown;
  const reactRef = R.useRef as (init: unknown) => unknown;
  const slot = (make: () => unknown) => {
    const i = hooks.at++;
    if (!(i in hooks.slots)) hooks.slots[i] = make();
    return i;
  };
  return {
    ...R,
    useState: (init: unknown) => {
      if (!hooks.on) return reactState(init);
      const i = slot(() => (typeof init === "function" ? (init as () => unknown)() : init));
      const set = (next: unknown) => {
        hooks.slots[i] = typeof next === "function" ? (next as (v: unknown) => unknown)(hooks.slots[i]) : next;
      };
      return [hooks.slots[i], set];
    },
    useRef: (init: unknown) => {
      if (!hooks.on) return reactRef(init);
      return hooks.slots[slot(() => ({ current: init }))];
    },
  };
});

// A query's made-up result, or a function of its args that gives the result.
const results: Record<string, unknown> = {};
vi.mock("convex/react", () => ({
  useQuery: (ref: FunctionReference<"query">, args?: unknown) => {
    if (args === "skip") return undefined;
    const r = results[getFunctionName(ref)];
    return typeof r === "function" ? r(args) : r;
  },
}));
vi.mock("../checkin/prof", () => ({ StaffGate: ({ children }: { children: ReactNode }) => children }));
// SignedInAs reads the Google sign-in (AuthProvider); a stand-in prints its name, so the test
// checks only where Page.tsx puts it.
vi.mock("../../blocks/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../blocks/auth")>()),
  SignedInAs: () => "[signed in as]",
}));
vi.mock("./AskRoom", () => ({ default: () => "[ask the room]" }));
vi.mock("./Missing", () => ({ Missing: () => "[who is missing it]" }));
vi.mock("./Boards", () => ({ PointsTab: () => "[points tab]" }));
vi.mock("./QA", () => ({ default: () => "[questions tab]" }));
vi.mock("../../blocks/ui", async (importOriginal) => {
  const { createElement } = await import("react");
  return {
    ...(await importOriginal<typeof import("../../blocks/ui")>()),
    ErrorBoundary: ({ label, children }: { label?: string; children?: ReactNode }) =>
      createElement("section", { "data-boundary": label }, children),
  };
});

beforeEach(() => {
  hooks.on = false;
  for (const k of Object.keys(results)) delete results[k];
  vi.stubGlobal("location", { hash: "#/host" });
});

const page = () => renderToStaticMarkup(createElement(HostPage));
const open = (first: Tab) => renderToStaticMarkup(createElement(Dashboard, { first }));

// The markup inside the first stand-in boundary labelled `label`, or null when the page has none.
// Boundaries nest (the Now tab's holds one per card), so the end is the matching </section>.
function boundary(html: string, label: string) {
  const start = `<section data-boundary="${label}">`;
  const at = html.indexOf(start);
  if (at < 0) return null;
  const tags = /<section[ >]|<\/section>/g;
  tags.lastIndex = at + start.length;
  let depth = 1;
  for (let m = tags.exec(html); m; m = tags.exec(html)) {
    depth += m[0] === "</section>" ? -1 : 1;
    if (depth === 0) return html.slice(at + start.length, m.index);
  }
  return null;
}
// The page's text a sighted professor sees: every element with the sr-only class dropped with
// what's inside it, tags dropped, spaces squeezed. (aria-hidden parts stay: they're on screen.)
const VOID = new Set(["area", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);
function visibleText(html: string) {
  const out: string[] = [];
  const hidden: boolean[] = [];
  for (const m of html.matchAll(/<(\/?)([a-zA-Z0-9]+)([^>]*?)(\/?)>|([^<]+)/g)) {
    const [, close, tag, attrs, selfClose, text] = m;
    if (text !== undefined) {
      if (!hidden.includes(true)) out.push(text);
    } else if (close) hidden.pop();
    else if (!selfClose && !VOID.has(tag.toLowerCase())) hidden.push(/class="([^"]* )?sr-only( [^"]*)?"/.test(attrs));
  }
  return out.join(" ").replace(/\s+/g, " ").trim();
}

const TABS: Tab[] = ["Now", "Points", "Questions"];
// Each tab's panel: whether it's hidden and the boundary inside it.
function panels(html: string) {
  return TABS.map((tab) => {
    const m = new RegExp(`<div id="host-panel-${tab}" role="tabpanel" aria-labelledby="host-tab-${tab}"( hidden="")?><section data-boundary="The ${tab} tab">`).exec(html);
    return { tab, mounted: m !== null, hidden: m !== null && m[1] !== undefined };
  });
}
// Where `card` sits in what Dashboard renders when it opens on `first`, or null when it isn't
// there. Each function component on the way (Panel, Screen, Card, the stand-in boundaries) is
// called and its output walked too, so a key or wrapper that changes per tab inside one of them
// shows up, not only one in Dashboard's own elements. The walk runs inside a render (Probe), so a
// hook in one of those components runs where React allows it.
function placeIn(first: Tab, card: unknown): string[] | null {
  let place: string[] | null = null;
  function Probe() {
    const tree = Dashboard({ first });
    place = placeOf(tree, card);
    return tree;
  }
  renderToStaticMarkup(createElement(Probe));
  return place;
}
// Where `target` sits in `node`: the type, key and place among its siblings of every element from
// the top down to it, or null when it isn't there.
function placeOf(node: ReactNode, target: unknown, path: string[] = []): string[] | null {
  if (Array.isArray(node)) {
    for (const [i, child] of node.entries()) {
      const found = placeOf(child as ReactNode, target, [...path, `[${i}]`]);
      if (found) return found;
    }
    return null;
  }
  if (!isValidElement(node)) return null;
  const type = node.type as string | { name?: string };
  const here = [...path, `${typeof type === "string" ? type : (type.name ?? "?")}#${node.key ?? ""}`];
  if (node.type === target) return here;
  const props = node.props as { children?: ReactNode };
  // A function component: walk what it returns. A class component or a tag: walk its children.
  const component = node.type as ((p: unknown) => ReactNode) & { prototype?: { isReactComponent?: unknown } };
  if (typeof component === "function" && !component.prototype?.isReactComponent) return placeOf(component(props), target, here);
  return placeOf(props.children, target, here);
}
type TabButton = {
  id?: string;
  tabIndex?: number;
  "aria-selected"?: boolean;
  onKeyDown?: unknown;
  ref?: (el: { focus: () => void } | null) => void;
};
// The props of every role="tab" button in a tree of elements, in order (components aren't run).
function buttonsIn(node: ReactNode): TabButton[] {
  if (Array.isArray(node)) return node.flatMap((n) => buttonsIn(n as ReactNode));
  if (!isValidElement(node)) return [];
  const props = node.props as TabButton & { role?: string; children?: ReactNode };
  if (node.type === "button" && props.role === "tab") return [props];
  return buttonsIn(props.children);
}
// The "Lost by slide" line's text, tags dropped.
function lostLine(html: string) {
  const m = /<p class="host-lost">(.*?)<\/p>/.exec(html);
  return m ? m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : null;
}

describe("#/host", () => {
  it("the header has an 'Attendance' link that opens #/checkin/teacher", () => {
    expect(page()).toContain('<a href="#/checkin/teacher">Attendance</a>');
  });

  it("the page opens on Now, with Now, Points and Questions tab buttons", () => {
    const html = page();
    expect(html).toContain('<button type="button" id="host-tab-Now" class="tabs__tab" role="tab" aria-selected="true" aria-controls="host-panel-Now" tabindex="0">Now</button>');
    expect(html).toContain('<button type="button" id="host-tab-Points" class="tabs__tab" role="tab" aria-selected="false" aria-controls="host-panel-Points" tabindex="-1">Points</button>');
    expect(html).toContain('<button type="button" id="host-tab-Questions" class="tabs__tab" role="tab" aria-selected="false" aria-controls="host-panel-Questions" tabindex="-1">Questions</button>');
    expect(panels(html).filter((p) => !p.hidden).map((p) => p.tab)).toEqual(["Now"]);
  });

  it("host-frontend-20 all three tab panels stay mounted and only the open one shows, so a half-written question survives a tab switch", () => {
    for (const first of TABS) {
      const html = open(first);
      expect(panels(html), first).toEqual(TABS.map((tab) => ({ tab, mounted: true, hidden: tab !== first })));
      expect(html, first).toContain('id="host-tab-' + first + '" class="tabs__tab" role="tab" aria-selected="true"');
    }
  });

  it("LIVE-risk-4 switching tabs keeps each tab's cards where they are, so React keeps them mounted", () => {
    // React keeps a component and its state (a half-written question) across renders only when
    // every element above it keeps its type, key and place. What Dashboard renders for each open
    // tab, down through Panel (the component that hides each tab), has to put each card at the
    // same place.
    for (const card of [AskRoom, Missing, PointsTab, QA]) {
      const now = placeIn("Now", card);
      // The walk went inside Panel: the path has Panel and then the div Panel returns.
      expect(now, String(card)).toContain("Panel#");
      expect(now!.slice(now!.findIndex((p) => p === "Panel#") + 1)[0], String(card)).toBe("div#");
      for (const tab of TABS) expect(placeIn(tab, card), `${tab}`).toEqual(now);
    }
  });

  it("Now shows Ask the room and Who is missing it, inside the Now tab's boundary", () => {
    const now = boundary(open("Now"), "The Now tab")!;
    expect(now).toContain("[ask the room]");
    expect(now).toContain("[who is missing it]");
    expect(now).not.toContain("[points tab]");
    expect(now).not.toContain("[questions tab]");
  });

  it("Points shows the points tab inside the Points tab's boundary", () => {
    expect(boundary(open("Points"), "The Points tab")).toBe('<div class="host-fade">[points tab]</div>');
  });

  it("Questions shows the questions tab inside the Questions tab's boundary", () => {
    expect(boundary(open("Questions"), "The Questions tab")).toBe('<div class="host-fade">[questions tab]</div>');
  });

  it("F20.4 the header's 'Lost by slide' line lists each slide with any, in order ('Slide 3: 4')", () => {
    results["live/read:lostBySlide"] = [
      { index: 1, count: 1 },
      { index: 2, count: 4 },
      { index: 9, count: 2 },
    ];
    const html = open("Now");
    expect(lostLine(html)).toBe("Lost by slide Slide 2: 1 Slide 3: 4 Slide 10: 2");
    expect(boundary(html, "Lost by slide")).toContain('<p class="host-lost">');

    results["live/read:lostBySlide"] = [];
    expect(lostLine(open("Now"))).toBe("Lost by slide Nobody has tapped I’m lost yet.");
    delete results["live/read:lostBySlide"];
    expect(lostLine(open("Now"))).toBe("Lost by slide Loading...");
  });

  it("F20.3 the header shows how many are lost on the slide on screen", () => {
    results["deck:current"] = { index: 2, beat: 0, count: 12, title: "Slide 3", lines: [], at: 0 };
    // 4 lost on slide 3 (index 2), 9 on any other slide.
    results["live/read:lostCount"] = (a: { channel?: string; index?: number }) => (a.channel === "gdg" && a.index === 2 ? 4 : 9);
    results["checkin/read:count"] = 30;
    const html = open("Now");
    expect(html).toContain('<span class="big__value">4</span><span class="big__label">lost on this slide</span>');
    expect(html).toContain('<span class="big__value">30</span><span class="big__label">checked in</span>');
  });

  // DS-HOST-risk-2: F20.3 above reads the sr-only copy. These check the count a sighted professor
  // sees: on a deck the lane draws, the 4 sits over slide 3's own column; and the hand-drawn lane's
  // counts (a quiet 0 on a slide already shown, nothing on a slide not reached yet).
  it("DS-HOST-risk-2 on a deck of 14 slides or fewer the lane shows the slide's lost count on screen, over its own column", () => {
    results["deck:current"] = { index: 2, beat: 0, count: 12, title: "Slide 3", lines: [], at: 0 };
    results["live/read:lostCount"] = (a: { index?: number }) => (a.index === 2 ? 4 : 9);
    results["live/read:lostBySlide"] = [
      { index: 0, count: 9 },
      { index: 2, count: 4 },
    ];
    results["checkin/read:count"] = 30;
    const html = open("Now");
    expect(html).toContain('class="track__lane host-lane"');
    // One count per slide shown so far, in its slide's column (grid column = index + 2).
    const counts = [...html.matchAll(/<span class="(track__n[^"]*)" style="grid-row:1;grid-column:(\d+)" aria-hidden="true">(\d+)<\/span>/g)].map((m) => ({
      slide: Number(m[2]) - 1,
      n: Number(m[3]),
      zero: m[1].includes("track__n--zero"),
    }));
    expect(counts).toEqual([
      { slide: 1, n: 9, zero: false },
      { slide: 2, n: 0, zero: true },
      { slide: 3, n: 4, zero: false },
    ]);
    // Each count is on screen, not only in the sr-only words.
    const seen = visibleText(html);
    expect(seen).toMatch(/^Professor view Now Points Questions Attendance Slide 3 of 12 Slide 3 Lost by slide 9 0 4 1 2 3 4 5 6 7 8 9 10 11 12 30 checked in/);
    // The lane carries the count, so the big number stays for screen readers only.
    expect(seen).not.toContain("lost on this slide");
  });

  // DS-HOST-risk-1: the lane draws at most 14 slides. On a longer deck (the 10-29 deck has 22) the
  // band shows the slide's lost count as the big number, the way it did before the lane.
  it("DS-HOST-risk-1 on a deck of more than 14 slides the band shows 'N lost on this slide' on screen", () => {
    results["deck:current"] = { index: 5, beat: 0, count: 22, title: "Recursion", lines: [], at: 0 };
    results["live/read:lostCount"] = (a: { index?: number }) => (a.index === 5 ? 4 : 1);
    results["live/read:lostBySlide"] = [
      { index: 2, count: 1 },
      { index: 5, count: 4 },
    ];
    results["checkin/read:count"] = 30;
    let html = open("Now");
    expect(html).toContain('class="host-lane host-lane--words"');
    expect(visibleText(html)).toContain("Slide 6 of 22 Recursion 4 lost on this slide Lost by slide Slide 3: 1 Slide 6: 4 30 checked in");

    // No taps on this slide: the band still says so, with a 0.
    results["live/read:lostCount"] = 0;
    results["live/read:lostBySlide"] = [{ index: 2, count: 1 }];
    html = open("Now");
    expect(visibleText(html)).toContain("Slide 6 of 22 Recursion 0 lost on this slide Lost by slide Slide 3: 1 30 checked in");

    // Before the deck sends a slide there's no slide to count, so the big number stays off screen.
    results["deck:current"] = null;
    expect(visibleText(open("Now"))).not.toContain("lost on this slide");
  });

  // DS-HOST-design-3: one card failing leaves the other card and the desk's two columns in place.
  // Each card has its own boundary inside the desk, with the Now tab's boundary still around both.
  it("DS-HOST-design-3 Ask the room and Who got it wrong each sit in their own boundary inside the desk", () => {
    const now = boundary(open("Now"), "The Now tab");
    expect(now).toBe(
      '<div class="desk host-desk">' +
        '<section data-boundary="The Now tab">[ask the room]</section>' +
        '<section data-boundary="The Now tab">[who is missing it]</section>' +
        "</div>",
    );
  });

  it("DS-HOST-design-2 the app bar ends with who is signed in and Sign out, after Attendance", () => {
    const html = page();
    const bar = html.slice(html.indexOf('<header class="bar host-bar">'), html.indexOf("</header>"));
    expect(bar).toContain('<div class="whoami">[signed in as]</div>');
    expect(bar.indexOf("[signed in as]")).toBeGreaterThan(bar.indexOf("Attendance"));
    expect(html.match(/\[signed in as\]/g)).toHaveLength(1);
  });

  it("sweep2-host-4 the open page has an h1 'Professor view', its only h1", () => {
    const html = open("Now");
    expect(html.match(/<h1[ >]/g)).toHaveLength(1);
    expect(html).toContain("<h1>Professor view</h1>");
  });

  it("sweep2-tests-8 F25.1 the header says 'Slide N of M' (index + 1) and the slide's title", () => {
    results["deck:current"] = { index: 2, beat: 0, count: 10, title: "Recursion", lines: [], at: 0 };
    const html = open("Now");
    expect(html).toContain("Slide 3 of 10</p>");
    expect(html).toContain("<h2>Recursion</h2>");
    expect(html).not.toContain("Slide 2 of 10");
  });

  it("sweep2-tests-8 F25.6 the header says 'Loading...' while the deck loads and \"The deck hasn't sent a slide yet.\" before the first slide", () => {
    delete results["deck:current"];
    expect(open("Now")).toContain('<p class="status status--loading" role="status">Loading...</p>');
    results["deck:current"] = null;
    const html = open("Now");
    expect(html).toContain("The deck hasn&#x27;t sent a slide yet.");
    expect(html).not.toContain("Loading...</p>");
  });

  it("sweep2-host-2 the tabs are the kit's: one Tab stop (the open tab), arrow keys, Home and End", () => {
    for (const first of TABS) {
      const html = open(first);
      expect(html, first).toContain('<div class="tabs__list" role="tablist" aria-label="Professor view">');
      for (const t of TABS) {
        const button = new RegExp(`<button[^>]*id="host-tab-${t}"[^>]*>`).exec(html)?.[0] ?? "";
        expect(button, `${first}: ${t}`).toContain('class="tabs__tab"');
        expect(button, `${first}: ${t}`).toContain(`tabindex="${t === first ? 0 : -1}"`);
      }
    }
    // Which tab each key opens from each tab, the way the kit's Tabs do it.
    const from = (key: string) => TABS.map((_, i) => tabKey(key, i, TABS.length));
    expect(from("ArrowRight")).toEqual([1, 2, 0]);
    expect(from("ArrowLeft")).toEqual([2, 0, 1]);
    expect(from("Home")).toEqual([0, 0, 0]);
    expect(from("End")).toEqual([2, 2, 2]);
    expect(from("Enter")).toEqual([undefined, undefined, undefined]);
    // Every tab button handles keys.
    let tabs: { tabIndex?: number; onKeyDown?: unknown }[] = [];
    function Probe() {
      const tree = Dashboard({ first: "Points" });
      tabs = buttonsIn(tree);
      return tree;
    }
    renderToStaticMarkup(createElement(Probe));
    expect(tabs.map((b) => [b.tabIndex, typeof b.onKeyDown])).toEqual([
      [-1, "function"],
      [0, "function"],
      [-1, "function"],
    ]);
  });

  it("sweep2-host-2 pressing Right, Left, Home or End on a tab button opens that tab and moves focus to it", () => {
    // Dashboard runs as a plain function with the hook stand-in on, so the tab a key press sets is
    // there on the next call. Each button gets a stand-in element through its ref, which records
    // focus().
    hooks.on = true;
    hooks.slots = [];
    const focused: string[] = [];
    function render() {
      hooks.at = 0;
      const tabs = buttonsIn(Dashboard({ first: "Now" }));
      for (const b of tabs) b.ref?.({ focus: () => focused.push(b.id ?? "?") });
      return tabs;
    }
    const open = (tabs: TabButton[]) => tabs.filter((b) => b["aria-selected"]).map((b) => [b.id, b.tabIndex]);
    function press(key: string, at: number) {
      const prevented = vi.fn();
      focused.length = 0;
      (render()[at].onKeyDown as (e: unknown) => void)({ key, preventDefault: prevented });
      const tabs = render();
      return { open: open(tabs), focused: [...focused], prevented: prevented.mock.calls.length, tabIndex: tabs.map((b) => b.tabIndex) };
    }
    expect(open(render())).toEqual([["host-tab-Now", 0]]);

    // `focused` holds the press's focus() calls only: render() hands out refs and never focuses.
    expect(press("ArrowRight", 0)).toEqual({ open: [["host-tab-Points", 0]], focused: ["host-tab-Points"], prevented: 1, tabIndex: [-1, 0, -1] });
    expect(press("ArrowRight", 1)).toEqual({ open: [["host-tab-Questions", 0]], focused: ["host-tab-Questions"], prevented: 1, tabIndex: [-1, -1, 0] });
    expect(press("ArrowRight", 2)).toEqual({ open: [["host-tab-Now", 0]], focused: ["host-tab-Now"], prevented: 1, tabIndex: [0, -1, -1] });
    expect(press("ArrowLeft", 0)).toEqual({ open: [["host-tab-Questions", 0]], focused: ["host-tab-Questions"], prevented: 1, tabIndex: [-1, -1, 0] });
    expect(press("Home", 2)).toEqual({ open: [["host-tab-Now", 0]], focused: ["host-tab-Now"], prevented: 1, tabIndex: [0, -1, -1] });
    expect(press("End", 0)).toEqual({ open: [["host-tab-Questions", 0]], focused: ["host-tab-Questions"], prevented: 1, tabIndex: [-1, -1, 0] });
    // Any other key changes nothing and leaves the browser's own handling alone.
    expect(press("Enter", 2)).toEqual({ open: [["host-tab-Questions", 0]], focused: [], prevented: 0, tabIndex: [-1, -1, 0] });
  });

  it("#/host/<other> shows 'No page at #/host/<other>'", () => {
    vi.stubGlobal("location", { hash: "#/host/nope" });
    const html = page();
    expect(html).toContain("<h1>No page at #/host/nope</h1>");
    expect(html).toContain('<a href="#/">Go home</a>');
    expect(html).not.toContain("tablist");
  });
});
