// @vitest-environment node
// #/ui and #/ui/projector (UIKit.tsx), rendered to markup. Design reviewers judge the kit from
// screenshots of these pages, so every part has to show in every state there, and the sample copy
// is what pages copy, so it follows AGENTS.md "Copy on screen".
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import UIKit from "./UIKit";

function open(hash: string) {
  vi.stubGlobal("location", { hash });
  return renderToStaticMarkup(createElement(UIKit));
}

// What a reader sees: the markup with its tags (and so its attributes and links' hrefs) taken out.
const words = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");

describe("#/ui shows every kit part in every state", () => {
  const html = open("#/ui");
  const count = (re: RegExp) => html.match(new RegExp(re, "g"))?.length ?? 0;

  it("a Segmented option with hover and with the keyboard focus ring, in light and dark", () => {
    expect(count(/class="seg__label" data-force="hover"/)).toBe(2);
    expect(count(/class="seg__label" data-force="focus"/)).toBe(2);
  });

  it("a pressed tab, in light and dark", () => {
    expect(count(/class="tabs__tab" data-force="active"/)).toBe(2);
  });

  it("the pinned banner stack (the late banner), in light and dark", () => {
    expect(count(/class="banner-stack[ "]/)).toBe(2);
  });

  it("links to the projector layout in light and in dark", () => {
    expect(html).toContain('href="#/ui/projector"');
    expect(html).toContain('href="#/ui/projector/dark"');
  });
});

describe("#/ui/projector", () => {
  it("is light by default", () => {
    expect(open("#/ui/projector")).toMatch(/<main class="projector" data-theme="light">/);
  });

  it("#/ui/projector/dark shows the same layout dark", () => {
    const dark = open("#/ui/projector/dark");
    expect(dark).toMatch(/<main class="projector" data-theme="dark">/);
    expect(words(dark)).toBe(words(open("#/ui/projector")));
  });

  // The 1920 x 1080 stage holds the ledger, the title, three rows and the Big number with
  // nothing under them: one more paragraph made the page 1158px tall (DESIGN-design-10).
  it("puts the way back to #/ui in the ledger line, so nothing sits under the Big number", () => {
    const html = open("#/ui/projector");
    expect(html).toMatch(/<p class="ledger">[^]*?<a href="#\/ui">[^]*?<\/p>/);
    expect(html).toMatch(/<div class="big"[^]*<\/div><\/main>$/);
  });
});

describe("sample copy names what people see, not a URL or the screen", () => {
  it("no words on #/ui or #/ui/projector name a #/ route", () => {
    for (const hash of ["#/ui", "#/ui/projector", "#/ui/projector/dark"]) expect(words(open(hash))).not.toContain("#/");
  });

  it("the EmptyState example in kit.tsx and docs/design.md says which page students ask from", () => {
    for (const file of ["../blocks/kit.tsx", "../../docs/design.md"]) {
      const text = readFileSync(new URL(file, import.meta.url), "utf8");
      expect(text, file).not.toMatch(/ask from #\//);
      expect(text, file).toContain("Students ask from the Live slides page");
    }
  });

  it("the Tabs sample panels hold content lines, not a description of the screen", () => {
    const text = words(open("#/ui"));
    for (const line of ["The slide, the quiz and who's lost.", "Student questions, most votes first.", "Teams and points."]) {
      expect(text).not.toContain(line);
    }
  });
});
