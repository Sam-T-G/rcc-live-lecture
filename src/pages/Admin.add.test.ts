// @vitest-environment node
// #/admin (Admin.tsx): what a failed Add shows, and the words each panel's ErrorBoundary would
// show. No browser DOM here, so, as in Lab.test.ts, React's state hooks are a small stand-in that
// keeps each hook's value between renders: a test renders, submits the form by calling its
// onSubmit, then renders again. People are samples (@example.edu).
import { createElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ConvexError } from "convex/values";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorBoundary } from "../blocks/ui";
import { AddPerson, AdminView, ProfessorView } from "./Admin";

const hooks = vi.hoisted(() => ({ slots: [] as unknown[], at: 0 }));
vi.mock("react", async (orig) => {
  const R = await orig<typeof import("react")>();
  function slot<T>(make: () => T): T {
    const i = hooks.at++;
    if (!(i in hooks.slots)) hooks.slots[i] = make();
    return hooks.slots[i] as T;
  }
  return {
    ...R,
    useState: (init: unknown) => {
      const i = hooks.at;
      const value = slot(() => (typeof init === "function" ? (init as () => unknown)() : init));
      const set = (next: unknown) => {
        hooks.slots[i] = typeof next === "function" ? (next as (v: unknown) => unknown)(hooks.slots[i]) : next;
      };
      return [value, set];
    },
    useRef: (init: unknown) => slot(() => ({ current: init })),
    useCallback: (fn: unknown) => fn,
    useEffect: () => {},
  };
});

const add = vi.fn<(a: { email: string; role: string }) => Promise<null>>();
vi.mock("convex/react", () => ({
  useQuery: () => undefined,
  useMutation: () => add,
  useConvexAuth: () => ({ isLoading: false, isAuthenticated: true }),
}));
vi.mock("../blocks/auth", () => ({ SignedInAs: () => null, GoogleButton: () => null, useGoogleUser: () => ({ user: null, signOut() {} }) }));

beforeEach(() => {
  hooks.slots = [];
  add.mockReset();
});

const plain = (html: string) => html.replace(/&#x27;/g, "'").replace(/&quot;/g, '"');
function render() {
  hooks.at = 0;
  return plain(renderToStaticMarkup(createElement(AddPerson)));
}
type El = ReactElement<{ children?: ReactNode; onSubmit?: (e: { preventDefault(): void }) => unknown; label?: string }>;
function elements(node: ReactNode, out: El[] = []): El[] {
  if (Array.isArray(node)) node.forEach((n) => elements(n, out));
  else if (isValidElement(node)) {
    out.push(node as El);
    elements((node as El).props.children, out);
  }
  return out;
}
async function submit() {
  hooks.at = 0;
  const form = elements(AddPerson()).find((e) => e.props.onSubmit);
  await form!.props.onSubmit!({ preventDefault() {} });
}
const alerts = (html: string) => [...html.matchAll(/<p class="status status--error" role="alert">(.*?)<\/p>/g)].map((m) => m[1]);

describe("#/admin Add someone", () => {
  it("sweep1-blocks-4 a refused Add shows the server's words in a Status error (role=alert), and the email field isn't marked invalid", async () => {
    render();
    add.mockRejectedValueOnce(new ConvexError("prof@example.edu is on the staff list already (scanner). Change the role in the list."));
    await submit();
    const html = render();
    expect(alerts(html)).toEqual(["prof@example.edu is on the staff list already (scanner). Change the role in the list."]);
    expect(html).not.toContain("field__error");
    expect(html).not.toContain("aria-invalid");
    // The alert comes before the Add button, as on Pair a door iPad.
    expect(html.indexOf('role="alert"')).toBeLessThan(html.indexOf(">Add<"));

    add.mockResolvedValueOnce(null);
    await submit();
    expect(alerts(render())).toEqual([]);
  });
});

describe("#/admin panel boundaries", () => {
  const labels = (view: () => ReactNode) =>
    elements(view())
      .filter((e) => e.type === ErrorBoundary)
      .map((e) => e.props.label);

  it("sweep1-blocks-9 each panel's boundary is named with a noun phrase, so its fallback reads as a sentence ('The staff list didn't load.')", () => {
    expect(labels(AdminView)).toEqual(["The Add someone form", "The staff list", "The pairing form", "The door iPad list", "The list of changes"]);
    expect(labels(ProfessorView)).toEqual(["The pairing form", "The door iPad list"]);
  });
});
