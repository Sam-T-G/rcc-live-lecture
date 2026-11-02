// @vitest-environment node
// #/ui and #/ui/projector (UIKit.tsx), rendered to markup. Design reviewers judge the kit from
// screenshots of these pages, so every part has to show in every state there, and the sample copy
// is what pages copy, so it follows AGENTS.md "Copy on screen".
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ConfirmButton } from "../blocks/kit";
import { parse } from "../styles/cssRules";
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

  // The busy and failed boxes otherwise show only after a real press and an 800 ms wait, which
  // screenshots never catch.
  describe("sweep2-blocks-5 ConfirmButton closed, asking, busy and failed", () => {
    const boxes = html.match(/<div class="confirm"[^]*?<\/div><\/div>/g) ?? [];
    const ids = (s: string) => s.replace(/«[^»]*»|:[a-z0-9]+:|_r_[a-z0-9]+_/gi, "ID");

    it("in light and dark: one box asking, one busy, one with its error line", () => {
      expect(boxes).toHaveLength(6);
      expect(boxes.filter((b) => b.includes('aria-busy="true"'))).toHaveLength(2);
      const failed = boxes.filter((b) => b.includes('<p class="status status--error" role="alert">That class already ended.</p>'));
      expect(failed).toHaveLength(2);
      expect(failed.every((b) => !b.includes("aria-busy"))).toBe(true);
    });

    it("the busy and failed samples are ConfirmButton's own markup in that state", () => {
      const real = renderToStaticMarkup(
        createElement(ConfirmButton, { defaultOpen: true, question: "End class for today?", confirm: "End class", onConfirm: () => {}, children: "End class" }),
      );
      const failed = boxes.find((b) => b.includes("status--error"))!;
      expect(ids(failed.replace(/<p class="status status--error"[^]*?<\/p>/, ""))).toBe(ids(real));
      const busy = boxes.find((b) => b.includes("aria-busy"))!;
      expect(busy).toMatch(
        /<button[^>]*aria-busy="true"[^>]*><span class="btn__label">End class<\/span><span class="btn__spinner"[^>]*><\/span><\/button><button[^>]*disabled=""[^>]*><span class="btn__label">Cancel<\/span><\/button>/,
      );
      // Apart from the busy marks, the same markup as the real box.
      const calm = busy.replace(/ aria-busy="true"| aria-disabled="true"| disabled=""|<span class="btn__spinner"[^>]*><\/span>/g, "");
      expect(ids(calm)).toBe(ids(real));
    });
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

// Builders copy these parts from #/ui, so each kit.html part kit.css already builds shows here.
describe("DS-KIT-design-2 #/ui shows the checked-in stub, the heading line and the glyph set", () => {
  const html = open("#/ui");
  const count = (re: RegExp) => html.match(new RegExp(re, "g"))?.length ?? 0;

  it("the checked-in stub with its perforation and times, in light and dark", () => {
    expect(count(/<section class="stub"/)).toBe(2);
    expect(count(/<hr class="perf"\/>/)).toBe(2);
    expect(count(/class="stub__times"/)).toBe(2);
  });

  it("the heading line with its state word, Open and Ended, in light and dark", () => {
    expect(count(/<div class="hline">/)).toBe(4);
    expect(count(/class="stateword stateword--open"/)).toBe(2);
    expect(count(/class="stateword stateword--ended"/)).toBe(2);
    expect(count(/class="facts facts-list"/)).toBe(4);
  });

  it("the glyph set: every Icon name at 24 and at 64, in light and dark", () => {
    const kit = readFileSync(new URL("../blocks/kit.tsx", import.meta.url), "utf8");
    const names = [...kit.match(/export type IconName =([^;]+);/)![1].matchAll(/"([a-z-]+)"/g)].map((m) => m[1]);
    expect(names.length).toBeGreaterThan(5);
    for (const name of names) expect(count(new RegExp(`data-glyph="${name}"`)), name).toBe(2);
  });
});

describe("DS-KIT-risk-5 #/ui adds no on-screen words the app doesn't have yet", () => {
  it("no Sent, Sending, Offline, Show slide or See all teams on #/ui or #/ui/projector", () => {
    for (const hash of ["#/ui", "#/ui/projector"]) {
      const text = words(open(hash));
      for (const w of [/\bSent\b/, /\bSending\b/, /\bOffline\b/, /Show slide/, /See all teams/]) expect(text, `${hash} ${w}`).not.toMatch(w);
    }
  });

  it("the rcc-design skill says Sent and Offline wait for the COPY pass", () => {
    const skill = readFileSync(new URL("../../.claude/skills/rcc-design/SKILL.md", import.meta.url), "utf8");
    const lines = skill.split("\n").filter((l) => /\bSent\b|\bOffline\b/.test(l));
    expect(lines.length).toBeGreaterThan(0);
    for (const l of lines) expect(l).toMatch(/COPY pass/);
  });
});

// The slide track's lane needs 44px plus 32px a slide, so at 390px wide its room count ran to
// x=531 and the whole page scrolled sideways. The sample sits in its own scroll box, the way
// .host-track scrolls under 800px on #/host.
describe("e2e-ui-gallery-sideways #/ui never scrolls sideways at phone width", () => {
  it("each slide track sample sits in a box that scrolls on its own", () => {
    const html = open("#/ui");
    expect(html.match(/<div class="uikit-trackscroll"><div class="track">/g)).toHaveLength(2);
    const css = parse(readFileSync(new URL("../styles/uikit.css", import.meta.url), "utf8"));
    const rule = css.find((r) => r.selectors.includes(".uikit-trackscroll") && r.at.length === 0);
    expect(rule?.decls).toContainEqual(["overflow-x", "auto"]);
  });

  // The box clips both ways once it scrolls. Held at the box's 326px, the track squeezed its
  // title column to 0px, "Slide 4 of 8" wrapped onto 3 lines, and the slide numbers fell below
  // the 88px box. The track is never narrower than its content, so it only overflows sideways,
  // and it still fills a wider box at 1280.
  it("the track inside the box is never narrower than its content", () => {
    const css = parse(readFileSync(new URL("../styles/uikit.css", import.meta.url), "utf8"));
    const rule = css.find((r) => r.selectors.includes(".uikit-trackscroll > .track") && r.at.length === 0);
    expect(rule?.decls).toContainEqual(["min-width", "max-content"]);
  });
});
