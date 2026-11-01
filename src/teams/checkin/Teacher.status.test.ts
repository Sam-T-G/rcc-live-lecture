// @vitest-environment node
// CKA-fixcheck: the status line on #/checkin/teacher (Teacher.tsx ClassStatus) turns from "Class
// starts" to "Class started" at the start time by itself, with no check-in to make the lectures
// query change. React's useState and useEffect are swapped for a stand-in that counts the
// re-renders a component asks for and runs its effects at once. Pacific time, Nov 5, 2026.
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { getFunctionName, type FunctionReference } from "convex/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const hooks = vi.hoisted(() => ({ rerenders: 0, cleanups: [] as (() => void)[] }));
vi.mock("react", async (orig) => {
  const R = await orig<typeof import("react")>();
  return {
    ...R,
    useState: (init: unknown) => [typeof init === "function" ? (init as () => unknown)() : init, () => void hooks.rerenders++],
    useEffect: (effect: () => void | (() => void)) => {
      const cleanup = effect();
      if (cleanup) hooks.cleanups.push(cleanup);
    },
  };
});
const results = vi.hoisted(() => ({ lectures: undefined as unknown }));
vi.mock("convex/react", () => ({
  useQuery: (ref: FunctionReference<"query">) => (getFunctionName(ref) === "checkin/attendance:lectures" ? results.lectures : undefined),
  useMutation: () => async () => null,
  useConvex: () => ({ query: async () => [] }),
}));

const { ClassStatus } = await import("./Teacher");

const pst = (mo: number, d: number, h: number, mi = 0) => Date.UTC(2026, mo - 1, d, h + 8, mi);
const open = { lecture: "k1", open: true, startedAt: pst(11, 5, 14, 12), startsAt: pst(11, 5, 14, 30), graceMin: 5, endedAt: null, count: 2 };

function text(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(text).join("");
  if (!isValidElement(node)) return "";
  return text((node as ReactElement<{ children?: ReactNode }>).props.children).replace(/\s+/g, " ");
}
const render = () => text(ClassStatus());

beforeEach(() => {
  vi.stubEnv("TZ", "America/Los_Angeles");
  vi.useFakeTimers();
  vi.setSystemTime(pst(11, 5, 14, 20));
  hooks.rerenders = 0;
  hooks.cleanups = [];
  results.lectures = [open];
});
afterEach(() => {
  for (const c of hooks.cleanups) c();
  vi.useRealTimers();
});

describe("CKA-fixcheck the class status line changes at the start time", () => {
  it("'Class starts 2:30 PM' asks for a re-render at 2:30, which then says 'Class started'", () => {
    expect(render()).toMatch(/^Class starts Thu Nov 5, 2:30 PM$/);
    vi.advanceTimersByTime(9 * 60_000);
    expect(hooks.rerenders).toBe(0);
    vi.advanceTimersByTime(60_000);
    expect(hooks.rerenders).toBe(1);
    expect(render()).toMatch(/^Class started Thu Nov 5, 2:30 PM$/);
  });

  it("a class that started already sets no timer", () => {
    vi.setSystemTime(pst(11, 5, 14, 40));
    expect(render()).toMatch(/^Class started/);
    expect(vi.getTimerCount()).toBe(0);
  });
});
