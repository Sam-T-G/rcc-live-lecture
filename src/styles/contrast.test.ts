// @vitest-environment node
// DESIGN: the colors every page uses pass WCAG AA in light and dark (4.5:1 for words, 3:1 for
// large words, edges, rings and bars), measured from the stylesheets themselves. The CSS is read
// from disk (Vitest blanks CSS imports, ?raw included) and the small parser below reads its
// rules, so a changed hex in tokens.css, a new rule in a team stylesheet or a dark block that
// drifts fails here.
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PAIRS, contrastRatio, parseColor, type Rgb } from "./contrast";
import { parse, type Rule } from "./cssRules";

const SRC = new URL("../", import.meta.url);
const TOKENS = readFileSync(new URL("styles/tokens.css", SRC), "utf8");
// Every stylesheet under src/, by path from src/ ("index.css", "styles/kit.css", ...).
const SHEETS = Object.fromEntries(
  readdirSync(SRC, { recursive: true, encoding: "utf8" })
    .filter((f) => f.endsWith(".css"))
    .map((f) => [f, readFileSync(new URL(f, SRC), "utf8")]),
);

type Scope = Map<string, string>;
const tokenRules = parse(TOKENS);
const inMedia = (r: Rule) => r.at.some((a) => a.startsWith("@media"));
function merge(rules: Rule[]): Scope {
  const m: Scope = new Map();
  for (const r of rules) for (const [k, v] of r.decls) if (k.startsWith("--") || k === "color-scheme") m.set(k, v);
  return m;
}

// What each theme's element ends up with: what it inherits from <html>, then its own rules.
const root = tokenRules.filter((r) => !inMedia(r) && r.selectors.includes(":root"));
const darkMedia = tokenRules.filter(
  (r) => r.at.some((a) => /prefers-color-scheme:\s*dark/.test(a)) && r.selectors.includes(':root:not([data-theme="light"])'),
);
const own = (theme: string) => tokenRules.filter((r) => !inMedia(r) && r.selectors.some((s) => s === `[data-theme="${theme}"]` || s === "[data-theme]"));
const THEMES = {
  light: merge(root),
  dark: new Map([...merge(root), ...merge(darkMedia)]), // :root:not(...) outranks :root
  lightScope: new Map([...merge(root), ...merge(darkMedia), ...merge(own("light"))]), // data-theme="light" inside a dark page
  darkScope: new Map([...merge(root), ...merge(own("dark"))]), // data-theme="dark" inside a light page
};

// A value with every var() replaced, as the browser would on an element with this scope.
function resolve(scope: Scope, value: string, depth = 0): string {
  if (depth > 20) throw new Error(`var() loop at ${value}`);
  return value.replace(/var\(\s*(--[\w-]+)\s*(?:,([^()]*))?\)/g, (_, name: string, fallback?: string) => {
    const v = scope.get(name) ?? fallback?.trim();
    if (v === undefined) throw new Error(`${name} isn't set`);
    return resolve(scope, v, depth + 1);
  });
}

function color(scope: Scope, token: string): Rgb {
  const text = resolve(scope, `var(${token})`);
  const rgb = parseColor(text);
  if (!rgb) throw new Error(`${token} is ${text}, not a solid color`);
  return rgb;
}

const ratio = (scope: Scope, fg: string, bg: string) => contrastRatio(color(scope, fg), color(scope, bg));

describe("contrast: every text/background token pair the app uses passes WCAG AA in light and dark", () => {
  for (const theme of ["light", "dark"] as const) {
    it(`${theme}: every pair in contrast.ts reaches its minimum`, () => {
      const low = PAIRS.map((p) => ({ ...p, ratio: Math.floor(ratio(THEMES[theme], p.fg, p.bg) * 100) / 100 }))
        .filter((p) => p.ratio < p.min)
        .map((p) => `${p.fg} on ${p.bg}: ${p.ratio}:1, needs ${p.min}:1 (${p.use})`);
      expect(low).toEqual([]);
    });
  }

  it("light and dark: every rule in src/**/*.css that sets both its words and its fill from tokens reaches 4.5:1", () => {
    const tokenOnly = /^var\(\s*(--[\w-]+)\s*\)$/;
    const low: string[] = [];
    let measured = 0;
    for (const [file, css] of Object.entries(SHEETS)) {
      for (const rule of parse(css)) {
        const decl = (name: string) => [...rule.decls].reverse().find(([k]) => k === name)?.[1];
        const fg = tokenOnly.exec(decl("color") ?? "")?.[1];
        const bg = tokenOnly.exec(decl("background-color") ?? decl("background") ?? "")?.[1];
        // A team's own property (--group, --soft) isn't a token, so this test can't measure it.
        if (!fg || !bg || !THEMES.light.has(fg) || !THEMES.light.has(bg)) continue;
        measured++;
        for (const theme of ["light", "dark"] as const) {
          const r = ratio(THEMES[theme], fg, bg);
          if (r < 4.5) low.push(`${file} ${rule.selectors.join(", ")} (${theme}): ${fg} on ${bg} is ${r.toFixed(2)}:1`);
        }
      }
    }
    expect(low).toEqual([]);
    expect(measured).toBeGreaterThan(10); // the parser found the kit's and the teams' rules
  });

  it("the dark colors are the same from the system setting and from data-theme=\"dark\"", () => {
    const media = merge(darkMedia);
    const attr = merge(tokenRules.filter((r) => !inMedia(r) && r.selectors.includes('[data-theme="dark"]')));
    expect(media.size).toBeGreaterThan(20);
    expect(Object.fromEntries(attr)).toEqual(Object.fromEntries(media));
  });

  it("a data-theme scope gets its theme's colors whatever the page's own theme is (#/ui, the projector)", () => {
    // Every name the dark block changes, and every app name built on them.
    const appNames = merge(tokenRules.filter((r) => !inMedia(r) && r.selectors.includes("[data-theme]")));
    const names = [...merge(darkMedia).keys(), ...appNames.keys()].filter((k) => k.startsWith("--"));
    expect(names.length).toBeGreaterThan(40);
    const values = (scope: Scope) => Object.fromEntries(names.map((n) => [n, resolve(scope, `var(${n})`)]));
    expect(values(THEMES.lightScope)).toEqual(values(THEMES.light));
    expect(values(THEMES.darkScope)).toEqual(values(THEMES.dark));
  });

  it("the names index.css had before still resolve, so every page picked up the new colors without an edit", () => {
    for (const theme of ["light", "dark"] as const) {
      for (const name of ["--bg", "--surface", "--text", "--muted", "--line", "--accent", "--accent-text", "--error"]) {
        expect(color(THEMES[theme], name), `${name} in ${theme}`).toHaveLength(3);
      }
      expect(resolve(THEMES[theme], "var(--radius)")).toMatch(/^\d*\.?\d+(rem|px)$/);
    }
  });

  it("every var() in src/**/*.css names a property some stylesheet sets", () => {
    const set = new Set<string>();
    const used: [string, string][] = [];
    for (const [file, css] of Object.entries(SHEETS)) {
      for (const rule of parse(css)) {
        for (const [k, v] of rule.decls) {
          if (k.startsWith("--")) set.add(k);
          for (const m of v.matchAll(/var\(\s*(--[\w-]+)\s*([,)])/g)) if (m[2] === ")") used.push([file, m[1]]);
        }
      }
    }
    expect(set.size).toBeGreaterThan(50);
    expect(used.filter(([, name]) => !set.has(name)).map(([file, name]) => `${file}: ${name}`)).toEqual([]);
  });
});
