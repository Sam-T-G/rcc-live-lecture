// @vitest-environment node
// useHashParams (router.tsx), read during the first render. Re-reading on hashchange runs in an
// effect, which needs a browser; the stage and portal browser checks cover it.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { useHashParams, useRoute } from "./router";

function Show() {
  const params = useHashParams();
  return `${useRoute().join("/")} deck=${params.get("deck")} bridge=${params.get("bridge")}`;
}

function open(hash: string) {
  vi.stubGlobal("location", { hash });
  return renderToStaticMarkup(createElement(Show));
}

describe("useHashParams", () => {
  it("gives the URLSearchParams of the part after '?' in the hash", () => {
    expect(open("#/checkin/stage?deck=https%3A%2F%2Fexample.com%2Fdeck.html%3Fs%3D2&bridge=gdg")).toBe(
      "checkin/stage deck=https://example.com/deck.html?s=2 bridge=gdg",
    );
  });

  it("is empty when the hash has no '?'", () => {
    expect(open("#/checkin/stage")).toBe("checkin/stage deck=null bridge=null");
    expect(open("")).toBe(" deck=null bridge=null");
  });
});

describe("useRoute", () => {
  const Parts = () => JSON.stringify(useRoute());
  const parts = (hash: string) => {
    vi.stubGlobal("location", { hash });
    return JSON.parse(renderToStaticMarkup(createElement(Parts)).replace(/&quot;/g, '"'));
  };

  it("blocks-frontend-13 decodes each part, and gives a path with a bad %-escape as one part, which names no page", () => {
    expect(parts("#/live/a%20b")).toEqual(["live", "a b"]);
    expect(parts("#/live/%E0%A4%A?deck=x")).toEqual(["live/%E0%A4%A"]);
    expect(parts("#/%E0%A4%A/live")).toEqual(["%E0%A4%A/live"]);
    expect(parts("#/")).toEqual([]);
  });
});
