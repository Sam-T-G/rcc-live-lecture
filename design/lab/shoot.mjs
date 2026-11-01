#!/usr/bin/env node
// Screenshots every lab scenario at its area's sizes in light and dark, with render.mjs's checks.
//
//   node design/lab/shoot.mjs --port <port> --out <dir> [--only <area or id prefix>[,...]]
//        [--themes light,dark] [--primary-only] [--strict]
//
// Starts Vite with design/lab/vite.config.ts on 127.0.0.1:<port>, opens each scenario
// (?s=<id>) in headless Playwright, writes <out>/<id>.<size>.<theme>.png and <out>/manifest.json
// (render.mjs's record plus scenario, area and the lab's own findings), blocks every request that
// leaves 127.0.0.1, and stops Vite.
//
// Playwright comes from LAB_PLAYWRIGHT (a node_modules folder that has playwright; default
// rcc-gdg's) and axe-core from LAB_AXE (an axe.min.js; default design/tools/vendor/axe.min.js).
//
// Exit 1 when a scenario fails to load, a click, typing or scroll step fails, it renders a blank
// page, shows an error boundary without expect: "error" (or doesn't show one with it), reads a
// query that has no fixture, or sends a request that leaves 127.0.0.1. Render-check hard failures
// (sideways scroll, axe serious or critical, small text, small targets, page errors) go in the
// manifest and exit 0, since the baseline records today's screens; --strict makes them exit 1 too.
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { homedir } from 'node:os';

const LAB = dirname(fileURLToPath(import.meta.url));
const W = resolve(LAB, '../..');
const PLAYWRIGHT = resolve(process.env.LAB_PLAYWRIGHT || join(homedir(), 'Documents/repositories/rcc-gdg/node_modules'));
const AXE = resolve(process.env.LAB_AXE || join(LAB, '../tools/vendor/axe.min.js'));
if (!existsSync(join(PLAYWRIGHT, 'playwright/package.json'))) {
  console.error(`shoot.mjs: no Playwright at ${join(PLAYWRIGHT, 'playwright')}; set LAB_PLAYWRIGHT to a node_modules folder that has it.`);
  process.exit(3);
}
if (!existsSync(AXE)) {
  console.error(`shoot.mjs: no axe-core at ${AXE}; set LAB_AXE to an axe.min.js.`);
  process.exit(3);
}
const { chromium, webkit } = createRequire(join(PLAYWRIGHT, '/'))('playwright');

// Sizes, floors, targets and engines as design/tools/render.mjs has them.
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
const FLOOR = { phone: 12, phone320: 12, laptop: 12, laptop1280: 12, projector: 32, ipad: 16 };
const TARGET = { phone: 44, phone320: 44, ipad: 44 };
const ENGINE = { phone: 'webkit', ipad: 'webkit', laptop: 'chromium', projector: 'chromium' };
const SURFACE = { phone: 'phone', host: 'laptop', staff: 'laptop', projector: 'projector', kiosk: 'ipad' };

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); if (i < 0) return d; const v = args[i + 1]; args.splice(i, 2); return v; };
const flag = (k) => { const i = args.indexOf(k); if (i < 0) return false; args.splice(i, 1); return true; };
const port = Number(opt('--port'));
const out = opt('--out');
const only = (opt('--only', '') || '').split(',').filter(Boolean);
const themes = opt('--themes', 'light,dark').split(',');
const primaryOnly = flag('--primary-only');
const strict = flag('--strict');
if (!port || !out || args.length) {
  console.error('usage: shoot.mjs --port <port> --out <dir> [--only <area or id prefix>] [--themes light,dark] [--primary-only] [--strict]');
  process.exit(3);
}
if ([5173, 5174, 47123, 47124].includes(port)) { console.error(`port ${port} belongs to the app's own build`); process.exit(3); }
mkdirSync(out, { recursive: true });
// A rerun into the same folder must not keep the last run's failure file.
rmSync(join(out, 'fatal.json'), { force: true });

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
  box: () => ({ sw: document.scrollingElement.scrollWidth, cw: document.documentElement.clientWidth,
    sh: document.scrollingElement.scrollHeight, ch: window.innerHeight }),
  fonts: () => document.fonts.ready.then(() => [...new Set([...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/["']/g, '')))]),
  axe: async () => {
    const r = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] }, resultTypes: ['violations', 'incomplete'] });
    const slim = (v) => ({ id: v.id, impact: v.impact, n: v.nodes.length,
      nodes: v.nodes.slice(0, 3).map((x) => ({ target: x.target.join(' '), summary: (x.failureSummary || '').replace(/\s+/g, ' ').slice(0, 220) })) });
    return { violations: r.violations.map(slim), contrastUnsure: r.incomplete.filter((v) => v.id === 'color-contrast').map(slim) };
  },
  // The lab's own look at the screen: blank, or an error boundary. Only ErrorBoundary's output
  // (src/blocks/ui.tsx) counts: an element marked data-boundary="page" or "part", or the
  // boundary's own markup, which nothing else draws. Page: <main class="page"> with exactly the h1
  // "Something went wrong." and a row of Reload and Go home. Part: <div class="row"> with exactly
  // the error line "<label> didn't load." and the quiet Try again button.
  state: () => {
    const root = document.getElementById('root');
    const text = (root?.innerText || '').trim();
    const blank = !root || (!text && !root.querySelector('img, svg, canvas, iframe, video'));
    const words = (el) => (el?.textContent || '').trim();
    const kids = (el) => [...el.children];
    const pageBoxes = [...document.querySelectorAll('main.page')].filter((m) => {
      const [h, row, ...more] = kids(m);
      return !more.length && h?.matches('h1') && words(h) === 'Something went wrong.' && row?.matches('p.row') &&
        kids(row).map(words).join('|') === 'Reload|Go home';
    });
    const partBoxes = [...document.querySelectorAll('div.row')].filter((d) => {
      const [line, button, ...more] = kids(d);
      return !more.length && line?.matches('p.status.status--error[role=alert]') && /^.{1,80} didn't load\.$/.test(words(line)) &&
        button?.matches('button.btn.btn--quiet[type=button]') && words(button) === 'Try again';
    });
    const marked = [...document.querySelectorAll('[data-boundary]')];
    const page = pageBoxes.length > 0 || marked.some((e) => e.getAttribute('data-boundary') === 'page');
    const parts = [...new Set([
      ...partBoxes.map((d) => words(d.children[0])),
      ...marked.filter((e) => e.getAttribute('data-boundary') === 'part').map((e) => words(e).slice(0, 80)),
    ])];
    const h1 = [...document.querySelectorAll('h1')].map(words);
    return { blank, boundary: page ? 'page' : parts.length ? 'part' : null, parts: parts.slice(0, 4), headline: h1[0] || null };
  },
};

