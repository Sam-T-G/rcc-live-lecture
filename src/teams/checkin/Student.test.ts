// @vitest-environment node
// The pass page (Student.tsx), rendered to HTML with made-up query results (no backend). Effects
// don't run here: Student.timing.test.ts checks when the page asks for codes and hides an old one.
import { readFileSync } from "node:fs";
import { cloneElement, createElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HideLate, Student, StudentPass } from "./Student";
import LateBanner from "./LateBanner";
import { ErrorBoundary } from "../../blocks/ui";
import { parse } from "../../styles/cssRules";

// Stand-ins for the quiz card and the late banner, so a test sees where each one sits.
vi.mock("./Quiz", () => ({ QuizCard: () => "[quiz card]" }));
vi.mock("./LateBanner", () => ({ default: () => "[late banner]" }));

// What each query answers, by its name ("checkin/pass:mine"); a query not listed is loading.
const answers = vi.hoisted(() => ({ now: {} as Record<string, unknown> }));
vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  return {
    useQuery: (ref: Parameters<typeof getFunctionName>[0]) => answers.now[getFunctionName(ref)],
    useMutation: () => async () => null,
  };
});
vi.mock("../../blocks/auth", () => ({
  StudentSignIn: () => null,
  SignedInAs: () => "[signed in as, Not you? Sign out]",
  useGoogleUser: () => ({ user: { name: "Sample student 1", email: "student1@example.edu" }, signOut: () => {} }),
}));

const PASS = { code: "ABCDEF", name: "Sample student 1", email: "student1@example.edu", at: 0 };
const render = (here: boolean) => {
  answers.now = { "checkin/pass:mine": PASS, "checkin/read:me": here, "checkin/attendance:myHideLate": false };
  return renderToStaticMarkup(createElement(StudentPass));
};

beforeEach(() => {
  answers.now = { "checkin/attendance:myHideLate": false };
});

describe("HideLate, the late-banner opt-out", () => {
  it("its label has no .row class, so the checkbox stays beside its words (DC-1, DESIGN-design-8)", () => {
    // .row (checkin.css) is flex-wrap: wrap, which drops the words under the box on a phone.
    // The base label:has(> input[type=checkbox]) rule lays it out (surfaces.test.ts).
    const html = renderToStaticMarkup(createElement(HideLate));
    const label = /<label class="([^"]*)"><input type="checkbox"/.exec(html);
    expect(label).not.toBeNull();
    expect(label![1].split(" ")).not.toContain("row");
  });

  it("F16 its label says what it does: 'Don’t show my first name on the class screens when I’m late'", () => {
    const html = renderToStaticMarkup(createElement(HideLate));
    expect(html).toContain("Don’t show my first name on the class screens when I’m late</label>");
    expect(html).not.toContain("on the slides");
  });
});

describe("the pass and the checked-in screen", () => {
  it("checkin-frontend-21 the pass says 'Show this to the professor' and that a screenshot stops working within a minute", () => {
    const html = render(false);
    expect(html).toContain("Show this to the professor");
    expect(html).toContain("The code changes every 20 seconds. A screenshot stops working within a minute.");
    expect(html).not.toMatch(/teacher|won’t work/);
    // A code the page just got shows as a QR with its letters, not "Getting a new code…".
    expect(html).toContain('<div class="pass__qr"><figure class="qr"');
    expect(html).toContain('<p class="pass__code">ABCDEF</p>');
    expect(html).not.toContain("Getting a new code");
  });

  it("blocks-frontend-8 checkin-frontend-13 rt-22 the pass and the checked-in screen both say who is signed in, with 'Not you? Sign out'", () => {
    expect(render(false)).toContain("[signed in as, Not you? Sign out]");
    const checkedIn = render(true);
    expect(checkedIn).toContain("You’re checked in.");
    expect(checkedIn).toContain("[signed in as, Not you? Sign out]");
  });

  it("checkin-frontend-13 before the pass loads, the page still says who is signed in, so a student can sign out", () => {
    answers.now = { "checkin/pass:mine": null, "checkin/read:me": false };
    const html = renderToStaticMarkup(createElement(StudentPass));
    expect(html).toContain("Making your pass…");
    expect(html).toContain("[signed in as, Not you? Sign out]");
  });

  it("sweep2-checkin-7 sweep2-tests-1 F10.4 F16.4 the checked-in screen has the quiz card, 'Follow the slides' to #/live and the late opt-out", () => {
    const html = render(true);
    expect(html).toContain("You’re checked in.");
    expect(html).toContain("[quiz card]");
    expect(html).toContain('<p><a href="#/live">Follow the slides</a></p>');
    expect(html).toContain("Don’t show my first name on the class screens when I’m late");
  });

  it("sweep2-tests-1 F16.4 the pass has the late opt-out too", () => {
    expect(render(false)).toContain("Don’t show my first name on the class screens when I’m late");
  });
});

