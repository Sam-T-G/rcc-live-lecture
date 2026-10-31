// @vitest-environment node
// #/live and #/live/leaderboard, rendered to HTML with made-up query results (no backend). The
// quiz, past-questions and questions cards and the late banner are stand-ins that print their
// names, and ErrorBoundary is a <section> that carries its label, so these tests check what
// Page.tsx decides: which card sits in which boundary, the I'm lost slot under the slide, paging,
// and the words.
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { getFunctionName, type FunctionReference } from "convex/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import LivePage, { LiveSlides } from "./Page";
import { Leaderboard } from "./Leaderboard";

const results: Record<string, unknown> = {};
// Every query the page asked for and every mutation it sent, with their args, so a test can check
// which slide "I'm lost" reads and taps.
const calls = vi.hoisted(() => ({
  queries: [] as { name: string; args: unknown }[],
  mutations: [] as { name: string; args: unknown }[],
  // Props of every kit <Button> rendered, so a test can press one by calling its onClick.
  buttons: [] as { className?: string; onClick?: () => unknown }[],
  // The index prop of every Questions card rendered.
  questions: [] as unknown[],
}));
const auth = vi.hoisted(() => ({ user: null as null | { name: string; email: string } }));
vi.mock("convex/react", () => ({
  useQuery: (ref: FunctionReference<"query">, args?: unknown) => {
    if (args === "skip") return undefined;
    calls.queries.push({ name: getFunctionName(ref), args });
    return results[getFunctionName(ref)];
  },
  useMutation: (ref: FunctionReference<"mutation">) => async (args: unknown) => {
    calls.mutations.push({ name: getFunctionName(ref), args });
    return true;
  },
  // GroupBadge (Leaderboard.tsx) waits for this before it calls live.groups.join.
  useConvexAuth: () => ({ isLoading: false, isAuthenticated: auth.user !== null }),
}));
vi.mock("../../blocks/auth", () => ({ useGoogleUser: () => auth, SignedInAs: () => "[signed in as]" }));
// The deck's live slide is results["deck:current"]. With deck.steps set, it is instead each of
// those slides in turn within one render: the hook moves to the next one while the page is
// rendering, so React renders the same LiveSlides again with its state kept, the way an open page
// re-renders when the professor moves.
const deck = vi.hoisted(() => ({ steps: null as unknown[] | null }));
vi.mock("../../blocks/deck", async () => {
  const { useState } = await import("react");
  return {
    CHANNEL: "gdg",
    useDeckSlide: () => {
      const [step, setStep] = useState(0);
      if (deck.steps === null) return results["deck:current"];
      if (step < deck.steps.length - 1) setStep(step + 1);
      return deck.steps[step];
    },
  };
});
vi.mock("../../blocks/kit", async (importOriginal) => {
  const kit = await importOriginal<typeof import("../../blocks/kit")>();
  const { createElement } = await import("react");
  return {
    ...kit,
    Button: (props: Parameters<typeof kit.Button>[0]) => {
      calls.buttons.push(props as (typeof calls.buttons)[number]);
      return createElement(kit.Button, props);
    },
  };
});
vi.mock("../checkin/Quiz", () => ({ QuizCard: () => "[quiz card]" }));
vi.mock("../checkin/LateBanner", () => ({ default: () => "[late banner]" }));
vi.mock("./PastQuestions", () => ({ default: () => "[past quizzes and votes]" }));
vi.mock("./Questions", () => ({
  default: ({ index }: { index: unknown }) => {
    calls.questions.push(index);
    return "[questions]";
  },
}));
vi.mock("../../blocks/ui", async (importOriginal) => {
  const { createElement } = await import("react");
  return {
    ...(await importOriginal<typeof import("../../blocks/ui")>()),
    ErrorBoundary: ({ label, children }: { label?: string; children?: ReactNode }) =>
      createElement("section", { "data-boundary": label }, children),
  };
});

