// Writes every kiosk comp in comps/kiosk from the shared pieces below. Nobody edits the .html files by hand:
// edit system/tokens.css, system/kit.css, kiosk.css or this file, then run  node <D>/comps/kiosk/src/gen.mjs
// Each comp names its three sheets with <link> tags, and this script swaps each tag for the sheet's current text.
// Why: WebKit gives every file:// page its own origin, so axe's stylesheet read of a linked sheet throws
// "access control checks", which render.mjs counts as a hard page error (tested 2026-10-31, round 2).
import { readFileSync, writeFileSync } from 'node:fs';
const K = new URL('..', import.meta.url).pathname;
const SYS = new URL('../../../system/', import.meta.url).pathname;
const SHEETS = { '../../system/tokens.css': SYS + 'tokens.css', '../../system/kit.css': SYS + 'kit.css', 'kiosk.css': K + 'kiosk.css' };
const inline = (html) => Object.entries(SHEETS).reduce((t, [href, path]) => t.replace(`<link rel="stylesheet" href="${href}" />`,
  `<style data-src="${href}">/* generated from ${href} by src/gen.mjs; edit that file */\n${readFileSync(path, 'utf8')}</style>`), html);

const ICONS = {
  camera: '<path d="M208 208H48a16 16 0 0 1-16-16V80a16 16 0 0 1 16-16h32l16-24h64l16 24h32a16 16 0 0 1 16 16v112a16 16 0 0 1-16 16Z"/><circle cx="128" cy="132" r="36"/>',
  'camera-off': '<line x1="48" y1="40" x2="208" y2="216"/><path d="M216 202.2V80a16 16 0 0 0-16-16h-32l-16-24H104"/><path d="M76 64H48a16 16 0 0 0-16 16v112a16 16 0 0 0 16 16h152"/><path d="M103 107.4a36 36 0 0 0 46.6 51.3"/>',
  check: '<polyline points="40 144 96 200 224 72"/>',
  checks: '<polyline points="8 136 48 176 128 96"/><polyline points="108 156 128 176 248 56"/>',
  clock: '<circle cx="128" cy="128" r="96"/><polyline points="128 72 128 128 184 128"/>',
  corners: null,
  door: '<path d="M56 224V40a8 8 0 0 1 8-8h128a8 8 0 0 1 8 8v184"/><line x1="24" y1="224" x2="232" y2="224"/><line x1="160" y1="128" x2="160" y2="132"/>',
  ipad: '<rect x="56" y="24" width="144" height="208" rx="16"/><line x1="112" y1="196" x2="144" y2="196"/>',
  repeat: '<polyline points="24 56 24 104 72 104"/><path d="M67.6 192A88 88 0 1 0 65.8 65.8L24 104"/>',
  scan: '<polyline points="176 40 216 40 216 80"/><polyline points="80 216 40 216 40 176"/><polyline points="216 176 216 216 176 216"/><polyline points="40 80 40 40 80 40"/>',
  stop: '<rect x="56" y="56" width="144" height="144" rx="16"/>',
  x: '<line x1="200" y1="56" x2="56" y2="200"/><line x1="200" y1="200" x2="56" y2="56"/>',
  lock: '<rect x="40" y="88" width="176" height="128" rx="8"/><path d="M88 88V56a40 40 0 0 1 80 0v32"/>',
  refresh: '<polyline points="184 104 232 104 232 56"/><path d="M188.4 192a88 88 0 1 1 1.8-126.2L232 104"/>',
};
const CORNERS = '<symbol id="i-corners" viewBox="0 0 100 75"><path d="M2 14V2h12M86 2h12v12M98 61v12H86M14 73H2V61" fill="none" stroke="currentColor" vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="round" style="stroke-width:6px"/></symbol>';
const ic = (n, cls = 'icon') => `<svg class="${cls}" aria-hidden="true"><use href="#i-${n}"/></svg>`;

