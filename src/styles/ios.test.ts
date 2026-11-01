// @vitest-environment node
// The iOS app (ios/RCCLivePortal) can't read the stylesheets, so docs/design.md "iOS app" says it
// uses the hex values in the color table. This test reads the Swift sources and tokens.css from
// disk and fails when:
// - a color in Palette (ios/RCCLivePortal/Palette.swift) differs from its token, light or dark;
// - a screen uses a system color (red, orange, blue, the unset AccentColor) instead of Palette:
//   docs/design.md says no blue, and red only for something that failed;
// - the late banner covers the deck screen instead of taking its own room at the bottom, the way
//   #/portal pins it at the bottom and grows the page (sweep1-ios-1);
// - Back to live is shorter than the 44 pt phone tap size (sweep1-ios-2).
// The pairs Palette draws (--accent-text on --accent, --warn-text on --warn, --line-strong on
// --bg) are in contrast.ts, so contrast.test.ts measures them.
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseColor, toHex } from "./contrast";
import { parse, type Rule } from "./cssRules";

const IOS = new URL("../../ios/RCCLivePortal/", import.meta.url);
const SWIFT = Object.fromEntries(
  readdirSync(IOS)
    .filter((f) => f.endsWith(".swift"))
    .map((f) => [f, readFileSync(new URL(f, IOS), "utf8")]),
);
// Swift code with `//` comments and string literals blanked, so a word in a comment or in
// on-screen copy can't match a code check.
const code = (src: string) => src.replace(/"(?:[^"\\\n]|\\.)*"/g, '""').replace(/\/\/.*$/gm, "");

const tokenRules = parse(readFileSync(new URL("tokens.css", import.meta.url), "utf8"));
const inMedia = (r: Rule) => r.at.some((a) => a.startsWith("@media"));
function vars(rules: Rule[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const r of rules) for (const [k, v] of r.decls) if (k.startsWith("--")) m.set(k, v);
  return m;
}
const light = vars(tokenRules.filter((r) => !inMedia(r) && r.selectors.includes(":root")));
const dark = new Map([
  ...light,
  ...vars(
    tokenRules.filter(
      (r) => r.at.some((a) => /prefers-color-scheme:\s*dark/.test(a)) && r.selectors.includes(':root:not([data-theme="light"])'),
    ),
  ),
]);
function hex(scope: Map<string, string>, token: string, depth = 0): string {
  const v = scope.get(token);
  if (v === undefined || depth > 20) throw new Error(`${token} isn't set`);
  const ref = /^var\(\s*(--[\w-]+)\s*\)$/.exec(v);
  if (ref) return hex(scope, ref[1], depth + 1);
  const rgb = parseColor(v);
  if (!rgb) throw new Error(`${token} is ${v}, not a solid color`);
  return toHex(rgb).toLowerCase();
}

// `static let accent = Hex(light: 0x00732D, dark: 0x96D6A0) // --accent`
const ENTRY = /static let (\w+) = Hex\(light: 0x([0-9A-Fa-f]{6}), dark: 0x([0-9A-Fa-f]{6})\)\s*\/\/\s*(--[\w-]+)/g;
const palette = [...(SWIFT["Palette.swift"] ?? "").matchAll(ENTRY)].map(([, name, l, d, token]) => ({
  name,
  token,
  light: `#${l.toLowerCase()}`,
  dark: `#${d.toLowerCase()}`,
}));

describe("iOS app colors and layout follow docs/design.md", () => {
  it("Palette has the tokens the deck screen draws, each with tokens.css's light and dark hex", () => {
    const needed = ["--accent", "--accent-text", "--warn", "--warn-text", "--line-strong", "--error", "--surface"];
    expect(palette.map((p) => p.token).sort()).toEqual(expect.arrayContaining(needed));
    const wrong = palette
      .map((p) => ({ ...p, want: { light: hex(light, p.token), dark: hex(dark, p.token) } }))
      .filter((p) => p.light !== p.want.light || p.dark !== p.want.dark)
      .map((p) => `${p.name} (${p.token}): ${p.light}/${p.dark}, tokens.css has ${p.want.light}/${p.want.dark}`);
    expect(wrong).toEqual([]);
  });

  it("no screen uses a system color or the unset AccentColor", () => {
    // `Color.red`, `UIColor.systemOrange`, and a bare `.red` or `.accentColor` where a color goes
    // (`.tint(showNotice ? .red : .accentColor)`).
    const system =
      /\b(?:Color|UIColor)\s*\.\s*(?:red|orange|blue|yellow|green|pink|purple|accentColor|system\w+)\b|(?<![\w)\]])\.(?:red|orange|blue|yellow|green|pink|purple|accentColor)\b/g;
    const hits = Object.entries(SWIFT).flatMap(([file, src]) =>
      code(src)
        .split("\n")
        .flatMap((line, i) => [...line.matchAll(system)].map((m) => `${file}:${i + 1} ${m[0]}`)),
    );
    expect(hits).toEqual([]);
  });

  it("the late banner sits in its own room at the bottom of the deck screen, covering nothing", () => {
    const deck = code(SWIFT["DeckView.swift"]);
    expect(deck).not.toMatch(/\.overlay\([^)]*\)\s*\{\s*LateBannerView/);
    expect(deck).toMatch(/\.safeAreaInset\(edge:\s*\.bottom[^)]*\)\s*\{\s*LateBannerView/);
  });

  it("Back to live is at least 44 pt tall", () => {
    const deck = code(SWIFT["DeckView.swift"]);
    const back = /Button\(Words\.backToLive\)[^\n]*\n((?:\s*\.[^\n]*\n)*)/.exec(deck);
    expect(back, "Button(Words.backToLive) not found").not.toBeNull();
    const style = /\.buttonStyle\((\w+)/.exec(back![1])?.[1];
    expect(style, "Back to live has no named button style").toBeDefined();
    const all = Object.values(SWIFT).map(code).join("\n");
    const body = new RegExp(`struct ${style}\\b[^{]*\\{([\\s\\S]*?)\\n\\}`).exec(all)?.[1] ?? "";
    expect(body).toMatch(/minHeight:\s*(4[4-9]|[5-9]\d)\b/);
  });
});
