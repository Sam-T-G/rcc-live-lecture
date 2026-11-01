// @vitest-environment node
// sweep2-blocks-3: #/ui and #/admin load their file only when opened. After that load fails (a
// phone offline for a moment), the page boundary's Go home and any link back mount the page again,
// and that new mount must import the file again. React.lazy keeps the failed import for the life of
// the tab, so it never would; src/pages/retryLazy.ts is the fix. The real retryLazy runs here
// around a loader that counts each import and fails the next `fail` of them.
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const chunk = vi.hoisted(() => ({ imports: 0, fail: 0, last: null as Promise<unknown> | null }));
vi.mock("./retryLazy", async (orig) => {
  const real = await orig<typeof import("./retryLazy")>();
  return {
    retryLazy: <P extends object>(load: () => Promise<{ default: ComponentType<P> }>) =>
      real.retryLazy(() => {
        chunk.imports++;
        const p = chunk.fail > 0 ? (chunk.fail--, Promise.reject(new TypeError("Failed to fetch dynamically imported module"))) : load();
        chunk.last = p;
        return p;
      }),
  };
});
const { pages } = await import("./index");

// One mount of the page at `hash`: renderToStaticMarkup mounts it fresh every time.
function mount(Page: ComponentType, hash: string) {
  vi.stubGlobal("location", { hash });
  return renderToStaticMarkup(createElement(Page));
}
const loadingScreen = (title: string) => `<main class="page page--wide"><h1>${title}</h1><p class="status status--loading" role="status">Loading…</p></main>`;

describe("sweep2-blocks-3 #/ui and #/admin import their file again after a failed load", () => {
  for (const [route, title] of [
    ["admin", "Admin"],
    ["ui", "UI kit"],
  ] as const)
    it(`#/${route}`, async () => {
      chunk.imports = 0;
      chunk.fail = 1; // the connection drops while the file downloads
      expect(mount(pages[route], `#/${route}`)).toBe(loadingScreen(title));
      expect(chunk.imports).toBe(1);
      await chunk.last!.catch(() => {});

      // Go home, then the link back: a new mount imports the file again and waits for it.
      expect(mount(pages[route], `#/${route}`)).toBe(loadingScreen(title));
      expect(chunk.imports).toBe(2);
      await chunk.last;

      // Once a load worked, later mounts reuse it. (#/admin then renders for real and throws with
      // no Convex client here; only the import count matters.)
      try {
        mount(pages[route], `#/${route}`);
      } catch {
        /* no Convex client */
      }
      expect(chunk.imports).toBe(2);
    });
});
