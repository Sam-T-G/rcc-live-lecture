// Builds the host comps from shared parts: node _build.mjs (writes the .html files next to it).
// Round 5: one console that fills the window; every part is a signature part from system/SIGNATURE.md (slide track,
// ruled list, ledger numerals, state lockup, pending and empty frames). No stat tiles, badges, seals, skeletons
// or wells around lists. The icon sprite is read from ../../system/kit.html so every comp draws the same glyphs.
// Fake data only: made-up first names, a made-up physics class.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const kit = readFileSync(join(here, '../../system/kit.html'), 'utf8');
const s0 = kit.indexOf('<svg width="0"');
const spriteKit = kit.slice(s0, kit.indexOf('</svg>', s0) + 6);
// kit_request: an overflow glyph (three round-cap dots on the 256 grid, no fills) for a row's "more actions" button
const sprite = spriteKit.replace('</svg>', '  <symbol id="i-more" viewBox="0 0 256 256"><path d="M60 128h0M128 128h0M196 128h0"/></symbol>\n</svg>');
const icon = (id, cls = '') => `<svg class="icon${cls ? ' ' + cls : ''}" aria-hidden="true"><use href="#i-${id}"/></svg>`;

// ---------------------------------------------------------------- page shell
// Round 5: every tab is one console that fills the window. The slide track is a band on its own surface under
// the bar; the desk below it is the raised card plus a flat side panel (1px rule on its left, no card), in every
// Now state, so the bars and counts never move sideways (host-craft-4-11, host-bespoke-4-2).
// One fixture Questions count (8) on every tab, in a fixed slot (host-use-4-12).
const page = ({ title, note, tab = 'Now', qn = 8, track: trk, main, aside = '', script = '', offline = false, after = '', match = false }) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="surface" content="laptop" />
<title>${title}</title>
<!-- ${note} -->
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Google+Sans:ital,opsz,wght@0,17..18,400..700;1,17..18,400..700&family=Google+Sans+Code:wght@400..700&display=swap" />
<link rel="stylesheet" href="../../system/tokens.css" />
<link rel="stylesheet" href="../../system/kit.css" />
<link rel="stylesheet" href="host.css" />
</head>
<body>
${sprite}

<header class="bar host-bar">
  <h1 class="bar__title">Professor view</h1>
  <nav class="tabs" role="tablist" aria-label="Professor view">
    ${['Now', 'Points', 'Questions'].map((t) => `<button class="tabs__tab" role="tab" aria-selected="${t === tab}">${t}${t === 'Questions' ? ` <span class="tabs__n host-n">${qn === null ? '<span class="skel skel--num" aria-hidden="true"></span>' : qn || ''}</span>` : ''}</button>`).join('\n    ')}
  </nav>
  <div class="bar__end"><span class="offline-slot" role="status">${offline ? `<span class="offline">${icon('warn')}Offline</span>` : ''}</span><a class="link link--sm host-att" href="#/checkin/teacher">Attendance${icon('right')}</a><div class="whoami"><span title="pat@example.edu">Pat Example</span><button class="btn btn--plain" type="button">Sign out</button></div></div>
</header>

<main class="page host-page">
${trk}

  <div class="desk host-desk${match ? ' host-desk--match' : ''}">
${main}${aside ? `

    <aside class="side host-side">
${aside}
    </aside>` : ''}
  </div>
