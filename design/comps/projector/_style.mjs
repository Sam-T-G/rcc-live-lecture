// node _style.mjs <comp.html> <selector> <prop...>: prints computed styles at 1920 x 1080
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const require = createRequire(join(homedir(), 'Documents/repositories/rcc-gdg/node_modules') + '/');
const { chromium } = require('playwright');
const [file, sel, ...props] = process.argv.slice(2);
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
await p.goto(pathToFileURL(resolve(file)).href, { waitUntil: 'networkidle' });
console.log(await p.evaluate(([sel, props]) => [...document.querySelectorAll(sel)].map((el) => props.map((k) => getComputedStyle(el)[k]).join(' | ')).join('\n'), [sel, props]));
await b.close();
