// @vitest-environment node
// #/host (Page.tsx), rendered with every Convex query still loading and the professor key gate
// open. Each card file (AskRoom, Missing, Boards, QA) is swapped for a stand-in that prints its
// name, and ErrorBoundary for a <section> that carries its label, so the test checks only what
// Page.tsx decides: the header link, the tab buttons, and which panel each tab shows inside which
// boundary. The cards' own headings belong to the files that own those cards.
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import HostPage, { Dashboard, type Tab } from "./Page";

vi.mock("convex/react", () => ({ useQuery: () => undefined }));
vi.mock("../checkin/prof", () => ({ ProfGate: ({ children }: { children: ReactNode }) => children, useProfKey: () => undefined }));
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

const open = (first: Tab) => renderToStaticMarkup(createElement(Dashboard, { first }));

// The markup inside the stand-in boundary labelled `label`, or null when the page has none.
function boundary(html: string, label: string) {
  const start = `<section data-boundary="${label}">`;
  const at = html.indexOf(start);
  if (at < 0) return null;
  return html.slice(at + start.length, html.indexOf("</section>", at));
}

const BOUNDARIES = ["The Now tab", "The Points tab", "The Questions tab"];
const shown = (html: string) => BOUNDARIES.filter((b) => boundary(html, b) !== null);

describe("#/host", () => {
  it("the header has an 'Attendance' link that opens #/checkin/teacher", () => {
    expect(renderToStaticMarkup(createElement(HostPage))).toContain('<a href="#/checkin/teacher">Attendance</a>');
  });

  it("the page opens on Now, with Now, Points and Questions tab buttons", () => {
    const page = renderToStaticMarkup(createElement(HostPage));
    expect(page).toContain('<button role="tab" aria-selected="true">Now</button>');
    expect(page).toContain('<button role="tab" aria-selected="false">Points</button>');
    expect(page).toContain('<button role="tab" aria-selected="false">Questions</button>');
    expect(shown(page)).toEqual(["The Now tab"]);
  });

  it("Now shows Ask the room and Who is missing it, inside the Now tab's boundary", () => {
    const page = open("Now");
    expect(shown(page)).toEqual(["The Now tab"]);
    const now = boundary(page, "The Now tab")!;
    expect(now).toContain("[ask the room]");
    expect(now).toContain("[who is missing it]");
    expect(now).not.toContain("[points tab]");
    expect(now).not.toContain("[questions tab]");
  });

  it("Points shows the points tab, and only it, inside the Points tab's boundary", () => {
    const page = open("Points");
    expect(page).toContain('<button role="tab" aria-selected="true">Points</button>');
    expect(shown(page)).toEqual(["The Points tab"]);
    expect(boundary(page, "The Points tab")).toBe('<div class="host-fade">[points tab]</div>');
  });

  it("Questions shows the questions tab, and only it, inside the Questions tab's boundary", () => {
    const page = open("Questions");
    expect(page).toContain('<button role="tab" aria-selected="true">Questions</button>');
    expect(shown(page)).toEqual(["The Questions tab"]);
    expect(boundary(page, "The Questions tab")).toBe('<div class="host-fade">[questions tab]</div>');
  });
});