</main>${after}${script ? `\n<script>\n${script}\n</script>` : ''}
</body>
</html>
`;

// ---------------------------------------------------------------- slide track (SIGNATURE 1; HO-01, HO-03, HO-04)
// One band under the bar on every tab: where the lecture is, I'm lost taps per slide, the room count.
// Every lost count is one numeral size on one baseline; the current slide is marked by its segment and its bold
// number only (host-visual-4-3, host-craft-4-4).
const SLIDES = 12;
const track = ({ checked = 38, slide = 4, title = 'Capacitors in a circuit', lost = { 3: 4, 4: 3 }, loading = false } = {}) => {
  const idx = Array.from({ length: SLIDES }, (_, i) => i + 1);
  const total = Object.values(lost).reduce((a, b) => a + b, 0);
  const sr = loading ? 'Loading the slides.'
    : `Slide ${slide} of ${SLIDES}, ${title}. ${total ? `I’m lost taps: ${Object.entries(lost).map(([s, n]) => `slide ${s}, ${n}`).join('; ')}.` : 'Nobody has tapped I’m lost yet.'} ${checked} checked in.`;
  // Round 6: every slide up to now prints its count on the 12-column grid over its segment, a muted 0 when nobody
  // tapped; future slides print nothing; loading prints nothing (no dashes that read as data) (host-craft-5-5,
  // host-use-5-5).
  const n = (i) => loading ? '<span></span>'
    : lost[i] ? `<span class="track__n">${lost[i]}</span>` : i <= slide ? '<span class="track__n track__n--zero">0</span>' : '<span></span>';
  const seg = (i) => `<span class="track__seg${loading ? '' : i === slide ? ' track__seg--now' : i < slide ? ' track__seg--past' : ''}"></span>`;
  const num = (i) => `<span class="track__i${!loading && i === slide ? ' track__i--now' : ''}">${i}</span>`;
  return `  <section class="track band host-track" aria-label="Slides, I’m lost taps and check-ins"${loading ? ' aria-busy="true"' : ''}>
    <p class="sr-only">${sr}</p>
    <div class="track__where" aria-hidden="true"><span class="track__of">Slide ${loading ? '<span class="skel skel--num"></span>' : slide} of ${SLIDES}</span><span class="track__title${loading ? ' pend' : ''}">${loading ? 'Loading the slides…' : title}</span></div>
    <div class="track__lane" aria-hidden="true" style="--slides: ${SLIDES}">
      <span class="track__rl">Lost</span>${!loading && !total ? '<span class="track__none">Nobody has tapped I’m lost yet.</span>' : idx.map(n).join('')}
      <span></span>${idx.map(seg).join('')}
      <span class="track__rl">Slide</span>${idx.map(num).join('')}
    </div>
    <div class="track__room roomn" aria-hidden="true"><span class="roomn__n">${loading ? '<span class="skel skel--num"></span>' : checked}</span><span class="roomn__l">checked in</span></div>
  </section>`;
};
const trackLate = { checked: 38, slide: 5, title: 'Charging and discharging', lost: { 3: 4, 4: 3, 5: 1 } };

// ---------------------------------------------------------------- heading line (SIGNATURE 12)
const hline = ({ id = 'ask-t', title = 'Ask the room', state = '', facts = [], end = '' } = {}) => `      <div class="hline ask__head">
        <h2 id="${id}" class="hline__t">${title}${state === 'open' ? ' <span class="stateword stateword--open">Open</span>' : state === 'ended' ? ' <span class="stateword stateword--ended">Ended</span>' : ''}</h2>${facts.length ? `
        <p class="facts facts-list">${facts.map((f) => `<span>${f}</span>`).join('')}</p>` : ''}${end ? `
        <div class="hline__end">${end}</div>` : ''}
      </div>`;

// Round 6: while loading, both buttons hold full contrast and only say aria-disabled (host-use-5-5); the
// professor sees the same two buttons a second later, so nothing changes color when the data lands.
const startEnd = ({ held = false } = {}) => {
  const d = held ? ' aria-disabled="true"' : '';
  return `<button class="btn btn--primary btn--lg" type="button" id="draft"${d}><span class="btn__label">Draft with AI</span></button><button class="btn btn--outline btn--lg" type="button" id="own"${d}>Write my own</button>`;
};
// Round 6: the card hugs its content and the page ground shows under it (host-visual-5-1, host-bespoke-5-1,
// host-craft-5-4). The rule line sits 24 under the last bar, next to the answers it describes (host-use-5-2).
// Round 7: the lock glyph only where answers can't change; a vote's line has no glyph (R3-12, host-craft-6-10).
const askCard = (inner, busy = false, foot = '', { start = false } = {}) => `    <section class="hcard ask${start ? ' ask--start' : ''}" aria-labelledby="ask-t"${busy ? ' aria-busy="true"' : ''}>
${inner}${foot ? `
      <p class="lockline muted ask__foot">${foot === FOOT_QUIZ ? icon('lock') : ''}<span>${foot}</span></p>` : ''}
    </section>`;
const FOOT_QUIZ = 'Students can’t change their answer.';
const FOOT_VOTE = 'No right answer. Students can change their pick until you end it.';

// ---------------------------------------------------------------- bars on the ruled list (SIGNATURE 13)
// Open (and every vote): the leading choice's bar fills in ink, the rest --muted, so the leader reads without
// comparing lengths. Green stays for the right answer after the question ends (host-use-4-4).
// Count 24/700 and percent 16/500 on one baseline, right-aligned to the card's text edge.
const QUIZ = [['A', 'Charge'], ['B', 'Current'], ['C', 'Resistance'], ['D', 'Voltage']];
const VOTE = [['A', 'The time constant'], ['B', 'Discharging'], ['C', 'Energy stored in a capacitor'], ['D', 'Capacitors in parallel']];
const bars = (choices, counts, { right = -1, label = 'Answers so far' } = {}) => {
  const total = counts.reduce((a, b) => a + b, 0);
  const lead = right < 0 ? counts.indexOf(Math.max(...counts)) : -1;
  return `      <div class="ruled rbars hbars" role="list" aria-label="${label}">
${choices.map(([l, w], i) => {
    const pct = Math.round((counts[i] / total) * 100);
    const tag = i === right ? `<span class="rbar__tag">${icon('check')}Right answer</span>` : '';
    return `        <div class="ruled__row${i === right ? ' is-right' : ''}${i === lead ? ' is-lead' : ''}" role="listitem"><span class="letter">${l}</span><span class="rbar__text"><span class="rbar__label">${w}${tag}</span><span class="rbar__track"><span class="rbar__fill" style="--f:${(counts[i] / total).toFixed(2)}"></span></span></span><span class="rbar__n">${counts[i]}<span class="rbar__pct">${pct}%</span></span></div>`;
  }).join('\n')}
      </div>`;
};

// ---------------------------------------------------------------- side panel: who got it wrong (HO-20 to HO-24)
// Round 6: before a quiz ends the panel is its heading and one sentence at --t-body on the page, no well, no
// column heads, no blank rows (host-bespoke-5-2, host-craft-5-1, host-use-5-1). The ruled table is drawn only
// when it has rows. A vote has no right answer, so its panel names the top pick instead (host-bespoke-5-2).
const PEOPLE = [
  ['Bo', 'teal', 'Teal', 'B', 'Current'], ['Cy', 'orange', 'Orange', 'D', 'Voltage'], ['Dot', 'purple', 'Purple', 'B', 'Current'],
  ['Ezra', 'navy', 'Navy', 'C', 'Resistance'], ['Fen', 'teal', 'Teal', 'D', 'Voltage'], ['Hal', 'brown', 'Brown', 'C', 'Resistance'],
  ['Ida', 'pink', 'Pink', 'D', 'Voltage'], ['Jo', 'gray', 'Gray', 'B', 'Current'],
];
const wrongHead = `          <div class="ruled__head" role="row"><span role="columnheader">Name</span><span role="columnheader">Team</span><span role="columnheader">Picked</span></div>`;
const wrongHeld = (line, { pend = false } = {}) => `      <section class="side-sec" aria-labelledby="wrong-t">
        <header class="side-sec__head"><h2 id="wrong-t" class="card-title">Who got it wrong</h2></header>
        <div class="state state--inline side-wait"${pend ? ' role="status"' : ''}><p class="state__text">${line}</p></div>
      </section>`;
const wrongTable = (n, answered) => `      <section class="side-sec" aria-labelledby="wrong-t">
        <header class="side-sec__head"><h2 id="wrong-t" class="card-title">Who got it wrong</h2>
          <button class="btn btn--outline" type="button">Ask the AI about these ${n}</button></header>
        <p class="side__sum"><b>${n}</b> of <b>${answered}</b> picked a wrong answer.</p>
        <div class="ruled ruled--well wrong" role="table" aria-label="Who got it wrong">
