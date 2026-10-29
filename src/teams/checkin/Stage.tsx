// #/checkin/stage: the projector screen. Today's deck fills the screen and the app sits on
// top in a corner: the check-in QR, how many checked in, and the live quiz.
// Open with #/checkin/stage?bridge=gdg.<DECK_BRIDGE_KEY> so the deck also feeds the phones;
// ?deck=<url> shows a different deck. Names never show here (the room sees this screen).
import { useEffect, useRef, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { pageUrl } from "../../blocks/router";
import { QR } from "../../blocks/qr";
import { CHANNEL } from "../../blocks/deck";

const TODAY = "https://sam-t-g.github.io/rcc-gdg/decks/build-with-ai/";
const LETTERS = ["A", "B", "C", "D"];

function hashParams() {
  return new URLSearchParams(location.hash.split("?")[1] ?? "");
}

export default function Stage() {
  const [params] = useState(hashParams);
  const frame = useRef<HTMLIFrameElement>(null);
  const [shown, setShown] = useState(true);
  const count = useQuery(api.checkin.read.count, { channel: CHANNEL });
  const poll = useQuery(api.checkin.quiz.current, { channel: CHANNEL });

  const deck = new URL(params.get("deck") || TODAY);
  const bridge = params.get("bridge");
  if (bridge) deck.searchParams.set("bridge", bridge);

  // Arrow keys belong to the deck: give it focus on load and after every tap on the overlay.
  const refocus = () => frame.current?.contentWindow?.focus();
  useEffect(() => {
    document.body.classList.add("stage-body");
    return () => document.body.classList.remove("stage-body");
  }, []);

  const total = poll?.results ? poll.results.counts.reduce((a, b) => a + b, 0) : 0;

  return (
    <div className="stage" onPointerUp={() => setTimeout(refocus, 0)}>
      <iframe ref={frame} className="stage__deck" src={deck.toString()} title="Slides" onLoad={refocus} allow="fullscreen" />
      {shown ? (
        <aside className="stage__card">
          <button className="stage__hide" onClick={() => setShown(false)} aria-label="Hide">×</button>
          <QR value={pageUrl("checkin/student")} size={150} />
          <p className="stage__count"><b>{count ?? "…"}</b> checked in</p>
          <p className="stage__hint">Scan to check in</p>
          {poll && (
            <div className="stage__poll">
              <p className="stage__q">{poll.question}</p>
              {poll.open ? (
                <p className="stage__answered"><b>{poll.answered}</b> answered</p>
              ) : poll.results && (
                <ul className="stage__bars">
                  {poll.choices.map((c, i) => {
                    const n = poll.results!.counts[i] ?? 0;
                    const right = poll.results!.correct === i;
                    return (
                      <li key={i} className={right ? "stage__bar stage__bar--right" : "stage__bar"}>
                        <span className="stage__fill" style={{ width: total ? `${(100 * n) / total}%` : 0 }} />
                        <span>{LETTERS[i]} {c}</span><b>{n}</b>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </aside>
      ) : (
        <button className="stage__show" onClick={() => setShown(true)}>Check-in</button>
      )}
    </div>
  );
}
