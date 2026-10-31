// WCAG 2 contrast for the app's color tokens (src/styles/tokens.css).
// src/styles/contrast.test.ts measures every pair below in light and dark, straight from the
// stylesheet, and #/ui shows each one with the ratio the browser draws. When a page puts one
// token's words, edge or ring on another token's fill, add the pair here. (A rule that sets both
// `color` and `background` to tokens is also measured on its own: contrast.test.ts reads every
// stylesheet in src/.)

export type Pair = {
  fg: string; // the words, edge or ring: a token name such as "--text"
  bg: string; // the fill it sits on
  // 4.5 for words. 3 for large words (24px, or 19px bold) and for what isn't words but has to be
  // seen: field and button edges, the focus ring, a bar on its track.
  min: 4.5 | 3;
  use: string; // where the app puts it
};

export const PAIRS: Pair[] = [
  { fg: "--text", bg: "--bg", min: 4.5, use: "Words on the page" },
  { fg: "--text", bg: "--surface", min: 4.5, use: "Words in a card" },
  { fg: "--text", bg: "--fill", min: 4.5, use: "Words in a table head, a grey badge or banner, the confirm box" },
  { fg: "--muted", bg: "--bg", min: 4.5, use: "Hints, times and labels on the page" },
  { fg: "--muted", bg: "--surface", min: 4.5, use: "Hints, times and labels in a card" },
  { fg: "--muted", bg: "--fill", min: 4.5, use: "A hint in the confirm box or a table head" },
  { fg: "--accent", bg: "--bg", min: 4.5, use: "Links, quiet buttons, the chosen tab and big numbers on the page" },
  { fg: "--accent", bg: "--surface", min: 4.5, use: "Links, quiet buttons, the chosen tab and big numbers in a card" },
  { fg: "--accent", bg: "--fill", min: 4.5, use: "A quiet button in the confirm box" },
  { fg: "--accent-text", bg: "--accent", min: 4.5, use: "Words on the main button" },
  { fg: "--accent-soft-text", bg: "--accent-soft", min: 4.5, use: "A chosen option, a success banner, a green badge" },
  { fg: "--error", bg: "--bg", min: 4.5, use: "Error words on the page" },
  { fg: "--error", bg: "--surface", min: 4.5, use: "Error words in a card" },
  { fg: "--error-text", bg: "--error", min: 4.5, use: "Words on a danger button" },
  { fg: "--error-soft-text", bg: "--error-soft", min: 4.5, use: "An error line, an error banner, a red badge" },
  { fg: "--live-text", bg: "--live", min: 4.5, use: "The Live badge" },
  { fg: "--warn-text", bg: "--warn", min: 4.5, use: "A warning banner or badge" },
  { fg: "--code-text", bg: "--code-bg", min: 4.5, use: "Code" },
  { fg: "--line-strong", bg: "--bg", min: 3, use: "Field, outline-button, badge and banner edges on the page" },
  { fg: "--line-strong", bg: "--surface", min: 3, use: "Field and outline-button edges in a card" },
  { fg: "--line-strong", bg: "--fill", min: 3, use: "An outline button in the confirm box" },
  { fg: "--focus", bg: "--bg", min: 3, use: "The keyboard focus ring on the page" },
  { fg: "--focus", bg: "--surface", min: 3, use: "The keyboard focus ring in a card" },
  { fg: "--focus", bg: "--fill", min: 3, use: "The keyboard focus ring in the confirm box" },
  { fg: "--focus", bg: "--accent-soft", min: 3, use: "The keyboard focus ring in a success banner" },
  { fg: "--focus", bg: "--warn", min: 3, use: "The keyboard focus ring in a warning banner" },
  { fg: "--focus", bg: "--error-soft", min: 3, use: "The keyboard focus ring in an error banner" },
  { fg: "--accent", bg: "--accent-soft", min: 3, use: "The ring around a chosen option" },
  { fg: "--muted", bg: "--line", min: 3, use: "A result bar on its track (checkin.css .bars)" },
  { fg: "--accent", bg: "--line", min: 3, use: "The right answer's bar on its track (checkin.css .bars)" },
];

export type Rgb = [number, number, number];

// A color as the stylesheet or getComputedStyle writes it: "#1e201e", "#fff", "rgb(30, 32, 30)",
// "rgb(30 32 30)", "rgba(30, 32, 30, 1)" or "color(srgb 0.1 0.2 0.3)". Null for anything else,
// and for a see-through color, which has no contrast of its own.
export function parseColor(text: string): Rgb | null {
  const s = text.trim().toLowerCase();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(s);
  if (hex) {
    const h = hex[1].length === 3 ? [...hex[1]].map((c) => c + c).join("") : hex[1];
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb;
  }
  const fn = /^(rgba?|color)\(\s*(srgb\s+)?([^)]*)\)$/.exec(s);
  if (!fn || (fn[1] === "color") !== !!fn[2]) return null;
  const parts = fn[3].split(/[\s,/]+/).filter(Boolean);
  if (parts.length < 3 || parts.length > 4) return null;
  if (parts.length === 4 && parseFloat(parts[3]) * (parts[3].endsWith("%") ? 0.01 : 1) < 1) return null;
  const scale = fn[1] === "color" ? 255 : 1;
  const rgb = parts.slice(0, 3).map((p) => (p.endsWith("%") ? (parseFloat(p) * 255) / 100 : parseFloat(p) * scale));
  return rgb.some((n) => Number.isNaN(n)) ? null : (rgb.map((n) => Math.round(Math.min(255, Math.max(0, n)))) as Rgb);
}

// Relative luminance, WCAG 2.
export function luminance([r, g, b]: Rgb): number {
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

// The contrast ratio between two colors, from 1 (same) to 21 (black on white).
export function contrastRatio(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

export function toHex([r, g, b]: Rgb): string {
  return "#" + [r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("");
}