${wrongHead}
${PEOPLE.slice(0, n).map(([nm, c, t, l, w]) => `          <div class="ruled__row" role="row"><span role="cell">${nm}</span><span role="cell"><span class="team"><span class="team__chip team-swatch" style="--c: var(--team-${c})"></span>${t}</span></span><span role="cell" class="pick"><b class="pick__l">${l}</b>${w}</span></div>`).join('\n')}
        </div>
      </section>`;
// the vote's side panel: the top pick as a ledger line, its letter tile, its words, its count over the answered
const topPick = ([l, w], n, of, ended) => `      <section class="side-sec" aria-labelledby="top-t">
        <header class="side-sec__head"><h2 id="top-t" class="card-title">${ended ? 'Top pick' : 'Top pick so far'}</h2></header>
        <p class="toppick"><span class="letter">${l}</span><span class="toppick__w">${w}</span><span class="toppick__n"><b>${n}</b> of ${of}</span></p>
        <p class="side__line">“What should we cover next?” is a vote, so it has no right answer.</p>
      </section>`;
const noQuiz = wrongHeld('No quiz with a right answer yet.');

const files = {};

// ================================================================ host-now-start (HO-11, HO-12)
// Round 6: the start card is the heading line, the one sentence and nothing else. The A to D scaffold appears
// only after Write my own (host-use-5-11). The card ends under the sentence and the page ground shows below.
files['host-now-start'] = page({
  title: 'Professor view, no question yet',
  note: `#/host Now tab. Slide track (HO-03, HO-04 no I'm lost taps yet) + HO-11 no question yet (HO-12 busy on press).
     First thing: "No question in this class yet." at the question's size under the heading line. Draft with AI is the
     one filled button. The card hugs its content. The side panel is its heading and one sentence, no table.`,
  track: track({ checked: 31, lost: {} }),
  main: askCard(`${hline({ facts: ['Slide 4, Capacitors in a circuit'], end: startEnd() })}
      <p class="ask__slotq ask__slotq--start">No question in this class yet.</p>`, false, '', { start: true }),
  aside: noQuiz, match: true,
  script: `  // HO-12: Draft with AI turns busy in place (spinner after 0.4s, width holds); Write my own waits.
  document.getElementById('draft').addEventListener('click', (e) => {
    e.currentTarget.setAttribute('aria-busy', 'true');
    document.getElementById('own').setAttribute('aria-disabled', 'true');
  });`,
});

// ================================================================ host-now-start--loading (HO-01, HO-10, HO-20)
files['host-now-start--loading'] = page({
  title: 'Professor view, loading',
  note: `#/host Now tab while data loads. Track: segments from the deck's length, no counts, "Loading the slides…" in the
     title slot, a sunken block where the slide number and the room count go. Card: the start frame, "Loading the
     question…" in the question's slot, both actions at full contrast with aria-disabled. Side: "Loading the answers…".`,
  qn: null,
  track: track({ loading: true }),
  main: askCard(`${hline({ end: startEnd({ held: true }) })}
      <div class="ask__load"><p class="ask__slotq--start pend" role="status">Loading the question…</p>
      <div class="skel-lines" aria-hidden="true"><span class="skel"></span><span class="skel"></span><span class="skel"></span></div></div>`, true, '', { start: true }),
  aside: wrongHeld('Loading the answers…', { pend: true }), match: true,
});

// ================================================================ host-now-start--error (HO-18 / SH-04 pattern)
// Round 6: the same heading line as every state (min 56 tall), Try again in its action slot where End the question
// sits, the error in the question's slot under it (host-craft-5-7, host-use-5-6).
files['host-now-start--error'] = page({
  title: 'Professor view, question did not load',
  note: `#/host Now tab when the question fails to load. The heading line is unchanged; Try again takes its action slot.
     The question's slot holds the kit error lockup (warn glyph, "The question didn't load." [TBD copy], one sentence).
     The bar's end shows Offline as a filled stop chip with 17px words.`,
  offline: true,
  track: track({ checked: 31, lost: {} }),
  main: askCard(`${hline({ facts: ['Slide 4, Capacitors in a circuit'], end: `<button class="btn btn--primary btn--lg" type="button">${icon('repeat')}<span class="btn__label">Try again</span></button>` })}
      <div class="state state--error ask__err" role="alert">
        ${icon('warn')}
        <p class="state__title">The question didn’t load.</p>
        <p class="state__text">Check the laptop’s connection, then try again.</p>
      </div>`, false, '', { start: true }),
  aside: noQuiz, match: true,
});

