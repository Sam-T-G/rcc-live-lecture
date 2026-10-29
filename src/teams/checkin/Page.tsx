// Check-in team: #/checkin/kiosk (a host's laptop or TV at the door) and
// #/checkin/join/<code> (what a phone opens after scanning).
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Link, pageUrl, useRoute } from "../../blocks/router";
import { Big, Card, Screen, Status } from "../../blocks/ui";
import { QR } from "../../blocks/qr";
import { CHANNEL } from "../../blocks/deck";
import { SignInButton, useGoogleUser } from "../../blocks/auth";
import { useLocation } from "../../blocks/location";

// The words a ConvexError carries, or a plain fallback.
function why(e: unknown) {
  const x = e as { data?: unknown; message?: string };
  return typeof x?.data === "string" ? x.data : "Something went wrong. Try again.";
}

export default function CheckinPage() {
  const [, part = "join", code = ""] = useRoute();
  return part === "kiosk" ? <Kiosk /> : <Join code={code} />;
}

function Kiosk() {
  const { user } = useGoogleUser();
  const host = useQuery(api.host.me.isHost);
  if (!user)
    return (
      <Screen title="Check in" wide>
        <Card title="Open the kiosk">
          <p>Sign in with a host account.</p>
          <SignInButton />
        </Card>
      </Screen>
    );
  if (host === undefined) return <Screen title="Check in" wide><Status kind="loading">Checking your account…</Status></Screen>;
  if (!host) return <Screen title="Check in" wide><Status kind="error">Only hosts can open the kiosk.</Status></Screen>;
  return <KioskOn />;
}

function KioskOn() {
  const kiosk = useQuery(api.checkin.kiosk.current, { channel: CHANNEL });
  const count = useQuery(api.checkin.read.count, { channel: CHANNEL });
  const names = useQuery(api.checkin.read.names, { channel: CHANNEL });
  const start = useMutation(api.checkin.kiosk.start);
  const rotate = useMutation(api.checkin.kiosk.rotate);
  const { request, busy } = useLocation();
  const [err, setErr] = useState("");
  const open = !!kiosk;

  // Ask for a new code every 5 s; the server only changes it once the old one is 20 s old.
  useEffect(() => {
    if (!open) return;
    const t = setInterval(() => rotate({ channel: CHANNEL }).catch(() => {}), 5000);
    return () => clearInterval(t);
  }, [open, rotate]);

  async function openHere(useRoom: boolean) {
    setErr("");
    try {
      const fix = useRoom ? await request() : null;
      await start({ channel: CHANNEL, ...(fix ? { lat: fix.lat, lng: fix.lng } : {}) });
    } catch (e) {
      setErr(useRoom ? "Couldn't get this laptop's location. Try again, or open without it." : why(e));
    }
  }

  if (kiosk === undefined) return <Screen title="Check in" wide><Status kind="loading">Loading…</Status></Screen>;
  if (!kiosk)
    return (
      <Screen title="Check in" wide>
        <Card title="Open check-in">
          <p>This laptop’s location becomes the room. Phones more than about 150 m away can’t check in.</p>
          <p className="row">
            <button onClick={() => openHere(true)} disabled={busy}>{busy ? "Finding this laptop…" : "Open check-in here"}</button>
            <button className="quiet" onClick={() => openHere(false)}>Open without location</button>
          </p>
          {err && <Status kind="error">{err}</Status>}
        </Card>
      </Screen>
    );
  return (
    <Screen title="Scan to check in" wide>
      <div className="kiosk">
        <QR value={pageUrl("checkin/join/" + kiosk.code)} size={440} label="The code changes every 20 seconds." />
        <div>
          <Big value={count ?? "…"} label="checked in" />
          <ul className="kiosk__names">
            {(names ?? []).slice(0, 10).map((n) => <li key={n.at + n.name}>{n.name}</li>)}
          </ul>
          {!kiosk.room && <p className="muted">Open without location: anyone with a fresh code can check in.</p>}
        </div>
      </div>
    </Screen>
  );
}

function Join({ code }: { code: string }) {
  const { user } = useGoogleUser();
  const me = useQuery(api.checkin.read.me, { channel: CHANNEL });
  const join = useMutation(api.checkin.kiosk.join);
  const { request, busy } = useLocation();
  const [err, setErr] = useState("");
  const [sending, setSending] = useState(false);

  async function checkIn() {
    setErr("");
    setSending(true);
    let fix = null;
    try { fix = await request(); } catch { /* the server says if the room needs it */ }
    try {
      await join({ channel: CHANNEL, code, ...(fix ? { lat: fix.lat, lng: fix.lng, accuracy: fix.accuracyM } : {}) });
    } catch (e) {
      setErr(why(e));
    }
    setSending(false);
  }

  if (!code) return <Screen title="Check in"><Status kind="empty">Scan the code on the screen at the door.</Status></Screen>;
  if (!user)
    return (
      <Screen title="Check in">
        <p>Sign in with Google to check in.</p>
        <SignInButton />
      </Screen>
    );
  if (me)
    return (
      <Screen title="You’re checked in.">
        <p><Link to="live">Follow the slides</Link></p>
      </Screen>
    );
  return (
    <Screen title="Check in">
      <p className="muted">Signed in as {user.name || user.email}. Your phone shares its location once, to show you’re in the room.</p>
      <button onClick={checkIn} disabled={busy || sending}>{busy ? "Finding you…" : sending ? "Checking you in…" : "Check me in"}</button>
      {err && <Status kind="error">{err}</Status>}
    </Screen>
  );
}
