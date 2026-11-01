// #/checkin/stage: the projector screen. The professor's deck fills the screen. A card in the
// bottom-right corner shows the check-in QR (it opens #/checkin/student), how many students have
// checked in, and the newest quiz or vote: "N answered" while it's open, then a bar per choice once
// it ends, with "✓ right answer" on the right one. × hides the card and "Show check-in" brings it
// back. When a student checks in late, the late banner (LateBanner.tsx) shows their first name,
// unless they turned that off on their pass. The whole room sees this screen, so it never shows a
// full name or an email.
//
// The link: #/checkin/stage?deck=<the deck's address>&bridge=<channel>.<DECK_BRIDGE_KEY>
//   deck: the deck to show. "https://" is added when it's missing, and on the https site an
//     http deck loads over https, since browsers block an http frame there (stageLink.ts). With
//     no ?deck= the page says to add one; an address that can't load says "That deck link didn't
//     work."
//   bridge: handed to the deck, whose deck-bridge.js then sends each slide to the phones. As soon
//     as the page has the key it saves it in this tab's sessionStorage and the address bar shows
//     ?bridge=saved instead, so the key never shows on the projector and a reload still hands it
//     to the deck. A new tab needs the link with the key again: a ?bridge=saved link opened in a
//     tab that saved no key (a bookmark, a copied address bar) shows "Phones aren't getting these
//     slides." at the top of the stage. The saved key goes only to a deck on the origin of the
//     ?deck= it came with: a ?bridge=saved link to a deck anywhere else gets no key and the same
//     line, since the key in a deck's address reaches that site. Taking ?bridge=saved out of the link stops the slides
//     going to the phones. When the link has more than one ?bridge=, the last key counts.
//   bridge-site: handed to the deck too, so it sends to that Convex backend instead of the one its
//     script tag names (prod, for the published decks). Checks on Sam's dev backend always pass
//     bridge-site=quaint-swan-637.
// The page reads the link again whenever the hash changes (useHashParams).
//
// The deck can't go full screen inside this page (allow="fullscreen 'none'"), so the deck's F key
// can't cover the card; use the browser's own full screen. Arrow keys go to the deck: it gets focus
// when it loads and after every click or tap on the card. The count, the quiz and the late banner
// each sit in an ErrorBoundary, so a query that fails shows an error in that spot and the deck
// stays up.
import "./stage.css";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { pageUrl, useHashParams } from "../../blocks/router";
import { QR } from "../../blocks/qr";
import { CHANNEL } from "../../blocks/deck";
import { Projector } from "../../blocks/kit";
import { ErrorBoundary } from "../../blocks/ui";
import LateBanner from "./LateBanner";
import { SAVED, bridgeIn, deckAddress, frameSrc, keyFor, savedBridge, takeBridge } from "./stageLink";

const LETTERS = ["A", "B", "C", "D"];

export default function Stage() {
  const params = useHashParams();
  const link = (params.get("deck") ?? "").trim();
  const deck = link ? deckAddress(link, location.protocol === "https:") : null;
  const inLink = bridgeIn(params);
  const bridge = useBridge(inLink, deck);
  const lost = inLink === SAVED && !bridge;
  const frame = useRef<HTMLIFrameElement>(null);
  const [shown, setShown] = useState(true);

  // Arrow keys belong to the deck: give it focus on load and after every tap on the overlay.
  const refocus = () => frame.current?.contentWindow?.focus();
  useEffect(() => {
    document.body.classList.add("stage-body");
    return () => document.body.classList.remove("stage-body");
  }, []);

  return (
    <div className="stage" onPointerUp={() => setTimeout(refocus, 0)}>
      {deck ? (
        <iframe
          ref={frame}
          className="stage__deck"
          src={frameSrc(deck, bridge, params.get("bridge-site"))}
          title="Slides"
          onLoad={refocus}
          allow="fullscreen 'none'"
        />
      ) : link ? (
        <Projector title="That deck link didn't work.">
          <p>Put your deck's address after <code>?deck=</code> in this page's link.</p>
        </Projector>
      ) : (
        <Projector title={<>Add <code>{"?deck=<your deck's address>"}</code> to this page's link.</>} />
      )}
      <div className="stage__late" data-theme="light">
        <ErrorBoundary label="The late banner">
          <LateBanner />
        </ErrorBoundary>
      </div>
      {lost && (
        <p className="stage__warn" data-theme="light" role="alert">
          Phones aren't getting these slides. Open this page from the full link again.
        </p>
      )}
      {shown ? (
        <aside className="stage__card" data-theme="light">
          <button className="stage__hide" onClick={() => setShown(false)} aria-label="Hide check-in">×</button>
          <QR value={pageUrl("checkin/student")} size={150} />
          <ErrorBoundary label="The check-in count">
            <Count />
          </ErrorBoundary>
          <p className="stage__hint">Scan to check in</p>
          <ErrorBoundary label="The quiz">
            <Poll />
          </ErrorBoundary>
        </aside>
      ) : (
        <button className="stage__show" data-theme="light" onClick={() => setShown(true)}>Show check-in</button>
      )}
    </div>
  );
}

// The bridge value for the deck: the one in the link, or, when the link says ?bridge=saved, this
// tab's saved key if the deck is on the origin the key came with (keyFor). takeBridge() swaps a key
// in the address bar for "saved" once the page has it, and again after every hash change, since
// the full link can be pasted in again.
function useBridge(inLink: string | null, deck: URL | null) {
  const [saved, setSaved] = useState(savedBridge);
  useEffect(() => {
    const take = () => {
      if (takeBridge()) setSaved(savedBridge());
    };
    take();
    window.addEventListener("hashchange", take);
    return () => window.removeEventListener("hashchange", take);
  }, []);
  return inLink === SAVED ? keyFor(saved, deck) : inLink;
}

function Count() {
  const count = useQuery(api.checkin.read.count, { channel: CHANNEL });
  return <p className="stage__count"><b>{count ?? "…"}</b> checked in</p>;
}

// The newest quiz or vote: how many answered while it's open, then a bar per choice.
function Poll() {
  const poll = useQuery(api.checkin.quiz.current, { channel: CHANNEL });
  if (poll === undefined) return null;
  if (poll === null) return <p className="stage__none">No quiz or vote yet.</p>;
  const results = poll.results;
  const total = results ? results.counts.reduce((a, b) => a + b, 0) : 0;
  return (
    <div className="stage__poll">
      <p className="stage__q">{poll.question}</p>
      {poll.open ? (
        <p className="stage__answered"><b>{poll.answered}</b> answered</p>
      ) : (
        results && (
          <ul className="stage__bars">
            {poll.choices.map((c, i) => {
              const n = results.counts[i] ?? 0;
              const right = results.correct === i;
              return (
                <li key={i} className={right ? "stage__bar stage__bar--right" : "stage__bar"}>
                  <span className="stage__fill" style={{ width: total ? `${(100 * n) / total}%` : 0 }} />
                  <span className="stage__label">{LETTERS[i]} {c}</span>
                  <b>{n}</b>
                  {right && <span className="stage__right">✓ right answer</span>}
                </li>
              );
            })}
          </ul>
        )
      )}
    </div>
  );
}