// ================================================================ draft form (HO-13, HO-14 on Vote, HO-18)
const draftHead = ({ busy = false } = {}) => hline({
  facts: ['AI draft'],
  end: `<button class="btn btn--primary btn--lg" type="submit" form="draft" id="open"${busy ? ' aria-disabled="true" disabled' : ''}><span class="btn__label">Open question</span></button><button class="btn btn--quiet" type="button">Cancel</button>`,
});
files['host-quiz-draft--drafting'] = page({
  title: 'Professor view, drafting',
  note: `#/host Now tab after Draft with AI. The start frame holds still: "Writing a question from slide 4…" [TBD copy] in the
     question's slot, Open question disabled, Cancel beside it. No skeleton bars, no empty fields.`,
  track: track(),
  main: askCard(`${draftHead({ busy: true })}
      <p class="ask__slotq pend" role="status">Writing a question from slide 4…</p>`, true),
  aside: noQuiz,
});

// The Right answer column is one 112 column: its head on the Choices line, a radio per choice, and a fifth row
// "No right answer" with its own radio, so the one choice lives in one column (host-use-4-5, host-craft-4-8,
// host-bespoke-4-3). No switch.
const draftForm = ({ err = false } = {}) => `    <section class="hcard ask" aria-labelledby="ask-t">
${draftHead()}
      <form class="draft" id="draft" onsubmit="return false">
        <div class="draft__kind">
          <div class="seg" role="radiogroup" aria-label="Quiz or vote">
            <button class="seg__item" type="button" role="radio" aria-checked="true" data-kind="quiz">${icon('check')}Quiz</button>
            <button class="seg__item" type="button" role="radio" aria-checked="false" data-kind="vote">${icon('check')}Vote</button>
          </div>
          <p class="lockline muted" id="rule">${icon('lock')}<span>Students can’t change their answer.</span></p>
        </div>

        <div class="fld draft__q">
          <label class="label" for="q">Question</label>
          <input class="input" id="q" value="What does a capacitor store?" />
        </div>

        <div class="draft__set" role="group" aria-labelledby="choices-l">
          <div class="draft__cols">
            <span class="draft__lh"><span class="label" id="choices-l">Choices</span></span>
            <span class="draft__rh" id="right-h">Right answer</span>
          </div>
          <div class="draft__choices">
${QUIZ.map(([l, w], i) => `            <div class="draft__row${i === 0 ? ' draft__row--right is-right' : ''}">
              <span class="letter">${l}</span>
              ${err && i === 0
    ? `<span class="draft__in"><input class="input" value="" placeholder="Choice (needed)" aria-label="Choice ${l}" aria-invalid="true" aria-describedby="err" />${icon('warn')}</span>`
    : `<input class="input" value="${w}" placeholder="Choice (${i < 2 ? 'needed' : 'optional'})" aria-label="Choice ${l}" />`}
              <label class="draft__right"><input class="radio" type="radio" name="right"${i === 0 ? ' checked' : ''} aria-label="${l} is the right answer" /></label>${err && i === 0 ? `
              <p class="draft__err" id="err" role="alert">Type the right answer’s choice.</p>` : ''}
            </div>`).join('\n')}
            <div class="draft__row draft__row--none">
              <span></span>
              <label class="draft__nonel" for="none">No right answer</label>
              <span class="draft__right"><input class="radio" type="radio" name="right" id="none" /></span>
            </div>
          </div>
        </div>
      </form>
    </section>`;
const draftScript = `  // HO-13 to HO-14: Vote drops the Right answer column, changes the rule line and the button.
  const card = document.querySelector('.ask');
  for (const b of card.querySelectorAll('[data-kind]')) b.addEventListener('click', () => {
    const vote = b.dataset.kind === 'vote';
    for (const o of card.querySelectorAll('[data-kind]')) o.setAttribute('aria-checked', String(o === b));
    card.classList.toggle('draft--vote', vote);
    document.querySelector('#rule span').textContent = vote
      ? 'No right answer. Students can change their pick until you end it.' : 'Students can’t change their answer.';
    document.querySelector('#rule .icon').hidden = vote;  // lock only where answers can't change (R3-12)
    for (const row of card.querySelectorAll('.draft__row--right')) row.classList.toggle('is-right', !vote);
    document.querySelector('#open .btn__label').textContent = vote ? 'Start the vote' : 'Open question';
  });
  // a radio picks the right answer: its letter tile turns solid green, as in the ended state
  for (const r of card.querySelectorAll('.radio')) r.addEventListener('change', () => {
    for (const row of card.querySelectorAll('.draft__row')) { const on = row.contains(r) && r.id !== 'none'; row.classList.toggle('draft__row--right', on); row.classList.toggle('is-right', on && !card.classList.contains('draft--vote')); }
  });`;
