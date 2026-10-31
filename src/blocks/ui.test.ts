// @vitest-environment node
// ErrorBoundary (ui.tsx). React's server renderer never calls an error boundary, and these tests
// have no browser DOM, so they call, one at a time, what React calls when a part throws
// (getDerivedStateFromError, then render, then componentDidCatch) and the Try again handler.
import { type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ErrorBoundary } from "./ui";

// What a boundary shows after a part inside it threw.
function failed(label?: string, page?: boolean) {
  const boundary = new ErrorBoundary({ label, page, children: "[the part]" });
  boundary.state = { ...boundary.state, ...ErrorBoundary.getDerivedStateFromError() };
  // Outside React, setState has nothing to update; apply the change the way React would.
  boundary.setState = ((next: { failed: boolean }) => {
    boundary.state = { ...boundary.state, ...next };
  }) as typeof boundary.setState;
  return boundary;
}

describe("ErrorBoundary", () => {
  it("renders its children until something inside throws", () => {
    expect(new ErrorBoundary({ children: "[the part]" }).render()).toBe("[the part]");
  });

  it("a part that throws shows Status error 'This part of the page didn't load.' and a 'Try again' button", () => {
    const html = renderToStaticMarkup(failed().render() as ReactElement);
    expect(html).toContain('<p class="status status--error" role="alert">This part of the page didn&#x27;t load.</p>');
    expect(html).toContain('<button type="button" class="quiet">Try again</button>');
    expect(html).not.toContain("[the part]");
  });

  it("with a label, the line names the part: 'The leaderboard didn't load.'", () => {
    expect(renderToStaticMarkup(failed("The leaderboard").render() as ReactElement)).toContain("The leaderboard didn&#x27;t load.");
  });

  it("logs the error with the label", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = new Error("Could not find public function");
    failed("The Points tab").componentDidCatch(error, { componentStack: "\n    at PointsTab" });
    expect(log).toHaveBeenCalledWith("The Points tab didn't load:", error, "\n    at PointsTab");
    log.mockRestore();
  });

  it("'Try again' resets it, so the part renders again", () => {
    const boundary = failed("The Now tab");
    const button = (boundary.render() as ReactElement<{ children: ReactElement<{ onClick: () => void }>[] }>).props.children[1];
    button.props.onClick();
    expect(boundary.state.failed).toBe(false);
    expect(boundary.render()).toBe("[the part]");
  });
});

// <ErrorBoundary page>: App.tsx puts one around every page and src/main.tsx one around the app.
describe("host-frontend-22 ErrorBoundary page", () => {
  it("host-frontend-22 a page that throws shows 'Something went wrong.' with Reload and Go home, not a blank screen", () => {
    const html = renderToStaticMarkup(failed(undefined, true).render() as ReactElement);
    expect(html).toBe(
      '<main class="page"><h1>Something went wrong.</h1><p class="row"><button type="button">Reload</button><a href="#/" class="btn btn--secondary">Go home</a></p></main>',
    );
  });

  it("host-frontend-22 Reload reloads the page", () => {
    const reload = vi.fn();
    vi.stubGlobal("location", { reload });
    // <Screen><p className="row"><button>Reload</button><Link>Go home</Link></p></Screen>
    type Row = ReactElement<{ children: ReactElement<{ onClick?: () => void; children: string }>[] }>;
    const row = (failed(undefined, true).render() as ReactElement<{ children: Row }>).props.children;
    const button = row.props.children[0];
    expect(button.props.children).toBe("Reload");
    button.props.onClick!();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("host-frontend-22 it renders the page again when the hash changes (Go home or any link); a part's boundary doesn't listen", () => {
    const on = new Map<string, () => void>();
    vi.stubGlobal("window", { addEventListener: (type: string, fn: () => void) => on.set(type, fn), removeEventListener: (type: string) => on.delete(type) });
    const page = failed(undefined, true);
    page.componentDidMount();
    on.get("hashchange")!();
    expect(page.state.failed).toBe(false);
    expect(page.render()).toBe("[the part]");
    page.componentWillUnmount();
    expect(on.has("hashchange")).toBe(false);

    failed("The leaderboard").componentDidMount();
    expect(on.size).toBe(0);
  });

  it("host-frontend-22 logs the error as 'The page didn't load:'", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = new Error("Could not find public function");
    failed(undefined, true).componentDidCatch(error, { componentStack: "\n    at HostPage" });
    expect(log).toHaveBeenCalledWith("The page didn't load:", error, "\n    at HostPage");
    log.mockRestore();
  });
});