// sweep2-ledger-1: a scan flips checkin.read.me to true and StudentPass swaps the pass for the
// checked-in screen. A banner inside either screen would mount again then and count the scan's
// own late arrival as already seen, so the late student's phone would never show it. The banner
// sits in Student(), beside StudentPass, and stays mounted through the swap.
describe("sweep2-ledger-1 F16.1 the late banner on #/checkin/student", () => {
  type El = ReactElement<{ children?: ReactNode; label?: string }>;
  // The elements Student() returns, without rendering the components inside them.
  const tree = (node: ReactNode): El[] =>
    Array.isArray(node) ? node.flatMap(tree) : isValidElement(node) ? [node as El, ...tree((node as El).props.children)] : [];

  it("is mounted once by Student(), beside StudentPass and in its own ErrorBoundary, the same whether or not the student is checked in", () => {
    for (const here of [false, true]) {
      answers.now = { "checkin/pass:mine": PASS, "checkin/read:me": here, "checkin/attendance:myHideLate": false };
      const els = tree(Student());
      const banners = els.filter((e) => e.type === LateBanner);
      expect(banners).toHaveLength(1);
      const boundary = els.find((e) => e.type === ErrorBoundary && tree(e.props.children).some((c) => c.type === LateBanner));
      expect(boundary?.props.label).toBe("The late banner");
      expect(els.some((e) => e.type === StudentPass)).toBe(true);
    }
  });

  it("neither the pass nor the checked-in screen draws a banner of its own", () => {
    expect(render(false)).not.toContain("[late banner]");
    expect(render(true)).not.toContain("[late banner]");
  });
});

// sweep2-checkin-fixcheck-1: the banner's ErrorBoundary sits outside <Screen>, so its failed
// state ("The late banner didn't load." + Try again) would land after <main class="page"> with no
// side gutter (body has no margin; only .page pads its sides). Student() wraps the boundary in
// .student-late (checkin.css), fixed 16px in from each side of the screen like portal's
// .portal-late, so the error line keeps the gutter while the banner itself stays fixed as before.
describe("sweep2-checkin-fixcheck-1 the late banner's error line on #/checkin/student", () => {
  type El = ReactElement<{ children?: ReactNode; label?: string; className?: string }>;
  const tree = (node: ReactNode): El[] =>
    Array.isArray(node) ? node.flatMap(tree) : isValidElement(node) ? [node as El, ...tree((node as El).props.children)] : [];
  const kids = (e: El) => tree(e.props.children);

  function wrapper() {
    answers.now = { "checkin/pass:mine": PASS, "checkin/read:me": false, "checkin/attendance:myHideLate": false };
    return tree(Student()).find((e) => e.props.className === "student-late" && kids(e).some((c) => c.type === ErrorBoundary));
  }

  it("the banner's ErrorBoundary sits in a .student-late wrapper", () => {
    expect(wrapper()).toBeDefined();
  });

  it("the boundary's failed state renders inside the wrapper", () => {
    const w = wrapper();
    expect(w).toBeDefined();
    const b = new ErrorBoundary({ label: "The late banner" });
    b.state = { failed: true };
    const html = renderToStaticMarkup(cloneElement(w!, undefined, b.render()));
    expect(html).toMatch(
      /^<div class="student-late"><div class="row"><p class="status status--error"[^>]*>The late banner didn(?:’|'|&#x27;)t load\.<\/p><button[^>]*>Try again<\/button><\/div><\/div>$/,
    );
  });

  it(".student-late is fixed 16px in from each side, and its error row takes taps", () => {
    const rules = parse(readFileSync(new URL("./checkin.css", import.meta.url), "utf8"));
    const decls = (sel: string) => Object.fromEntries(rules.filter((r) => r.selectors.includes(sel)).flatMap((r) => r.decls));
    const box = decls(".student-late");
    expect(box.position).toBe("fixed");
    expect(box.left).toBe("16px");
    expect(box.right).toBe("16px");
    expect(box["pointer-events"]).toBe("none");
    expect(decls(".student-late > .row")["pointer-events"]).toBe("auto");
  });
});
