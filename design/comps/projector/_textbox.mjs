// node _textbox.mjs <comp.html> <selector...>: prints the last text run's glyph box (top-bottom) for each match
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
console.log(await p.evaluate((sels) => sels.flatMap((s) => [...document.querySelectorAll(s)].map((el) => {
  const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let t, last; while ((t = w.nextNode())) if (t.textContent.trim()) last = t;
  const r = document.createRange(); r.selectNodeContents(last); const rs = [...r.getClientRects()]; const q = rs[rs.length - 1];
  return `${s}: x ${q.left.toFixed(0)} y ${q.top.toFixed(1)}-${q.bottom.toFixed(1)} fs ${getComputedStyle(last.parentElement).fontSize}`;
})).join('\n'), sels));
await b.close();
