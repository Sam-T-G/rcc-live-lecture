// Writes staff-gate.html, staff-gate-loading.html, staff-gate-refused.html (round 7). Run: node src/gate.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '..');
const head = readFileSync(join(here, 'gate.head'), 'utf8');
const gsi = readFileSync(join(here, 'gsi.txt'), 'utf8').trim();
const A = '../../system/assets/';

const BASE = 'Round 7 locked console: no bar while signed out. The two columns sit centered in the window. Logo: the horizontal light lockup at 360 wide in light, the stacked dark lockup at 144 tall in dark (bright-lines: no light file on a dark ground), 16 above the independence sentence, which breaks into two even lines. Title 40/700, then the gate sentence and its action. Staff pages is one sunken well with the three pages as rows; the current page lifts one rung.';

const rows = `<ul class="gatec__rows">
        <li class="gatec__row is-here" aria-current="page"><span class="gatec__name">Attendance<span class="sr-only"> (this page)</span></span><span class="gatec__what">Scan passes and see who checked in.</span></li>
        <li class="gatec__row"><span class="gatec__name">Ask a question or start a vote</span><span class="gatec__what">Run quizzes and votes during class.</span></li>
        <li class="gatec__row"><span class="gatec__name">Admin</span><span class="gatec__what">Add staff and pair door iPads. Admins only.</span></li>
      </ul>`;

const states = {
  'staff-gate': {
    note: '#/checkin/teacher signed out, SH-12 + SH-05. Google\'s button at 48 with the one shadow on the page.',
    door: `<p class="gatec__lede">Sign in with the Google account your admin added.</p>
    <div class="gatec__act"><button class="gsi" type="button">${gsi}</button></div>`,
    sub: '<span class="lsec__sub"><svg class="icon" aria-hidden="true"><use href="#i-lock"/></svg>Sign in to open them.</span>',
  },
  'staff-gate-loading': {
    note: 'SH-11 loading. The button\'s 48 slot holds one line, "Checking your Google sign-in.", over a 4px sunken rule the button\'s width. Nothing moves, nothing loops. Staff pages shows no sub line until the check resolves.',
    door: `<p class="gatec__lede">Sign in with the Google account your admin added.</p>
    <div class="gatec__act"><div class="gatec__wait" role="status"><p>Checking your Google sign-in.</p><span class="gatec__rule" aria-hidden="true"></span></div></div>`,
    sub: '',
  },
  'staff-gate-refused': {
    note: 'SH-16 signed in with Google, not on the staff list. The address in 700 inside the sentence; Copy address and Sign out sit 16 under the instruction they carry out. Staff pages stays the same list as signed out.',
    door: `<div class="gatec__msg" role="status">
      <p class="lockup lockup--plain"><svg class="icon" aria-hidden="true"><use href="#i-lock"/></svg><b>ivy@example.edu</b> isn’t on the staff list.</p>
      <p>Ask an admin to add you on #/admin.</p>
      <p class="gatec__next">Send this address to an admin, then sign in again.</p>
    </div>
    <div class="cluster gatec__acts"><button class="btn btn--raised gatec__copy" type="button" aria-live="polite"><svg class="icon" aria-hidden="true"><use href="#i-copy"/></svg>Copy address</button><button class="btn btn--outline" type="button">Sign out</button></div>`,
    sub: '<span class="lsec__sub"><svg class="icon" aria-hidden="true"><use href="#i-lock"/></svg>Your account can’t open them yet.</span>',
  },
};

for (const [id, st] of Object.entries(states)) {
  const h = head.replace(/<!--.*-->\n?$/s, '') + `<!-- ${st.note} ${BASE} -->\n`;
  const html = `${h}</head>
<body>
<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false">
  <symbol id="i-lock" viewBox="0 0 256 256"><rect x="40" y="88" width="176" height="128" rx="8"/><path d="M88 88V56a40 40 0 0 1 80 0v32"/></symbol>
  <symbol id="i-copy" viewBox="0 0 256 256"><rect x="88" y="88" width="128" height="128" rx="8"/><path d="M168 88V48a8 8 0 0 0-8-8H48a8 8 0 0 0-8 8v112a8 8 0 0 0 8 8h40"/></symbol>
</svg>
<main class="gatec">
  <section class="gatec__door" aria-labelledby="h-gate">
    <div class="gatec__brand">
      <div class="gatec__logo"><img class="gate__logo-l" src="${A}gdg-on-campus-horizontal-light.svg" alt="GDG on Campus Riverside City College" width="360" height="73" /><img class="gate__logo-d" src="${A}gdg-on-campus-stacked-dark.svg" alt="GDG on Campus Riverside City College" width="104" height="144" /></div>
      <p class="indep">GDG on Campus Riverside City College is an independent group; our activities and the opinions expressed here should in no way be linked to Google, the corporation.</p>
    </div>
    <h1 id="h-gate">Attendance</h1>
    ${st.door}
  </section>
  <section class="lsec gatec__map" aria-labelledby="h-map">
    <div class="lsec__head"><h2 class="card-title" id="h-map">Staff pages</h2>${st.sub}</div>
    ${rows}
  </section>
</main>
</body>
</html>
`;
  writeFileSync(join(out, id + '.html'), html);
  console.log('wrote', id);
}
