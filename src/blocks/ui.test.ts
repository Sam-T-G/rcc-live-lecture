// @vitest-environment node
// ErrorBoundary (ui.tsx). React's server renderer never calls an error boundary, and these tests
// have no browser DOM, so they call, one at a time, what React calls when a part throws
// (getDerivedStateFromError, then render, then componentDidCatch) and the Try again handler.
import { type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ErrorBoundary } from "./ui";

// What a boundary shows after a part inside it threw.
function failed(label?: string) {
  const boundary = new ErrorBoundary({ label, children: "[the part]" });
  boundary.state = { ...boundary.state, ...ErrorBoundary.getDerivedStateFromError() };
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
    // Outside React, setState has nothing to update; apply the change the way React would.
    boundary.setState = ((next: { failed: boolean }) => { boundary.state = { ...boundary.state, ...next }; }) as typeof boundary.setState;
    const button = (boundary.render() as ReactElement<{ children: ReactElement<{ onClick: () => void }>[] }>).props.children[1];
    button.props.onClick();
    expect(boundary.state.failed).toBe(false);
    expect(boundary.render()).toBe("[the part]");
  });
});
