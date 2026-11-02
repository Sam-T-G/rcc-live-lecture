// #/checkin/student (also #/checkin/join): the student signs in with Google (StudentSignIn; the
// typed test form only in `npm run dev` builds), and the phone shows their QR pass until the
// professor or the door kiosk scans it. Both screens say who is signed in, with "Not you? Sign out". The pass asks for a new code every 5 s, whenever
// the phone comes back to the page, and as the code turns 20 s old (passTiming.ts); a code over
// 25 s old on screen means those asks stopped getting through, so it shows "Getting a new code…"
// in place of a QR the door would refuse.
// Layout (docs/design.md, phone): signed out and while the pass loads, the app bar names the page;
// signed out, Google's button sits in the action bar at the bottom. The pass, the student's ticket,
// is top-anchored under "Show this to the professor": the QR on its white plate, the perforation,
// the name and the code a professor reads out when the camera fails. Checked in, the pass turns
// into its stub on the green field. The late opt-out and the signed-in line follow the pass.
// checkin.css draws the frame.
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
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

// The phone frame for the pass page: the app bar with the page's name (signed out and while the
// pass loads; the pass and the checked-in screen carry their own title as the page heading), then
// its body, then the action bar at the bottom when the screen has one (kit .phone-actions).
// `moment` (CheckInMoment) renders nothing; it sits after the body so its effects run once the
// body's parts are on the page, in the same place on every screen so it stays mounted.
function PassFrame({ title, actions, moment, children }: { title?: string; actions?: ReactNode; moment?: ReactNode; children: ReactNode }) {
  return (
    <div className="ph" data-surface="phone">
      {title && (
        <header className="bar ph__bar">
          <h1 className="bar__title">{title}</h1>
        </header>
      )}
      <main className="ph__body">{children}</main>
      {moment}
      {actions && <div className="phone-actions">{actions}</div>}
    </div>
  );
}

// A screen's own title as the page heading, at the card-title size its h2 had (.text-h2), with no
// margin of its own: the card's gap spaces it.
const HEAD = { margin: 0 };