const team = (n: number) => ({ team: n, color: "green", label: `Team ${n}`, members: 3, correct: 6 - n, changes: 0, points: 6 - n, perStudent: (6 - n) / 3, rank: n, ec: 0 });
// The deck on slide `index + 1` of 10, with slides 1 to `index + 1` shown this class.
function deckOn(index: number) {
  results["deck:current"] = { index, beat: 0, count: 10, title: `Slide ${index + 1}`, lines: ["A line"], at: 0 };
  results["deck:slides"] = Array.from({ length: index + 1 }, (_, i) => ({ index: i, beat: 0, title: `Slide ${i + 1}`, lines: [], at: 0 }));
}
const STUDENT = { name: "Sample student 1", email: "student1@example.edu" };

beforeEach(() => {
  for (const k of Object.keys(results)) delete results[k];
  auth.user = null;
  deck.steps = null;
  calls.queries.length = 0;
  calls.mutations.length = 0;
  calls.buttons.length = 0;
  calls.questions.length = 0;
  Object.assign(results, {
    "checkin/pass:amHost": true, // a professor is signed in on the projector laptop
    "live/groups:status": { size: 3, locked: true, locksAt: null },
    "live/groups:leaderboard": { questions: 2, teams: [1, 2, 3, 4, 5].map(team) },
    "live/groups:mine": null,
    "deck:current": null,
    "deck:slides": [],
  });
});

function open(hash: string) {
  vi.stubGlobal("location", { hash });
  return renderToStaticMarkup(createElement(LivePage));
}

// The markup inside the stand-in boundary labelled `label`, or null when the page has none.
function boundary(html: string, label: string) {
  const start = `<section data-boundary="${label}">`;
  const at = html.indexOf(start);
  if (at < 0) return null;
  return html.slice(at + start.length, html.indexOf("</section>", at));
}
// The check-in line and link #/live shows a signed-in student who isn't checked in.
const CHECKIN_BOX =
  '<div class="live-checkin"><p class="live-checkin__note">Check in to answer, ask and join a team.</p><a href="#/checkin/student" class="btn btn--secondary btn--block">Check in</a></div>';
