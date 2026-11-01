import { Link } from "../blocks/router";
import { Screen } from "../blocks/ui";

// #/: every page in the app, one link each, in the order people use them. Each link sits on its
// own line as a quiet button, so it's 48px tall to tap on a phone. A new route in
// src/pages/index.ts, or a new part of a team page (#/checkin/<part>, #/live/<part>), gets a line
// here too (Home.test.ts checks every route is listed).
type Group = { title: string; note?: string; links: { to: string; name: string; what: string }[] };

const GROUPS: Group[] = [
  {
    title: "Students",
    links: [
      { to: "checkin/student", name: "Check in", what: "Sign in and get your pass for the door." },
      { to: "live", name: "Follow the slides", what: "The slide the professor is on, with the quiz, your team and questions." },
      { to: "portal", name: "Slides only", what: "The slide the professor is on. Page back through the ones already shown." },
    ],
  },
  {
    title: "Professors",
    note: "Sign in with the Google account an admin added on #/admin.",
    links: [
      { to: "checkin/teacher", name: "Scan passes", what: "Check students in with the laptop camera, set when class starts and download attendance." },
      { to: "checkin/quiz", name: "Quiz and vote", what: "Ask the room a quiz question or a vote, watch the answers come in, and see the results when you end it." },
      { to: "host", name: "Professor view", what: "The check-in count, AI-drafted quiz questions, team points and students’ questions." },
      { to: "admin", name: "Staff and door iPads", what: "Admins add professors and scanners. Professors pair door iPads." },
    ],
  },
  {
    title: "Projector and door",
    links: [
      { to: "checkin/stage", name: "Projector", what: "Today’s deck full screen with the check-in QR, the check-in count and the open quiz." },
      { to: "live/leaderboard", name: "Team board", what: "The team leaderboard, big enough to read from the back of the room." },
      { to: "checkin/kiosk", name: "iPad at the door", what: "The iPad shows a pairing code. Type it on #/admin once, and the iPad scans passes." },
    ],
  },
  {
    title: "Building the app",
    links: [
      { to: "lab", name: "Lab", what: "Try each building block: sign-in, live sync, QR codes, location, the slide feed, AI and the camera." },
      { to: "ui", name: "UI kit", what: "Every color and part of the app, in light and dark." },
    ],
  },
];

export default function Home() {
  return (
    <Screen title="RCC Live Lecture">
      <p className="muted">Check in to class, follow the professor’s slides on your phone, and answer the quiz.</p>
      {GROUPS.map((g) => (
        <section key={g.title}>
          <h2>{g.title}</h2>
          {g.note && <p>{g.note}</p>}
          <ul className="list">
            {g.links.map((p) => (
              <li key={p.to}>
                <Link to={p.to} className="btn btn--quiet btn--flush">{p.name}</Link>
                <div className="muted">{p.what}</div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </Screen>
  );
}
