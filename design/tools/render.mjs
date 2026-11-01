#!/usr/bin/env node
// Screenshot HTML comps (or URLs) at each surface's sizes in light and dark, and run the fixed checks.
//
//   node render.mjs --out <dir> [--themes light,dark] [--engine chromium|webkit] [--primary-only] <file.html|dir> ...
//   node render.mjs --out <dir> --surface phone --name <name> <http url>
//
// A comp file names its surface in <meta name="surface" content="phone|laptop|projector|ipad">. A directory means
// every .html file in it. Phone and iPad render in WebKit (Safari's engine), laptop and projector in Chromium,
// unless --engine says otherwise. Writes <out>/<name>.<size>.<theme>.png and <out>/manifest.json, prints one line
// per render, and exits 1 when any render has a hard failure (sideways scroll, a serious or critical axe violation,
// text under the size floor, a button or field under the tap-target minimum, a page error).
//
// Playwright comes from LAB_PLAYWRIGHT (a node_modules folder that has playwright; default
// rcc-gdg's) and axe-core from LAB_AXE (an axe.min.js; default vendor/axe.min.js next to this file).
import { createRequire } from 'node:module';
import { existsSync, readFileSync, readdirSync, mkdirSync, writeFileSync, statSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { homedir } from 'node:os';

const PLAYWRIGHT = resolve(process.env.LAB_PLAYWRIGHT || join(homedir(), 'Documents/repositories/rcc-gdg/node_modules'));
const AXE = resolve(process.env.LAB_AXE || fileURLToPath(new URL('./vendor/axe.min.js', import.meta.url)));
if (!existsSync(join(PLAYWRIGHT, 'playwright/package.json'))) {
  console.error(`render.mjs: no Playwright at ${join(PLAYWRIGHT, 'playwright')}; set LAB_PLAYWRIGHT to a node_modules folder that has it.`);
  process.exit(3);
}
if (!existsSync(AXE)) {
  console.error(`render.mjs: no axe-core at ${AXE}; set LAB_AXE to an axe.min.js.`);
  process.exit(3);
}
const { chromium, webkit } = createRequire(join(PLAYWRIGHT, '/'))('playwright');

const SIZES = {
  phone: [
    { id: 'phone', width: 390, height: 844, dpr: 2, mobile: true, primary: true },
    { id: 'phone320', width: 320, height: 693, dpr: 2, mobile: true, primary: false },
  ],
  laptop: [
    { id: 'laptop', width: 1440, height: 900, dpr: 1, primary: true },
    { id: 'laptop1280', width: 1280, height: 800, dpr: 1, primary: false },
  ],
  projector: [{ id: 'projector', width: 1920, height: 1080, dpr: 1, primary: true }],
  ipad: [{ id: 'ipad', width: 820, height: 1180, dpr: 1, mobile: true, primary: true }],
};
// Smallest text allowed per size (px). Projector follows the GDG presentation.md ledger floor.
const FLOOR = { phone: 12, phone320: 12, laptop: 12, laptop1280: 12, projector: 32, ipad: 16 };
// Tap targets (px) for buttons and fields on touch surfaces (DESIGN-BRIEF: 44 x 44).
const TARGET = { phone: 44, phone320: 44, ipad: 44 };
const ENGINE = { phone: 'webkit', ipad: 'webkit', laptop: 'chromium', projector: 'chromium' };

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); if (i < 0) return d; const v = args[i + 1]; args.splice(i, 2); return v; };
const flag = (k) => { const i = args.indexOf(k); if (i < 0) return false; args.splice(i, 1); return true; };
const outArg = opt('--out');
const out = outArg && resolve(outArg);
const themes = opt('--themes', 'light,dark').split(',');
const engineOverride = opt('--engine');
const urlSurface = opt('--surface');
const urlName = opt('--name');
const primaryOnly = flag('--primary-only');
if (!out || !args.length) { console.error('usage: render.mjs --out <dir> [--themes light,dark] [--engine e] [--primary-only] <file|dir|url> ...'); process.exit(3); }
mkdirSync(out, { recursive: true });

