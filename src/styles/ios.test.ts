// @vitest-environment node
// The iOS app (ios/RCCLivePortal) can't read the stylesheets, so docs/design.md "iOS app" says it
// uses the hex values in the color table. This test reads the Swift sources and tokens.css from
// disk and fails when:
// - a color in Palette (ios/RCCLivePortal/Palette.swift) differs from its token, light or dark;
// - a screen uses a system color (SwiftUI's .red or .gray, UIKit's .systemBackground or .label,
//   the unset AccentColor) instead of Palette:
//   docs/design.md says no blue, and red only for something that failed;
// - the deck screen's body drops `.tint(Palette.accent.color)`, so its arrows go back to the
//   unset AccentColor's system blue (sweep1-ios-fixcheck-1);
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

// A system color where a color goes, after `Color.`, `UIColor.` or a bare `.`: SwiftUI's named
// colors (`.red`, `.gray`, `.teal`, `.accentColor`) and UIKit's (`.systemOrange`,
// `.secondarySystemBackground`, `.label`, `.secondaryLabel`, `.separator`), as in
// `.tint(showNotice ? .red : .accentColor)`, `Color(uiColor: .systemRed)` or `Color.gray`.
// `.system(size:)` fonts and `.foregroundStyle(.secondary)` don't match.
const SYSTEM_NAMES =
  "red|orange|yellow|green|mint|teal|cyan|blue|indigo|purple|pink|brown|gray|accentColor|system\\w+|(?:secondary|tertiary|quaternary)[A-Z]\\w*|label|separator|opaqueSeparator|placeholderText|link|lightGray|darkGray|lightText|darkText";
