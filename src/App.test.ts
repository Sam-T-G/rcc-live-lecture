// @vitest-environment node
// App (App.tsx): which page a URL opens. Rendered on the server with the real router reading a
// stubbed location.hash, and two stand-in pages. React's server renderer never runs an error
// boundary, so ErrorBoundary is swapped for a box that shows where App put it and with which
// props; ui.test.ts tests the boundary itself.
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import App from "./App";

vi.mock("./pages", () => ({ pages: { "": () => "[Home]", live: () => "[Live slides]" } }));
vi.mock("./blocks/ui", async (orig) => ({
  ...(await orig<typeof import("./blocks/ui")>()),
  ErrorBoundary: ({ page, children }: { page?: boolean; children: ReactNode }) => createElement("section", { "data-boundary": page ? "page" : "part" }, children),
}));

function open(hash: string) {
  vi.stubGlobal("location", { hash });
  return renderToStaticMarkup(createElement(App));
}

describe("App", () => {
  it("blocks-frontend-13 a bad %-escape, #/constructor, #/hasOwnProperty and #/__proto__ show 'No page' with a link home", () => {
    for (const [hash, path] of [
      ["#/live/%E0%A4%A", "live/%E0%A4%A"],
      ["#/%E0%A4%A", "%E0%A4%A"],
      ["#/constructor", "constructor"],
      ["#/hasOwnProperty", "hasOwnProperty"],
      ["#/__proto__", "__proto__"],
      ["#/nope/more", "nope/more"],
    ])
      expect([hash, open(hash)]).toEqual([hash, `<main class="page"><h1>No page at #/${path}</h1><p><a href="#/">Go home</a></p></main>`]);
  });

  it("host-frontend-22 puts every page inside the page error boundary, so a page that throws can't blank the screen", () => {
    expect(open("#/live")).toBe('<section data-boundary="page">[Live slides]</section>');
    expect(open("")).toBe('<section data-boundary="page">[Home]</section>');
    expect(open("#/live/a%20b")).toBe('<section data-boundary="page">[Live slides]</section>');
  });
});
