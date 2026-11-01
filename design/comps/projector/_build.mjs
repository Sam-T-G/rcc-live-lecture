// Builds the projector comps from shared parts: node _build.mjs (writes the .html files next to it).
// The sprite (icons and the sample QR) is read from ../../system/kit.html so every comp draws the same glyphs.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const kit = readFileSync(join(here, '../../system/kit.html'), 'utf8');
const sprite = kit.slice(kit.indexOf('<svg width="0"'), kit.indexOf('</svg>', kit.indexOf('<svg width="0"')) + 6);

const icon = (id, cls = 'icon') => `<svg class="${cls}" aria-hidden="true"><use href="#i-${id}"/></svg>`;

const page = (title, body) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="surface" content="projector" />
<title>${title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Google+Sans:ital,opsz,wght@0,17..18,400..700;1,17..18,400..700&family=Google+Sans+Code:wght@400..700&display=swap" />
<link rel="stylesheet" href="../../system/tokens.css" />
<link rel="stylesheet" href="../../system/kit.css" />
<link rel="stylesheet" href="projector.css" />
</head>
<body data-surface="projector">
${sprite}
${body}
</body>
</html>
`;

// ---------------------------------------------------------------- parts
// Round 5: the signature parts from SIGNATURE.md 4, 5, 9, 11, 12, 13, 14, 16 (stage-card count slot, .first,
// .ledger, .lower3, .pnote, .ptab, .lockup, .tally). No pills, chips, eyebrows, dots or grey bars.
const deck = () => {
  const lines = ['Two plates with a gap between them', 'A battery pushes charge onto the plates', 'The plates stop filling when they match the battery'];
  return `<section class="p-deck" aria-label="Slides">
    <h2 class="p-deck__title">Capacitors in a circuit</h2>
    <ul>${lines.map((l) => `<li>${l}</li>`).join('')}</ul>
  </section>`;
};

const qr = `<div class="qr qrcode"><svg role="img" aria-label="QR code for the check-in page"><use href="#qr"/></svg></div>`;

// The count slot is one 192 box in every state (SIGNATURE 4), 48 under the QR: the 240 numeral (line-height .8)
// with "checked in" on its baseline, "Loading" on that same baseline, or the 48 warn glyph and one quiet line.
const card = ({ count = 'n', n = 38, poll = false } = {}) => {
  let slot;
  if (count === 'n') slot = `<p class="stage-card__count"><span class="num">${n}</span><span class="stage-card__label">checked in</span></p>`;
  // round 7: loading names the step in the numeral's place (head size, on the count baseline, no separate label).
  // A failed refresh keeps the last count in --on-field-muted with "checked in" at its usual x; the warning and
  // Try again live only in the presenter note.
  else if (count === 'loading') slot = `<p class="stage-card__count stage-card__count--wait" aria-busy="true"><span class="stage-card__step">Loading</span><span class="sr-only"> the check-in count</span></p>`;
  else slot = `<p class="stage-card__count stage-card__count--stale"><span class="num">${n}</span><span class="stage-card__label">checked in</span></p>`;
  return `<aside class="stage-card${poll ? ' stage-card--poll' : ''}" aria-label="Check-in">
    <div class="stage-card__top"><p class="stage-card__scan">Scan to check in</p><button class="btn stage-card__hide" type="button" aria-label="Hide check-in">${icon('x', 'icon icon--d')}</button></div>
    ${qr}
    ${slot}
  </aside>`;
};

// presenter note: a 6 stage px rule on top, "For the presenter:" with the warn glyph, then the words. No box.
const note = (inner, cls = '') => `<div class="pnote${cls ? ` ${cls}` : ''}" role="status"><p class="pnote__who">${icon('warn', 'icon icon--d')}For the presenter:</p>${inner}</div>`;

// lower third: a band in the bottom-left lane, square corners, a 6 stage px rule on top in the late mark
const late = ({ name = 'Ana', min = 4, more = 0 } = {}) => `<p class="lower3 p-lower3 enter-rise" role="status">${icon('clock', 'icon icon--d p-lower3__glyph')}<span class="p-lower3__line"><b>${name}</b> walked in <span class="num">${min}</span> min late.</span>${more ? `<span class="lower3__more">+<span class="num">${more}</span> more</span>` : ''}</p>`;

const Q = 'What does a capacitor store?';
const CHOICES = [['A', 'Charge', 21, true], ['B', 'Current', 7], ['C', 'Voltage', 4], ['D', 'Resistance', 2]];
const TOTAL = CHOICES.reduce((a, c) => a + c[2], 0);
const pct = (n, t = TOTAL) => (t ? Math.round((100 * n) / t) : 0);

// One panel for every question state: the question on one line, then the count sentence with the state word on
// its baseline at the right, then four ruled rows. Rows keep their y and the letters their x when it ends.
const stateWord = (open) => `<p class="lockup p-poll__state">${open ? icon('clock', 'icon icon--d') + 'Open' : icon('lock', 'icon icon--d') + 'Ended'}</p>`;
const plainRows = () => CHOICES.map(([l, w]) => `<li class="barrow"><span class="letter">${l}</span><span class="barrow__text"><span class="barrow__label"><span class="barrow__name">${w}</span></span></span></li>`).join('\n      ');

const pollOpen = (answered = 14) => `<section class="p-poll p-poll--open" aria-labelledby="pq">
    <h2 class="p-poll__q" id="pq">${Q}</h2>
    <div class="p-poll__line"><p class="tally p-poll__tally"><span class="num tally__lead">${answered}</span><span class="p-poll__of">answered</span></p>${stateWord(true)}</div>
    <ul class="bars" aria-label="Choices">
      ${plainRows()}
    </ul>
  </section>`;

const endedRows = (counts) => CHOICES.map(([l, w, , right], i) => {
  const n = counts[i];
  const t = counts.reduce((a, b) => a + b, 0);
  return `<li class="barrow${right ? ' is-right' : ''}"><span class="letter">${l}</span><span class="barrow__text"><span class="barrow__label"><span class="barrow__name">${w}</span>${right ? `<span class="barrow__tag">${icon('check', 'icon icon--d')}Right answer</span>` : ''}<span class="barrow__n"><span class="num">${n}</span>${right && t ? '<span class="barrow__pct" aria-hidden="true"></span>' : `<span class="barrow__pct">${pct(n, t)}%</span>`}</span></span><span class="barrow__track"><span class="barrow__fill" style="--f:${t ? (n / t).toFixed(3) : 0}"></span></span></span></li>`;
}).join('\n      ');

// ended: the reveal. none: nobody answered, so "No answers" takes the numeral's place and every row reads 0.
const pollEnded = ({ none = false } = {}) => {
  const counts = none ? CHOICES.map(() => 0) : CHOICES.map((c) => c[2]);
  const [, , rn] = CHOICES.find((c) => c[3]);
  const tally = none
    ? `<p class="tally p-poll__tally p-poll__tally--none"><span class="num tally__lead">0</span><span class="p-poll__of">answered</span></p>`
    : `<p class="tally p-poll__tally"><span class="num tally__lead">${pct(rn)}%</span><span class="p-poll__of">${rn} of ${TOTAL} right</span></p>`;
  return `<section class="p-poll p-poll--ended" aria-labelledby="pq">
    <h2 class="p-poll__q" id="pq">${Q}</h2>
    <div class="p-poll__line">${tally}${stateWord(false)}</div>
    <ul class="bars" aria-label="Answers">
      ${endedRows(counts)}
    </ul>
  </section>`;
};

// ended, results fetch failed: "Results unavailable" at head size with the warn glyph takes the count line, the
// choices stay with no numbers, and the presenter's Try again sits in a note at the panel's foot
const pollEndedError = () => `<section class="p-poll p-poll--ended p-poll--err" aria-labelledby="pq">
    <h2 class="p-poll__q" id="pq">${Q}</h2>
    <div class="p-poll__line"><p class="tally p-poll__tally p-poll__tally--err" role="status">${icon('warn', 'icon icon--d')}<span class="tally__lead">Results unavailable</span></p>${stateWord(false)}</div>
    <ul class="bars" aria-label="Choices">
      ${plainRows()}
    </ul>
    ${note(`<p>The results didn’t load.</p><button class="btn pnote__act" type="button">${icon('repeat', 'icon icon--d')}Try again</button>`, 'pnote--row p-poll__note')}
  </section>`;

const stage = (inner, label = 'Projector stage') => `<main class="stage" aria-label="${label}">
  ${inner}
</main>`;

// ---------------------------------------------------------------- leaderboard
const TEAMS = [
  ['Orange', 'orange', 6, '2.0', 3, 5], ['Teal', 'teal', 5, '1.7', 3, 3], ['Purple', 'purple', 4, '1.3', 3, 1],
  ['Navy', 'navy', 4, '1.0', 4, 0], ['Pink', 'pink', 2, '0.7', 3, 0], ['Brown', 'brown', 1, '0.3', 3, 0],
  ['Gray', 'gray', 1, '0.3', 3, 0], ['Lime', 'lime', 1, '0.3', 4, 0], ['Green', 'green', 0, '0.0', 3, 0], ['Yellow', 'yellow', 0, '0.0', 4, 0],
];
const ord = (n) => n + (n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th');
const title = ({ lock = true } = {}) => `<header class="lbtitle"><h1>Team leaderboard</h1>${lock ? `<p class="lockup lockup--plain"><span class="lbtitle__after">After 2 quizzes.</span>${icon('lock')}Teams are final.</p>` : ''}</header>`;
// round 6: "After 2 quizzes." moved up beside "Teams are final." so the scoring line holds one line in the footnote
// slot and the many-teams line fits under it inside the 96 frame
const first = ([name, c, right, per, students, ec]) => `<section class="first" aria-label="1st place">
      <p class="first__rank">1<span class="first__ord">st</span></p>
      <p class="first__team"><span class="team-swatch team__chip" style="--c:var(--team-${c})"></span>${name}</p>
      <p class="first__credit">+${ec} extra credit</p>
      <p class="first__line"><b>${per}</b> per student<br /><b>${right}</b> right, <b>${students}</b> students</p>
    </section>`;
const HEAD = `<div class="ledger__head" aria-hidden="true"><span class="n">Place</span><span>Team</span><span class="n">Right</span><span class="n">Per student</span><span class="n">Extra credit</span></div>`;
const row = ([name, c, right, per, , ec], i) => `<div class="ledger__row" role="listitem"><span class="n ledger__place" aria-label="${ord(i + 2)} place">${i + 2}</span><span class="team"><span class="team-swatch team__chip" style="--c:var(--team-${c})"></span>${name}</span><span class="n" aria-label="${right} right">${right}</span><span class="n" aria-label="${per} per student">${per}</span>${ec ? `<span class="n ln--credit" aria-label="${ec} extra credit">+${ec}</span>` : `<span class="n ln--zero" aria-label="no extra credit">0</span>`}</div>`;
const RULE = 'Teams rank by points per student: 1st place gets 5 extra credit, 2nd gets 3, 3rd gets 1.';

// round 6: the ledger always holds places 2 to 6 at 104 (5 rows), so the 1st panel and every rule keep one height
// in every state. More teams go into the footnote slot as its second line, never into the grid.
const ledger = (rows, { busy = false } = {}) => `<div class="ledger"${busy ? ' aria-busy="true"' : ''}>
        ${HEAD}
        <div role="list" aria-label="Places 2 and down" class="ledger__rows">
        ${rows}
        </div>
      </div>`;

// the grid and the footnote slot ride in one column from y 216, so the slot sits 48 under the last rule
const body = (grid, lines) => `<div class="lbbody">
    <div class="lbgrid">
    ${grid}
    </div>
    <div class="lbfoot">${lines.map((l) => `<p>${l}</p>`).join('')}</div>
  </div>`;

const board = (teams, { more = 0 } = {}) => `${title()}
  ${body(`${first(teams[0])}
    ${ledger(teams.slice(1, 6).map(row).join('\n        '))}`, [RULE, ...(more ? [`Plus ${more} more teams. Your phone shows your team’s place.`] : [])])}`;

// loading and empty share the populated frame. The 1st panel waits on the raised rung with "1st" muted and the
// step named at 48 in ink; the ledger keeps its head and five numbered rules.
const waitFirst = (label, words, live) => `<section class="first first--wait" aria-label="${label}">
      <p class="first__rank">1<span class="first__ord">st</span></p>
      <p class="first__wait"${live ? ' role="status"' : ''}>${words}</p>
    </section>`;
const emptyRows = (cells) => [2, 3, 4, 5, 6].map((p) => `<div class="ledger__row ledger__row--empty" role="listitem"><span class="n ledger__place">${p}</span><span></span>${cells}</div>`).join('\n        ');
// loading: each number is an en dash in --muted (SIGNATURE 13); no grey bars
const DASHES = '<span class="n ledger__dash" aria-hidden="true">–</span>'.repeat(3);
const boardLoading = () => `${title({ lock: false })}
  ${body(`${waitFirst('1st place, loading', 'Loading the scores', true)}
    ${ledger(emptyRows(DASHES), { busy: true })}`, [RULE])}`;

// empty: the same frame with no numbers; why it is empty sits in the footnote slot above the scoring line
const boardEmpty = () => `${title({ lock: false })}
  ${body(`${waitFirst('No teams yet', 'No teams yet.', false)}
    ${ledger(emptyRows('<span></span><span></span><span></span>'))}`, ['Each student joins a team when they check in.', RULE])}`;

// ---------------------------------------------------------------- the comps
const comps = {
  // PR-03 / PR-04: the first minutes of class. The count is the one number.
  'projector-stage-checkin': ['Stage check-in', stage(`${deck()}\n  ${card()}`)],
  'projector-stage-checkin--loading': ['Stage count loading', stage(`${deck()}\n  ${card({ count: 'loading' })}`)],
  // PR-10: the count failed; the room sees one quiet line, the presenter gets Try again in the note lane
  'projector-stage-checkin--error': ['Stage count error', stage(`${deck()}\n  ${card({ count: 'error' })}\n  ${note(`<p>The check-in count didn’t load.</p><button class="btn pnote__act" type="button">${icon('repeat', 'icon icon--d')}Try again</button>`, 'pnote--row')}`)],
  // PR-07: the professor hid the card; the card folded to a tab docked at the right edge
  'projector-stage-checkin--hidden': ['Stage card hidden', stage(`${deck()}\n  <button class="ptab p-show" type="button">Show check-in</button>`)],
  // PR-05: a question is open; the poll panel is the green field
  'projector-stage-quiz-open': ['Stage quiz open', stage(`${pollOpen()}\n  ${card({ poll: true })}`)],
  'projector-stage-quiz-open--empty': ['Stage quiz no answers yet', stage(`${pollOpen(0)}\n  ${card({ poll: true })}`)],
  // PR-06: the reveal
  'projector-stage-quiz-ended': ['Stage quiz ended', stage(`${pollEnded()}\n  ${card({ poll: true })}`)],
  'projector-stage-quiz-ended--none': ['Stage quiz no answers', stage(`${pollEnded({ none: true })}\n  ${card({ poll: true })}`)],
  'projector-stage-quiz-ended--error': ['Stage results error', stage(`${pollEndedError()}\n  ${card({ poll: true })}`)],
  // PR-09: a late arrival, with two more queued
  'projector-stage-late': ['Stage late arrival', stage(`${deck()}\n  ${card({ n: 41 })}\n  ${late({ more: 2 })}`)],
  // PR-08: the presenter's problem, in the bottom-left lane, clear of the slide
  'projector-stage-setup': ['Stage setup note', stage(`${deck()}\n  ${card()}\n  ${note('<p>Phones aren’t getting these slides. Open this page from the full link again.</p>')}`)],
  // PR-01: no deck in the link yet; the slide column says so and holds the note where the slide would be
  'projector-stage-setup--no-deck': ['Stage no deck', stage(`<section class="p-nodeck"><h1 class="p-nodeck__title">No slides yet</h1></section>\n  ${note('<p>Add this to this page’s link:</p><p><code>?deck=&lt;your deck’s address&gt;</code></p>')}\n  ${card({ n: 12 })}`)],
  // PR-22: up to 6 teams
  'projector-leaderboard': ['Team leaderboard', stage(board(TEAMS.slice(0, 6)), 'Team leaderboard')],
  // PR-23 / PR-24: 12 teams in the class, the top 6 shown, the rest named in the footnote slot
  'projector-leaderboard--many': ['Leaderboard many teams', stage(board(TEAMS, { more: 6 }), 'Team leaderboard')],
  // PR-20, PR-21
  'projector-leaderboard--loading': ['Leaderboard loading', stage(boardLoading(), 'Team leaderboard')],
  'projector-leaderboard--empty': ['Leaderboard empty', stage(boardEmpty(), 'Team leaderboard')],
};

for (const [id, [title, body]] of Object.entries(comps)) writeFileSync(join(here, `${id}.html`), page(title, body));
console.log(`wrote ${Object.keys(comps).length} comps`);