files['host-quiz-draft'] = page({
  title: 'Professor view, AI draft',
  note: `#/host Now tab. Slide track + HO-13 the AI draft form (HO-14 vote on the Vote press).
     First thing: the question field. Open question is the one filled button, at the heading row's right edge with Cancel
     beside it. "Right answer" heads one 112 column on the Choices line; its radios and the fifth row "No right answer"
     sit centered under it. The right row's letter tile is solid green, the same tile as the ended state.`,
  track: track(),
  main: draftForm(),
  aside: noQuiz,
  script: draftScript,
});
files['host-quiz-draft--error'] = page({
  title: 'Professor view, draft needs the right answer',
  note: `#/host Now tab. HO-18 form error "Type the right answer’s choice." right under field A, 15px in --error, no glyph
     in the message (host-use-5-10). Choice A, marked right but empty, takes the kit's 2px error ring (aria-invalid) and a warning glyph.`,
  track: track(),
  main: draftForm({ err: true }),
  aside: noQuiz,
  script: draftScript,
});

// ================================================================ host-quiz-open (HO-16)
files['host-quiz-open'] = page({
  title: 'Professor view, question open',
  note: `#/host Now tab. Slide track + HO-16 poll open.
     First thing: "14 of 38 answered", the count sentence at --n-hero in ink. The leading choice's bar is ink.
     Round 6: the card hugs its content, the lock line 24 under the last bar. Who got it wrong is its heading and one
     sentence, no table until rows exist. Lost counts 24/700 over their segments, a muted 0 on quiet past slides.`,
  track: track({ lost: { 3: 4, 4: 3 } }),
  main: askCard(`${hline({ state: 'open', facts: ['Quiz', 'AI draft'], end: '<button class="btn btn--primary btn--lg" type="button"><span class="btn__label">End the question</span></button>' })}
      <p class="tally ask__tally"><span class="tally__lead n-hero">14</span><span class="tally__of">of 38 answered</span></p>
      <h3 class="question ask__q">What does a capacitor store?</h3>
${bars(QUIZ, [9, 2, 1, 2])}`, false, FOOT_QUIZ),
  aside: wrongHeld('Shows after you end the question.'),
});

// ================================================================ host-quiz-ended (HO-17, HO-24)
// Round 6: after the question ends Draft with AI stays the one filled button, as on the start card (host-visual-5-7)
// Round 7: both outline after a question ends, so the 62% numeral is the screen's one green mass (host-visual-6-5;
// DESIGN-SYSTEM host-quiz-ended row, R3-05). The filled green comes back on the start card.
const nextOutline = `<button class="btn btn--outline btn--lg" type="button">Draft with AI</button><button class="btn btn--outline btn--lg" type="button">Write my own</button>`;
files['host-quiz-ended'] = page({
  title: 'Professor view, question ended',
  note: `#/host Now tab. Slide track (now on slide 5) + HO-17 poll ended + HO-24 who got it wrong.
     First thing: "62% got it right" in the hero slot, in green. The right answer's bar is the only other green.
     Draft with AI is filled again, Write my own outline. The side table sits in a well with a raised head; the right
     answer is named only on the card (green tile and check); "Ask the AI about these 8" says what it asks about.`,
  track: track(trackLate),
  main: askCard(`${hline({ state: 'ended', facts: ['Quiz', 'AI draft', 'asked on slide 4'], end: nextOutline })}
      <div class="tally tally--accent ask__tally"><span class="tally__lead n-hero">62%</span><span class="tally__of">got it right</span><p class="tally__line"><b>21</b> of <b>38</b> answered, median time <b>18</b> s</p></div>
      <h3 class="question ask__q">What does a capacitor store?</h3>
${bars(QUIZ, [13, 3, 2, 3], { right: 0, label: 'Final answers' })}`, false, FOOT_QUIZ),
  aside: wrongTable(8, 21),
});

// ================================================================ vote open / ended (HO-14 opened, HO-22)
const voteSideOpen = topPick(VOTE[0], 11, 23, false);
const voteSideEnded = topPick(VOTE[0], 13, 27, true);
files['host-quiz-open--vote'] = page({
  title: 'Professor view, vote open',
  note: `#/host Now tab with a vote open. The quiz card's parts: "Open", the fact line "Vote", the count sentence, End the vote.
     The leading pick's bar is ink; no bar is green. The side panel is "Top pick so far" as a ledger line, then HO-22.`,
  track: track({ lost: { 3: 4, 4: 3 } }),
  main: askCard(`${hline({ state: 'open', facts: ['Vote, no right answer'], end: '<button class="btn btn--primary btn--lg" type="button"><span class="btn__label">End the vote</span></button>' })}
      <p class="tally ask__tally"><span class="tally__lead n-hero">23</span><span class="tally__of">of 38 answered</span></p>
      <h3 class="question ask__q">What should we cover next?</h3>
${bars(VOTE, [11, 6, 4, 2], { label: 'Picks so far' })}`, false, FOOT_VOTE),
  aside: voteSideOpen,
});
files['host-quiz-ended--vote'] = page({
  title: 'Professor view, vote ended',
  note: `#/host Now tab after a vote ends. "Ended", the count sentence, the counts as one line. Draft with AI filled, Write my
     own outline. The top pick's bar is ink; no bar is green. The side panel names the top pick, then HO-22.`,
  track: track(trackLate),
  main: askCard(`${hline({ state: 'ended', facts: ['Vote, no right answer', 'asked on slide 4'], end: nextOutline })}
      <div class="tally ask__tally"><span class="tally__lead n-hero">27</span><span class="tally__of">of 38 answered</span><p class="tally__line">Median time <b>11</b> s</p></div>
      <h3 class="question ask__q">What should we cover next?</h3>
${bars(VOTE, [13, 7, 5, 2], { label: 'Final picks' })}`, false, FOOT_VOTE),
  aside: voteSideEnded,
});

