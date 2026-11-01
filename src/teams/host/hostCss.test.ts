// @vitest-environment node
// sweep2-host-9: host.css styles only parts a page renders, and its header points at the file the
// colors come from. A rule for a class nothing renders does nothing when someone restyles it.
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const SRC = new URL("../../", import.meta.url);
const CSS = readFileSync(new URL("teams/host/host.css", SRC), "utf8");
// Every .ts and .tsx file under src/ that isn't a test, joined.
const CODE = readdirSync(SRC, { recursive: true, encoding: "utf8" })
  .filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f))
  .map((f) => readFileSync(new URL(f, SRC), "utf8"))
  .join("\n");

describe("host.css", () => {
  it("every class it styles is in a src file's code", () => {
    const classes = [...new Set([...CSS.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/\.(-?[a-z_][\w-]*)/gi)].map((m) => m[1]))];
    const unused = classes.filter((c) => !new RegExp(`(^|[^\\w-])${c}([^\\w-]|$)`).test(CODE));
    expect(unused).toEqual([]);
  });

  it("its header names src/styles/tokens.css as where the colors come from", () => {
    expect(CSS.slice(0, CSS.indexOf("*/"))).toContain("src/styles/tokens.css");
  });
});
