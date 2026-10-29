// /#/lab: one panel per building block, so anyone can see each one work before building on it.
import { lazy, Suspense, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { SignInButton, useGoogleUser } from "../blocks/auth";
import { QR } from "../blocks/qr";
import { useLocation } from "../blocks/location";
import { useDeckSlide } from "../blocks/deck";
import { pageUrl } from "../blocks/router";
// Loaded only when the lab opens, so phones on other pages never download the vision library.
const Vision = lazy(() => import("./LabVision"));

export default function Lab() {
  return (
    <main className="page">
      <h1>Lab</h1>
      <p className="muted">Each panel tests one building block.</p>
      <SignIn />
      <Sync />
      <Qr />
      <Location />
      <Deck />
      <Ai />
      <Suspense fallback={<p className="muted">Loading vision…</p>}><Vision /></Suspense>
    </main>
  );
}

function SignIn() {
  const { user, signOut } = useGoogleUser();
  const who = useQuery(api.lab.whoami);
  return (
    <section className="panel">
      <h2>Google sign-in</h2>
      {user ? (
        <>
          <p>
            Signed in as <b>{user.name || user.email}</b>.{" "}
            {who === undefined ? "Checking with the server…" : who ? (who.isHost ? "The server says you're a host." : "The server says you're a student.") : "The server didn't accept the sign-in."}
          </p>
          <button onClick={signOut}>Sign out</button>
        </>
      ) : (
        <SignInButton />
      )}
    </section>
  );
}

function Sync() {
  const count = useQuery(api.lab.pings);
  const ping = useMutation(api.lab.ping);
  const [err, setErr] = useState("");
  return (
    <section className="panel">
      <h2>Live sync</h2>
      <p>
        Pings so far: <b>{count ?? "…"}</b>. Open this page on two devices and press on one.
      </p>
      <button onClick={() => ping().then(() => setErr(""), (e) => setErr(String(e.data ?? e.message)))}>Ping</button>
      {err && <p className="error">{err}</p>}
    </section>
  );
}

function Qr() {
  const [value, setValue] = useState(pageUrl("lab"));
  return (
    <section className="panel">
      <h2>QR code</h2>
      <label>
        Encodes
        <input value={value} onChange={(e) => setValue(e.target.value)} />
      </label>
      <QR value={value} size={240} />
    </section>
  );
}

function Location() {
  const { fix, error, busy, request } = useLocation();
  return (
    <section className="panel">
      <h2>Location</h2>
      <button disabled={busy} onClick={() => request().catch(() => {})}>
        {busy ? "Finding you…" : "Share my location"}
      </button>
      {fix && (
        <p>
          {fix.lat.toFixed(5)}, {fix.lng.toFixed(5)} · within about {Math.round(fix.accuracyM)} m
        </p>
      )}
      {error && <p className="error">{error}</p>}
    </section>
  );
}

function Deck() {
  const [channel, setChannel] = useState("test");
  const slide = useDeckSlide(channel || null);
  return (
    <section className="panel">
      <h2>Deck bridge</h2>
      <label>
        Channel
        <input value={channel} onChange={(e) => setChannel(e.target.value.trim())} />
      </label>
      {slide === undefined ? (
        <p className="muted">Loading…</p>
      ) : slide === null ? (
        <p className="muted">No deck has sent this channel anything yet.</p>
      ) : (
        <div className="slide">
          <p className="muted">
            Slide {slide.index + 1} of {slide.count} · press {slide.beat}
          </p>
          <h3>{slide.title}</h3>
          <ul>
            {slide.lines.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function Ai() {
  const run = useAction(api.lab.aiPing);
  const [out, setOut] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <section className="panel">
      <h2>AI (Gemini)</h2>
      <button
        disabled={busy}
        onClick={() => {
          setBusy(true);
          run().then(setOut, (e) => setOut("Error: " + String(e.data ?? e.message))).finally(() => setBusy(false));
        }}
      >
        {busy ? "Asking…" : "Ask the AI"}
      </button>
      {out && <p>{out}</p>}
    </section>
  );
}
