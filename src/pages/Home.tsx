import { Link } from "../blocks/router";

// Every page in the app, one link each. Teams build theirs in src/teams/<team>/Page.tsx.
// Each link sits on its own line as a quiet button, so it's 48px tall to tap on a phone.
const PAGES = [
  { to: "checkin/kiosk", name: "Kiosk", what: "The iPad at the door scans your pass." },
  { to: "checkin/join", name: "Check in", what: "Sign in and get your pass for the door." },
  { to: "live", name: "Live slides", what: "The slide on your phone." },
  { to: "host", name: "Professor view", what: "Hosts only." },
  { to: "lab", name: "Lab", what: "Test the building blocks." },
];

export default function Home() {
  return (
    <main className="page">
      <h1>RCC Live Lecture</h1>
      <p className="muted">Check in, follow the slides on your phone, and tell the professor when you’re lost.</p>
      <ul className="list">
        {PAGES.map((p) => (
          <li key={p.to}>
            <Link to={p.to} className="btn btn--quiet">{p.name}</Link>
            <div className="muted">{p.what}</div>
          </li>
        ))}
      </ul>
    </main>
  );
}
