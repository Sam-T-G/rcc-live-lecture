// #/checkin/stage: the projector screen. The professor's deck fills the screen. The check-in card
// (the kit's .stage-card, 600 stage px wide on the right of the 96 frame, the frame's full height)
// shows the check-in QR (it opens #/checkin/student) and how many students have checked in. The
// newest quiz or vote shows in a panel that takes the left column while it's open: the question,
// "N answered" and the choices, each after its A to D letter tile. Once it ends, the panel is the
// card's width at the bottom of the left column, with a bar per choice and "✓ right answer" on the
// right one, so the deck shows around it for the rest of class (quiz.current keeps returning the
// ended poll); the card steps down to the sunken rung while it shows and keeps its box. × hides the
// card (and the quiz panel with it) and "Show check-in" brings it back. The bottom-left lane holds
// the late banner (LateBanner.tsx: a student's first name when they check in late, unless they
// turned that off on their pass) and the notes for the presenter: no ?deck=, a deck link that
// can't load, a ?bridge=saved link with no saved key, and a part that didn't load. The whole room
// sees this screen, so it never shows a full name or an email. stage.css places it all.
//
// The link: #/checkin/stage?deck=<the deck's address>&bridge=<channel>.<DECK_BRIDGE_KEY>
//   deck: the deck to show. "https://" is added when it's missing, and on the https site an
//     http deck loads over https, since browsers block an http frame there (stageLink.ts). With
//     no ?deck= the page says to add one; an address that can't load says "That deck link didn't
//     work."
//   bridge: handed to the deck, whose deck-bridge.js then sends each slide to the phones. As soon
//     as the page has the key, it saves the key in this tab's sessionStorage and the address bar
//     shows ?bridge=saved instead, so the key never shows on the projector and a reload still
//     hands it to the deck. A new tab needs the link with the key again: a ?bridge=saved link
//     opened in a tab that saved no key (a bookmark, a copied address bar) shows "Phones aren't
//     getting these slides." at the top of the stage. The saved key goes only to a deck on the
//     origin of the ?deck= it came with: a ?bridge=saved link to a deck anywhere else gets no key
//     and the same line, since the key in a deck's address reaches that site. A key whose link had
//     no ?deck= that loads waits in the tab and goes to the first ?deck= that loads there, then
//     only to that deck's origin. Taking ?bridge=saved out of the link stops the slides going to
//     the phones. When the link has more than one ?bridge=, the last key counts.
//   bridge-site: handed to the deck too, so it sends to that Convex backend instead of the one its
//     script tag names (prod, for the published decks). Checks on Sam's dev backend always pass
//     bridge-site=quaint-swan-637.
// The page reads the link again whenever the hash changes (useHashParams).
//
// The deck can't go full screen inside this page (allow="fullscreen 'none'"), so the deck's F key
// can't cover the card; use the browser's own full screen. Arrow keys go to the deck: it gets focus
// when it loads and after every click or tap on the card. The count, the quiz and the late banner
// each sit in an ErrorBoundary, so a query that fails shows an error and the deck and the QR stay
// up: the error and its Try again sit in the bottom-left lane for the count and the late banner,
// and in the quiz panel's place for the quiz.
//
// Markup that Stage.test.ts and Stage.press.test.ts pin: the root .stage with the deck first, the
// aside .stage__card (data-theme light), the hide button right before the QR, the count, "Scan to
// check in" and the quiz in that order, and the .stage__warn line. The kit's look comes from the
// .stage-card inside the aside and the .pnote notes; stage.css draws the rest.
import "./stage.css";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { pageUrl, useHashParams } from "../../blocks/router";
import { QR } from "../../blocks/qr";
import { CHANNEL } from "../../blocks/deck";
import { Icon, Projector } from "../../blocks/kit";
import { ErrorBoundary } from "../../blocks/ui";
import LateBanner from "./LateBanner";
import { SAVED, bindTo, bridgeIn, deckAddress, frameSrc, keyFor, savedBridge, takeBridge } from "./stageLink";

const LETTERS = ["A", "B", "C", "D"];

// Each presenter note opens with this on its own line beside the warning glyph (stage.css; comp
// projector-stage-setup), so the room can tell which lines are for whoever runs the screen. The
// count's and the quiz's error lines open with it too, on the same line (ErrorBoundary prefix).
const FOR_PRESENTER = <span className="pnote__who">For the presenter:</span>;

