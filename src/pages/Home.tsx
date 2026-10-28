import { Link } from "../blocks/router";

// Placeholder until the club builds the real first page.
export default function Home() {
  return (
    <main className="page">
      <h1>RCC Live Lecture</h1>
      <p className="muted">Nothing built yet.</p>
      <p>
        <Link to="lab">Test the building blocks</Link>
      </p>
    </main>
  );
}
