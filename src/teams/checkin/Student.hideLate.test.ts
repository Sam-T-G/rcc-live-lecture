// @vitest-environment node
// HideLate (Student.tsx), the student's late-banner opt-out (F16.4, sweep2-ledger-3 and
// sweep2-tests-1): the box shows the saved choice, and ticking or unticking it sends that choice to
// checkin.attendance.setHideLate. There is no browser DOM, so React's useState is swapped for a
// stand-in that keeps state between calls; each render calls HideLate as a plain function and the
// test fires the checkbox's onChange itself.
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const hooks = vi.hoisted(() => ({ slots: [] as unknown[], at: 0 }));
vi.mock("react", async (orig) => {
  const R = await orig<typeof import("react")>();
  return {
    ...R,
    useState: (init: unknown) => {
      const i = hooks.at++;
      if (!(i in hooks.slots)) hooks.slots[i] = typeof init === "function" ? (init as () => unknown)() : init;
      return [hooks.slots[i], (next: unknown) => (hooks.slots[i] = next)];
    },
  };
});

// checkin.attendance.myHideLate's answer, and every setHideLate call.
const server = vi.hoisted(() => ({ hide: undefined as boolean | undefined, sent: [] as unknown[] }));
vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  return {
    useQuery: (ref: Parameters<typeof getFunctionName>[0]) => (getFunctionName(ref) === "checkin/attendance:myHideLate" ? server.hide : undefined),
    useMutation: (ref: Parameters<typeof getFunctionName>[0]) => async (args: unknown) => {
      server.sent.push([getFunctionName(ref), args]);
      return null;
    },
  };
});
vi.mock("../../blocks/auth", () => ({ StudentSignIn: () => null, SignedInAs: () => null, useGoogleUser: () => ({ user: null, signOut: () => {} }) }));
vi.mock("./Quiz", () => ({ QuizCard: () => null }));
vi.mock("./LateBanner", () => ({ default: () => null }));

const { HideLate } = await import("./Student");

type El = ReactElement<{ children?: ReactNode; type?: string; checked?: boolean; onChange?: (e: unknown) => void }>;
function elements(node: ReactNode): El[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement(node)) return [];
  const el = node as El;
  return [el, ...elements(el.props.children)];
}
function checkbox() {
  hooks.at = 0;
  const box = elements(HideLate()).find((e) => e.type === "input" && e.props.type === "checkbox");
  if (!box) throw new Error("no checkbox");
  return box;
}

beforeEach(() => {
  hooks.slots = [];
  server.sent = [];
});

describe("sweep2-ledger-3 F16.4 the late-banner opt-out", () => {
  it("is ticked only when the student turned the banner off", () => {
    server.hide = true;
    expect(checkbox().props.checked).toBe(true);
    server.hide = false;
    expect(checkbox().props.checked).toBe(false);
  });

  it("ticking it sends hide: true; unticking it sends hide: false", () => {
    server.hide = false;
    checkbox().props.onChange!({ target: { checked: true } });
    server.hide = true;
    checkbox().props.onChange!({ target: { checked: false } });
    expect(server.sent).toEqual([
      ["checkin/attendance:setHideLate", { hide: true }],
      ["checkin/attendance:setHideLate", { hide: false }],
    ]);
  });

  it("shows nothing while the saved choice loads", () => {
    server.hide = undefined;
    hooks.at = 0;
    expect(HideLate()).toBeNull();
  });
});