export default function Stage() {
  const params = useHashParams();
  const link = (params.get("deck") ?? "").trim();
  const deck = link ? deckAddress(link, location.protocol === "https:") : null;
  const inLink = bridgeIn(params);
  const { bridge, waiting } = useBridge(inLink, deck);
  const lost = inLink === SAVED && !bridge && !waiting;
  const frame = useRef<HTMLIFrameElement>(null);
  const [shown, setShown] = useState(true);

  // Arrow keys belong to the deck: give it focus on load and after every tap on the overlay.
  const refocus = () => frame.current?.contentWindow?.focus();
  useEffect(() => {
    document.body.classList.add("stage-body");
    return () => document.body.classList.remove("stage-body");
  }, []);

  // With no deck the left column is the page's ground and a presenter note says what to add.
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
      ) : (
        <Projector />
      )}
      <div className="stage__lane" data-theme="light" data-surface="projector">
        <div className="stage__late" data-theme="light">
          <ErrorBoundary label="The late banner">
            <LateBanner />
          </ErrorBoundary>
        </div>
        {!deck && (
          <p className="pnote">
            <Icon name="warning" />
            {link ? (
              <span>
                {FOR_PRESENTER} <b>That deck link didn't work.</b> Put your deck's address after <code>?deck=</code> in this page's link.
              </span>
            ) : (
              <span>
                {FOR_PRESENTER} Add <code>{"?deck=<your deck's address>"}</code> to this page's link.
              </span>
            )}
          </p>
        )}
        {lost && (
          <p className="stage__warn" data-theme="light" role="alert">
            <span className="pnote" data-surface="projector">
              <Icon name="warning" />
              <span>{FOR_PRESENTER} Phones aren't getting these slides. Open this page from the full link again.</span>
            </span>
          </p>
        )}
      </div>
      {shown ? (
        <aside className="stage__card" data-theme="light">
          <div className="stage-card" data-surface="projector">
            <button className="stage__hide" onClick={() => setShown(false)} aria-label="Hide check-in">
              <Icon name="x" />
            </button>
            <QR value={pageUrl("checkin/student")} size={150} />
            <ErrorBoundary label="The check-in count" prefix={FOR_PRESENTER}>
              <Count />
            </ErrorBoundary>
            <p className="stage__hint">Scan to check in</p>
            <ErrorBoundary label="The quiz" prefix={FOR_PRESENTER}>
              <Poll />
            </ErrorBoundary>
          </div>
        </aside>
      ) : (
        <button className="stage__show" data-theme="light" onClick={() => setShown(true)}>Show check-in</button>
      )}
    </div>
  );
}

// The bridge value for the deck: the one in the link, or, when the link says ?bridge=saved, this
// tab's saved key if the deck is on the origin the key came with (keyFor). A key waiting for a
// deck (saved from a link with no ?deck= that loads) goes to this deck (bindTo); takeBridge saves
// it with this deck's origin in the effect. takeBridge() swaps a key in the address bar for
// "saved" once the page has it, and again after every hash change, since the full link can be
// pasted in again. `waiting`: the key is saved and no deck loads yet, so the stage only asks for
// ?deck=.
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
  if (inLink !== SAVED) return { bridge: inLink, waiting: false };
  return { bridge: keyFor(bindTo(saved, deck), deck), waiting: !deck && saved?.origin === null };
}

// The count at the card's foot, "checked in" on its baseline. While it loads, "…" takes the
// numeral's place at the head size (stage.css, by aria-busy), so the card keeps its box.
function Count() {
  const count = useQuery(api.checkin.read.count, { channel: CHANNEL });
  if (count === undefined) {
    return (
      <p className="stage__count" aria-busy="true">
        <b>…</b> checked in
      </p>
    );
  }
  return <p className="stage__count"><b>{count}</b> checked in</p>;
}

// The newest quiz or vote: the question, then how many answered and the choices while it's open,
// then a bar per choice once it ends. It sits in the card's markup, so × hides it with the card;
// stage.css draws it as its own panel in the left column (the field and the column's full height
// while it's open, the raised rung and the card's width once it ends). "No quiz or vote yet." is there for screen readers
// only: the stage shows the deck until a question opens.
function Poll() {
  const poll = useQuery(api.checkin.quiz.current, { channel: CHANNEL });
  if (poll === undefined) return null;
  if (poll === null) return <p className="stage__none sr-only">No quiz or vote yet.</p>;
  const results = poll.results;
  const total = results ? results.counts.reduce((a, b) => a + b, 0) : 0;
  return (
    <div className="stage__poll">
      <p className="stage__q">{poll.question}</p>
      {poll.open ? (
        <>
          <p className="stage__answered"><b>{poll.answered}</b> answered</p>
          <ul className="stage__choices">
            {poll.choices.map((c, i) => (
              <li key={i} className="stage__choice">
                <span className="stage__label"><span className="letter">{LETTERS[i]}</span> {c}</span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        results && (
          <ul className="stage__bars">
            {poll.choices.map((c, i) => {
              const n = results.counts[i] ?? 0;
              const right = results.correct === i;
              return (
                <li key={i} className={right ? "stage__bar stage__bar--right" : "stage__bar"}>
                  <span className="stage__fill" style={{ width: total ? `${(100 * n) / total}%` : 0 }} />
                  <span className="stage__label"><span className="letter">{LETTERS[i]}</span> {c}</span>
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
