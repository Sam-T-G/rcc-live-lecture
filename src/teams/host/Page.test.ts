// @vitest-environment node
// #/host (Page.tsx), rendered with made-up query results and the staff gate open. Each card file
// (AskRoom, Missing, Boards, QA) is swapped for a stand-in that prints its name, and ErrorBoundary
// for a <section> that carries its label, so the test checks only what Page.tsx decides: the
// header (its link and the "Lost by slide" line), the tab buttons, and which panel shows inside
// which boundary. The cards' own headings belong to the files that own those cards.
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { getFunctionName, type FunctionReference } from "convex/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import HostPage, { Dashboard, type Tab } from "./Page";

const results: Record<string, unknown> = {};
vi.mock("convex/react", () => ({
  useQuery: (ref: FunctionReference<"query">, args?: unknown) => (args === "skip" ? undefined : results[getFunctionName(ref)]),
}));
vi.mock("../checkin/prof", () => ({ StaffGate: ({ children }: { children: ReactNode }) => children }));
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
  for (const k of Object.keys(results)) delete results[k];
  vi.stubGlobal("location", { hash: "#/host" });
});

const page = () => renderToStaticMarkup(createElement(HostPage));
const open = (first: Tab) => renderToStaticMarkup(createElement(Dashboard, { first }));

// The markup inside the stand-in boundary labelled `label`, or null when the page has none.
function boundary(html: string, label: string) {
  const start = `<section data-boundary="${label}">`;
  const at = html.indexOf(start);
  if (at < 0) return null;
  return html.slice(at + start.length, html.indexOf("</section>", at));
}

const TABS: Tab[] = ["Now", "Points", "Questions"];
// Each tab's panel: whether it's hidden and the boundary inside it.
function panels(html: string) {
  return TABS.map((tab) => {
    const m = new RegExp(`<div id="host-panel-${tab}" role="tabpanel" aria-labelledby="host-tab-${tab}"( hidden="")?><section data-boundary="The ${tab} tab">`).exec(html);
    return { tab, mounted: m !== null, hidden: m !== null && m[1] !== undefined };
  });
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
    expect(html).toContain('<button id="host-tab-Now" role="tab" aria-selected="true" aria-controls="host-panel-Now">Now</button>');
    expect(html).toContain('<button id="host-tab-Points" role="tab" aria-selected="false" aria-controls="host-panel-Points">Points</button>');
    expect(html).toContain('<button id="host-tab-Questions" role="tab" aria-selected="false" aria-controls="host-panel-Questions">Questions</button>');
    expect(panels(html).filter((p) => !p.hidden).map((p) => p.tab)).toEqual(["Now"]);
  });

  it("host-frontend-20 all three tab panels stay mounted and only the open one shows, so a half-written question survives a tab switch", () => {
    for (const first of TABS) {
      const html = open(first);
      expect(panels(html), first).toEqual(TABS.map((tab) => ({ tab, mounted: true, hidden: tab !== first })));
      expect(html, first).toContain('<button id="host-tab-' + first + '" role="tab" aria-selected="true"');
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
    results["live/read:lostCount"] = 4;
    results["checkin/read:count"] = 30;
    const html = open("Now");
    expect(html).toContain('<span class="big__value">4</span><span class="big__label">lost on this slide</span>');
    expect(html).toContain('<span class="big__value">30</span><span class="big__label">checked in</span>');
  });

  it("#/host/<other> shows 'No page at #/host/<other>'", () => {
    vi.stubGlobal("location", { hash: "#/host/nope" });
    const html = page();
    expect(html).toContain("<h1>No page at #/host/nope</h1>");
    expect(html).toContain('<a href="#/">Go home</a>');
    expect(html).not.toContain("tablist");
  });
});