// Types `step.text` into its field as real keystrokes, then submits it. The field is found again
// before each try, and a try counts only when the field still holds the text a moment later: a
// page that draws its form anew (the staff check landing) drops what was typed into the first one.
async function typeStep(page, step) {
  const find = () => (step.label !== undefined ? page.getByLabel(step.label, { exact: true }) : page.locator(step.selector)).first();
  for (let tries = 1; tries <= 3; tries++) {
    const field = find();
    await field.waitFor({ state: 'visible', timeout: 5000 });
    const el = await field.elementHandle();
    await page.waitForTimeout(250);
    if (!(await el.evaluate((x) => x.isConnected))) continue; // drawn anew while we waited
    if ((await field.inputValue()) !== '') await field.clear();
    await field.click({ timeout: 5000 });
    await page.keyboard.type(step.text);
    await page.waitForTimeout(250);
    if ((await find().inputValue().catch(() => null)) !== step.text) continue;
    if (step.submit === true) await find().press('Enter');
    else if (typeof step.submit === 'string') await page.locator(step.submit).first().click({ timeout: 5000 });
    return;
  }
  throw new Error('the field kept no text after 3 tries');
}

// Centers the element when it fits the viewport, else puts its top at the top.
const scrollStep = (page, sel) => page.locator(sel).first().evaluate((el) => {
  const fits = el.getBoundingClientRect().height <= window.innerHeight;
  el.scrollIntoView({ block: fits ? 'center' : 'start', inline: 'nearest', behavior: 'instant' });
}, null, { timeout: 5000 });

// Vite, from the app's own node_modules, on this port only.
process.env.LAB_PORT = String(port);
const vitePath = join(W, 'node_modules/vite/dist/node/index.js');
if (!existsSync(vitePath)) { console.error(`shoot.mjs: no Vite at ${vitePath}; run npm ci in ${W}.`); process.exit(3); }
const { createServer } = await import(pathToFileURL(vitePath).href);
let server;
const browsers = {};
async function stop() {
  for (const b of Object.values(browsers)) await b.close().catch(() => {});
  if (server) await server.close().catch(() => {});
  server = undefined;
}
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { stop().finally(() => process.exit(130)); });

const manifest = [];
const fatal = []; // { scenario, area, reason }
let hardCount = 0;

