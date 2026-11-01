// @vitest-environment node
// Every route shows something while it loads, and a URL with a part no page has shows "No page"
// (F41). The pages in src/pages/index.ts render here with the real router reading a stubbed
// location.hash. No case below reaches the server, so there is no Convex client.
import { readFileSync } from "node:fs";
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { pages } from "./index";
import UIKit from "./UIKit";

function open(Page: ComponentType, hash: string) {
  vi.stubGlobal("location", { hash });
  return renderToStaticMarkup(createElement(Page));
}

const noPage = (path: string) => `<main class="page"><h1>No page at #/${path}</h1><p><a href="#/">Go home</a></p></main>`;

describe("lazy routes while their file loads", () => {
  // The first render of a React.lazy page always suspends, so this is what a slow phone sees
  // until the chunk arrives. Rendered before anything else in this file imports Admin or UIKit.
  it("E2E-1 #/admin shows its title and Loading…, never a blank page", () => {
    expect(open(pages.admin, "#/admin")).toBe('<main class="page page--wide"><h1>Admin</h1><p class="status status--loading" role="status">Loading…</p></main>');
  });

  it("E2E-1 #/ui and #/ui/projector show the kit's title and Loading…, never a blank page", () => {
    for (const hash of ["#/ui", "#/ui/projector"])
      expect([hash, open(pages.ui, hash)]).toEqual([hash, '<main class="page page--wide"><h1>UI kit</h1><p class="status status--loading" role="status">Loading…</p></main>']);
  });
});

describe("E2E-2 a part after a page's name that the page doesn't have shows 'No page'", () => {
  it("#/admin/<part> and #/lab/<part>", () => {
    expect(open(pages.admin, "#/admin/nope")).toBe(noPage("admin/nope"));
    expect(open(pages.lab, "#/lab/nope")).toBe(noPage("lab/nope"));
    expect(open(pages.lab, "#/lab/a/b")).toBe(noPage("lab/a/b"));
  });

  it("#/ui/<part>, #/ui/projector/<part> other than dark, and anything longer", () => {
    for (const path of ["ui/nope", "ui/dark", "ui/projector/nope", "ui/projector/light", "ui/projector/dark/x", "ui/nope/dark"])
      expect([path, open(UIKit, "#/" + path)]).toEqual([path, noPage(path)]);
  });

  it("#/ui, #/ui/projector and #/ui/projector/dark still open the kit", () => {
    expect(open(UIKit, "#/ui")).toContain("<h1>UI kit</h1>");
    expect(open(UIKit, "#/ui/projector")).toMatch(/^<main class="projector" data-theme="light">/);
    expect(open(UIKit, "#/ui/projector/dark")).toMatch(/^<main class="projector" data-theme="dark">/);
  });

  it("#/checkin/<page>/<part>", () => {
    for (const path of ["checkin/student/extra", "checkin/join/x", "checkin/teacher/extra", "checkin/kiosk/x", "checkin/quiz/x", "checkin/stage/extra", "checkin/nope/x"])
      expect([path, open(pages.checkin, "#/" + path)]).toEqual([path, noPage(path)]);
    expect(open(pages.checkin, "#/checkin/nope")).toBe(noPage("checkin/nope"));
  });

  it("#/live/leaderboard/<part>", () => {
    expect(open(pages.live, "#/live/leaderboard/extra")).toBe(noPage("live/leaderboard/extra"));
    expect(open(pages.live, "#/live/nope/x")).toBe(noPage("live/nope/x"));
    expect(open(pages.live, "#/live/nope")).toBe(noPage("live/nope"));
  });
});

describe("sweep2-blocks-4 F41 before the app's file runs", () => {
  // Every route is index.html until the main bundle (about 130 kB gzipped) downloads and runs, so
  // #root holds a loading line, the same markup as the app's own, which createRoot().render
  // replaces. With JavaScript off, a line says so instead of a blank page.
  const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
  const root = /<div id="root">([\s\S]*?)<\/div>/.exec(html)?.[1] ?? "";

  it("index.html's #root shows Loading…, and a browser with JavaScript off gets a line that says so", () => {
    expect(root).toContain('<p class="status status--loading" role="status">Loading…</p>');
    expect(html).toMatch(/<noscript>[\s\S]*Turn on JavaScript[\s\S]*<\/noscript>/);
  });
});
