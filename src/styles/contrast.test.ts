// @vitest-environment node
// DESIGN: the colors every page uses pass WCAG AA in light and dark (4.5:1 for words, 3:1 for
// large words, edges, rings and bars), measured from the stylesheets themselves. The CSS is read
// from disk (Vitest blanks CSS imports, ?raw included) and the small parser in cssRules.ts reads its
// rules, so a changed hex in tokens.css, a new rule in a team stylesheet or a dark block that
// drifts fails here.
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PAIRS, contrastRatio, parseColor, type Rgb } from "./contrast";
import { parse, splitTop, type Rule } from "./cssRules";

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

  it("sweep2-host-3 light and dark: #/host's 'Group by topic with AI' switch shows its edge and knob at 3:1 on the card when off, and its knob at 3:1 on the track when on", () => {
    const rules = parse(SHEETS["teams/host/host.css"]);
    // The last value `name` gets from a rule with exactly this selector, or "" when none sets it.
    const value = (selector: string, name: string) =>
      rules.filter((r) => r.selectors.includes(selector)).flatMap((r) => r.decls.filter(([k]) => k === name).map(([, v]) => v)).pop() ?? "";
    // The color in a value like "2px solid var(--line-strong)" or "#fff".
    const colorIn = (scope: Scope, text: string) => {
      const found = /var\(\s*--[\w-]+\s*\)|#[0-9a-f]{3,8}\b/i.exec(text)?.[0];
      const rgb = found ? parseColor(resolve(scope, found)) : null;
      if (!rgb) throw new Error(`no solid color in "${text}"`);
      return rgb;
    };
    const TRACK = ".host-switch__track";
    const ON = ".host-switch input:checked + .host-switch__track";
    const low: string[] = [];
    for (const theme of ["light", "dark"] as const) {
      const scope = THEMES[theme];
      const card = color(scope, "--surface");
      const check = (what: string, fg: Rgb, bg: Rgb) => {
        const r = Math.floor(contrastRatio(fg, bg) * 100) / 100;
        if (r < 3) low.push(`${theme}: ${what} ${r}:1`);
      };
      check("the off switch's edge on the card", colorIn(scope, value(TRACK, "border") || value(TRACK, "border-color") || value(TRACK, "background")), card);
      check("the off switch's knob on the card", colorIn(scope, value(`${TRACK}::after`, "background")), card);
      const knobOn = value(`${ON}::after`, "background") || value(`${TRACK}::after`, "background");
      check("the on switch's knob on its track", colorIn(scope, knobOn), colorIn(scope, value(ON, "background")));
    }
    expect(low).toEqual([]);
  });

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

// A small selector matcher for the cascade tests below. An element is a tag and its classes.
// `may` answers "could this compound selector match it?": it reads the tag, classes, :is(),
// :where() and :not(), and treats any other pseudo-class or [attr] as "could", so it errs
// toward yes. `:not(X)` rules the element out only when X surely matches it (X is only a tag
// and classes).
type El = { tag: string; classes: string[] };
function compoundParts(sel: string) {
  let tag = "";
  const classes: string[] = [];
  const fns: { name: string; args: string[] }[] = [];
  let i = 0;
  const word = () => /^[\w-]*/.exec(sel.slice(i))![0];
  while (i < sel.length) {
    const ch = sel[i];
    if (i === 0 && /[a-z*]/i.test(ch)) {
      tag = ch === "*" ? "" : word();
      i += Math.max(1, tag.length);
    } else if (ch === ".") {
      i++;
      const w = word();
      classes.push(w);
      i += w.length;
    } else if (ch === "[" || ch === ":") {
      let name = "";
      if (ch === ":") {
        i += sel[i + 1] === ":" ? 2 : 1;
        name = word();
        i += name.length;
        if (sel[i] !== "(") continue;
      }
      const close = ch === "[" ? "]" : ")";
      const start = i + 1;
      let depth = 0;
      for (; i < sel.length; i++) {
        if (sel[i] === "(" || sel[i] === "[") depth++;
        else if (sel[i] === ")" || sel[i] === "]") depth--;
        if (depth === 0) break;
      }
      if (close === ")") fns.push({ name, args: splitTop(sel.slice(start, i), ",") });
      i++;
    } else i++;
  }
  return { tag, classes, fns };
}
function surely(sel: string, el: El) {
  const p = compoundParts(sel);
  return /^[\w.-]+$/.test(sel) && (!p.tag || p.tag === el.tag) && p.classes.every((c) => el.classes.includes(c));
}
function may(sel: string, el: El): boolean {
  const p = compoundParts(sel);
  if (p.tag && p.tag !== el.tag) return false;
  if (!p.classes.every((c) => el.classes.includes(c))) return false;
  for (const f of p.fns) {
    if (["is", "where", "matches"].includes(f.name) && !f.args.some((a) => may(a, el))) return false;
    if (f.name === "not" && f.args.some((a) => surely(a, el))) return false;
  }
  return true;
}
// Could `selector` reach `el` through an ancestor in `around` (and only those)? A selector with
// no ancestor isn't about the surroundings, and one that needs any other ancestor (.host-tabs,
// .q__meta) is a team's own part.
function reaches(selector: string, el: El, around: string[]) {
  const parts = splitTop(selector.replace(/\s*([>+~])\s*/g, " "), " ");
  const subject = parts.pop() ?? "";
  return parts.length > 0 && parts.every((p) => /^\.[\w-]+$/.test(p) && around.includes(p.slice(1))) && may(subject, el);
}