function page({ title, note, names, body }) {
  const syms = names.map((n) => n === 'corners' ? CORNERS : `<symbol id="i-${n}" viewBox="0 0 256 256">${ICONS[n]}</symbol>`).join('\n  ');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="surface" content="ipad" />
<title>${title}</title>
<!-- ${note} -->
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Google+Sans:ital,opsz,wght@0,17..18,400..700;1,17..18,400..700&family=Google+Sans+Code:wght@400..700&display=swap" />
<link rel="stylesheet" href="../../system/tokens.css" />
<link rel="stylesheet" href="../../system/kit.css" />
<link rel="stylesheet" href="kiosk.css" />
</head>
<body data-surface="kiosk">
<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false">
  ${syms}
</svg>
${body}
</body>
</html>
`;
}

const GSI = '<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>';

// ---- door parts (SIGNATURE.md 6, 7, 10, 11, 14).
// Round 7: one geometry in every door state. The panel is two grid rows: the status band, fixed at
// 432 * --k-u, and the camera window in the rest (minmax(0, 1fr)), inset 24 on three sides. Start,
// loading, scan, reading, blocked and every result keep the window at the same box, so nothing moves
// on a scan (kiosk-craft-6-1, kiosk-visual-6-2, kiosk-use-6-11). A result floods the whole panel, so
// the flood frames the window and the band holds the words; no empty field is left.
const bar = (count, open = false) => `  <header class="k-bar">
    <h1 class="sr-only">Check-in kiosk</h1>
    <button class="k-staffbtn" type="button" aria-haspopup="menu" aria-expanded="${open}">${ic('lock')}<span>Staff<span class="sr-only">, press and hold</span></span></button>
    <p class="roomn"><span class="roomn__n${count === null ? ' pend' : ''}">${count === null ? '––' : count}</span><span class="roomn__l">checked in</span></p>
    <p class="k-bar__door">${ic('door')}A-210 door</p>
  </header>`;
// The strip: the field in the code face with the pass code's grouping as its placeholder, and
// Check in as its own 64 button with a 2px ring and 700 words, so it reads as a button (kiosk-use-6-5).
const strip = (label = 'Code on your pass', disabled = false) => `  <form class="door__strip" onsubmit="return false">
    <label class="k-label" for="code">${label}</label>
    <div class="codein">
      <input class="input input--code" id="code" inputmode="numeric" autocomplete="off" placeholder="000 000"${disabled ? ' disabled aria-disabled="true"' : ''} />
      <button class="codein__go" type="submit" aria-disabled="true">Check in</button>
    </div>
  </form>`;
const TARGET = `<span class="target"><svg viewBox="0 0 100 100" aria-hidden="true"><polyline points="0 22 0 0 22 0"/><polyline points="78 0 100 0 100 22"/><polyline points="100 78 100 100 78 100"/><polyline points="22 100 0 100 0 78"/></svg></span>`;
// The camera window. In the comp a flat --cam fill stands in for the live video, which replaces it in phase 2.
const camOn = `    <div class="door__cam" role="img" aria-label="Camera on">${TARGET}</div>`;
// Start: the window itself is the button, same box as the live camera, dark --cam with a 4px
// --cam-mark-ok ring and the camera glyph over "Start check-in" in --cam-mark-ok. No green flood,
// so the full green fill means only "Checked in" (kiosk-visual-6-3).
const camStart = `    <button class="door__cam camstart" type="button"><span class="camstart__do">${ic('camera', 'icon icon--d')}<span>Start check-in</span></span></button>`;
// Blocked: the same window with the camera-off glyph; "Start check-in" (the app's retry, KI-16) stays the button.
const camBlocked = `    <button class="door__cam camstart camstart--off" type="button"><span class="camstart__do">${ic('camera-off', 'icon icon--d')}<span>Start check-in</span></span></button>`;
// Loading: the same window as a sunken --well with the camera glyph in --muted, disabled. No bar:
// nothing is measured, so nothing implies progress (kiosk-use-6-7, kiosk-craft-6-7).
const camWait = `    <div class="door__cam camstart camstart--wait" aria-disabled="true"><span class="camstart__do">${ic('camera', 'icon icon--d')}</span></div>`;
const door = ({ count = 38, panel = '', status, win, label, menu = '', busy = false, stripOff = false, kind = 'prompt' }) => `<div class="door${menu ? ' door--menu' : ''}"${busy ? ' aria-busy="true"' : ''}>
${bar(count, !!menu)}
  <main class="door__panel${panel}">
    <section class="door__status door__status--${kind}" role="status" aria-live="polite">
${status}
    </section>
${win}
  </main>
${strip(label, stripOff)}${menu}
</div>`;
const lock = (glyph, word, cls = '') => `      <p class="lockup door__word${cls}">${ic(glyph, 'icon icon--d')}${word}</p>`;
const prompt = (t, sub = '') => `      <p class="door__prompt">${t}</p>${sub ? `\n      <p class="door__sub">${sub}</p>` : ''}`;
// Staff menu: an overlay under the bar on --overlay with --shadow-2; a real scrim element (no pseudo)
// dims the panel and strip, which keep their place (kiosk-use-5-4).
const MENU = `
  <div class="k-scrim" aria-hidden="true"></div>
  <div class="k-menu" role="menu" aria-label="Staff">
    <button class="k-menu__row k-menu__row--stop" type="button" role="menuitem">${ic('stop', 'icon icon--d')}Stop camera</button>
    <button class="k-menu__row" type="button" role="menuitem">${ic('x')}Close</button>
  </div>`;

const comps = {
  'kiosk-start': {
    title: 'Check-in kiosk', note: '#/checkin/kiosk, KI-10 with KI-18: paired door iPad, camera off. Same band and window as the scan state: the band already says what to do, and the window itself is the Start button, dark with a light green ring, so green fill stays the Checked in color. "Or type the code on your pass" joins two app strings [copy].',
    names: ['lock', 'door', 'camera'],
    body: door({ status: prompt('Hold your pass up to the camera'), win: camStart, label: 'Or type the code on your pass' }),
  },
  'kiosk-start--loading': {
    title: 'Check-in kiosk', note: '#/checkin/kiosk, KI-01 + KI-18 loading: the real frame, two en dashes in the count slot (SIGNATURE 14), the step named in the band at the prompt size, the window as a sunken well with the camera glyph, field and Check in disabled. No progress bar: nothing is measured.',
    names: ['lock', 'door', 'camera'],
    body: door({ count: null, busy: true, stripOff: true, status: prompt('Checking this iPad…'), win: camWait, panel: ' door__panel--wait', label: 'Or type the code on your pass' }),
  },
  'kiosk-scan': {
    title: 'Check-in kiosk', note: '#/checkin/kiosk, KI-12: camera on, idle. The state students walk past. The prompt fills the band; the window keeps the same box in every state.',
    names: ['lock', 'door'],
    body: door({ status: prompt('Hold your pass up to the camera'), win: camOn }),
  },
  'kiosk-scan--reading': {
    title: 'Check-in kiosk', note: '#/checkin/kiosk, between KI-12 and a result: a pass was read and the server has not answered. The corners go solid green, the window takes a 6px green ring, and "Hold still" sits under the prompt; nothing moves [copy: "Reading your pass" and "Hold still" are new].',
    names: ['lock', 'door'],
    body: door({ panel: ' door__panel--reading', status: prompt('Reading your pass', 'Hold still'), win: camOn }),
  },
  'kiosk-scan--staff': {
    title: 'Check-in kiosk', note: '#/checkin/kiosk, KI-12 after a staff member held the Staff control for 1s: the menu lies over the panel under the bar, a scrim dims the rest, and nothing under it moves.',
    names: ['lock', 'door', 'stop', 'x'],
    body: door({ menu: MENU, status: prompt('Hold your pass up to the camera'), win: camOn }),
  },
  'kiosk-scan--camera-blocked': {
    title: 'Check-in kiosk', note: '#/checkin/kiosk, KI-16: camera error. Drawn as a result: the red flood, the x and "Camera blocked" on the status rows, the fix on the name rows. The window keeps its box with the camera-off glyph and the app\'s retry, Start check-in; the code strip under it is the other way in.',
    names: ['lock', 'door', 'camera-off', 'x'],
    body: door({ kind: 'result', panel: ' door__panel--stop door__panel--result', status: `${lock('x', 'Camera blocked')}
      <p class="door__reason">Allow it in the browser's address bar.</p>`, win: camBlocked, label: 'Or type the code on your pass' }),
  },
  'kiosk-checked-in': {
    title: 'Check-in kiosk', note: '#/checkin/kiosk, KI-13: scan ok, held 3s, then back to the scan prompt. The panel turns green around the same camera window; the word, then the name at 80, sit on fixed rows at the band\'s foot. The count ticks 38 to 39.',
    names: ['lock', 'door', 'check'],
    body: door({ kind: 'result', count: 39, panel: ' door__panel--in door__panel--result', status: `${lock('check', 'Checked in')}
      <p class="door__name">Ivy Sample</p>`, win: camOn }),
  },
  'kiosk-already': {
    title: 'Check-in kiosk', note: '#/checkin/kiosk, KI-14: already checked in, held 3s. "Already checked in" at the same 96 as every status word, wrapping to two lines in the word slot; double check, pale green field; the name and the first scan time (fake) on the same rows as Checked in.',
    names: ['lock', 'door', 'checks'],
    body: door({ kind: 'result', count: 39, panel: ' door__panel--already door__panel--result', status: `${lock('checks', 'Already checked in')}
      <p class="door__name">Ivy Sample</p>
      <p class="door__fact">First scanned at 2:31 PM</p>`, win: camOn }),
  },
  'kiosk-refused': {
    title: 'Check-in kiosk', note: '#/checkin/kiosk, KI-15: refusal, held 3s. Full red panel around the same window, "Try again" on the word row, the app sentence at 40 across the name and detail rows at the band\'s full width.',
    names: ['lock', 'door', 'x'],
    body: door({ kind: 'result', panel: ' door__panel--stop door__panel--result', status: `${lock('x', 'Try again')}
      <p class="door__reason">That code is old. Open your pass again and hold it up.</p>`, win: camOn }),
  },
};

