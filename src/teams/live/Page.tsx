// Live slides team: #/live, the slide the professor is on, with "I'm lost".
import { useState } from "react";
import "./live.css";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Screen, Status } from "../../blocks/ui";
import { CHANNEL, useDeckSlide } from "../../blocks/deck";
import { SignInButton, useGoogleUser } from "../../blocks/auth";

export default function LivePage() {
  const slide = useDeckSlide(CHANNEL);
  const { user } = useGoogleUser();
  const at = slide ? { channel: CHANNEL, index: slide.index } : "skip";
  const mine = useQuery(api.live.read.mine, at);
  const lost = useQuery(api.live.read.lostCount, at);
  const toggle = useMutation(api.live.lost.toggle);
  const [err, setErr] = useState("");

  if (slide === undefined) return <Screen title="Live slides"><Status kind="loading">Connecting…</Status></Screen>;
  if (slide === null) return <Screen title="Live slides"><Status kind="empty">The slides show up here when the professor starts.</Status></Screen>;
  return (
    <Screen>
      <p className="muted">Slide {slide.index + 1} of {slide.count}</p>
      <h1>{slide.title}</h1>
      <ul className="live__lines">
        {slide.lines.map((l) => <li key={l}>{l}</li>)}
      </ul>
      {user ? (
        <button
          className={mine ? "lost lost--on" : "lost"}
          onClick={() => toggle({ channel: CHANNEL, index: slide.index }).then(() => setErr(""), () => setErr("That didn’t go through. Tap again."))}
        >
          {mine ? "Marked lost. Tap if you caught up." : "I’m lost"}
        </button>
      ) : (
        <>
          <p>Sign in to tell the professor when you’re lost.</p>
          <SignInButton />
        </>
      )}
      {!!lost && <p className="muted">{lost === 1 ? "1 person is" : lost + " people are"} lost on this slide.</p>}
      {err && <Status kind="error">{err}</Status>}
    </Screen>
  );
}
