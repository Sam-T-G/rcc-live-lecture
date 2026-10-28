/* deck-bridge.js: sends a deck-kit deck's current slide to this app's Convex backend.

   Add one line to a deck, after deck.js:
     <script src="https://sam-t-g.github.io/rcc-live-lecture/deck-bridge.js"
             data-site="https://<deployment>.convex.site" defer></script>
   Then open the deck with ?bridge=<channel>.<DECK_BRIDGE_KEY> on its URL. Without that
   parameter the script does nothing, so a published deck is safe to carry the line.
   Phones read the channel with useDeckSlide("<channel>") (src/blocks/deck.ts).

   It sends: the slide number, presses revealed, slide count, the heading, and the
   slide's visible text in order (never speaker notes, never beats not yet shown). */
(function () {
  var me = document.currentScript;
  var site = me && me.getAttribute('data-site');
  var param = (/[?&]bridge=([^&#]+)/.exec(location.search) || [])[1];
  if (!site || !param) return;
  if (/[?&]view=/.test(location.search)) return; // presenter, mirror, remote: only the main window sends
  var cut = decodeURIComponent(param).lastIndexOf('.');
  if (cut < 1) return;
  var channel = decodeURIComponent(param).slice(0, cut), key = decodeURIComponent(param).slice(cut + 1);

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
    body.channel = channel;
    body.key = key;
    fetch(site.replace(/\/$/, '') + '/deck', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(body) })
      .then(function (r) { if (!r.ok) console.warn('deck-bridge:', r.status); })
      .catch(function (e) { last = ''; console.warn('deck-bridge: offline', e); });
  }
  setInterval(tick, 300);
})();