// ================================================================ questions (HO-42 to HO-48)
const Q = [
  { n: 9, text: 'Why does the capacitor charge slower near the end?', slide: 5, who: 'Anonymous', time: '2:48 PM' },
  { n: 6, text: 'Is the time constant the same when it discharges?', slide: 5, who: 'Ivy', time: '2:46 PM', kept: true },
  { n: 4, text: 'Can you go over why ohms times farads comes out to seconds?', slide: 4, who: 'Nia', time: '2:41 PM', shared: 'An ohm is a volt per amp and a farad is a coulomb per volt, so the volts cancel and you get coulombs per amp, which is seconds.' },
  { n: 3, text: 'Does a bigger capacitor take longer to charge?', slide: 4, who: 'Kai', time: '2:40 PM', shared: 'Yes, if the resistor stays the same. The time constant is R times C, so doubling C doubles the time.' },
  { n: 2, text: 'I missed the formula for the charge at time t.', slide: 4, who: 'Lou', time: '2:39 PM', priv: true },
  { n: 1, text: 'What happens if the resistor is zero?', slide: 3, who: 'Anonymous', time: '2:35 PM' },
  { n: 0, text: 'Do we need to know the derivation?', slide: 2, who: 'Max', time: '2:31 PM' },
  { n: 0, text: 'Will this be on the exam?', slide: 3, who: 'Anonymous', time: '2:33 PM', dismissed: true },
];
const SHOWN = 3;
const qState = (cls, g, w) => `<span class="qstate qstate--${cls}">${icon(g)}${w}</span>`;
// Round 6: every row has the same three action slots at the same x: the answer button, Keep, Dismiss, then the
// overflow button with Delete. A kept row shows "Kept" with a check in Keep's slot instead of dropping it, and the
// answer button is the same ghost button on every row (host-use-5-8, host-craft-5-3). The selected row is lifted
// inside the one well (--raised, --r-md, --hl, --shadow-1) so it reads as the top of its list (host-visual-5-6).
// A shared answer shows as one line in the list; the full answer lives only in the side panel (host-bespoke-4-9).
const qRow = (q, i, mode) => {
  const sel = i === 0;
  const kept = q.kept || (sel && mode === 'kept');
  const meta = [`Slide ${q.slide}`, q.who];
  // round 7: the state marks leave the meta line (no comma before a glyph, one weight, host-craft-6-8) and sit in the
  // first action slot on rows that are not selected (R6-13)
  const marks = [kept && qState('kept', 'check', 'Kept'), q.priv && qState('priv', 'lock', 'Private'), q.shared && qState('shared', 'eye', 'Shared with students')].filter(Boolean);
  const acts = [
    `<button class="btn btn--ghost qa__act qa__slot--ans" type="button">${q.shared ? 'Edit answer' : 'Type answer'}</button>`,
    kept ? `<span class="qa__done qa__slot--keep">${icon('check', 'icon--d')}Kept</span>` : `<button class="btn btn--ghost qa__act qa__slot--keep" type="button">${icon('check', 'icon--d')}Keep</button>`,
    `<button class="btn btn--ghost qa__act qa__slot--dis" type="button">${icon('x', 'icon--d')}Dismiss</button>`,
  ].join('');
  const open = sel && mode === 'delete';
  return `          <div class="ruled__row qq${sel ? ' is-selected' : ''}" role="listitem">
            <span class="ln qq__n" aria-label="${q.n} upvote${q.n === 1 ? '' : 's'}">${q.n}</span>
            <button class="row__open qq__open" type="button" aria-expanded="${sel}">
              <span class="qq__text">${q.text}</span>
              <span class="qq__meta facts-list">${meta.map((m) => `<span>${m}</span>`).join('')}</span>
            </button>
            <span class="qq__time">${q.time}</span>${q.shared ? `
            <p class="qq__answer"><b>Your answer:</b> ${q.shared}</p>` : ''}
            <div class="qq__acts"><span class="qq__mark">${marks.join('')}</span>${acts}<button class="btn btn--ghost btn--icon btn--sm qa__more-btn" type="button" aria-label="More for this question" aria-haspopup="menu" aria-expanded="${open}">${icon('more')}</button>${open ? `
              <div class="qa__menu" role="menu"><button class="qa__menu-i" role="menuitem" type="button">Delete</button></div>` : ''}</div>
          </div>`;
};
const confirmSheet = (q) => `
<div class="scrim" role="presentation">
  <section class="sheet confirm qa-confirm" role="dialog" aria-modal="true" aria-labelledby="del-q">
    <p class="confirm__q" id="del-q">Delete this question from every phone?</p>
    <p class="row__quote">“${q.text}”</p>
    <div class="confirm__actions"><button class="btn btn--outline" type="button" autofocus>Cancel</button><button class="btn btn--danger" type="button">Delete</button></div>
  </section>
</div>`;
const orderSeg = `<div class="seg" role="radiogroup" aria-label="Order of questions">
            <button class="seg__item" type="button" role="radio" aria-checked="true">${icon('check')}Most upvoted</button>
            <button class="seg__item" type="button" role="radio" aria-checked="false">${icon('check')}Group by topic with AI</button>
          </div>`;