const pages = [];
for (const a of args) {
  if (/^https?:/.test(a)) {
    if (!urlSurface || !urlName) { console.error('a URL needs --surface and --name'); process.exit(3); }
    pages.push({ url: a, name: urlName, surface: urlSurface });
    continue;
  }
  const p = resolve(a);
  const files = statSync(p).isDirectory() ? readdirSync(p).filter((f) => f.endsWith('.html')).sort().map((f) => join(p, f)) : [p];
  for (const f of files) {
    const m = readFileSync(f, 'utf8').match(/<meta\s+name=["']surface["']\s+content=["'](\w+)["']/i);
    if (!m || !SIZES[m[1]]) { console.error(`${f}: no <meta name="surface" content="phone|laptop|projector|ipad">`); process.exit(3); }
    pages.push({ url: pathToFileURL(f).href, name: basename(f, '.html'), surface: m[1], file: f });
  }
}

const inPage = {
  text: (floor) => {
    const small = []; let min = Infinity; const seen = new Set();
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      const el = n.parentElement;
      if (!n.textContent.trim() || !el || seen.has(el)) continue;
      seen.add(el);
      const cs = getComputedStyle(el); const r = el.getBoundingClientRect();
      if (cs.visibility === 'hidden' || cs.display === 'none' || r.width === 0 || r.height === 0) continue;
      if (el.closest('.sr-only, .visually-hidden')) continue;
      const px = parseFloat(cs.fontSize); min = Math.min(min, px);
      if (px < floor) small.push({ px, text: n.textContent.trim().slice(0, 40) });
    }
    return { min: min === Infinity ? null : min, small: small.slice(0, 6), smallCount: small.length };
  },
  targets: (minPx) => {
    const sel = 'button, input:not([type=hidden]), select, textarea, [role=button], [role=tab], [role=switch], [role=checkbox], [role=radio], a[href]';
    const bad = [];
    for (const el of document.querySelectorAll(sel)) {
      const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
      if (r.width === 0 || r.height === 0 || cs.visibility === 'hidden') continue;
      if (r.width >= minPx && r.height >= minPx) continue;
      const inline = el.tagName === 'A' && el.closest('p, li') !== null;
      bad.push({ w: Math.round(r.width), h: Math.round(r.height), kind: inline ? 'inline-link' : el.tagName.toLowerCase(),
        label: (el.getAttribute('aria-label') || el.innerText || el.value || '').trim().slice(0, 30) });
    }
    return bad;
  },
  // RUBRIC blocker 5: the stage count reads from the back row at 160px or more, in every state (added in round 5,
  // after the count shrank in quiz states in rounds 1 and 5). Largest digit run inside each visible count.
  stageCount: () => [...document.querySelectorAll('.stage-card__count, [data-stage-count]')].flatMap((el) => {
    const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
    if (r.width === 0 || r.height === 0 || cs.display === 'none' || cs.visibility === 'hidden') return [];
    let max = 0; const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) if (/\d/.test(n.textContent) && n.parentElement) max = Math.max(max, parseFloat(getComputedStyle(n.parentElement).fontSize));
    return max ? [Math.round(max)] : [];
  }),
  box: () => ({ sw: document.scrollingElement.scrollWidth, cw: document.documentElement.clientWidth,
    sh: document.scrollingElement.scrollHeight, ch: window.innerHeight }),
  fonts: () => document.fonts.ready.then(() => [...new Set([...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/["']/g, '')))]),
  axe: async () => {
    const r = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] }, resultTypes: ['violations', 'incomplete'] });
    const slim = (v) => ({ id: v.id, impact: v.impact, n: v.nodes.length,
      nodes: v.nodes.slice(0, 3).map((x) => ({ target: x.target.join(' '), summary: (x.failureSummary || '').replace(/\s+/g, ' ').slice(0, 220) })) });
    return { violations: r.violations.map(slim), contrastUnsure: r.incomplete.filter((v) => v.id === 'color-contrast').map(slim) };
  },
};

const browsers = {};
const launch = async (e) => (browsers[e] ||= await (e === 'webkit' ? webkit : chromium).launch({ headless: true }));
const manifest = [];
let hardCount = 0;

for (const pg of pages) {
  for (const size of SIZES[pg.surface]) {
    if (primaryOnly && !size.primary) continue;
    for (const theme of themes) {
      const engine = engineOverride || ENGINE[pg.surface];
      const browser = await launch(engine);
      const ctx = await browser.newContext({ viewport: { width: size.width, height: size.height }, deviceScaleFactor: size.dpr,
        isMobile: engine === 'chromium' ? !!size.mobile : undefined, hasTouch: !!size.mobile, colorScheme: theme, reducedMotion: 'reduce' });
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(`pageerror: ${String(e.message).slice(0, 160)}`));
      page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text().slice(0, 160)}`); });
      page.on('requestfailed', (r) => errors.push(`requestfailed: ${r.url().slice(0, 120)}`));
      const rec = { name: pg.name, surface: pg.surface, size: size.id, theme, engine, primary: size.primary, file: pg.file || pg.url };
      try {
        await page.goto(pg.url, { waitUntil: 'networkidle', timeout: 30000 });
        rec.fonts = await page.evaluate(inPage.fonts);
        await page.waitForTimeout(250);
        rec.png = join(out, `${pg.name}.${size.id}.${theme}.png`);
        await page.screenshot({ path: rec.png });
        const box = await page.evaluate(inPage.box);
        rec.overflowX = box.sw > box.cw + 1 ? `${box.sw} > ${box.cw}` : null;
        rec.belowFold = Math.max(0, box.sh - box.ch);
        rec.text = await page.evaluate(inPage.text, FLOOR[size.id]);
        rec.smallTargets = TARGET[size.id] ? await page.evaluate(inPage.targets, TARGET[size.id]) : [];
        rec.stageCount = pg.surface === 'projector' ? await page.evaluate(inPage.stageCount) : [];
        await page.addScriptTag({ path: AXE });
        rec.axe = await page.evaluate(inPage.axe);
      } catch (e) {
        errors.push(`render: ${String(e.message).slice(0, 200)}`);
      }
      rec.errors = errors.slice(0, 8);
      const hard = [];
      if (rec.overflowX) hard.push(`sideways scroll ${rec.overflowX}`);
      if (rec.text?.smallCount) hard.push(`${rec.text.smallCount} text element(s) under ${FLOOR[size.id]}px (smallest ${rec.text.min}px)`);
      const smallControls = (rec.smallTargets || []).filter((t) => t.kind !== 'inline-link');
      if (smallControls.length) hard.push(`${smallControls.length} control(s) under ${TARGET[size.id]}px`);
      const smallCount = (rec.stageCount || []).filter((px) => px < 160);
      if (smallCount.length) hard.push(`stage count at ${smallCount.join(', ')}px, under 160px (RUBRIC blocker 5)`);
      for (const v of rec.axe?.violations || []) if (v.impact === 'serious' || v.impact === 'critical') hard.push(`axe ${v.id} (${v.impact}) x${v.n}`);
      if (errors.some((e) => e.startsWith('pageerror') || e.startsWith('render'))) hard.push('page error');
      rec.hard = hard;
      hardCount += hard.length ? 1 : 0;
      manifest.push(rec);
      console.log(`${pg.name} ${size.id} ${theme}: ${hard.length ? 'HARD ' + hard.join('; ') : 'ok'}`);
      await ctx.close();
    }
  }
}
for (const b of Object.values(browsers)) await b.close();
writeFileSync(join(out, 'manifest.json'), JSON.stringify(manifest, null, 1));
console.log(`${manifest.length} render(s), ${hardCount} with hard failures; manifest ${join(out, 'manifest.json')}`);
process.exit(hardCount ? 1 : 0);
