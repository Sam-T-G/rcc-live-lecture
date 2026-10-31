/* deck-bridge.js: sends a deck-kit deck's current slide to this app's Convex backend.

   Add one line to a deck, after deck.js:
     <script src="https://sam-t-g.github.io/rcc-live-lecture/deck-bridge.js"
             data-site="https://<deployment>.convex.site" defer></script>
   Then open the deck with ?bridge=<channel>.<DECK_BRIDGE_KEY> on its URL. Without that
   parameter the script does nothing, so a published deck is safe to carry the line.
   Phones read the channel with useDeckSlide("<channel>") (src/blocks/deck.ts).

   The script reads ?bridge= once, keeps it in this tab's sessionStorage (one entry per deck
   page) and takes it out of the address bar, so the key never shows on the projector and a
   reload keeps sending. ?bridge=off, or any value without a channel and a key, stops sending
   from this tab. Closing the tab does too.

   To feed other backends instead (each lead's own dev deployment during a meeting), add
   &bridge-site=<deployment>,<deployment> with their names (e.g. quaint-swan-637). Every
   one of them needs the same DECK_BRIDGE_KEY in its Convex env. The script stores that
   list with the key and takes it out of the address bar too.

   It sends when the slide or the number of presses shown on it changes:
     index   the slide, 0-based
     beat    how many of the slide's presses are shown
     count   slides in the deck
     title   the slide's first h1 or h2, or its aria-label when it has neither
     lines   at most 12 lines of the slide's text, in page order, each once, from .eyebrow,
             .sub, li (a list item inside another list item is part of its parent's line),
             .label, .clock__hint and p.figure
     run     an id the script stores in this tab for the deck (a reload reuses it)
     seq     a number that goes up with every send, so the backend can ignore a press that
             arrives after a newer one (convex/deck.ts)
   Never speaker notes (aside.notes), .notice text, or data-beat items not shown yet.
   Presenter, mirror, remote and run-sheet windows (?view=) never send. Decks load this file
   from the live site, so a change here reaches them only after Sam deploys. */
(function () {
  var me = document.currentScript;
  var search = location.search;
  var given = (/[?&]bridge=([^&]*)/.exec(search) || [])[1];
  var givenSites = (/[?&]bridge-site=([^&]*)/.exec(search) || [])[1];

  // Take the key out of the address bar first, in every window that has it.
  if (given !== undefined || givenSites !== undefined) {
    var rest = search.slice(1).split('&').filter(function (p) {
      var name = p.split('=')[0];
      return p && name !== 'bridge' && name !== 'bridge-site';
    });
    try { history.replaceState(history.state, '', location.pathname + (rest.length ? '?' + rest.join('&') : '') + location.hash); }
    catch (e) { /* a page that can't rewrite its URL keeps the key in it */ }
  }
  // Presenter, mirror, remote: only the main window sends. presenter.js opens the presenter
  // window with window.open, which copies this tab's sessionStorage, so this check comes first.
  if (/[?&]view=/.test(search)) return;

  var STORE = 'deck-bridge:' + location.pathname + ':';
  function recall(name) { try { return JSON.parse(sessionStorage.getItem(STORE + name)); } catch (e) { return null; } }
  function keep(name, value) {
    try {
      if (value === null) sessionStorage.removeItem(STORE + name);
      else sessionStorage.setItem(STORE + name, JSON.stringify(value));
    } catch (e) { /* storage is off: this page load still sends, a reload won't */ }
  }
  function decode(s) { try { return decodeURIComponent(s); } catch (e) { return ''; } }

  var link = given !== undefined ? { bridge: decode(given), sites: givenSites === undefined ? '' : decode(givenSites) } : recall('link');
  var bridge = link && typeof link.bridge === 'string' ? link.bridge : '';
  var cut = bridge.lastIndexOf('.');
  if (cut < 1 || cut === bridge.length - 1) { keep('link', null); return; }
  if (given !== undefined) keep('link', link);
  var channel = bridge.slice(0, cut), key = bridge.slice(cut + 1);
  var named = typeof link.sites === 'string' ? link.sites : '';
  var sites = named
    ? named.split(',').filter(function (n) { return /^[a-z]+-[a-z]+-\d+$/.test(n); }).map(function (n) { return 'https://' + n + '.convex.site'; })
    : [me && me.getAttribute('data-site')].filter(Boolean);
  if (!sites.length) return;

  function newRun() {
    var id = '';
    try { crypto.getRandomValues(new Uint8Array(8)).forEach(function (b) { id += (b + 256).toString(16).slice(1); }); }
    catch (e) { id = Math.random().toString(16).slice(2, 10) + Date.now().toString(16); }
    return id;
  }
  var run = recall('run');
  if (!run || typeof run.id !== 'string' || !run.id || !Number.isSafeInteger(run.seq) || run.seq < 0) run = { id: newRun(), seq: 0 };

  function clean(t) { return (t || '').replace(/\s+/g, ' ').trim(); }

  function read(st) {
    var slides = document.querySelectorAll('main.deck > section.slide');
    var slide = slides[st.i];
    if (!slide) return null;
    var beats = Array.prototype.slice.call(slide.querySelectorAll('[data-beat]'));
    var hidden = beats.slice(st.b);
    function shown(el) {
      if (el.closest('aside.notes, .notice')) return false;
      for (var k = 0; k < hidden.length; k++) if (hidden[k] === el || hidden[k].contains(el)) return false;
      return true;
    }
    var head = slide.querySelector('h1, h2');
    var lines = [];
    slide.querySelectorAll('.eyebrow, .sub, li, .label, .clock__hint, p.figure').forEach(function (el) {
      if (!shown(el)) return;
      if (el.tagName === 'LI' && el.parentElement.closest('li')) return;
      var t = clean(el.innerText || el.textContent); // innerText keeps the gap between a beat and its detail line
      if (t && lines.indexOf(t) < 0) lines.push(t);
    });
    return { index: st.i, beat: st.b, count: slides.length, title: head ? clean(head.textContent) : clean(slide.getAttribute('aria-label')), lines: lines.slice(0, 12) };
  }

  var last = '';
  function tick() {
    var st = window.__deck && window.__deck.state();
    if (!st) return;
    var sig = st.i + ':' + st.b;
    if (sig === last) return;
    var body = read(st);
    if (!body) return;
    last = sig;
    // Up by at least 1 on every send, and never behind the clock, so after a reload it is past
    // every send before it even when the last one never reached sessionStorage.
    run.seq = Math.max(run.seq + 1, Date.now());
    keep('run', run);
    body.channel = channel;
    body.key = key;
    body.run = run.id;
    body.seq = run.seq;
    sites.forEach(function (site) {
      fetch(site.replace(/\/$/, '') + '/deck', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(body) })
        .then(function (r) { if (!r.ok) console.warn('deck-bridge:', site, r.status); })
        .catch(function (e) { last = ''; console.warn('deck-bridge: offline', site, e); });
    });
  }
  setInterval(tick, 300);
})();
