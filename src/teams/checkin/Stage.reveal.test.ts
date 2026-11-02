// @vitest-environment node
// The results reveal on #/checkin/stage (Stage.tsx Poll; MOTION.md projector results-reveal):
// the panel gets .stage__poll--reveal only when this screen sees the open question end, and a
// page that opens on a question already over shows its results still (IT1-PROJECTOR-risk-2).
// There is no browser DOM, so React's hooks are swapped for a stand-in that keeps state between
// renders (Stage.press.test.ts does the same). A component that sets state while it renders is
// rendered again, as React does.
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const hooks = vi.hoisted(() => ({ slots: [] as unknown[], at: 0, set: false }));
vi.mock("react", async (orig) => {
  const R = await orig<typeof import("react")>();
  function slot<T>(make: () => T): [unknown[], number] {
    const i = hooks.at++;
    if (!(i in hooks.slots)) hooks.slots[i] = make();
    return [hooks.slots, i];
  }
  return {
    ...R,
    useState: (init: unknown) => {
      const [list, i] = slot(() => (typeof init === "function" ? (init as () => unknown)() : init));
      return [
        list[i],
        (next: unknown) => {
          hooks.set = true;
          list[i] = typeof next === "function" ? (next as (v: unknown) => unknown)(list[i]) : next;
        },
      ];
    },
    useRef: (init: unknown) => {
      const [list, i] = slot(() => ({ current: init }));
      return list[i];
    },
    useEffect: () => {},
  };
});
const quiz = vi.hoisted(() => ({ current: undefined as unknown }));
vi.mock("convex/react", () => ({ useQuery: () => quiz.current }));
vi.mock("./LateBanner", () => ({ default: () => null }));
vi.mock("../../blocks/router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../blocks/router")>()),
  useHashParams: () => new URLSearchParams("deck=https://deck.example.com/d/"),
}));

const { default: Stage } = await import("./Stage");

type El = ReactElement<{ children?: ReactNode; className?: string }>;
function elements(node: ReactNode): El[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement(node)) return [];
  const el = node as El;
  return [el, ...elements(el.props.children)];
}

// Poll as Stage places it (inside the card's ErrorBoundary).
function findPoll() {
  vi.stubGlobal("location", { hash: "#/checkin/stage", href: "https://x/#/checkin/stage", origin: "https://x", pathname: "/", protocol: "https:", search: "" });
  hooks.slots = [];
  hooks.at = 0;
  const poll = elements(Stage()).find((e) => typeof e.type === "function" && e.type.name === "Poll");
  vi.unstubAllGlobals();
  if (!poll) throw new Error("Stage has no Poll");
  return poll.type as () => ReactNode;
}
const Poll = findPoll();

// The panel's class after the quiz query returns `value` and Poll settles.
function panel(value: unknown) {
  quiz.current = value;
  let out: ReactNode;
  do {
    hooks.set = false;
    hooks.at = 0;
    out = Poll();
  } while (hooks.set);
  return elements(out).find((e) => typeof e.props.className === "string" && e.props.className.startsWith("stage__poll"))?.props.className;
}

const Q = { id: "poll-12", kind: "quiz", question: "Which hook runs after every render by default?", choices: ["useMemo", "useEffect", "useRef", "useId"], answered: 36 };
const OPEN = { ...Q, open: true, results: null };
const ENDED = { ...Q, open: false, results: { counts: [7, 22, 5, 2], correct: 1 } };

beforeEach(() => {
  hooks.slots = [];
});

describe("the results reveal (Stage.tsx Poll)", () => {
  it("IT1-PROJECTOR-risk-2 the open question ending on this screen gets .stage__poll--reveal", () => {
    expect(panel(OPEN)).toBe("stage__poll");
    expect(panel(ENDED)).toBe("stage__poll stage__poll--reveal");
    // The same ended question on the next update keeps it; the bars don't play again.
    expect(panel({ ...ENDED })).toBe("stage__poll stage__poll--reveal");
  });

  it("IT1-PROJECTOR-risk-2 a page opened on a question already over shows its results still", () => {
    expect(panel(ENDED)).toBe("stage__poll");
  });

  it("IT1-PROJECTOR-risk-2 a new question that is already over when it first shows doesn't reveal", () => {
    expect(panel(OPEN)).toBe("stage__poll");
    expect(panel({ ...ENDED, id: "poll-13" })).toBe("stage__poll");
  });
});
