// node _base.mjs <comp.html> <selector...>: prints the alphabetic baseline y of the last text line in each match
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
  const m = document.createElement('span'); m.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline';
  el.appendChild(m); const y = m.getBoundingClientRect().top; m.remove(); return `${s}: ${y.toFixed(1)}`;
})).join('\n'), sels));
await b.close();
