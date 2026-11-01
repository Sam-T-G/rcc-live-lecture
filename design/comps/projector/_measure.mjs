// node _measure.mjs <comp.html> [selector ...]: prints each selector's box at 1920 x 1080 and flags anything outside the 96 frame.
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const require = createRequire(join(homedir(), 'Documents/repositories/rcc-gdg/node_modules') + '/');
const { chromium } = require('playwright');
const [file, ...sels] = process.argv.slice(2);
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
await p.goto(pathToFileURL(resolve(file)).href, { waitUntil: 'networkidle' });
const out = await p.evaluate((sels) => {
  const r = [];
  const all = sels.length ? sels : ['.stage-card', '.stage-card .qr', '.stage-card__count', '.stage-card__count .num', '.p-poll', '.p-late .late', '.presenter-note', '.lb-top', '.leader', '.board', '.lb-foot', '.board__more', '.p-deck__title', '.p-show', '.lb-empty'];
  for (const s of all) for (const el of document.querySelectorAll(s)) {
    const b = el.getBoundingClientRect(); if (!b.width) continue;
    const out = b.left < 95.5 || b.top < 95.5 || b.right > 1824.5 || b.bottom > 984.5;
    r.push(`${s.padEnd(26)} x ${b.left.toFixed(0)}-${b.right.toFixed(0)}  y ${b.top.toFixed(0)}-${b.bottom.toFixed(0)}  ${b.width.toFixed(0)}x${b.height.toFixed(0)}${out ? '  OUTSIDE FRAME' : ''}  fs ${getComputedStyle(el).fontSize}`);
  }
  return r;
}, sels);
console.log(out.join('\n'));
await b.close();