function checkinBox(html: string) {
  return /<div class="live-checkin">.*?<\/a><\/div>/.exec(html)?.[0] ?? null;
}
// The text of the page's I'm lost slot, tags dropped.
function lostSlot(html: string) {
  const inner = boundary(html, "The I’m lost button");
  return inner === null ? null : inner.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

describe("#/live/leaderboard, the room's board", () => {
  it("renders on the light projector stage, not in the phone screen", () => {
    const html = open("#/live/leaderboard");
    expect(html).toMatch(/^<main class="projector" data-theme="light">/);
    expect(html).not.toContain('class="page');
  });

  it("never shows the professor's 'Teams of 3 / Teams of 4' buttons to the room", () => {
    const html = open("#/live/leaderboard");
    expect(html).not.toContain("Teams of 3");
    expect(html).not.toContain("Teams of 4");
  });

  it("F16 the late banner shows on the room's board, in its projector-size box", () => {
    expect(open("#/live/leaderboard")).toContain('<div class="live-board__late">[late banner]</div>');
  });

  it("lists every team, since nobody can open a fold on the projector", () => {
    const html = renderToStaticMarkup(createElement(Leaderboard, { big: true }));
    expect(html).not.toContain("<details");
    for (const n of [1, 2, 3, 4, 5]) expect(html).toContain(`Team ${n}`);
  });

  const big = () => renderToStaticMarkup(createElement(Leaderboard, { big: true }));
  const rows = (html: string) => [...html.matchAll(/<span class="board__name">(.*?)<\/span>/g)].map((m) => m[1].split("<!-- -->").join(""));
  const teams = (n: number) => Array.from({ length: n }, (_, i) => team(i + 1));

  it("up to six teams keep the two-line rows (DESIGN-fixcheck-2)", () => {
    expect(big()).toMatch(/<ol class="board board--big">/);
  });

  it("seven to ten teams all show, in one-line rows so they fit 1080 tall (DESIGN-fixcheck-2)", () => {
    for (const n of [7, 8, 10]) {
      results["live/groups:leaderboard"] = { questions: 2, teams: teams(n) };
      const html = big();
      expect(html, `${n} teams`).toMatch(/<ol class="board board--big board--many">/);
      expect(rows(html)).toHaveLength(n);
      expect(html).not.toContain("board__more");
    }
  });

  it("past ten teams it lists ten and says how many more (DESIGN-fixcheck-2)", () => {
    results["live/groups:leaderboard"] = { questions: 2, teams: teams(12) };
    const html = big();
    expect(rows(html)).toEqual(teams(10).map((g) => g.label));
    expect(html).toContain("Plus 2 more teams. Your phone shows your team’s place.");
  });

  it("past ten teams, the viewer's own lower team takes the tenth row", () => {
    results["live/groups:leaderboard"] = { questions: 2, teams: teams(13) };
    results["live/groups:mine"] = { team: 12, color: "green", label: "Team 12" };
    const html = big();
    expect(rows(html)).toEqual([...teams(9).map((g) => g.label), "Team 12 (you)"]);
    expect(html).toContain("Plus 3 more teams.");
  });

  it("rt-2 the phone card has no team-size buttons, even for a professor: they're on #/host Points", () => {
    const html = renderToStaticMarkup(createElement(Leaderboard));
    expect(html).not.toContain("Teams of 3");
    expect(html).not.toContain("Teams of 4");
  });
});

describe("#/live, the student phone", () => {
  it("stacks the side cards in a column with a gap (live.css .live__side)", () => {
    const html = open("#/live");
    expect(html).toMatch(/<div class="live__side"><section data-boundary="The quiz">\[quiz card\]/);
  });

  it("live-frontend-22 each side card sits in its own error boundary, apart from the slide", () => {
    deckOn(2);
    const html = open("#/live");
    expect(boundary(html, "The quiz")).toBe("[quiz card]");
    expect(boundary(html, "The team leaderboard")).toContain("<h2>Team leaderboard</h2>");
    expect(boundary(html, "Past quizzes and votes")).toBe("[past quizzes and votes]");
    expect(boundary(html, "Questions")).toBe("[questions]");
    expect(html).toContain('<div id="live-questions"><section data-boundary="Questions">');
    // The slide is outside every card's boundary, so a card that fails leaves it up.
    const slide = html.indexOf("<h2 class=\"slide__title\">Slide 3</h2>");
    expect(slide).toBeGreaterThan(-1);
    expect(slide).toBeLessThan(html.indexOf('<div class="live__side">'));
  });

  it("F16 the late banner shows on #/live", () => {
    expect(boundary(open("#/live"), "The late banner")).toBe("[late banner]");
  });

  it("core-backend-10 'Signed in as' with its sign-out sits under the title", () => {
    expect(open("#/live")).toContain("<h1>Live slides</h1>[signed in as]");
  });

  it("F20.1 a checked-in student sees 'I’m lost' under the slide, pressed while they're counted as lost on it", () => {
    deckOn(2);
    auth.user = STUDENT;
    results["checkin/read:me"] = true;
    results["live/read:mine"] = false;
    let html = open("#/live");
    expect(html).toMatch(/<button aria-pressed="false" type="button" class="btn btn--secondary btn--block lost__button">/);
    expect(lostSlot(html)).toBe("I’m lost The professor sees how many people are lost on each slide. Your name isn’t shown.");

    results["live/read:mine"] = true;
    html = open("#/live");
    expect(html).toMatch(/<button aria-pressed="true" type="button" class="btn btn--secondary btn--block lost__button">/);
    expect(lostSlot(html)).toBe("✓ I’m lost You’re counted as lost on slide 3. Tap again to undo.");

    // Right after a slide change, before `mine` arrives: the button shows, not pressed and not busy.
    delete results["live/read:mine"];
    html = open("#/live");
    expect(html).toMatch(/<button aria-pressed="false" type="button" class="btn btn--secondary btn--block lost__button">/);
    expect(html).not.toContain("aria-busy");
  });

  it("LIVE-risk-1 I'm lost reads and taps the slide on screen: the live one, or the one the student paged back to", async () => {
    auth.user = STUDENT;
    results["checkin/read:me"] = true;
    results["live/read:mine"] = false;
    const mineArgs = () => calls.queries.filter((q) => q.name === "live/read:mine").map((q) => q.args);
    // Press the I'm lost button the last render drew, and return what it sent.
    async function press() {
      const button = calls.buttons.filter((b) => b.className?.includes("lost__button")).at(-1);
      expect(button).toBeDefined();
      calls.mutations.length = 0;
      await button!.onClick!();
      return calls.mutations;
    }

    // Following the professor on slide 7.
    deckOn(6);
    renderToStaticMarkup(createElement(LiveSlides));
    expect(mineArgs()).toEqual([{ channel: "gdg", index: 6 }]);
    expect(await press()).toEqual([{ name: "live/lost:toggle", args: { channel: "gdg", index: 6 } }]);

    // Paged back to slide 4 while the professor stays on slide 7.
    calls.queries.length = 0;
    const html = renderToStaticMarkup(createElement(LiveSlides, { pin: 3 }));
    expect(html).toContain('<h2 class="slide__title">Slide 4</h2>');
    expect(mineArgs()).toEqual([{ channel: "gdg", index: 3 }]);
    expect(await press()).toEqual([{ name: "live/lost:toggle", args: { channel: "gdg", index: 3 } }]);
  });

  it("F21.2 a signed-in student who isn't checked in sees 'Check in to answer, ask and join a team.' and a link to #/checkin/student above the slide, and no I'm lost button", () => {
    deckOn(2);
    auth.user = STUDENT;
    results["checkin/read:me"] = false;
    const html = open("#/live");
    expect(checkinBox(html)).toBe(CHECKIN_BOX);
    expect(html.indexOf(CHECKIN_BOX)).toBeLessThan(html.indexOf('<div class="live">'));
    expect(lostSlot(html)).toBe(""); // shown once, above the slide
    expect(html).not.toContain("lost__button");
  });

  it("LIVE-spec-2 the check-in line and link show with no slide up and no quiz open too", () => {
    auth.user = STUDENT;
    results["checkin/read:me"] = false;
    for (const current of [null, undefined]) {
      results["deck:current"] = current; // waiting for the slides, or loading them
      expect(checkinBox(open("#/live")), String(current)).toBe(CHECKIN_BOX);
    }
    // Checked in, or the check-in state still loading: no check-in line.
    results["checkin/read:me"] = true;
    expect(checkinBox(open("#/live"))).toBeNull();
    delete results["checkin/read:me"];
    expect(checkinBox(open("#/live"))).toBeNull();
    // Signed out: no check-in line; the Questions card has the sign-in form.
    auth.user = null;
    results["checkin/read:me"] = false;
    expect(checkinBox(open("#/live"))).toBeNull();
  });

  it("F20.6 signed out: 'Sign in to tap I’m lost' instead of the button", () => {
    deckOn(2);
    const html = open("#/live");
    expect(lostSlot(html)).toBe("Sign in to tap I’m lost");
    expect(html).not.toContain("lost__button");
  });

  it("no I'm lost slot while the check-in state loads, and none before the slides start", () => {
    deckOn(2);
    auth.user = STUDENT; // checkin/read:me not in yet
    expect(boundary(open("#/live"), "The I’m lost button")).toBe('<div class="lost" aria-busy="true"></div>');
    results["deck:current"] = null;
    expect(open("#/live")).not.toContain("The I’m lost button");
  });

  it("the words match #/portal: 'Loading the slides…', 'Waiting for the slides to start.', '← Back', 'Next →'", () => {
    results["deck:current"] = undefined;
    expect(open("#/live")).toContain("Loading the slides…");
    results["deck:current"] = null;
    expect(open("#/live")).toContain("Waiting for the slides to start.");
    deckOn(2);
    const html = open("#/live");
    expect(html).toContain("← Back");
    expect(html).toContain("Next →");
    expect(html).not.toContain("Back to live"); // following the professor
  });

  it("UC-risk-3 the Questions card gets index undefined while the deck loads, null before the slides start, and the slide on screen after", () => {
    results["deck:current"] = undefined;
    open("#/live");
    expect(calls.questions).toEqual([undefined]);
    results["deck:current"] = null;
    open("#/live");
    deckOn(2);
    open("#/live");
    expect(calls.questions).toEqual([undefined, null, 2]);
  });

  it("live-frontend-18 a phone that paged back follows live again once the professor reaches or goes back past its slide", () => {
    const at = (pin: number) => renderToStaticMarkup(createElement(LiveSlides, { pin }));
    // Paged back to slide 4 while the professor is on slide 7: the phone stays on slide 4.
    deckOn(6);
    let html = at(3);
    expect(html).toContain('<h2 class="slide__title">Slide 4</h2>');
    expect(html).toContain("The professor is on slide 7 now.");
    expect(html).toContain("Back to live");

    // The professor goes back to slide 3: the phone follows live.
    deckOn(6);
    results["deck:current"] = { index: 2, beat: 0, count: 10, title: "Slide 3", lines: [], at: 0 };
    html = at(3);
    expect(html).toContain('<h2 class="slide__title">Slide 3</h2>');
    expect(html).not.toContain("The professor is on slide");
    expect(html).not.toContain("Back to live");

    // The professor reaches slide 4: live again too.
    results["deck:current"] = { index: 3, beat: 0, count: 10, title: "Slide 4 live", lines: [], at: 0 };
    html = at(3);
    expect(html).toContain('<h2 class="slide__title">Slide 4 live</h2>');
    expect(html).not.toContain("Back to live");

    // The deck stops (End day): the phone waits for the next slides.
    results["deck:current"] = null;
    expect(at(3)).toContain("Waiting for the slides to start.");
  });

  it("LIVE-risk-3 an open phone paged back to slide 4 follows live when the professor moves, without reopening the page", () => {
    const on = (index: number, title = `Slide ${index + 1}`) => ({ index, beat: 0, count: 10, title, lines: [], at: 0 });
    deckOn(6); // slides 1 to 7 shown this class
    const at = (pin: number) => renderToStaticMarkup(createElement(LiveSlides, { pin }));

    // The professor stays on slide 7: the phone stays on slide 4 the whole time.
    deck.steps = [on(6), on(6)];
    let html = at(3);
    expect(html).toContain('<h2 class="slide__title">Slide 4</h2>');
    expect(html).toContain("The professor is on slide 7 now.");

    // The professor goes back to slide 3 while the phone is on slide 4: it follows live.
    deck.steps = [on(6), on(2)];
    html = at(3);
    expect(html).toContain('<h2 class="slide__title">Slide 3</h2>');
    expect(html).not.toContain("Back to live");

    // The professor reaches slide 4: live again.
    deck.steps = [on(6), on(3, "Slide 4 live")];
    html = at(3);
    expect(html).toContain('<h2 class="slide__title">Slide 4 live</h2>');
    expect(html).not.toContain("Back to live");

    // The deck stops (End day): the phone waits for the next slides.
    deck.steps = [on(6), null];
    expect(at(3)).toContain("Waiting for the slides to start.");
  });

  it("#/live/<other> shows 'No page at #/live/<other>'", () => {
    const html = open("#/live/nope");
    expect(html).toContain("<h1>No page at #/live/nope</h1>");
    expect(html).toContain('<a href="#/">Go home</a>');
  });
});
