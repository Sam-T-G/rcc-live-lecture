#!/usr/bin/env node
// Build one contact sheet per theme from render.mjs manifests: every primary-size render as a labeled tile,
// grouped by surface, so a judge sees the whole app on one image.
//
//   node contact.mjs --out <dir> [--themes light,dark] <manifest.json> ...
//
// Writes <out>/contact-<theme>.png (and the .html it was shot from). Exits 1 when no manifest has a render.
// Playwright comes from LAB_PLAYWRIGHT (a node_modules folder that has playwright; default rcc-gdg's).
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { basename, dirname, join, isAbsolute, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { homedir } from 'node:os';

const PLAYWRIGHT = resolve(process.env.LAB_PLAYWRIGHT || join(homedir(), 'Documents/repositories/rcc-gdg/node_modules'));
if (!existsSync(join(PLAYWRIGHT, 'playwright/package.json'))) {
  console.error(`contact.mjs: no Playwright at ${join(PLAYWRIGHT, 'playwright')}; set LAB_PLAYWRIGHT to a node_modules folder that has it.`);
  process.exit(3);
}
const { chromium } = createRequire(join(PLAYWRIGHT, '/'))('playwright');

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); if (i < 0) return d; const v = args[i + 1]; args.splice(i, 2); return v; };
const out = opt('--out');
const themes = opt('--themes', 'light,dark').split(',');
if (!out || !args.length) { console.error('usage: contact.mjs --out <dir> [--themes light,dark] <manifest.json> ...'); process.exit(3); }
mkdirSync(out, { recursive: true });

// PNGs sit beside their manifest; a manifest written with a relative --out still finds them there.
const recs = args.flatMap((m) => (existsSync(m) ? JSON.parse(readFileSync(m, 'utf8')).map((r) => ({ ...r,
    png: r.png && (isAbsolute(r.png) && existsSync(r.png) ? r.png : join(dirname(m), basename(r.png))) })) : []))
  .filter((r) => r.primary && r.png && existsSync(r.png));
if (!recs.length) { console.error('no primary renders in the manifests given'); process.exit(1); }

const ORDER = ['phone', 'ipad', 'laptop', 'projector'];
const WIDTH = { phone: 220, ipad: 300, laptop: 560, projector: 560 };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const browser = await chromium.launch({ headless: true });
for (const theme of themes) {
  const rows = ORDER.map((s) => recs.filter((r) => r.surface === s && r.theme === theme)).filter((g) => g.length);
  const html = `<!doctype html><meta charset="utf-8"><style>
    body{margin:0;padding:24px;background:${theme === 'dark' ? '#111' : '#eee'};color:${theme === 'dark' ? '#eee' : '#111'};font:14px system-ui}
    h2{font-size:16px;margin:16px 0 8px}.row{display:flex;flex-wrap:wrap;gap:16px;align-items:flex-start}
    figure{margin:0}img{display:block;border:1px solid #8888}figcaption{margin-top:4px;max-width:560px;overflow-wrap:anywhere}
    .hard{color:#c00;font-weight:600}</style>
    ${rows.map((g) => `<h2>${esc(g[0].surface)} (${theme})</h2><div class="row">${g.map((r) => `<figure><img src="${pathToFileURL(r.png).href}" width="${WIDTH[r.surface]}"><figcaption>${esc(r.name)}${r.hard?.length ? ` <span class="hard">HARD: ${esc(r.hard.join('; '))}</span>` : ''}</figcaption></figure>`).join('')}</div>`).join('')}`;
  const file = join(out, `contact-${theme}.html`);
  writeFileSync(file, html);
  const page = await browser.newPage({ viewport: { width: 2400, height: 1200 } });
  await page.goto(pathToFileURL(file).href, { waitUntil: 'load' });
  await page.screenshot({ path: join(out, `contact-${theme}.png`), fullPage: true });
  await page.close();
  console.log(`${join(out, `contact-${theme}.png`)}: ${rows.reduce((n, g) => n + g.length, 0)} tile(s)`);
}
await browser.close();
