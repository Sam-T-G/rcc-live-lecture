// #/checkin/student (also #/checkin/join): the student signs in with Google (StudentSignIn; the
// typed test form only in `npm run dev` builds), and the phone shows their QR pass until the
// professor or the door kiosk scans it. Both screens say who is signed in, with "Not you? Sign out". The pass asks for a new code every 5 s, whenever
// the phone comes back to the page, and as the code turns 20 s old (passTiming.ts); a code over
// 25 s old on screen means those asks stopped getting through, so it shows "Getting a new code…"
// in place of a QR the door would refuse.
// Layout (docs/design.md, phone): the app bar names the page, then the pass, the student's ticket,
// top-anchored under it: the QR on its white plate, the perforation, the name and the code a
// professor reads out when the camera fails. Checked in, the pass turns into its stub on the green
// field. The late opt-out and the signed-in line follow the pass. checkin.css draws the frame.
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Link } from "../../blocks/router";
import { ErrorBoundary, Status } from "../../blocks/ui";
import { Icon } from "../../blocks/kit";
import { QR } from "../../blocks/qr";
import { CHANNEL } from "../../blocks/deck";
import { SignedInAs, StudentSignIn, useGoogleUser } from "../../blocks/auth";
import LateBanner from "./LateBanner";
import { SignInEnding, STUDENT_ENDING } from "./prof";
import { QuizCard } from "./Quiz";
import { askForCodes, codeIsOld, msUntilNewCode } from "./passTiming";
import { why } from "./util";

// The phone frame for the pass page: the app bar with the page's name, then its body.
function PassFrame({ children }: { children: ReactNode }) {
  return (
    <div className="ph" data-surface="phone">
      <header className="bar ph__bar">
        <h1 className="bar__title">Your check-in pass</h1>
      </header>
      <main className="ph__body">{children}</main>
    </div>
  );
}

export function Student() {
  const { user } = useGoogleUser();
  if (!user)
    return (
      <PassFrame>
        <section className="pass pass--out">
          <p>Sign in to get your pass.</p>
          <StudentSignIn />
        </section>
      </PassFrame>
    );
  // The late banner sits beside StudentPass, not inside its screens, so it stays mounted when a
  // scan swaps the pass for "You're checked in.": a remount would count the scan's own late
  // arrival as already seen, and the late student's phone would never show it. Outside <Screen>
  // there is no page gutter, so .student-late (checkin.css) holds the boundary fixed 16px in from
  // each side: "The late banner didn't load." and Try again stay clear of the screen's edges.
  return (
    <>
      <SignInEnding line={STUDENT_ENDING} />
      <StudentPass />
      <div className="student-late">
        <ErrorBoundary label="The late banner">
          <LateBanner />
        </ErrorBoundary>
      </div>
    </>
  );
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

  // Checked in: the pass's stub on the green field, then the next step, Follow the slides.
  if (here)
    return (
      <PassFrame>
        <section className="stub">
          <h2 className="lockup">
            <Icon name="check" className="icon--d" />
            You’re checked in.
          </h2>
          {pass && <p className="stub__name">{pass.name}</p>}
        </section>
        <QuizCard />
        <div className="ph-go">
          <p><Link to="live">Follow the slides</Link></p>
        </div>
        <HideLate />
        <footer className="ph-foot">
          <SignedInAs />
        </footer>
      </PassFrame>
    );
  // No pass yet: the pass at its real size, the QR's square naming the step. A failed request
  // takes the square's place.
  if (!pass)
    return (
      <PassFrame>
        <section className="pass">
          {err ? (
            <Status kind="error">{err}</Status>
          ) : (
            <div className="pass__qr qr--wait">
              <Status kind="loading">Making your pass…</Status>
            </div>
          )}
        </section>
        <footer className="ph-foot">
          <SignedInAs />
        </footer>
      </PassFrame>
    );
  // A code this page hasn't timed yet has just arrived, so it shows. An old one gives its square
  // to "Getting a new code…" on the waiting fill, and its letters keep their line, hidden.
  const old = got?.at === pass.at && codeIsOld(got.when, now);
  return (
    <PassFrame>
      <section className="pass">
        <h2 className="pass__head">Show this to the professor</h2>
        <div className={old ? "pass__qr qr--wait" : "pass__qr"}>
          {old ? <Status kind="loading">Getting a new code…</Status> : <QR value={"RCC-" + pass.code} size={280} />}
        </div>
        <hr className="perf" />
        <p className="pass__name">{pass.name}</p>
        <p className={old ? "pass__code pass__code--old" : "pass__code"} aria-hidden={old || undefined}>
          {pass.code}
        </p>
        <p className="pass__note">The code changes every 20 seconds. A screenshot stops working within a minute.</p>
        {err && <Status kind="error">{err}</Status>}
      </section>
      <HideLate />
      <footer className="ph-foot">
        <SignedInAs />
      </footer>
    </PassFrame>
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
// turns that off for them. One ruled row on the page; the whole row is the target.
export function HideLate() {
  const hide = useQuery(api.checkin.attendance.myHideLate);
  const set = useMutation(api.checkin.attendance.setHideLate);
  const [err, setErr] = useState("");
  if (hide === undefined) return null;
  return (
    <div className="ph-opt">
      <label className="ph-check">
        <input
          type="checkbox"
          checked={hide}
          onChange={(e) => set({ hide: e.target.checked }).then(() => setErr(""), (x) => setErr(why(x)))}
        />
        Don’t show my first name on the class screens when I’m late
      </label>
      {err && <Status kind="error">{err}</Status>}
    </div>
  );
}
