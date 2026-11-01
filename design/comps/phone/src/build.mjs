// Builds the phone comps from comps/phone/src into comps/phone.
// Sources link ../../system/tokens.css, ../../system/kit.css and phone.css. Playwright WebKit (the phone
// renderer) blocks linked file:// stylesheets ("Cross origin requests are only supported for HTTP", round 2
// retest), so each <link> becomes a generated <style data-src> marked with its source; never edit that copy.
// Rebuild after any change to tokens.css, kit.css, phone.css or a source:  node comps/phone/src/build.mjs
// Tokens in sources: @@icon:name@@ (@@icond:name@@ at stroke 32) (Phosphor Bold geometry, as kit.html draws it), @@QR@@ (comp-only
// QR pattern, not scannable), @@part:name@@ (src/parts/name.html).
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const SRC = new URL('.', import.meta.url).pathname;
const OUT = resolve(SRC, '..');
const DESIGN = resolve(OUT, '../..');

const ICON = {
  check: '<polyline points="40 144 96 200 224 72"/>',
  x: '<line x1="200" y1="56" x2="56" y2="200"/><line x1="200" y1="200" x2="56" y2="56"/>',
  up: '<polyline points="48 160 128 80 208 160"/>',
  lock: '<rect x="40" y="88" width="176" height="128" rx="8"/><path d="M88 88V56a40 40 0 0 1 80 0v32"/>',
  clock: '<circle cx="128" cy="128" r="96"/><polyline points="128 72 128 128 184 128"/>',
  warn: '<path d="M128 32 240 216H16Z"/><line x1="128" y1="104" x2="128" y2="144"/><line x1="128" y1="180" x2="128" y2="182"/>',
  info: '<circle cx="128" cy="128" r="96"/><polyline points="116 120 128 120 128 176 140 176"/><line x1="128" y1="84" x2="128" y2="86"/>',
  signin: '<polyline points="94 170 136 128 94 86"/><line x1="24" y1="128" x2="136" y2="128"/><path d="M136 40h56a8 8 0 0 1 8 8v160a8 8 0 0 1-8 8h-56"/>',
  left: '<line x1="216" y1="128" x2="40" y2="128"/><polyline points="112 56 40 128 112 200"/>',
  right: '<line x1="40" y1="128" x2="216" y2="128"/><polyline points="144 56 216 128 144 200"/>',
  inbox: '<rect x="40" y="40" width="176" height="176" rx="8"/><polyline points="40 152 84 152 100 176 156 176 172 152 216 152"/>',
  down: '<polyline points="208 96 128 176 48 96"/>',
  repeat: '<polyline points="24 56 24 104 72 104"/><path d="M67.6 192A88 88 0 1 0 65.8 65.8L24 104"/>',
};
const icon = (n, d = false) => {
  if (!ICON[n]) throw new Error(`no icon ${n}`);
  return `<svg class="icon${d ? ' icon--d' : ''}" viewBox="0 0 256 256" aria-hidden="true">${ICON[n]}</svg>`;
};
// The comp QR: direction 1's 29x29 pattern with a 4-module quiet zone (work/qr.svg), black on white.
const qrPath = readFileSync(join(DESIGN, 'directions/1/work/qr.svg'), 'utf8').match(/<path[^>]*d="([^"]+)"/)[1];
const qr = (label) => `<svg viewBox="0 0 37 37" role="img" aria-label="${label}" shape-rendering="crispEdges"><rect width="37" height="37" fill="#fff"/><path fill="#000" d="${qrPath}"/></svg>`;

const fonts = `<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Google+Sans:ital,GRAD,opsz,wght@0,-50..200,17..18,400..700;1,-50..200,17..18,400..700&family=Google+Sans+Code:ital,wght@0,400..700;1,400..700&display=swap" onload="document.fonts && document.fonts.load('700 40px &quot;Google Sans Code&quot;', '0123456789')" />`;

const inline = (html) => html.replace(/<link rel="stylesheet" href="([^"]+\.css)"\s*\/?>/g, (_, href) =>
  `<style data-src="${href}">/* generated from ${href} by src/build.mjs; edit that file */\n${readFileSync(resolve(OUT, href), 'utf8')}\n</style>`);

let n = 0;
for (const f of readdirSync(SRC).filter((x) => x.endsWith('.html'))) {
  let t = readFileSync(join(SRC, f), 'utf8');
  for (let i = 0; i < 3 && /@@part:/.test(t); i++)  // parts may hold parts (slide-row-lost holds lost-note)
    t = t.replace(/@@part:([\w-]+)@@/g, (_, p) => readFileSync(join(SRC, 'parts', `${p}.html`), 'utf8').trim());
  t = t.replace('@@FONTS@@', fonts);
  t = t.replace(/@@QR@@/g, () => qr('QR code for Ivy Sample’s pass'));
  t = t.replace(/@@icon:(\w+)@@/g, (_, i) => icon(i));
  t = t.replace(/@@icond:(\w+)@@/g, (_, i) => icon(i, true));  // stroke 32, beside 700 words (SIGNATURE 11)
  t = inline(t);
  if (/@@/.test(t)) throw new Error(`${f}: unreplaced token`);
  writeFileSync(join(OUT, f), t);
  n++;
}
console.log(`built ${n} comp(s) into ${OUT}`);
