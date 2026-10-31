// Block: shared screen parts, so every team's pages look like one app without anyone
// designing a button. Styles are in src/index.css. BLOCKS.md shows each one.
import { Component, type ErrorInfo, type ReactNode } from "react";
import { Link } from "./router";

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

// Wrap each part of a page that reads its own data, so an error there leaves the rest of the page
// up. A Convex query that fails (a function a deploy renamed, a server limit) throws while its part
// renders, and with no boundary React empties the whole page, the slide included.
//   <ErrorBoundary label="The leaderboard"><Leaderboard /></ErrorBoundary>
// When the part throws, it shows "The leaderboard didn't load." ("This part of the page didn't
// load." with no label) and a Try again button that renders the part again from the start. The
// error goes to the browser console with the label.
//
// `page` makes it the boundary for a whole page (App.tsx puts one around every page, src/main.tsx
// one around the app): when the page throws, the screen says "Something went wrong." with Reload
// and Go home instead of going blank, for example on a tab still open from before a deploy that
// removed a function it calls. It tries the page again when the URL's hash changes, so Go home or
// any link clears it.
type BoundaryProps = { label?: string; children?: ReactNode; page?: boolean };

export class ErrorBoundary extends Component<BoundaryProps, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidMount() {
    if (this.props.page) window.addEventListener("hashchange", this.retry);
  }

  componentWillUnmount() {
    window.removeEventListener("hashchange", this.retry);
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    const what = this.props.label || (this.props.page ? "The page" : "This part of the page");
    console.error(`${what} didn't load:`, error, info.componentStack);
  }

  retry = () => {
    if (this.state.failed) this.setState({ failed: false });
  };

  render() {
    if (!this.state.failed) return this.props.children;
    if (this.props.page)
      return (
        <Screen title="Something went wrong.">
          <p className="row">
            <button type="button" onClick={() => location.reload()}>Reload</button>
            <Link to="" className="btn btn--secondary">Go home</Link>
          </p>
        </Screen>
      );
    return (
      <div className="row">
        <Status kind="error">{`${this.props.label || "This part of the page"} didn't load.`}</Status>
        <button type="button" className="quiet" onClick={this.retry}>Try again</button>
      </div>
    );
  }
}
