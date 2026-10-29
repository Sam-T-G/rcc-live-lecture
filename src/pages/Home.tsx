import { Link } from "../blocks/router";

// Every page in the app, one link each. Teams build theirs in src/teams/<team>/Page.tsx.
export default function Home() {
  return (
    <main className="page">
      <h1>RCC Live Lecture</h1>
      <p className="muted">Check in, follow the slides on your phone, and tell the professor when you’re lost.</p>
      <ul>
        <li><Link to="checkin/kiosk">Kiosk</Link> · the code at the door</li>
        <li><Link to="checkin/join">Check in</Link> · what a phone opens after scanning</li>
        <li><Link to="live">Live slides</Link> · the slide on your phone</li>
        <li><Link to="host">Professor view</Link> · hosts only</li>
        <li><Link to="lab">Lab</Link> · test the building blocks</li>
      </ul>
    </main>
  );
}
