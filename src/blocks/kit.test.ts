// @vitest-environment node
// ConfirmButton (kit.tsx) when onConfirm fails. These tests have no browser DOM, so React's
// hooks are swapped for a small stand-in that keeps state between calls: each render calls
// ConfirmButton as a plain function, and a test presses the confirm button by calling its
// onClick, the way React would.
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ConvexError } from "convex/values";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const hooks = vi.hoisted(() => ({ slots: [] as unknown[], at: 0 }));
vi.mock("react", async (orig) => {
  const R = await orig<typeof import("react")>();
  function slot<T>(make: () => T): [number, T] {
    const i = hooks.at++;
    if (!(i in hooks.slots)) hooks.slots[i] = make();
    return [i, hooks.slots[i] as T];
  }
  return {
    ...R,
    useState: (init: unknown) => {
      const [i, value] = slot(() => (typeof init === "function" ? (init as () => unknown)() : init));
      const set = (next: unknown) => {
        hooks.slots[i] = typeof next === "function" ? (next as (v: unknown) => unknown)(hooks.slots[i]) : next;
      };
      return [value, set];
    },
    useRef: (init: unknown) => slot(() => ({ current: init }))[1],
    useEffect: () => {},
    useId: () => "q",
  };
});

const { ConfirmButton } = await import("./kit");

type Props = Parameters<typeof ConfirmButton>[0];
type El = ReactElement<{ children?: ReactNode; onClick?: () => void }>;

function render(props: Partial<Props> & Pick<Props, "onConfirm">) {
  hooks.at = 0;
  return ConfirmButton({ defaultOpen: true, question: "End the day?", confirm: "Yes, end it", children: "End day", ...props }) as El;
}

// The first element in the tree whose children are exactly `label`.
function find(node: ReactNode, label: string): El | undefined {
  if (!isValidElement(node)) return Array.isArray(node) ? node.map((n) => find(n, label)).find(Boolean) : undefined;
  const el = node as El;
  if (el.props.children === label) return el;
  return find(el.props.children, label);
}

async function press(props: Partial<Props> & Pick<Props, "onConfirm">) {
  find(render(props), "Yes, end it")!.props.onClick!();
  await new Promise((r) => setTimeout(r, 10));
  return renderToStaticMarkup(render(props));
}

let rejections: unknown[];
const onRejection = (r: unknown) => rejections.push(r);
beforeEach(() => {
  hooks.slots = [];
  rejections = [];
  process.prependListener("unhandledRejection", onRejection);
});
afterEach(() => {
  process.removeListener("unhandledRejection", onRejection);
});

describe("ConfirmButton", () => {
  it("closes when onConfirm finishes", async () => {
    const html = await press({ onConfirm: async () => {} });
    expect(html).not.toContain("End the day?");
    expect(html).toContain("End day");
  });

  it("when onConfirm throws a ConvexError, the box stays open and shows its words, with no unhandled rejection", async () => {
    const html = await press({ onConfirm: () => Promise.reject(new ConvexError("That class already ended.")) });
    expect(rejections.map(String)).toEqual([]);
    expect(html).toContain("End the day?");
    expect(html).toContain('<p class="status status--error" role="alert">That class already ended.</p>');
    expect(html).not.toContain('aria-busy="true"');
  });

  it("any other error shows 'Something went wrong. Try again.'", async () => {
    const html = await press({ onConfirm: () => Promise.reject(new Error("fetch failed")) });
    expect(rejections).toEqual([]);
    expect(html).toContain("Something went wrong. Try again.");
  });

  it("with onError, the page gets the error and the box shows no message", async () => {
    const seen: unknown[] = [];
    const error = new ConvexError("Only hosts can do that.");
    const html = await press({ onConfirm: () => Promise.reject(error), onError: (e) => seen.push(e) });
    expect(rejections).toEqual([]);
    expect(seen).toEqual([error]);
    expect(html).toContain("End the day?");
    expect(html).not.toContain("status--error");
  });
});