const SYSTEM_COLOR = new RegExp(`\\b(?:Color|UIColor)\\s*\\.\\s*(?:${SYSTEM_NAMES})\\b|(?<![\\w)\\]])\\.(?:${SYSTEM_NAMES})\\b`, "g");

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
    const hits = Object.entries(SWIFT).flatMap(([file, src]) =>
      code(src)
        .split("\n")
        .flatMap((line, i) => [...line.matchAll(SYSTEM_COLOR)].map((m) => `${file}:${i + 1} ${m[0]}`)),
    );
    expect(hits).toEqual([]);
  });

  it("the system-color check catches the system colors SwiftUI and UIKit name, and passes fonts and Palette", () => {
    // DeckView no longer uses a system color, so the check above passes with a narrower pattern
    // too. These fixed lines fail the test when the pattern stops seeing one (sweep2-core-fixcheck-1).
    const caught = [
      "Color(.systemOrange)",
      "Color(uiColor: .systemRed)",
      "Color(.systemBackground)",
      "Color(.secondarySystemBackground)",
      "Color(.label)",
      "Color(uiColor: .secondaryLabel)",
      ".foregroundStyle(Color(.separator))",
      "UIColor.systemBlue",
      "Color.gray",
      "Color.accentColor",
      ".tint(.teal)",
      ".foregroundStyle(.red)",
      ".tint(showNotice ? .red : .accentColor)",
    ];
    const passed = [
      ".font(.system(size: 12))",
      ".font(.system(.title, design: .rounded))",
      ".foregroundStyle(.secondary)",
      ".tint(Palette.accent.color)",
      ".background(Palette.surface.color)",
      ".labelStyle(.titleOnly)",
      "Text(Words.live).font(.title)",
    ];
    const hit = (line: string) => [...line.matchAll(SYSTEM_COLOR)].length > 0;
    expect(caught.filter((l) => !hit(l))).toEqual([]);
    expect(passed.filter(hit)).toEqual([]);
  });

  it("the deck screen tints its arrows with Palette's green, so they aren't the unset AccentColor's blue", () => {
    // The project sets no AccentColor, so without this tint the Previous and Next chevrons
    // draw in system blue, which the system-color check above can't see (sweep1-ios-fixcheck-1).
    const deck = code(SWIFT["DeckView.swift"]);
    const body = /struct DeckView\b[^{]*\{[\s\S]*?\n {4}var body: some View \{\n([\s\S]*?)\n {4}\}\n/.exec(deck)?.[1];
    expect(body, "DeckView's body not found").toBeDefined();
    expect(body).toMatch(/^\s*\.tint\(\s*Palette\.accent\.color\s*\)/m);
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

// The app's words are copies of the web's, so a student reads the same line on every screen
// (F16, F42). Each side's own tests check only its own copy, so these read both and fail when a
// copy edit changes one side (sweep2-ios-5, sweep2-ios-8).
describe("iOS app words match the web's", () => {
  const lateTs = readFileSync(new URL("../teams/checkin/late.ts", import.meta.url), "utf8");
  const pageTsx = readFileSync(new URL("../portal/Page.tsx", import.meta.url), "utf8");
  const deck = SWIFT["DeckView.swift"] ?? "";
  // Swift's "\(n) min late" and JS's `${n} min late`, with every slot written as {}.
  const slots = (s: string) => s.replace(/\\\([^)]*\)/g, "{}").replace(/\$\{[^}]*\}/g, "{}");
  // A late line's slots by what they hold, so a line that swaps the name and the minutes
  // ("🐢 3 just walked in, Ana min late.") fails (sweep2-ios-fixcheck-3). The first closure
  // parameter is the name and the second the minutes, on both sides.
  const lateSlots = (s: string, name: string, min: string) =>
    s
      .replace(/\\\(\s*(\w+)\s*\)|\$\{\s*(\w+)\s*\}/g, (all, a?: string, b?: string) => {
        const v = a ?? b;
        return v === name ? "{name}" : v === min ? "{min}" : all;
      });

  it("the late banner's five lines are late.ts's LINES, in the same order, with the name and the minutes in the same slots", () => {
    const swiftBody = /enum LateLines \{[\s\S]*?static let lines[^=]*= \[([\s\S]*?)\n {4}\]/.exec(SWIFT["LateBanner.swift"] ?? "")?.[1];
    expect(swiftBody, "LateLines.lines not found in LateBanner.swift").toBeDefined();
    const swift = [...swiftBody!.matchAll(/\{\s*(\w+),\s*(\w+)\s+in\s+"((?:[^"\\]|\\.)*)"\s*\}/g)].map(([, n, m, s]) => lateSlots(s, n, m));
    const webBody = /const LINES = \[([\s\S]*?)\n\];/.exec(lateTs)?.[1];
    expect(webBody, "LINES not found in late.ts").toBeDefined();
    const web = [...webBody!.matchAll(/\(\s*(\w+)\s*:\s*string\s*,\s*(\w+)\s*:\s*number\s*\)\s*=>\s*`([^`]*)`/g)].map(([, n, m, s]) =>
      lateSlots(s, n, m),
    );
    expect(web).toHaveLength(5);
    expect(swift).toHaveLength(5);
    for (const line of [...web, ...swift]) {
      const found = [...line.matchAll(/\{[^}]*\}/g)].map((m) => m[0]).sort();
      expect(found, `${line}: its slots aren't the name and the minutes, once each`).toEqual(["{min}", "{name}"]);
    }
    expect(swift).toEqual(web);
  });

  // Words in DeckView.swift: `static let loading = "..."` and
  // `static func professorOn(slide: Int) -> String { "... \(slide) ..." }`.
  const words = () => {
    const body = /enum Words \{([\s\S]*?)\n\}/.exec(deck)?.[1] ?? "";
    const lets = [...body.matchAll(/static let (\w+) = "((?:[^"\\]|\\.)*)"/g)].map(([, name, text]) => ({ name, text }));
    const funcs = [...body.matchAll(/static func (\w+)\([^)]*\) -> String \{ "((?:[^"\\]|\\.)*)" \}/g)].map(([, name, text]) => ({
      name,
      text: slots(text),
    }));
    return [...lets, ...funcs];
  };
  // Lines only the app has: #/portal has no connection bar. Words.back and Words.next are the
  // arrow buttons' words without the arrows; the next test checks them.
  const APP_ONLY = ["cantLoad", "offline"];
  const ARROWS = ["back", "next"];
  // #/portal's source with each one-line JSX `{expression}` written as {}.
  const portalText = pageTsx.replace(/\{[^{}\n]+\}/g, "{}");
  // The text between two JSX tags, whitespace collapsed: "Slide {} of {}", "Back to live".
  // A word has to be a whole text node, so "Live" can't match setLiveAtBrowse and "Loading the
  // slides…" can't match a longer line (sweep2-ios-fixcheck-3).
  const textNodes = new Set(
    [...portalText.matchAll(/<\/?[A-Za-z][^<>]*>([^<>]*)(?=<)/g)].map((m) => m[1].replace(/\s+/g, " ").trim()).filter(Boolean),
  );

  it("every line in Words is a whole text node on #/portal, word for word", () => {
    const all = words();
    expect(all.map((w) => w.name)).toEqual(
      expect.arrayContaining(["loading", "waiting", "backToLive", "live", "professorOn", "slideOf", "back", "next"]),
    );
    const missing = all
      .filter((w) => !APP_ONLY.includes(w.name) && !ARROWS.includes(w.name) && !textNodes.has(w.text))
      .map((w) => `${w.name}: ${w.text}`);
    expect(missing).toEqual([]);
  });

  it("the Live tag on #/portal says Words.live", () => {
    const live = words().find((w) => w.name === "live")?.text;
    expect(live, "Words.live not found").toBeDefined();
    expect(portalText).toMatch(new RegExp(`className="[^"]*\\bportal__tag--live\\b[^"]*">\\s*${live}\\s*<`));
  });

  it("the arrows' VoiceOver labels are Words.back and Words.next, #/portal's button words", () => {
    const labels = [...code(deck).matchAll(/\.accessibilityLabel\(([^)]*)\)/g)].map((m) => m[1].trim());
    expect(labels).toEqual(expect.arrayContaining(["Words.back", "Words.next"]));
    const all = Object.fromEntries(words().map((w) => [w.name, w.text]));
    expect(pageTsx).toMatch(new RegExp(`>\\s*← ${all.back}\\s*</button>`));
    expect(pageTsx).toMatch(new RegExp(`>\\s*${all.next} →\\s*</button>`));
  });
});
