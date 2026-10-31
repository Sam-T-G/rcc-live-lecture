// #/checkin/student (also #/checkin/join): the student signs in (a typed name and email; StudentSignIn says why not Google yet), and
// the phone shows their QR pass until the professor or the door kiosk scans it. Both screens say
// who is signed in, with "Not you? Sign out". The pass asks for a new code every 5 s, whenever
// the phone comes back to the page, and as the code turns 20 s old (passTiming.ts); a code over
// 25 s old on screen means those asks stopped getting through, so it shows "Getting a new code…"
// in place of a QR the door would refuse.
import { useCallback, useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Link } from "../../blocks/router";
import { Screen, Status } from "../../blocks/ui";
import { QR } from "../../blocks/qr";
import { CHANNEL } from "../../blocks/deck";
import { SignedInAs, StudentSignIn, useGoogleUser } from "../../blocks/auth";
import LateBanner from "./LateBanner";
import { QuizCard } from "./Quiz";
import { askForCodes, codeIsOld, msUntilNewCode } from "./passTiming";
import { why } from "./util";

export function Student() {
  const { user } = useGoogleUser();
  if (!user)
    return (
      <Screen title="Your check-in pass">
        <p>Sign in to get your pass.</p>
        <StudentSignIn />
      </Screen>
    );
  return <StudentPass />;
}

export function StudentPass() {
  const { signOut } = useGoogleUser();
  const pass = useQuery(api.checkin.pass.mine);
  // True once checked in; still loading counts as not yet, so the pass asks for codes meanwhile.
  const here = useQuery(api.checkin.read.me, { channel: CHANNEL }) === true;
  const refresh = useMutation(api.checkin.pass.refresh);
  const [err, setErr] = useState("");
  // The code on screen (by its `at`) and when this phone got it, by the phone's own clock.
  const [got, setGot] = useState<{ at: number; when: number } | null>(null);
  const now = useClock(!here);

  // The server makes a new code only once the current one is 20 s old. "Sign in first." means it
  // no longer takes this sign-in, so the page signs out and the sign-in form comes back.
  const ask = useCallback(() => {
    refresh({ channel: CHANNEL }).then(
      () => setErr(""),
      (e) => {
        const message = why(e);
        if (message === "Sign in first.") signOut();
        else setErr(message);
      },
    );
  }, [refresh, signOut]);

  useEffect(() => (here ? undefined : askForCodes(ask, window, document)), [here, ask]);

  useEffect(() => {
    if (pass) setGot((g) => (g?.at === pass.at ? g : { at: pass.at, when: Date.now() }));
  }, [pass]);

  useEffect(() => {
    if (here || !got) return;
    const timer = setTimeout(ask, msUntilNewCode(got.when, Date.now()));
    return () => clearTimeout(timer);
  }, [here, got, ask]);

  if (here)
    return (
      <Screen title="You’re checked in.">
        <QuizCard />
        <p><Link to="live">Follow the slides</Link></p>
        <HideLate />
        <SignedInAs />
        <LateBanner />
      </Screen>
    );
  if (!pass)
    return (
      <Screen title="Your check-in pass">
        {err ? <Status kind="error">{err}</Status> : <Status kind="loading">Making your pass…</Status>}
        <SignedInAs />
      </Screen>
    );
  // A code this page hasn't timed yet has just arrived, so it shows.
  const old = got?.at === pass.at && codeIsOld(got.when, now);
  return (
    <Screen title="Show this to the professor">
      <div className="pass">
        <div className="pass__qr">
          {old ? <Status kind="loading">Getting a new code…</Status> : <QR value={"RCC-" + pass.code} size={280} />}
        </div>
        <p className="pass__name">{pass.name}</p>
        <p className={old ? "pass__code pass__code--old" : "pass__code"} aria-hidden={old || undefined}>
          {pass.code}
        </p>
        <p className="muted">The code changes every 20 seconds. A screenshot stops working within a minute.</p>
        {err && <Status kind="error">{err}</Status>}
        <HideLate />
      </div>
      <SignedInAs />
      <LateBanner />
    </Screen>
  );
}

// The time now, by this phone's clock: every second while `on`, and at once when the page turns
// visible, so an old code hides the moment the phone wakes.
function useClock(on: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!on) return;
    const tick = () => setNow(Date.now());
    const timer = setInterval(tick, 1000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [on]);
  return now;
}

// A late check-in puts the student's first name on every class screen (LateBanner.tsx). This
// turns that off for them.
export function HideLate() {
  const hide = useQuery(api.checkin.attendance.myHideLate);
  const set = useMutation(api.checkin.attendance.setHideLate);
  const [err, setErr] = useState("");
  if (hide === undefined) return null;
  return (
    <>
      <label className="muted">
        <input
          type="checkbox"
          checked={hide}
          onChange={(e) => set({ hide: e.target.checked }).then(() => setErr(""), (x) => setErr(why(x)))}
        />
        Don’t show my first name on the class screens when I’m late
      </label>
      {err && <Status kind="error">{err}</Status>}
    </>
  );
}
