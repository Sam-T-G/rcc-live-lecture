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

  // The design system's rungs and parts (docs/design.md "Contrast").
  { fg: "--text", bg: "--page", min: 4.5, use: "Words on the page" },
  { fg: "--text", bg: "--well", min: 4.5, use: "Words in a well: rows, tables, readouts" },
  { fg: "--text", bg: "--raised", min: 4.5, use: "Words in a card, a table head, a field" },
  { fg: "--text", bg: "--bar", min: 4.5, use: "A neutral badge, a letter tile" },
  { fg: "--text", bg: "--overlay", min: 4.5, use: "A sheet, a confirm" },
  { fg: "--text", bg: "--chrome", min: 4.5, use: "The app bar, the phone's action bar, the kiosk bar" },
  { fg: "--text", bg: "--on-raised", min: 4.5, use: "A letter tile or a selected row inside a card" },
  { fg: "--muted", bg: "--page", min: 4.5, use: "Hints, times and labels on the page" },
  { fg: "--muted", bg: "--well", min: 4.5, use: "A table's muted cells, a waiting line in a side panel" },
  { fg: "--muted", bg: "--raised", min: 4.5, use: "A table head, a readout label in a card" },
  { fg: "--muted", bg: "--bar", min: 4.5, use: "A hint on a neutral fill" },
  { fg: "--muted", bg: "--chrome", min: 4.5, use: "The whoami line and the bar's page links" },
  { fg: "--muted", bg: "--neutral-btn", min: 4.5, use: "A disabled button's words (the neutral fill)" },
  { fg: "--text", bg: "--neutral-btn", min: 4.5, use: "Words on .btn--neutral (I'm lost on the field's screens)" },
  { fg: "--accent", bg: "--raised", min: 4.5, use: "The live number, a link, the current tab rule in a card" },
  { fg: "--accent", bg: "--page", min: 4.5, use: "The live number or a link on the page" },
  { fg: "--accent", bg: "--well", min: 4.5, use: "The lead readout in a well" },
  { fg: "--on-accent", bg: "--accent", min: 4.5, use: "Words on the one filled button" },
  { fg: "--on-accent-soft", bg: "--accent-soft", min: 4.5, use: "Words on a tonal fill" },
  { fg: "--on-tonal", bg: "--tonal", min: 4.5, use: "Words on .btn--tonal" },
  { fg: "--line-strong", bg: "--raised", min: 3, use: "Field and outline-button edges in a card" },
  { fg: "--line-strong", bg: "--page", min: 3, use: "Field and outline-button edges on the page" },
  { fg: "--line-strong", bg: "--well", min: 3, use: "An outline in a well" },
  { fg: "--on-field", bg: "--field", min: 4.5, use: "Words on the color field" },
  { fg: "--on-field-muted", bg: "--field", min: 4.5, use: "The perforation and a muted line on the field" },
  { fg: "--on-field-tile", bg: "--field-tile", min: 4.5, use: "Answer tile words on the field" },
  { fg: "--on-field-tile", bg: "--field-letter", min: 4.5, use: "The letter in its well on a tile on the field" },
  { fg: "--st-stop-mark", bg: "--field-tile", min: 3, use: "The failed tile's ring and the inset error's glyph" },
  { fg: "--on-tile-out", bg: "--tile-out", min: 4.5, use: "Words on a tile left out after sending" },
  { fg: "--on-out-letter", bg: "--out-letter", min: 4.5, use: "The letter on a tile left out after sending" },
  { fg: "--on-field-btn", bg: "--field-btn", min: 4.5, use: "Words on the button on a field" },
  { fg: "--on-st-in", bg: "--st-in", min: 4.5, use: "Right, sent, paired, added" },
  { fg: "--st-in-mark", bg: "--st-in", min: 3, use: "The check on a right or added state" },
  { fg: "--on-st-open", bg: "--st-open", min: 4.5, use: "Private, sign-in ending, needs you" },
  { fg: "--st-open-mark", bg: "--st-open", min: 3, use: "The clock or lock on an open state" },
  { fg: "--on-st-stop", bg: "--st-stop", min: 4.5, use: "Refused, failed, a field error, a Status error" },
  { fg: "--st-stop-mark", bg: "--st-stop", min: 3, use: "The warning glyph on a failed state" },
  { fg: "--on-st-wait", bg: "--st-wait", min: 4.5, use: "Ended, already checked in, waiting" },
  { fg: "--st-wait-mark", bg: "--st-wait", min: 3, use: "The glyph on a waiting state" },
  { fg: "--on-st-stop-fill", bg: "--st-stop-fill", min: 4.5, use: "The kiosk's refused and camera-blocked flood" },
  { fg: "--on-error", bg: "--error", min: 4.5, use: "Words on the danger button in a confirm" },
  { fg: "--on-warn", bg: "--warn", min: 4.5, use: "The late banner" },
  { fg: "--cam-mark-ok", bg: "--cam", min: 3, use: "The camera's corner marks on a read, Start check-in" },
  { fg: "--cam-mark", bg: "--cam", min: 4.5, use: "The camera's still corners; Start check-in's glyph and words inside a result's flood" },
  { fg: "--st-in-mark", bg: "--accent-soft", min: 3, use: "The repeat glyph on the door's Already checked in flood" },
  { fg: "--qr-ink", bg: "--qr-tile", min: 4.5, use: "A QR code on its plate" },
  { fg: "--bar-rest", bg: "--track", min: 3, use: "A poll bar that isn't the lead or the right answer, on its track" },
  { fg: "--bar-rest", bg: "--on-raised", min: 3, use: "The same bar on its track inside a card" },
  { fg: "--accent", bg: "--track", min: 3, use: "The right answer's bar on its track" },
  { fg: "--accent", bg: "--on-raised", min: 3, use: "The right answer's bar on its track inside a card" },
  { fg: "--focus", bg: "--page", min: 3, use: "The keyboard focus ring on the page" },
  { fg: "--focus", bg: "--raised", min: 3, use: "The keyboard focus ring in a card" },
  { fg: "--focus", bg: "--well", min: 3, use: "The keyboard focus ring in a well" },
  ...(["red", "green", "orange", "purple", "pink", "teal", "brown", "gray", "navy", "lime", "blue"] as const).map((t) => ({
    fg: "--on-team",
    bg: `--team-${t}`,
    min: 4.5 as const,
    use: `Words on the ${t} team's color (the team badge)`,
  })),
  { fg: "--on-team-yellow", bg: "--team-yellow", min: 4.5, use: "Words on the yellow team's color (the team badge)" },
  ...(["red", "yellow", "green", "orange", "purple", "pink", "teal", "brown", "gray", "navy", "lime", "blue"] as const).flatMap((t) =>
    (["--page", "--well", "--raised"] as const).map((bg) => ({ fg: `--team-${t}`, bg, min: 3 as const, use: `The ${t} team's chip on ${bg.slice(2)}` })),
  ),
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