const qaPage = (mode, title, note) => page({
  title, note, tab: 'Questions',
  track: track(trackLate),
  main: `    <section class="hcard qa" aria-labelledby="qa-t">
${hline({ id: 'qa-t', title: 'Questions from students', end: orderSeg })}
      <div class="ruled ruled--well qa-list">
        <div class="ruled__head" aria-hidden="true"><span class="end">Upvotes</span><span>Question</span><span class="end">Asked</span></div>
        <div id="list" role="list" aria-label="Questions, most upvoted first">
${Q.slice(0, SHOWN).map((q, i) => qRow(q, i, mode)).join('\n')}
        </div>
        <div class="ruled__row qa__more" id="more"><span></span><button class="link link--sm" type="button"><span>${Q.length - SHOWN} more</span>${icon('right')}</button></div>
      </div>
    </section>`,
  aside: `      <section class="side-sec" aria-labelledby="shared-t">
        <header class="side-sec__head"><h2 id="shared-t" class="card-title">Shared with students</h2></header>
        <div class="ruled shared" role="list">
${Q.filter((q) => q.shared).map((q) => `          <div class="ruled__row" role="listitem">
            <p class="shared__q">${q.text}</p>
            <p class="shared__a">${q.shared}</p>
          </div>`).join('\n')}
        </div>
      </section>`,
  after: mode === 'delete' ? confirmSheet(Q[0]) : '',
  script: mode === 'list' ? `  // Pick a row: it lifts inside the well; the action slots stay where they are.
  const qrows = [...document.querySelectorAll('#list .qq')];
  for (const r of qrows) r.querySelector('.qq__open').addEventListener('click', () => {
    for (const o of qrows) { o.classList.toggle('is-selected', o === r); o.querySelector('.qq__open').setAttribute('aria-expanded', String(o === r)); }
  });` : '',
});
files['host-questions'] = qaPage('list', 'Professor view, questions',
  `#/host Questions tab. Slide track + HO-42 list (HO-44 answered) + HO-48 shared.
     First thing: the top upvoted question, lifted inside the one well. Three rows, then "5 more", so the page fits
     1280 x 800. Type answer, Keep and Dismiss sit in fixed slots on every row; Delete waits in the overflow button. A shared
     answer is one line in the list and the full text in the side panel. Order is a two-item segmented control.`);
files['host-questions--kept'] = qaPage('kept', 'Professor view, question kept',
  `#/host Questions tab right after Keep on the top question: Keep's slot shows "Kept" with a check, in place.`);
files['host-questions--delete'] = qaPage('delete', 'Professor view, delete a question',
  `#/host Questions tab after Delete in the top row's overflow: HO-45 confirm "Delete this question from every phone?" on
     the overlay rung (kit .scrim + .sheet) with the question quoted in a well; Delete is the only red fill, focus on Cancel.`);

// ================================================================ points (HO-30, HO-31, HO-34, HO-35, HO-36)
const TEAMS = [
  { c: 'teal', t: 'Teal', place: '1st', n: 3, right: 7, per: '2.3', credit: 5 },
  { c: 'orange', t: 'Orange', place: '2nd', tied: true, n: 3, right: 6, per: '2.0', credit: 3 },
  { c: 'purple', t: 'Purple', place: '2nd', tied: true, n: 3, right: 6, per: '2.0', credit: 3 },
  { c: 'navy', t: 'Navy', place: '4th', n: 3, right: 4, per: '1.3', credit: 0 },
  { c: 'brown', t: 'Brown', place: '5th', n: 2, right: 2, per: '1.0', credit: 0 },
  { c: 'pink', t: 'Pink', place: '6th', n: 3, right: 2, per: '0.7', credit: 0 },
];
const seg34 = `<div class="seg" role="radiogroup" aria-label="Team size">
            <button class="seg__item" type="button" role="radio" aria-checked="true">${icon('check')}Teams of 3</button>
            <button class="seg__item" type="button" role="radio" aria-checked="false">${icon('check')}Teams of 4</button>
          </div>`;
const ptsHead = `        <div class="ruled__head" role="row"><span role="columnheader" class="end">Place</span><span role="columnheader">Team</span><span role="columnheader" class="end">Right</span><span role="columnheader" class="end">Per student</span><span role="columnheader" class="end">Extra credit</span><span role="columnheader"><span class="sr-only">Change points</span></span></div>`;
// −1 and +1 on every row: 32 square buttons, r-sm, 1px --line-strong ring, 8 apart, in a fixed right column
// (host-use-4-7, host-bespoke-4-7). The selected row is the kit's fill step in the same columns.
// Round 6: 40 square, 8 apart, the laptop target floor at the lectern (host-use-5-7)
const pm = (t) => `<button class="btn btn--outline btn--sm btn--icon pm" type="button" aria-label="Take 1 point from ${t}">${icon('minus')}</button><button class="btn btn--outline btn--sm btn--icon pm" type="button" aria-label="Give ${t} 1 point">${icon('plus')}</button>`;
const teamRow = (tm, i) => `        <div class="ruled__row" role="row"><span role="cell" class="ln ln--place">${tm.place}${tm.tied ? '<span class="ln--tied">tied</span>' : ''}</span><span role="cell" class="pts__team"><span class="team"><span class="team__chip team-swatch" style="--c: var(--team-${tm.c})"></span>${tm.t}</span><span class="muted small">${tm.n} students</span></span><span role="cell" class="ln">${tm.right}</span><span role="cell" class="ln">${tm.per}</span><span role="cell" class="ln ${tm.credit ? 'ln--credit' : 'ln--zero'}">${tm.credit ? '+' + tm.credit : '0'}</span><span role="cell" class="pts__acts">${pm(tm.t)}</span></div>`;
const CHANGES = [
  ['+1', 'Cy', 'orange', 'Orange', 'Good question', '2:41 PM'],
  ['+1', 'Bo', 'teal', 'Teal', '', '2:38 PM'],
  ['−1', 'Hal', 'brown', 'Brown', 'Phone out', '2:33 PM'],
];
const changesSec = (empty) => `      <section class="side-sec" aria-labelledby="chg-t">
        <header class="side-sec__head"><h2 id="chg-t" class="card-title">Point changes</h2></header>${empty ? `
        <p class="state state--inline side__empty">No point changes in this class yet.</p>` : `
        <div class="ruled ruled--well chg" role="list">
