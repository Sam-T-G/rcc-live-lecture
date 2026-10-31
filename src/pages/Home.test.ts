// @vitest-environment node
// Home (#/): every link is a quiet button on its own line, so it's 48px tall to tap on a phone
// (docs/design.md, Student phone), and the check-in lines describe the pass flow: the student
// shows a pass and the door iPad scans it.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Home from "./Home";

const html = renderToStaticMarkup(createElement(Home));
const links = [...html.matchAll(/<a\b([^>]*)>([^<]*)<\/a>/g)].map((m) => ({ attrs: m[1], text: m[2] }));

describe("Home", () => {
  it("lists every page as a quiet button link", () => {
    expect(links.map((l) => l.text)).toEqual(["Kiosk", "Check in", "Live slides", "Professor view", "Lab"]);
    for (const l of links) expect(l.attrs).toMatch(/class="btn btn--quiet"/);
  });

  it("puts each description on its own line, not beside the link", () => {
    expect(html).not.toMatch(/<\/a> ·/);
    expect(html.match(/<div class="muted">/g)).toHaveLength(links.length);
  });

  it("describes check-in as a pass the door iPad scans", () => {
    expect(html).not.toMatch(/code at the door|after scanning/);
    expect(html).toContain("The iPad at the door scans your pass.");
    expect(html).toContain("Sign in and get your pass for the door.");
  });
});
