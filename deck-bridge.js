/* deck-bridge.js: sends a deck-kit deck's current slide to this app's Convex backend.

   Add one line to a deck, after deck.js:
     <script src="https://sam-t-g.github.io/rcc-live-lecture/deck-bridge.js"
             data-site="https://<deployment>.convex.site" defer></script>
   Then open the deck with ?bridge=<channel>.<DECK_BRIDGE_KEY> on its URL. Without that
   parameter the script does nothing, so a published deck is safe to carry the line.
   Phones read the channel with useDeckSlide("<channel>") (src/blocks/deck.ts).

   The script reads ?bridge= once, keeps it in this tab's sessionStorage (one entry per deck
   page) and takes it out of the address bar, so the key never shows on the projector and a
   reload (the browser's reload button or key) keeps sending. Any other load of the deck
   without ?bridge= (a link, a typed address, back or forward) sends nothing and forgets the
   saved key. ?bridge=off, or any value without a channel and a key, stops sending from this
   tab. Closing the tab does too. Inside an iframe (the stage, #/checkin/stage) the script
   never saves or reads the key: the stage hands it over on every load, so taking ?bridge=saved
   out of the stage's link stops the slides.

   To feed other backends instead (each lead's own dev deployment during a meeting), add
   &bridge-site=<deployment>,<deployment> with their names (e.g. quaint-swan-637) to the same
   link as ?bridge=. Every one of them needs the same DECK_BRIDGE_KEY in its Convex env. The
   script stores that list with the key and takes it out of the address bar too. A
   &bridge-site= without ?bridge= sends nothing and stays in the address bar.

   It sends when the slide or the number of presses shown on it changes, and again in the 3 s
   after that when the slide's title or lines change as its animation runs:
     index   the slide, 0-based
     beat    how many of the slide's presses are shown
     count   slides in the deck
     title   the slide's first h1 or h2 the room can see, or its aria-label when there is none
     lines   at most 12 lines of the slide's text, in page order, each once, from .eyebrow,
             .sub, li (a list item inside another list item is part of its parent's line),
             .label, .clock__hint and p.figure (a counting figure sends its end value)
     run     an id the script stores in this tab for the deck (a reload reuses it)
     seq     a number that goes up with every send, so the backend can ignore a press that
             arrives after a newer one (convex/deck.ts)
   Only text the room can see on the projector: never speaker notes (aside.notes), .notice
   text, data-beat items not shown yet, anything display:none or visibility:hidden (a strip
   card off the stage), or a deck-kit source list (.flow-src, .strip-src, .compress-src and the
   other *-src lists a scene or compress slide draws from one step at a time).
   When a site can't be reached (no network, a typo'd deployment name) or answers 500 or more,
   only that site gets the same send again: 0.3 s later, then 0.6, 1.2 and 2.4 s and so on up to
   every 9.6 s, until it takes it, the slide changes, or 2 minutes have passed since the first
   send. A 4xx answer (wrong key, bad slide) is not tried again. After 2 minutes the press is
   old: the professor may have ended the class since, and a late press would open a new one
   (convex/deck.ts), so that site waits for the next slide. Sites that took the send get
   nothing more, so a dead site never makes the others reopen a class the professor ended.
   Presenter, mirror, remote and run-sheet windows (?view=) never send. Decks load this file
   from the live site, so a change here reaches them only after Sam deploys. */