// Pairing: no card. The page is the surface on the 24 gutter. Round 7: the code, its time rule, the
// time line and the instruction are one group as wide as the code, centered in the space above the
// sign-in footer (kiosk-visual-6-6, kiosk-craft-6-8). The code is one run, two groups .3em apart
// (kiosk-visual-6-5, kiosk-craft-6-4). Fixed head and after slots keep the code still when it expires.
const pairShell = (head, code, after) => `<div class="pairpage">
  <header class="k-bar">
    <h1 class="k-bar__title">${ic('ipad')}Pair this iPad</h1>
  </header>
  <main class="pair__body" aria-labelledby="pair-label">
    <div class="pair__group">
${head}
      <p class="pair__code${code.old ? ' pair__code--old' : ''}"${code.desc || ''}><span>482</span><span>913</span></p>
      <div class="pair__after">
${after}
      </div>
      <p class="pair__how">A professor or admin types this code on <b>#/admin</b>, under Pair a door iPad. Then this iPad scans passes.</p>
    </div>
  </main>
  <section class="pair__or" aria-label="Or sign in">
    <p>Scanners can sign in here instead of pairing.</p>
    <button class="gsi" type="button">${GSI}Continue with Google</button>
  </section>
</div>`;
comps['kiosk-pair-code'] = {
  title: 'Pair this iPad', note: '#/checkin/kiosk, KI-03: unpaired iPad, code waiting. The code group is centered above the footer; the bar under the code is the time left (set by JS once a minute, never animated) with its minutes written at the right [copy: "9 min left" is new].',
  names: ['ipad', 'clock'],
  body: pairShell('      <p class="pair__head pair__label" id="pair-label">Pairing code</p>', { desc: ' aria-describedby="pair-ends"' },
    `        <span class="pair__rule" style="--left: 64%" aria-hidden="true"><span></span></span>
        <p class="pair__until" id="pair-ends"><span>${ic('clock')}The code works until 2:51 PM.</span><span class="pair__left">9 min left</span></p>`),
};
comps['kiosk-pair-code--expired'] = {
  title: 'Pair this iPad', note: '#/checkin/kiosk, KI-04: the pairing code ran out. Same slots: "The code expired." takes the label slot, the old code stays put, each group struck through its own glyphs, and Get a new code takes the time slot.',
  names: ['ipad', 'repeat', 'x'],
  body: pairShell(`      <p class="pair__head lockup pair__expired" id="pair-label" role="status">${ic('x', 'icon icon--d')}The code expired.</p>`, { old: true },
    `        <button class="btn btn--primary btn--k" type="button">${ic('repeat', 'icon icon--d')}Get a new code</button>`),
};

for (const [id, c] of Object.entries(comps)) writeFileSync(K + id + '.html', inline(page(c)));
console.log('wrote', Object.keys(comps).join(' '));
