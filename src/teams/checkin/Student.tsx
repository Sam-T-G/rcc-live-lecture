// #/checkin/student (also #/checkin/join): the student signs in by typing a name and email, and
// the phone shows their QR pass until the professor or the door kiosk scans it.
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Link } from "../../blocks/router";
import { Screen, Status } from "../../blocks/ui";
import { QR } from "../../blocks/qr";
import { CHANNEL } from "../../blocks/deck";
import { SignInButton, useGoogleUser } from "../../blocks/auth";
import LateBanner from "./LateBanner";
import { QuizCard } from "./Quiz";
import { why } from "./util";

export function Student() {
  const { user } = useGoogleUser();
  if (!user)
    return (
      <Screen title="Your check-in pass">
        <p>Type your name and email to get your pass.</p>
        <SignInButton />
      </Screen>
    );
  return <StudentPass />;
}

export function StudentPass() {
  const pass = useQuery(api.checkin.pass.mine);
  const here = useQuery(api.checkin.read.me, { channel: CHANNEL });
  const refresh = useMutation(api.checkin.pass.refresh);
  const [err, setErr] = useState("");

  // Ask for a new code every 5 s; the server only changes it once the old one is 20 s old.
  useEffect(() => {
    if (here) return;
    const tick = () => refresh().then(() => setErr("")).catch((e) => setErr(why(e)));
    tick();
    const t = setInterval(tick, 5000);
    return () => clearInterval(t);
  }, [here, refresh]);

  if (here)
    return (
      <Screen title="You’re checked in.">
        <QuizCard />
        <p><Link to="live">Follow the slides</Link></p>
        <HideLate />
        <LateBanner />
      </Screen>
    );
  if (err) return <Screen title="Your check-in pass"><Status kind="error">{err}</Status></Screen>;
  if (!pass) return <Screen title="Your check-in pass"><Status kind="loading">Making your pass…</Status></Screen>;
  return (
    <Screen title="Show this to your teacher">
      <div className="pass">
        <QR value={"RCC-" + pass.code} size={280} />
        <p className="pass__name">{pass.name}</p>
        <p className="muted">{pass.email}</p>
        <p className="pass__code">{pass.code}</p>
        <p className="muted">The code changes every 20 seconds, so a screenshot won’t work.</p>
        <HideLate />
      </div>
      <LateBanner />
    </Screen>
  );
}

// Late check-ins put your first name on everyone's slides. This turns that off for you.
export function HideLate() {
  const hide = useQuery(api.checkin.attendance.myHideLate);
  const set = useMutation(api.checkin.attendance.setHideLate);
  if (hide === undefined) return null;
  return (
    <label className="row muted">
      <input type="checkbox" checked={hide} onChange={(e) => set({ hide: e.target.checked }).catch(() => {})} />
      Don’t put my name on the slides if I’m late
    </label>
  );
}
