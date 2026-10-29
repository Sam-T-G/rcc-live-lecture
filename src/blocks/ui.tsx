// Block: shared screen parts, so every team's pages look like one app without anyone
// designing a button. Styles are in src/index.css. BLOCKS.md shows each one.
import type { ReactNode } from "react";

// A whole page. `wide` is for big screens (kiosk, professor view); phones get the narrow one.
export function Screen({ title, wide, children }: { title?: string; wide?: boolean; children?: ReactNode }) {
  return (
    <main className={wide ? "page page--wide" : "page"}>
      {title && <h1>{title}</h1>}
      {children}
    </main>
  );
}

// A placeholder that says which team builds this page. Delete it when the page is real.
export function Todo({ team, children }: { team: string; children: ReactNode }) {
  return (
    <section className="panel todo">
      <p className="todo__team">{team} team</p>
      <p>{children}</p>
    </section>
  );
}

// One number, big enough to read from across a room, with what it counts under it.
export function Big({ value, label }: { value: ReactNode; label: string }) {
  return (
    <div className="big">
      <span className="big__value">{value}</span>
      <span className="big__label">{label}</span>
    </div>
  );
}

// The three states every screen needs besides "working": waiting on the server, nothing
// to show yet, and something failed. Pass the words the designer wrote.
export function Status({ kind, children }: { kind: "loading" | "empty" | "error"; children: ReactNode }) {
  return (
    <p className={"status status--" + kind} role={kind === "error" ? "alert" : "status"}>
      {children}
    </p>
  );
}

// A boxed section, the same as the lab page's panels.
export function Card({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="panel">
      {title && <h2>{title}</h2>}
      {children}
    </section>
  );
}