(function () {
  var me = document.currentScript;
  var search = location.search;
  var given = (/[?&]bridge=([^&]*)/.exec(search) || [])[1];
  var givenSites = (/[?&]bridge-site=([^&]*)/.exec(search) || [])[1];

  // Take the key out of the address bar first, in every window that has it. A bridge-site with
  // no bridge stays there, since the script sends nothing for it.
  if (given !== undefined) {
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

  // In an iframe (the stage, #/checkin/stage), whose page hands over the key on every load.
  var framed = true;
  try { framed = window.self !== window.top; } catch (e) { /* a cross-origin parent can throw: count it as framed */ }
  // The browser's reload of this page, not a link, a typed address or an iframe's new src.
  var reloaded = false;
  try {
    var nav = performance.getEntriesByType('navigation')[0];
    reloaded = nav ? nav.type === 'reload' : performance.navigation.type === 1;
  } catch (e) { /* no navigation timing: count it as a new load */ }

  // The saved link counts only for a reload of the deck's own tab with no bridge-site of its own.
  // Any other load without ?bridge= forgets it, so taking ?bridge= out of a link stops the slides.
  var link = null;
  if (given !== undefined) link = { bridge: decode(given), sites: givenSites === undefined ? '' : decode(givenSites) };
  else if (givenSites !== undefined) console.warn('deck-bridge: &bridge-site= works only with ?bridge=<channel>.<key> on the same link; sending nothing');
  else if (reloaded && !framed) link = recall('link');
  var bridge = link && typeof link.bridge === 'string' ? link.bridge : '';
  var cut = bridge.lastIndexOf('.');
  if (cut < 1 || cut === bridge.length - 1) { keep('link', null); return; }
  if (given !== undefined) keep('link', framed ? null : link);
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

  // Whether the room can see `el` now: false when it or a parent is display:none (deck-kit hides
  // a scene's source list that way once the scene draws) or it is visibility:hidden (a beat not
  // shown yet, a strip card off the stage). An element that isn't rendered has no innerText of its
  // own (the browser hands back textContent instead), so this check comes before reading it.
  function visible(el) {
    if (typeof el.checkVisibility === 'function') return el.checkVisibility({ visibilityProperty: true });
    if (!el.getClientRects().length) return false; // a browser without checkVisibility (Safari before 17.4)
    return getComputedStyle(el).visibility === 'visible';
  }
  // A deck-kit source list (.flow-src, .strip-src, .bars-src, .compress-src, .rung-src ...): the
  // text a scene, compress or rung slide draws from step by step. compress-src and rung-src stay
  // rendered (clipped to 1 px), so only their class keeps them off the phones.
  var SOURCE = '[class$="-src"], [class*="-src "]';
  // A figure counts from data-from to data-to over a second or so after the slide opens, so its
  // text is a number on the way. Send the end value, the way deck.js shows it when the count lands.
  function figureText(el) {
    var num = el.querySelector('.figure__num[data-to]');
    var to = num ? parseFloat(num.getAttribute('data-to')) : NaN;
    if (isNaN(to)) return el.innerText;
    var end = Math.round(to);
    end = Math.abs(to) >= 1000 ? end.toLocaleString('en-US') : String(end);
    return Array.prototype.map.call(el.childNodes, function (n) {
      if (n === num) return end;
      if (n.nodeType !== 1) return n.textContent;
      return n.contains(num) ? figureText(n) : visible(n) ? n.innerText : '';
    }).join(' ');
  }

  function read(st) {
    var slides = document.querySelectorAll('main.deck > section.slide');
    var slide = slides[st.i];
    if (!slide) return null;
    var beats = Array.prototype.slice.call(slide.querySelectorAll('[data-beat]'));
    var hidden = beats.slice(st.b);
    function shown(el) {
      if (el.closest('aside.notes, .notice') || el.closest(SOURCE)) return false;
      for (var k = 0; k < hidden.length; k++) if (hidden[k] === el || hidden[k].contains(el)) return false;
      return visible(el);
    }
    var head = Array.prototype.filter.call(slide.querySelectorAll('h1, h2'), shown)[0];
    var lines = [];
    slide.querySelectorAll('.eyebrow, .sub, li, .label, .clock__hint, p.figure').forEach(function (el) {
      if (!shown(el)) return;
      if (el.tagName === 'LI' && el.parentElement.closest('li')) return;
      // innerText leaves out a beat inside the line that isn't shown yet, and keeps the gap
      // between a beat and its detail line.
      var t = clean(el.matches('p.figure') ? figureText(el) : el.innerText);
      if (t && lines.indexOf(t) < 0) lines.push(t);
    });
    return { index: st.i, beat: st.b, count: slides.length, title: head ? clean(head.innerText) : clean(slide.getAttribute('aria-label')), lines: lines.slice(0, 12) };
  }
  // True when two reads of a slide would show the phones the same thing.
  function same(a, b) { return a.title === b.title && a.lines.join('\n') === b.lines.join('\n'); }

  var last = '';
  var pressAt = 0; // when the deck reached slide:press `last` (Date.now())
  // A press starts animations (a strip card scrolling onto the stage, a scene drawing its next
  // stop), so for 3 s after it each check reads the slide again and sends it again when what the
  // phones would show has changed. After that a slide's lines stay as sent until the next press.
  var SETTLE_MS = 3000;
  var latest = null; // the body of the last send
  var latestAt = 0; // when `latest` first went out (Date.now())
  var RETRY_MS = 120000; // a failed send is tried again for 2 minutes after it first went out
  // Sites whose send of `latest` failed: { wait: checks until the next try, gap: checks between
  // tries (1, 2, 4 ... 32), busy: a try is on its way }.
  var retry = {};
  // A send that didn't land: no answer (no network, a typo'd deployment name) or a 5xx (the
  // backend failed to store it or was busy). Only that site tries `latest` again.
  function failed(site, body, why) {
    if (body !== latest) return; // a newer slide has gone out since
    var gap = retry[site] ? Math.min(retry[site].gap * 2, 32) : 1;
    retry[site] = { wait: gap, gap: gap, busy: false };
    console.warn('deck-bridge:', site, why);
  }
  function send(site, body) {
    fetch(site.replace(/\/$/, '') + '/deck', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(body) })
      .then(function (r) {
        // A 4xx (403 wrong key, 400 bad slide) fails the same way every time: no retry.
        if (r.status >= 500) return failed(site, body, r.status);
        if (!r.ok) console.warn('deck-bridge:', site, r.status);
        if (body === latest) delete retry[site];
      })
      .catch(function (e) { failed(site, body, e); });
  }
  function tick() {
    var st = window.__deck && window.__deck.state();
    if (!st) return;
    var sig = st.i + ':' + st.b;
    var body = null;
    if (sig === last) {
      var fresh = Date.now() - pressAt < SETTLE_MS ? read(st) : null;
      if (fresh && !same(fresh, latest)) body = fresh;
      else {
        if (Date.now() - latestAt > RETRY_MS) { retry = {}; return; }
        Object.keys(retry).forEach(function (site) {
          var r = retry[site];
          if (r.busy || --r.wait > 0) return;
          r.busy = true;
          send(site, latest);
        });
        return;
      }
    } else {
      body = read(st);
      if (!body) return;
      last = sig;
      pressAt = Date.now();
    }
    // Up by at least 1 on every send, and never behind the clock, so after a reload it is past
    // every send before it even when the last one never reached sessionStorage.
    run.seq = Math.max(run.seq + 1, Date.now());
    keep('run', run);
    body.channel = channel;
    body.key = key;
    body.run = run.id;
    body.seq = run.seq;
    latest = body;
    latestAt = Date.now();
    retry = {};
    sites.forEach(function (site) { send(site, body); });
  }
  setInterval(tick, 300);
})();