describe("cascade: a kit part keeps its own colors wherever a page puts it", () => {
  const rules = Object.entries(SHEETS).flatMap(([file, css]) => parse(css).map((r) => ({ file, ...r })));
  const layered = (r: Rule) => r.at.some((a) => a.startsWith("@layer"));

  it("a filled button inside a Banner keeps the button's word color (DESIGN-spec-2)", () => {
    // <Banner action={<a className="btn" href=...>}>, and the same with btn--danger: the
    // banner's own ink on the green or red fill is 1.3 to 2.7:1. Outlined and quiet buttons
    // take the ink on purpose: they have no fill of their own.
    const filled: El[] = [
      { tag: "a", classes: ["btn"] },
      { tag: "a", classes: ["btn", "btn--danger"] },
      { tag: "button", classes: ["btn"] },
      { tag: "button", classes: ["btn", "btn--danger"] },
    ];
    const wrong = rules.flatMap((r) =>
      r.decls.some(([k]) => k === "color")
        ? r.selectors.filter((s) => filled.some((el) => reaches(s, el, ["banner"]))).map((s) => `${r.file}: ${s}`)
        : [],
    );
    expect(wrong).toEqual([]);
  });

  it("no unlayered team rule under a page's root class restyles a kit Button or tab (DESIGN-risk-2)", () => {
    // Team stylesheets aren't in a layer, so their rules beat the kit whatever the selector:
    // `.host-root button {...}` turned every kit Button on #/host, the danger one included, into
    // host's transparent pill.
    const kit: El[] = [
      { tag: "button", classes: ["btn"] },
      { tag: "button", classes: ["btn", "btn--danger"] },
      { tag: "button", classes: ["tabs__tab"] },
    ];
    const roots = [...new Set(Object.values(SHEETS).flatMap((css) => [...css.matchAll(/\.([\w-]+-root)\b/g)].map((m) => m[1])))];
    expect(roots).toContain("host-root");
    // Turning motion off (host.css's reduced-motion `.host-root *`) is fine on any part.
    const motionOnly = (r: Rule) => r.decls.every(([k]) => /^(transition|animation)/.test(k));
    const wrong = rules
      .filter((r) => r.file.startsWith("teams") && !layered(r) && !motionOnly(r))
      .flatMap((r) => r.selectors.filter((s) => kit.some((el) => reaches(s, el, roots))).map((s) => `${r.file}: ${s}`));
    expect(wrong).toEqual([]);
  });

  it("the matcher reads the selectors those two tests meet", () => {
    const a: El = { tag: "a", classes: ["btn"] };
    expect(reaches(".banner :is(.muted, a)", a, ["banner"])).toBe(true);
    expect(reaches(".banner :is(.muted, a:not(.btn))", a, ["banner"])).toBe(false);
    expect(reaches(".banner :is(.muted, a:not(.btn))", { tag: "a", classes: [] }, ["banner"])).toBe(true);
    expect(reaches(".banner :is(.btn--secondary, .btn--quiet)", a, ["banner"])).toBe(false);
    expect(reaches(".banner :is(.btn--secondary, .btn--quiet)", { tag: "a", classes: ["btn", "btn--quiet"] }, ["banner"])).toBe(true);
    expect(reaches(".card a", a, ["banner"])).toBe(false);
    const b: El = { tag: "button", classes: ["btn", "btn--danger"] };
    expect(reaches(".host-root button", b, ["host-root"])).toBe(true);
    expect(reaches(".host-root > button", b, ["host-root"])).toBe(true);
    expect(reaches(".host-root button:hover:not(:disabled)", b, ["host-root"])).toBe(true);
    expect(reaches(".host-root button:where(:not(.btn, .tabs__tab)):hover:not(:disabled)", b, ["host-root"])).toBe(false);
    expect(reaches(".host-root button.host-main", b, ["host-root"])).toBe(false);
    expect(reaches(".host-root .host-tabs button", b, ["host-root"])).toBe(false);
    expect(reaches(".host-root button[aria-pressed=\"true\"]", b, ["host-root"])).toBe(true);
  });
});
