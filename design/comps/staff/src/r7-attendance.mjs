// Round 7 one-shot transform of the five attendance comps (run once from this folder's parent).
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = join(dirname(fileURLToPath(import.meta.url)), '..');
const files = ['staff-attendance-list', 'staff-attendance-list--empty', 'staff-attendance-scan', 'staff-attendance-scan--already', 'staff-attendance-scan--error'];

const CLOCK = '<symbol id="i-clock" viewBox="0 0 256 256"><circle cx="128" cy="128" r="96"/><polyline points="128 72 128 128 184 128"/></symbol>';
const TARGET = '<span class="cam__dim" aria-hidden="true"><svg viewBox="0 0 100 100"><polyline points="0 22 0 0 22 0"/><polyline points="78 0 100 0 100 22"/><polyline points="100 78 100 100 78 100"/><polyline points="22 100 0 100 0 78"/></svg></span>';
const CAMICON = '<svg class="icon" aria-hidden="true"><use href="#i-camera"/></svg>';

for (const f of files) {
  const p = join(dir, f + '.html');
  let s = readFileSync(p, 'utf8');
  if (s.includes('r7-done')) continue;
  s = s.replace('<!-- #/checkin', '<!-- r7-done. #/checkin');
  // clock symbol for the late column
  if (!s.includes('id="i-clock"')) s = s.replace('<symbol id="i-check"', CLOCK + '\n  <symbol id="i-check"');
  // late minutes: clock glyph before the words
  s = s.replace(/class="ln ln--late end">\+/g, 'class="ln ln--late end"><svg class="icon ln__clock" aria-hidden="true"><use href="#i-clock"/></svg>+');
  // Remove in the action column of every register row (shown on hover or focus)
  s = s.replace(/<div class="ruled__row([^"]*)" role="row"><span role="cell">((?:<svg[^>]*>.*?<\/svg>)?)([^<]+)<\/span>(.*?)<span role="cell" class="end"><\/span><\/div>/g,
    (m, cls, mark, name, mid) => `<div class="ruled__row${cls}" role="row"><span role="cell">${mark}${name}</span>${mid}<span role="cell" class="end"><button class="btn btn--ghost btn--sm reg__rm" type="button">Remove<span class="sr-only"> ${name}</span></button></span></div>`);
  // the confirm replaces Jo's row in place, one 44 row
  s = s.replace(/<div class="ruled__row is-dim" role="row">.*?<\/div>\s*<div class="reg__confirm" role="row">.*?<\/span><\/div>/s,
    '<div class="ruled__row reg__confirm" role="row"><span role="cell" class="reg__q"><svg class="icon" aria-hidden="true"><use href="#i-warn"/></svg>Remove Jo Sample?</span><span role="cell" class="cluster"><button class="btn btn--sm reg__cancel" type="button">Cancel</button><button class="btn btn--sm btn--danger-solid" type="button">Remove</button></span></div>');
  // idle camera: compact, dimmed target beside the line and the button
  s = s.replace('<div class="cam cam--idle"><div class="cam__msg"><p>Scan a pass or type its code.</p>',
    `<div class="cam cam--idle">${TARGET}<div class="cam__msg"><p>Scan a pass or type its code.</p>`);
  // camera blocked: the warn container, and a button that says it retries
  s = s.replace(/<div class="cam cam--idle cam--blocked">.*?<\/button><\/div><\/div>/s,
    `<div class="cam cam--blocked" role="alert"><div class="cam__msg"><div><p class="lockup"><svg class="icon icon--d" aria-hidden="true"><use href="#i-warn"/></svg>Camera blocked.</p><p class="cam__sub">Allow it in the browser's address bar.</p></div><button class="btn btn--sm cam__retry" type="button">${CAMICON}Try camera again</button></div></div>`);
  writeFileSync(p, s);
  console.log('ok', f);
}
