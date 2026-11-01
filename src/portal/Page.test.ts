// @vitest-environment node
// #/portal (PORTAL), rendered to HTML with made-up query results (no backend). LateBanner is
// swapped for a stand-in that prints its name, so these tests check only where the page mounts
// it; its feed and its lines are Check-in's (LateBanner.tsx). Paging (swipe, the arrow keys,
// ← Back and Next →) and the "The professor is on slide N now." notice need a browser, and so
// does the ErrorBoundary around the banner (React's server render doesn't run boundaries): the
// PORTAL browser checks cover them (F35).
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { getFunctionName, type FunctionReference } from "convex/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parse } from "../styles/cssRules";
import PortalPage from "./Page";

const css = parse(readFileSync(new URL("./portal.css", import.meta.url), "utf8"));
const tsx = readFileSync(new URL("./Page.tsx", import.meta.url), "utf8");

const results: Record<string, unknown> = {};
const asked: { name: string; args: unknown }[] = [];
vi.mock("convex/react", () => ({
  useQuery: (ref: FunctionReference<"query">, args: unknown) => {
    asked.push({ name: getFunctionName(ref), args });
    return results[getFunctionName(ref)];
  },
}));
vi.mock("../teams/checkin/LateBanner", () => ({ default: () => "[late banner]" }));

const slide = (index: number) => ({ index, beat: 0, title: `Slide title ${index + 1}`, lines: [`Line on ${index + 1}`], at: index });

// What the server sends in each state of the page.
const LOADING = {};
const WAITING = { "deck:current": null, "deck:slides": [] };
const ON_SLIDE_3 = { "deck:current": { ...slide(2), count: 10 }, "deck:slides": [slide(0), slide(1), slide(2)] };

function open(hash: string, server: Record<string, unknown>) {
  for (const k of Object.keys(results)) delete results[k];
  Object.assign(results, server);
  vi.stubGlobal("location", { hash });
  return renderToStaticMarkup(createElement(PortalPage));
}

const CHECK_IN = '<a href="#/checkin/student" class="btn btn--secondary">Check in</a>';
const QUIZ = '<a href="#/live" class="btn btn--secondary">Quiz and questions</a>';

beforeEach(() => {
  asked.length = 0;
});

describe("#/portal", () => {
  it("checkin-frontend-5: #/portal mounts <LateBanner /> while the slides load, before they start and on a slide; #/portal?channel=room2 follows room2's deck without it (the banner lists gdg's check-ins)", () => {
    for (const server of [LOADING, WAITING, ON_SLIDE_3]) {
      expect(open("#/portal", server)).toContain("[late banner]");
    }

    asked.length = 0;
    const other = open("#/portal?channel=room2", ON_SLIDE_3);
    expect(asked).toContainEqual({ name: "deck:current", args: { channel: "room2" } });
    expect(asked).toContainEqual({ name: "deck:slides", args: { channel: "room2" } });
    expect(other).not.toContain("[late banner]");
    expect(open("#/portal?channel=gdg", ON_SLIDE_3)).toContain("[late banner]");
  });

  it("live-frontend-15: the two links under the slide open #/checkin/student ('Check in') and #/live ('Quiz and questions'), and the waiting and loading screens have them too", () => {
    const html = open("#/portal", ON_SLIDE_3);
    const under = html.slice(html.indexOf("</article>"));
    expect(html).toContain("</article>");
    expect(under).toContain(CHECK_IN);
    expect(under).toContain(QUIZ);
    for (const server of [LOADING, WAITING]) {
      const page = open("#/portal", server);
      expect(page).toContain(CHECK_IN);
      expect(page).toContain(QUIZ);
    }
  });

  it("#/portal/<other> shows 'No page at #/portal/<other>' with a link home and reads no slides", () => {
    const html = open("#/portal/nope?channel=room2", ON_SLIDE_3);
    expect(html).toContain("<h1>No page at #/portal/nope</h1>");
    expect(html).toContain('<a href="#/">Go home</a>');
    expect(html).not.toContain("Slide title");
    expect(asked).toEqual([]);
    expect(open("#/portal/a/b", ON_SLIDE_3)).toContain("<h1>No page at #/portal/a/b</h1>");
  });

  it("uses the words #/live and iOS copy: 'Loading the slides…', 'Waiting for the slides to start.', '← Back', 'Next →'", () => {
    expect(open("#/portal", LOADING)).toContain(">Loading the slides…</p>");
    expect(open("#/portal", WAITING)).toContain(">Waiting for the slides to start.</p>");
    const html = open("#/portal", ON_SLIDE_3);
    expect(html).toContain(">← Back</button>");
    expect(html).toContain(">Next →</button>");
    expect(html).toContain("Slide title 3");
  });

  it("PORTAL-check-1: the late banner sits in .portal-late inside .portal-room, which sets --late-room (0px until a banner shows) for the page's bottom padding; room2 has no .portal-late", () => {
    for (const server of [LOADING, WAITING, ON_SLIDE_3]) {
      const html = open("#/portal", server);
      expect(html.startsWith('<div class="portal-room" style="--late-room:0px">')).toBe(true);
      expect(html).toContain('<div class="portal-late">[late banner]</div></div>');
    }
    const other = open("#/portal?channel=room2", ON_SLIDE_3);
    expect(other.startsWith('<div class="portal-room" style="--late-room:0px">')).toBe(true);
    expect(other).not.toContain("portal-late");
  });

  // The server render runs no effects, so these two read the files: portal.css must use
  // --late-room for the bottom padding and pin the banner in .portal-late, and Page.tsx must
  // measure the banner with lateRoom.ts (its own tests) and scroll when it says to.
  it("PORTAL-fixcheck-1: portal.css adds --late-room to the slide view's and the loading/waiting page's bottom padding, fixes .portal-late at the bottom and keeps .late static inside it", () => {
    const decls = (selector: string) => {
      const found = css.filter((r) => r.at.length === 0 && r.selectors.includes(selector)).flatMap((r) => r.decls);
      return Object.fromEntries(found);
    };
    expect(decls(".portal").padding).toMatch(/^16px 16px calc\(.*var\(--late-room, 0px\)\)$/);
    expect(decls(".portal-room > .page")["padding-bottom"]).toMatch(/var\(--late-room, 0px\)\)$/);
    expect(decls(".portal-room").display).toBe("contents");
    expect(decls(".portal-late")).toMatchObject({ position: "fixed", bottom: "16px" });
    expect(decls(".portal-late .late").position).toBe("static");
  });

  it("PORTAL-fixcheck-1: Page.tsx sets --late-room from watchLateRoom on the .portal-late box and scrolls to the bottom when it says so", () => {
    expect(tsx).toContain("watchLateRoom(el, window, ResizeObserver, (px, bottom) => {");
    expect(tsx).toMatch(/keepBottom\.current = bottom;\s*setLateRoom\(px\);/);
    expect(tsx).toMatch(/keepBottom\.current = false;\s*scrollToBottom\(window\);\s*\}, \[lateRoom\]\);/);
    expect(tsx).toContain('<div className="portal-late" ref={late}>');
  });
});