${CHANGES.map(([d, nm, c, t, why, tm]) => `          <div class="ruled__row" role="listitem"><span class="ln chg__d">${d}</span><span class="chg__who"><span class="team"><span class="team__chip team-swatch" style="--c: var(--team-${c})" title="${t}"></span>${nm}</span>${why ? `<span class="muted chg__why">${why}</span>` : ''}</span><span class="qq__time">${tm}</span><button class="btn btn--ghost undo" type="button">Undo</button></div>`).join('\n')}
        </div>`}
      </section>`;
// both actions in the outline treatment on one row; the section is as tall as its words (host-craft-4-6)
const endSec = `      <section class="side-sec side-sec--end" aria-labelledby="end-t">
        <header class="side-sec__head"><h2 id="end-t" class="card-title">End of class</h2></header>
        <p class="side__sum">No extra credit saved yet. End day saves it.</p>
        <div class="cluster end__acts">
          <button class="btn btn--outline" type="button">End day</button>
          <button class="btn btn--outline" type="button" aria-disabled="true" disabled>${icon('download')}Download extra credit (CSV)</button>
        </div>
      </section>`;
const ptsCard = (body, { busy = false, end = seg34, facts = ['Teams lock at 2:41 PM'] } = {}) => `    <section class="hcard pts" aria-labelledby="pts-t"${busy ? ' aria-busy="true"' : ''}>
${hline({ id: 'pts-t', title: 'Teams', facts, end })}
${body}
    </section>`;
files['host-points'] = page({
  title: 'Professor view, points',
  note: `#/host Points tab. Slide track + HO-31 teams + HO-34 point changes + HO-35 end of class.
     Round 6 first thing: the leader in the count sentence, "Teal" at --n-hero with its swatch, "+5 extra credit".
     The table under it is the quiet detail: place right-aligned in one 88 column with "tied" on a second small line,
     team name and size on one baseline, −1 and +1 as 40 square ring buttons 8 apart. The side panel is flat: point changes in a well with
     32-tall Undo buttons, then End of class with two outline buttons on one row.`,
  tab: 'Points',
  track: track(),
  main: ptsCard(`      <div class="tally pts__lead"><span class="team__chip team-swatch pts__sw" style="--c: var(--team-teal)"></span><span class="tally__lead n-hero">Teal</span><span class="tally__of">leads, <span class="pts__credit">+5 extra credit</span></span><p class="tally__line"><b>7</b> right, <b>2.3</b> per student. Orange and Purple tied 2nd with <b>6</b>.</p></div>
      <div class="ruled points pts-list" role="table" aria-label="Teams by place">
${ptsHead}
${TEAMS.map(teamRow).join('\n')}
      </div>`),
  aside: `${changesSec(false)}\n${endSec}`,
});
files['host-points--empty'] = page({
  title: 'Professor view, no teams yet',
  note: `#/host Points tab before anyone checks in. HO-30: the same ruled table as the filled state, one row per team with
     muted en dashes in Place, Right, Per student and Extra credit, then "Each student joins a team when they check in."
     right under it (host-bespoke-4-8, host-use-4-8). Aside: HO-34 empty in the one inline well, HO-35 nothing saved.`,
  tab: 'Points', qn: 0,
  track: track({ checked: 0, lost: {} }),
  main: ptsCard(`      <p class="pts__note">Each student joins a team when they check in.</p>
      <div class="ruled points pts-list pts-list--empty" role="table" aria-label="Teams">
${ptsHead}
${TEAMS.map((tm) => `        <div class="ruled__row" role="row"><span role="cell" class="ln pend">–</span><span role="cell"><span class="team"><span class="team__chip team-swatch" style="--c: var(--team-${tm.c})"></span>${tm.t}</span></span><span role="cell" class="ln pend">–</span><span role="cell" class="ln pend">–</span><span role="cell" class="ln pend">–</span><span role="cell"></span></div>`).join('\n')}
      </div>`),
  aside: `${changesSec(true)}\n${endSec}`,
});
files['host-points--error'] = page({
  title: 'Professor view, teams did not load',
  note: `#/host Points tab when the teams fail to load (HO-36). The table keeps its head; the danger well with the warn
     glyph, "The teams didn't load." [TBD copy] and Try again replaces the rows. Point changes keep their last good rows.`,
  tab: 'Points', offline: true,
  track: track(),
  main: ptsCard(`      <div class="ruled points pts-list" role="table" aria-label="Teams by place">
${ptsHead}
      </div>
      <div class="state state--error" role="alert">
        ${icon('warn')}
        <p class="state__title">The teams didn’t load.</p>
        <p class="state__text">Check the laptop’s connection, then try again.</p>
        <div class="cluster"><button class="btn btn--primary" type="button">${icon('repeat')}<span class="btn__label">Try again</span></button></div>
      </div>`),
  aside: `${changesSec(false)}\n${endSec}`,
});

for (const [name, html] of Object.entries(files)) writeFileSync(join(here, `${name}.html`), html);
console.log(`wrote ${Object.keys(files).length} comps`);
