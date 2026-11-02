// @vitest-environment node
// googleButtonOptions (auth.tsx): what renderButton asks Google's script to draw (docs/design.md
// "Sign-in"). The outline pill on a light page and the filled black pill on a dark one, by the
// nearest data-theme or else the device's setting; as wide as its box, up to Google's 400. These
// tests have no browser, so the box and window.matchMedia are stand-ins.
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { googleButtonOptions } from "./auth";

vi.mock("convex/react", () => ({
  ConvexProviderWithAuth: ({ children }: { children: ReactNode }) => children,
  ConvexReactClient: class {},
  useConvexAuth: () => ({ isLoading: true, isAuthenticated: false }),
}));

// A box `width` px wide, inside an element with data-theme `theme` (none when it's left out).
function box(width: number, theme?: "light" | "dark") {
  return {
    getBoundingClientRect: () => ({ width }),
    closest: (selector: string) =>
      selector === "[data-theme]" && theme ? { getAttribute: (name: string) => (name === "data-theme" ? theme : null) } : null,
  } as unknown as HTMLElement;
}

function deviceDark(dark: boolean) {
  vi.stubGlobal("window", { matchMedia: (q: string) => ({ matches: dark && q === "(prefers-color-scheme: dark)" }) });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("googleButtonOptions", () => {
  it("keeps Google's large pill that says Continue with Google", () => {
    deviceDark(false);
    expect(googleButtonOptions(box(358))).toMatchObject({ size: "large", shape: "pill", text: "continue_with" });
  });

  it("is the outline pill on a light page and the filled black pill on a dark one", () => {
    deviceDark(false);
    expect(googleButtonOptions(box(358)).theme).toBe("outline");
    deviceDark(true);
    expect(googleButtonOptions(box(358)).theme).toBe("filled_black");
  });

  it("a data-theme around the box wins over the device's setting", () => {
    deviceDark(true);
    expect(googleButtonOptions(box(358, "light")).theme).toBe("outline");
    deviceDark(false);
    expect(googleButtonOptions(box(358, "dark")).theme).toBe("filled_black");
  });

  it("is as wide as its box, up to Google's 400", () => {
    deviceDark(false);
    expect(googleButtonOptions(box(358)).width).toBe(358);
    expect(googleButtonOptions(box(560)).width).toBe(400);
    expect(googleButtonOptions(box(358.6)).width).toBe(358);
  });

  it("a box narrower than Google's 200, or not laid out yet (a banner's shrink-to-fit slot), keeps Google's own width", () => {
    deviceDark(false);
    expect(googleButtonOptions(box(0))).not.toHaveProperty("width");
    expect(googleButtonOptions(box(160))).not.toHaveProperty("width");
  });

  it("with no browser to ask (a plain object for the box, no matchMedia), it is the light outline pill at Google's width", () => {
    expect(googleButtonOptions({} as HTMLElement)).toEqual({ theme: "outline", size: "large", shape: "pill", text: "continue_with" });
  });
});