try {
  server = await createServer({ configFile: join(LAB, 'vite.config.ts'), logLevel: 'warn', server: { port, strictPort: true, host: '127.0.0.1' } });
  await server.listen();
  const base = `http://127.0.0.1:${port}/`;
  console.log(`lab on ${base}`);

  const launch = async (e) => (browsers[e] ||= await (e === 'webkit' ? webkit : chromium).launch({ headless: true }));
  const newContext = async (engine, opts) => {
    const ctx = await (await launch(engine)).newContext({ timezoneId: 'America/Los_Angeles', locale: 'en-US', ...opts });
    const blocked = [];
    await ctx.route('**/*', (route) => {
      const u = new URL(route.request().url());
      if (u.hostname === '127.0.0.1' || u.protocol === 'data:' || u.protocol === 'blob:' || u.protocol === 'about:') return route.continue();
      blocked.push(u.href.slice(0, 120));
      return route.abort('blockedbyclient');
    });
    return { ctx, blocked };
  };
  const waitReady = (page) => page.waitForFunction(() => window.__lab?.ready === true, null, { timeout: 60000 });

  // The scenario list, from the lab page itself (it loads each area file on its own).
  const { ctx: listCtx } = await newContext('chromium', {});
  const listPage = await listCtx.newPage();
  await listPage.goto(base, { waitUntil: 'load', timeout: 60000 });
  await waitReady(listPage);
  const lab = await listPage.evaluate(() => window.__lab);
  await listCtx.close();
  for (const e of lab.errors) {
    if (only.length && !only.some((o) => o === e.area || o.startsWith(e.area + '-'))) continue;
    fatal.push({ scenario: null, area: e.area, reason: `area failed to load: ${e.message}` });
    console.log(`AREA ${e.area}: FAILED TO LOAD ${e.message}`);
  }
  const picked = lab.scenarios.filter((s) => !only.length || only.some((o) => s.area === o || s.id.startsWith(o)));
  console.log(`${picked.length} scenario(s)${only.length ? ` for ${only.join(',')}` : ''}`);
  for (const o of only) {
    const known = lab.scenarios.some((s) => s.area === o || s.id.startsWith(o)) || ['phone', 'host', 'staff', 'projector', 'kiosk'].includes(o);
    if (!known) fatal.push({ scenario: null, area: null, reason: `--only ${o} matches no area or scenario` });
  }

  for (const sc of picked) {
    const surface = SURFACE[sc.area];
    for (const size of SIZES[surface]) {
      if (primaryOnly && !size.primary) continue;
      for (const theme of themes) {
        const engine = ENGINE[surface];
        const { ctx, blocked } = await newContext(engine, { viewport: { width: size.width, height: size.height }, deviceScaleFactor: size.dpr,
          isMobile: engine === 'chromium' ? !!size.mobile : undefined, hasTouch: !!size.mobile, colorScheme: theme, reducedMotion: 'reduce' });
        const page = await ctx.newPage();
        const errors = [];
        const warnings = [];
        page.on('pageerror', (e) => errors.push(`pageerror: ${String(e.message).slice(0, 160)}`));
        page.on('console', (m) => {
          if (m.type() === 'error') errors.push(`console: ${m.text().slice(0, 160)}`);
          else if (m.type() === 'warning' && m.text().startsWith('[lab]')) warnings.push(m.text().slice(0, 160));
        });
        page.on('requestfailed', (r) => { if (!blocked.includes(r.url().slice(0, 120))) errors.push(`requestfailed: ${r.url().slice(0, 120)}`); });
        const rec = { name: sc.id, scenario: sc.id, area: sc.area, title: sc.title, role: sc.role, route: sc.route, expect: sc.expect ?? null,
          surface, size: size.id, theme, engine, primary: size.primary, file: `${base}?s=${sc.id}` };
        const lfatal = [];
        const step = async (what, run) => {
          try {
            await run();
          } catch (e) {
            lfatal.push(`${what} failed: ${String(e.message).split('\n')[0].slice(0, 120)}`);
          }
        };
        try {
          await page.goto(`${base}?s=${encodeURIComponent(sc.id)}`, { waitUntil: 'load', timeout: 60000 });
          await waitReady(page);
          const st = await page.evaluate(() => window.__lab);
          if (st.mode === 'error') lfatal.push(`failed to load: ${st.message}`);
          const s = st.scenario ?? {};
          await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
          for (const sel of s.clicks ?? []) {
            await step(`click ${sel}`, () => page.locator(sel).first().click({ timeout: 5000 }));
            await page.waitForTimeout(300);
          }
          for (const t of s.type ?? []) {
            await step(`type into ${t.label ?? t.selector}`, () => typeStep(page, t));
            await page.waitForTimeout(300);
          }
          if (s.scrollTo) await step(`scroll to ${s.scrollTo}`, () => scrollStep(page, s.scrollTo));
          if (s.tickMs) {
            await page.evaluate((ms) => window.__labTick?.(ms), s.tickMs);
            await page.waitForTimeout(1200); // the page's next 1 s tick reads the new time
          }
          rec.fonts = await page.evaluate(inPage.fonts);
          await page.waitForTimeout(400 + (s.settleMs ?? 0));
          rec.png = join(out, `${sc.id}.${size.id}.${theme}.png`);
          await page.screenshot({ path: rec.png, fullPage: !!s.fullPage });
          rec.state = await page.evaluate(inPage.state);
          const box = await page.evaluate(inPage.box);
          rec.overflowX = box.sw > box.cw + 1 ? `${box.sw} > ${box.cw}` : null;
          rec.belowFold = Math.max(0, box.sh - box.ch);
          rec.text = await page.evaluate(inPage.text, FLOOR[size.id]);
          rec.smallTargets = TARGET[size.id] ? await page.evaluate(inPage.targets, TARGET[size.id]) : [];
          await page.addScriptTag({ path: AXE });
          rec.axe = await page.evaluate(inPage.axe);
        } catch (e) {
          errors.push(`render: ${String(e.message).slice(0, 200)}`);
          lfatal.push(`failed to load: ${String(e.message).slice(0, 160)}`);
        }
        rec.errors = errors.slice(0, 8);
        rec.missingFixtures = warnings.slice(0, 8);
        rec.blocked = blocked.slice(0, 8);
        if (rec.state?.blank) lfatal.push('blank page');
        if (rec.state?.boundary && sc.expect !== 'error') lfatal.push(`error boundary (${rec.state.boundary}${rec.state.parts.length ? ': ' + rec.state.parts.join(' | ') : ''})`);
        if (rec.state && !rec.state.boundary && sc.expect === 'error') lfatal.push('expected an error boundary, none showed');
        if (rec.missingFixtures.length) lfatal.push(`${rec.missingFixtures.length} query(ies) with no fixture: ${rec.missingFixtures.map((w) => w.replace(/^\[lab\] no fixture for (\S+): .*$/, '$1')).join(', ')}`);
        if (rec.blocked.length) lfatal.push(`request(s) left 127.0.0.1: ${rec.blocked.join(', ')}`);
        const hard = [];
        if (rec.overflowX) hard.push(`sideways scroll ${rec.overflowX}`);
        if (rec.text?.smallCount) hard.push(`${rec.text.smallCount} text element(s) under ${FLOOR[size.id]}px (smallest ${rec.text.min}px)`);
        const smallControls = (rec.smallTargets || []).filter((t) => t.kind !== 'inline-link');
        if (smallControls.length) hard.push(`${smallControls.length} control(s) under ${TARGET[size.id]}px`);
        for (const v of rec.axe?.violations || []) if (v.impact === 'serious' || v.impact === 'critical') hard.push(`axe ${v.id} (${v.impact}) x${v.n}`);
        if (errors.some((e) => e.startsWith('pageerror') || e.startsWith('render'))) hard.push('page error');
        rec.hard = hard;
        rec.fatal = lfatal;
        hardCount += hard.length ? 1 : 0;
        for (const reason of lfatal) fatal.push({ scenario: sc.id, area: sc.area, size: size.id, theme, reason });
        manifest.push(rec);
        const tag = lfatal.length ? `FATAL ${lfatal.join('; ')}` : hard.length ? `HARD ${hard.join('; ')}` : 'ok';
        console.log(`${sc.id} ${size.id} ${theme}: ${tag}`);
        await ctx.close();
      }
    }
  }
} catch (e) {
  fatal.push({ scenario: null, area: null, reason: `lab failed: ${String(e?.message || e).slice(0, 300)}` });
  console.error(`lab failed: ${e?.stack || e}`);
} finally {
  await stop();
}

writeFileSync(join(out, 'manifest.json'), JSON.stringify(manifest, null, 1));
if (fatal.length) writeFileSync(join(out, 'fatal.json'), JSON.stringify(fatal, null, 1));
const scen = new Set(manifest.map((r) => r.scenario)).size;
const missing = new Set(manifest.filter((r) => r.missingFixtures.length).map((r) => r.scenario)).size;
const leaked = new Set(manifest.filter((r) => r.blocked.length).map((r) => r.scenario)).size;
console.log(`${manifest.length} render(s) of ${scen} scenario(s): ${fatal.length} fatal (${missing} scenario(s) with missing fixtures, ${leaked} with blocked requests), ${hardCount} with render-check hard failures${strict ? ' (strict)' : ' (recorded, not fatal)'}; manifest ${join(out, 'manifest.json')}`);
process.exit(fatal.length || (strict && hardCount) ? 1 : 0);