export function Student() {
  const { user } = useGoogleUser();
  // Signed out: the pass holds the sentence; Google's button is the screen's action, in the action
  // bar at the bottom, in reach of the thumb.
  if (!user)
    return (
      <PassFrame title="Your check-in pass" actions={<StudentSignIn />}>
        <section className="pass pass--out">
          <p>Sign in to get your pass.</p>
        </section>
      </PassFrame>
    );
  // The late banner sits beside StudentPass, not inside its screens, so it stays mounted when a
  // scan swaps the pass for "You're checked in.": a remount would count the scan's own late
  // arrival as already seen, and the late student's phone would never show it. Outside <Screen>
  // there is no page gutter, so .student-late (checkin.css) holds the boundary 16px in from each
  // side: "The late banner didn't load." and Try again stay clear of the screen's edges, in the
  // page under "Not you? Sign out" (T18).
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
  // The checked-in moment gets the raw answer, so loading then true (a student already checked in
  // opening the page) doesn't play it.
  const me = useQuery(api.checkin.read.me, { channel: CHANNEL });
  const here = me === true;
  const refresh = useMutation(api.checkin.pass.refresh);
  const [err, setErr] = useState("");
  // The code on screen (by its `at`) and when this phone got it, by the phone's own clock.
  const [got, setGot] = useState<{ at: number; when: number } | null>(null);
  const now = useClock(!here);
  // The pass card and its stub, for the checked-in moment (CheckInMoment, below).
  const passEl = useRef<HTMLElement | null>(null);
  const stubEl = useRef<HTMLElement | null>(null);
  const passRef = useCallback((node: HTMLElement | null) => {
    if (node) passEl.current = node;
  }, []);
  const moment = <CheckInMoment me={me} pass={passEl} stub={stubEl} />;

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
      <PassFrame moment={moment}>
        <section key="stub" ref={stubEl} className="stub">
          <h1 className="text-h2 lockup" style={HEAD}>
            <Icon name="check" className="icon--d" />
            You’re checked in.
          </h1>
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
      <PassFrame title="Your check-in pass" moment={moment}>
        <section key="pass" ref={passRef} className="pass">
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
    <PassFrame moment={moment}>
      <section key="pass" ref={passRef} className="pass">
        <h1 className="text-h2 pass__head" style={HEAD}>Show this to the professor</h1>
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

// The checked-in moment (MOTION.md phone checked-in; checkin.css draws it). When the door or the
// professor checks the student in while the pass is open, the pass card turns into its stub: a
// copy of the pass fades out where it stood, the card's bottom edge moves up to the stub's height
// with the rows under it riding along, the fill steps to the field and "You’re checked in." rises
// into place. The pass and the stub are separate <section>s (keyed), so React leaves the old pass
// whole, off the page, and its copy can fade. While the pass shows, each render records where it
// and the rows under it sit. Effects only: it renders nothing, nothing here changes what the page
// says or does, and the helpers and classes go at 450ms. Reduced motion: the layout swaps at once
// and only the fill, the words and what follows the stub fade. Its own component (PassFrame places
// it after the body), since the pass page's tests call StudentPass as a plain function.
type Spot = { top: number; left: number; width: number; height: number };
type Box = { current: HTMLElement | null };
const ROWS = [".ph-opt", ".ph-foot"];
const MOMENT_MS = 450;
// It records the pass only while read.me answers false, never while it loads, so only a real false
// to true change plays the moment, never a reload by a student who is already checked in.
function CheckInMoment({ me, pass, stub }: { me: boolean | undefined; pass: Box; stub: Box }) {
  const here = me === true;
  const seen = useRef<{ card: Spot; rows: (number | null)[] } | null>(null);
  useLayoutEffect(() => {
    if (me === undefined) seen.current = null;
    const card = pass.current;
    const body = card?.parentElement;
    if (me !== false || !card?.isConnected || !body) return;
    const b = body.getBoundingClientRect();
    const r = card.getBoundingClientRect();
    seen.current = {
      card: { top: r.top - b.top, left: r.left - b.left, width: r.width, height: r.height },
      rows: ROWS.map((sel) => {
        const row = body.querySelector(`:scope > ${sel}`);
        return row ? row.getBoundingClientRect().top - b.top : null;
      }),
    };
  });
  useLayoutEffect(() => {
    const before = seen.current;
    seen.current = null;
    const old = pass.current;
    const card = stub.current;
    if (!here || !before || !old || old.isConnected || !card) return;
    return playCheckIn(card, old, before);
  }, [here, pass, stub]);
  return null;
}

function playCheckIn(card: HTMLElement, old: HTMLElement, before: { card: Spot; rows: (number | null)[] }): () => void {
  const body = card.parentElement;
  if (!body) return () => {};
  const quiet = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const kids = [...body.children] as HTMLElement[];
  const rows = ROWS.map((sel) => body.querySelector<HTMLElement>(`:scope > ${sel}`));
  // What sits between the stub and the rows (the quiz card, Follow the slides) is new: it fades in.
  const after = kids.filter((el) => el !== card && !rows.includes(el));
  const added: HTMLElement[] = [];
  let timer = 0;
  const done = () => {
    window.clearTimeout(timer);
    added.forEach((el) => el.remove());
    card.classList.remove("ci-arrive", "ci-quiet");
    after.forEach((el) => el.classList.remove("ci-late", "ci-quiet-in"));
    rows.forEach((el) => {
      el?.classList.remove("ci-row");
      el?.style.removeProperty("--dy");
    });
    body.classList.remove("ci-host");
  };
  if (quiet) {
    card.classList.add("ci-quiet");
    after.forEach((el) => el.classList.add("ci-quiet-in"));
  } else {
    const b = body.getBoundingClientRect();
    const r = card.getBoundingClientRect();
    const now = { top: r.top - b.top, left: r.left - b.left, width: r.width, height: r.height };
    const place = (el: HTMLElement, at: Spot) =>
      Object.assign(el.style, { top: `${at.top}px`, left: `${at.left}px`, width: `${at.width}px`, height: `${at.height}px` });
    // The rows below start where they stood under the pass and ride up with the card's edge.
    rows.forEach((el, i) => {
      const was = before.rows[i];
      if (!el || was === null) return;
      el.style.setProperty("--dy", `${was - (el.getBoundingClientRect().top - b.top)}px`);
      el.classList.add("ci-row");
    });
    // Stub-sized surfaces from the stub's box down to the pass's old bottom edge, each moving up by
    // its share of the drop on one curve, so together they always draw one unbroken card.
    const drop = Math.max(0, before.card.top + before.card.height - (now.top + now.height));
    const n = Math.max(1, Math.ceil(drop / Math.max(1, now.height - 32)));
    for (let i = 0; i <= n; i++) {
      const s = document.createElement("div");
      s.className = i ? "ci-surface ci-surface--edge" : "ci-surface";
      s.setAttribute("aria-hidden", "true");
      place(s, now);
      s.style.setProperty("--dy", `${(drop * i) / n}px`);
      added.push(s);
    }
    // The pass as it stood, fading out over the new layout: never read, focused or tapped.
    const leave = old.cloneNode(true) as HTMLElement;
    leave.querySelectorAll("[id]").forEach((el) => el.removeAttribute("id"));
    leave.classList.add("ci-leave");
    leave.setAttribute("aria-hidden", "true");
    leave.setAttribute("inert", "");
    place(leave, before.card);
    added.push(leave);
    body.classList.add("ci-host");
    card.classList.add("ci-arrive");
    after.forEach((el) => el.classList.add("ci-late"));
    body.append(...added);
  }
  timer = window.setTimeout(done, MOMENT_MS);
  return done;
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
