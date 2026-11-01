// #/lab: one panel for each building block (sign-in, live sync, QR code, location, the deck
// bridge, AI and vision), to check on a real phone or laptop that each one works before a page
// builds on it. Anyone can open it; Home links it. Ping and Ask the AI work only for professors
// and admins, because the server lets only them call lab.ping and lab.aiPing (convex/lab.ts says
// why), so everyone else sees a line saying so in those two panels. Each panel that reads from
// the server has its own ErrorBoundary, so a block that breaks leaves the other panels up.
import { Suspense, useState, type ReactNode } from "react";
import { useAction, useConvexAuth, useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { SignInButton, useGoogleUser } from "../blocks/auth";
import { useDeckSlide } from "../blocks/deck";
import { Button } from "../blocks/kit";
import { useLocation } from "../blocks/location";
import { QR } from "../blocks/qr";
import { pageUrl } from "../blocks/router";
import { Card, ErrorBoundary, Screen, Status } from "../blocks/ui";
import { useStaff } from "../teams/checkin/prof";
import { why } from "../teams/checkin/util";
import { retryLazy } from "./retryLazy";
// The vision panel loads only when the lab opens. LabVision.tsx is the one file that imports the
// vision block (src/blocks/vision.ts, which brings in MediaPipe, about 160 KB), and pages that only
// need the camera import src/blocks/camera.ts instead, so phones on other pages never download
// MediaPipe. src/blocks/camera.test.ts fails if a static import ever brings it back.
// retryLazy instead of React.lazy, so the panel's Try again imports the chunk again after a
// failed load (src/pages/retryLazy.ts says why).
const pickVision = retryLazy(() => import("./LabVision"));

// Each mount picks the vision component once. The ErrorBoundary's Try again mounts this again,
// which gets a new import after a failed one.
function VisionPanel() {
  const [Vision] = useState(pickVision);
  return (
    <Suspense fallback={<Status kind="loading">Loading vision…</Status>}>
      <Vision />
    </Suspense>
  );
}

export default function Lab() {
  return (
    <Screen title="Lab">
      <ErrorBoundary label="The sign-in panel">
        <SignIn />
      </ErrorBoundary>
      <ErrorBoundary label="The live sync panel">
        <Sync />
      </ErrorBoundary>
      <ErrorBoundary label="The QR panel">
        <Qr />
      </ErrorBoundary>
      <Location />
      <ErrorBoundary label="The deck panel">
        <Deck />
      </ErrorBoundary>
      <ErrorBoundary label="The AI panel">
        <Ai />
      </ErrorBoundary>
      <ErrorBoundary label="The vision panel">
        <VisionPanel />
      </ErrorBoundary>
    </Screen>
  );
}

// What lab.whoami's role is called on the page. No role is a student.
const ROLE_WORDS = { admin: "an admin", professor: "a professor", scanner: "a scanner" } as const;

function SignIn() {
  const { user, signOut } = useGoogleUser();
  // Waits for Convex to take the sign-in first (as useStaff does), so the line never says the
  // server refused a sign-in for a moment before the real answer comes.
  const { isLoading } = useConvexAuth();
  const who = useQuery(api.lab.whoami, isLoading ? "skip" : {});
  return (
    <Card title="Sign in">
      {user ? (
        <>
          <p>
            Signed in as <b>{user.name || user.email}</b>.{" "}
            {who === undefined
              ? "Checking with the server…"
              : who
                ? `The server says you're ${who.role ? ROLE_WORDS[who.role] : "a student"}.`
                : "The server didn't accept the sign-in."}
          </p>
          <Button variant="secondary" onClick={signOut}>
            Sign out
          </Button>
        </>
      ) : (
        <SignInButton />
      )}
    </Card>
  );
}

// Ping and Ask the AI: `children` (the button) for professors and admins, and `line` for
// everyone else, plus which account to sign in with when signed out. The server checks again
// on every call (convex/lab.ts).
function ProfOnly({ line, children }: { line: string; children: ReactNode }) {
  const me = useStaff();
  if (me === undefined) return <Status kind="loading">Checking who is signed in…</Status>;
  if (me && (me.role === "professor" || me.role === "admin")) return <>{children}</>;
  return <p>{me === null ? `${line} Sign in with the Google account your admin added.` : line}</p>;
}

// "9:30:05 PM": to the second, so pings a few seconds apart show different times.
const toTheSecond = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" });

// Live sync: the newest ping's time (lab.lastPing). Every open #/lab shows the new time when a
// professor or admin presses Ping, even after 500 pings, where lab.pings (a count that stops at
// 500) would stay the same.
export function Sync() {
  const last = useQuery(api.lab.lastPing);
  const ping = useMutation(api.lab.ping);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function press() {
    setBusy(true);
    setError("");
    try {
      await ping();
    } catch (e) {
      setError(why(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card title="Live sync">
      {last === undefined ? (
        <Status kind="loading">Loading the last ping…</Status>
      ) : last === null ? (
        <Status kind="empty">No pings yet.</Status>
      ) : (
        <p>
          Last ping at <b>{toTheSecond(last)}</b>.
        </p>
      )}
      <ProfOnly line="Only professors and admins can press Ping, since each press saves a row on the server.">
        <p>Open #/lab on two devices and press Ping on one. The time changes on both.</p>
        <Button busy={busy} onClick={press}>
          Ping
        </Button>
      </ProfOnly>
      {error && <Status kind="error">{error}</Status>}
    </Card>
  );
}

function Qr() {
  const [value, setValue] = useState(pageUrl("lab"));
  return (
    <Card title="QR code">
      <label>
        Encodes
        <input value={value} onChange={(e) => setValue(e.target.value)} />
      </label>
      <QR value={value} size={240} />
    </Card>
  );
}

function Location() {
  const { fix, error, busy, request } = useLocation();
  return (
    <Card title="Location">
      <Button busy={busy} onClick={() => request().catch(() => {})}>
        Share my location
      </Button>
      {fix && (
        <p>
          {fix.lat.toFixed(5)}, {fix.lng.toFixed(5)} · within about {Math.round(fix.accuracyM)} m
        </p>
      )}
      {error && <Status kind="error">{error}</Status>}
    </Card>
  );
}

function Deck() {
  const [channel, setChannel] = useState("test");
  const slide = useDeckSlide(channel || null);
  return (
    <Card title="Deck bridge">
      <label>
        Channel
        <input value={channel} onChange={(e) => setChannel(e.target.value.trim())} />
      </label>
      {!channel ? (
        <Status kind="empty">Type a channel.</Status>
      ) : slide === undefined ? (
        <Status kind="loading">Loading…</Status>
      ) : slide === null ? (
        <Status kind="empty">No slide on this channel in this class yet.</Status>
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
    </Card>
  );
}

export function Ai() {
  const run = useAction(api.lab.aiPing);
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState("");
  async function ask() {
    setBusy(true);
    setAnswer("");
    setError("");
    try {
      setAnswer(await run());
    } catch (e) {
      setError(why(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card title="AI (Gemini)">
      <ProfOnly line="Only professors and admins can ask the AI, since each question uses the app's Gemini key.">
        <Button busy={busy} onClick={ask}>
          Ask the AI
        </Button>
      </ProfOnly>
      {answer && (
        <p>
          Gemini answered: <b>{answer}</b>
        </p>
      )}
      {error && <Status kind="error">{error}</Status>}
    </Card>
  );
}
