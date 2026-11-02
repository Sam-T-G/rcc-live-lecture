// @vitest-environment node
// The design system's kit parts (kit.tsx, docs/design.md "The kit"), rendered to markup: the
// classes kit.css draws, the states each part takes, and that the older parts keep their markup.
import { createElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Badge, Bars, Button, Choice, ConfirmButton, Icon, Notice, Row, Rows, SlideTrack, StateChip, Switch, TeamChip } from "./kit";
import { QR } from "./qr";

const html = (el: ReactElement) => renderToStaticMarkup(el);
// createElement without its per-component prop checks: these tests pass each part the props a
// page would, and some on purpose leave one out.
const h = createElement as unknown as (type: unknown, props: Record<string, unknown> | null, ...children: ReactNode[]) => ReactElement;

describe("Button", () => {
  it("keeps the older looks' classes: a bare .btn is the primary, small is .btn--small", () => {
    expect(html(h(Button, null, "Check in"))).toBe('<button type="button" class="btn"><span class="btn__label">Check in</span></button>');
    expect(html(h(Button, { variant: "secondary", small: true }, "Copy link"))).toContain('class="btn btn--secondary btn--small"');
  });

  it("draws the design system's looks and sizes as one class each", () => {
    expect(html(h(Button, { variant: "neutral", size: "lg" }, "I’m lost"))).toContain('class="btn btn--neutral btn--lg"');
    expect(html(h(Button, { variant: "ghost", size: "sm" }, "Keep"))).toContain('class="btn btn--ghost btn--sm"');
    expect(html(h(Button, { variant: "raised" }, "Follow the slides"))).toContain('class="btn btn--raised"');
  });

  it("busy keeps the words and marks the button busy and disabled, so the disabled look never hides the spinner", () => {
    const out = html(h(Button, { busy: true }, "Save"));
    expect(out).toContain('aria-busy="true"');
    expect(out).toContain('aria-disabled="true"');
    expect(out).toContain('<span class="btn__label">Save</span><span class="btn__spinner" aria-hidden="true"></span>');
  });
});

describe("Badge and StateChip", () => {
  it("Badge keeps its markup and tones", () => {
    expect(html(h(Badge, { tone: "warn" }, "Private"))).toBe('<span class="badge badge--warn">Private</span>');
  });

  it("IT1-KIT host-craft-1-3 tone place draws a place as the ledger's bare numeral, in the same markup", () => {
    expect(html(h(Badge, { tone: "place" }, "2nd, tied"))).toBe('<span class="badge badge--place">2nd, tied</span>');
  });

  it("StateChip draws a state tone with its glyph before the words, hidden from screen readers", () => {
    const out = html(h(StateChip, { tone: "in", glyph: "check" }, "Paired"));
    expect(out).toMatch(/^<span class="badge badge--in"><svg class="icon" viewBox="0 0 256 256" aria-hidden="true" focusable="false">.*<\/svg>Paired<\/span>$/);
    expect(html(h(StateChip, { tone: "quiet" }, "AI draft"))).toBe('<span class="badge badge--quiet">AI draft</span>');
  });

  it("every Icon is a hidden SVG on the 256 grid", () => {
    for (const name of ["check", "x", "warning", "clock", "lock", "eye", "repeat", "inbox", "arrow-left", "arrow-right", "chevron-right"] as const) {
      expect(html(h(Icon, { name })), name).toMatch(/^<svg class="icon" viewBox="0 0 256 256" aria-hidden="true" focusable="false"><(path|circle|rect)/);
    }
  });
});

describe("Choice", () => {
  const choice = (state?: string, word?: string) => html(h(Choice, { letter: "B", state, word }, "Current"));

  it("draws the letter tile and the words, on the field unless onPage", () => {
    expect(choice()).toBe('<button type="button" class="choice"><span class="letter">B</span><span>Current</span></button>');
    expect(html(h(Choice, { letter: "A", onPage: true }, "Charge"))).toContain('class="choice choice--on-page"');
  });

  it("marks each state with one class, and sending as busy with the clock glyph before its word", () => {
    expect(choice("picked")).toContain('class="choice is-picked"');
    expect(choice("sent", "Sent")).toContain('class="choice is-picked is-locked"');
    expect(choice("error", "Try again")).toContain('class="choice is-error"');
    expect(choice("right", "Right answer")).toContain('class="choice is-right"');
    expect(choice("out")).toContain('class="choice is-out"');
    const sending = choice("sending", "Sending");
    expect(sending).toContain('aria-busy="true"');
    expect(sending).toMatch(/<span class="choice__state"><svg class="icon choice__clock"[^>]*>.*<\/svg>Sending<\/span>/);
  });
});

describe("Bars", () => {
  it("puts each row's count and percent on its label line, the fill as a share, the right answer and yours marked", () => {
    const out = html(
      h(Bars, {
        hero: true,
        bars: [
          { letter: "A", label: "Charge", count: 3, right: true, tag: "Right answer" },
          { letter: "B", label: "Current", count: 1, mine: true, tag: "Your answer" },
        ],
      }),
    );
    expect(out).toMatch(/^<div class="bars bars--hero">/);
    expect(out).toContain('<div class="barrow is-right"><span class="letter">A</span>');
    expect(out).toContain('<span class="barrow__fill" style="--f:0.75"></span>');
    expect(out).toContain('<span class="barrow__n"><span>3</span><span class="barrow__pct">75%</span></span>');
    expect(out).toContain('<div class="barrow is-mine">');
    expect(out).toContain('<span class="barrow__tag">Your answer</span>');
  });

  it("with no answers every bar is 0%, never NaN", () => {
    const out = html(h(Bars, { bars: [{ letter: "A", label: "Charge", count: 0 }] }));
    expect(out).toContain('style="--f:0"');
    expect(out).toContain('<span class="barrow__pct">0%</span>');
  });
});

describe("Rows and Row", () => {
  it("draws a table in a well with its head and columns, each row's state as one class", () => {
    const out = html(
      h(
        Rows,
        { head: ["Name", "Late"], cols: "minmax(0, 1fr) 64px" },
        h(Row, null, h("span", null, "Ana"), h("span", null, "0")),
        h(Row, { selected: true }, "Leo"),
        h(Row, { fresh: true }, "Mia"),
        h(Row, { confirm: true }, "Remove Mia?"),
      ),
    );
    expect(out).toMatch(/^<div class="ruled ruled--well" style="--rcols:minmax\(0, 1fr\) 64px"><div class="ruled__head"><span>Name<\/span><span>Late<\/span><\/div>/);
    expect(out).toContain('<div class="ruled__row is-selected">Leo</div>');
    expect(out).toContain('<div class="ruled__row is-new">Mia</div>');
    expect(out).toContain('<div class="ruled__row is-confirm">Remove Mia?</div>');
    expect(html(h(Rows, { well: false }, "x"))).toBe('<div class="ruled">x</div>');
  });
});

describe("SlideTrack", () => {
  it("prints a muted 0 for a past slide with no taps and nothing for a slide not reached; the current slide is its filled segment", () => {
    const out = html(h(SlideTrack, { counts: [0, 2, null], at: 1, label: "Lost" }));
    expect(out).toContain('style="--slides:3"');
    expect(out).toContain('<span class="track__n track__n--zero" style="grid-row:1;grid-column:2">0</span>');
    expect(out).toContain('<span class="track__n" style="grid-row:1;grid-column:3">2</span>');
    expect(out).toContain('<span class="track__n" style="grid-row:1;grid-column:4"></span>');
    expect(out).toContain('<span class="track__seg track__seg--now" style="grid-row:2;grid-column:3" aria-hidden="true"></span>');
    expect(out).toContain('<span class="track__i track__i--now" style="grid-row:3;grid-column:3">2</span>');
  });
});

describe("Switch, TeamChip and Notice", () => {
  it("Switch is a button with role switch and its state", () => {
    expect(html(h(Switch, { checked: true, onChange: () => {} }, "Group by topic with AI"))).toBe(
      '<button type="button" role="switch" class="switch" aria-checked="true"><span class="switch__track" aria-hidden="true"></span><span>Group by topic with AI</span></button>',
    );
  });

  it("TeamChip is the chip and the written name, colored by the team's class", () => {
    expect(html(h(TeamChip, { color: "teal", label: "Teal" }))).toBe('<span class="team group--teal"><span class="team__chip" aria-hidden="true"></span>Teal</span>');
  });

  it("Notice: a stop notice is an alert, a warn notice a status, each with its glyph", () => {
    expect(html(h(Notice, null, "The server didn’t accept that sign-in."))).toMatch(/^<div class="notice" role="alert"><svg class="icon"/);
    expect(html(h(Notice, { tone: "warn" }, "Check in to answer, ask and join a team."))).toMatch(/^<div class="notice notice--warn" role="status">/);
  });
});

describe("ConfirmButton overlay", () => {
  const props = { question: "End class for today?", confirm: "End class", onConfirm: () => {}, children: "End class" };

  it("without overlay the question box takes the button's place, as before", () => {
    const out = html(h(ConfirmButton, { ...props, defaultOpen: true }));
    expect(out).toMatch(/^<div class="confirm" role="group" aria-labelledby="[^"]+"><p class="confirm__question"/);
  });

  it("with overlay it keeps the button (disabled) and opens the box as a dialog sheet on the scrim", () => {
    const out = html(h(ConfirmButton, { ...props, defaultOpen: true, overlay: true }));
    expect(out).toMatch(/^<button disabled="" type="button" class="btn btn--danger"><span class="btn__label">End class<\/span><\/button><div class="scrim"><div class="sheet confirm" role="dialog" aria-modal="true" aria-labelledby="[^"]+">/);
    expect(out).toContain('<p class="confirm__question"');
  });

  it("IT1-KIT host-use-1-7 openerVariant draws the first button in its own look; the confirming button stays the only red fill", () => {
    expect(html(h(ConfirmButton, { ...props, openerVariant: "outline" }))).toBe(
      '<button type="button" class="btn btn--outline"><span class="btn__label">End class</span></button>',
    );
    const open = html(h(ConfirmButton, { ...props, openerVariant: "outline", defaultOpen: true, overlay: true }));
    expect(open).toMatch(/^<button disabled="" type="button" class="btn btn--outline"><span class="btn__label">End class<\/span><\/button><div class="scrim">/);
    expect(open).toContain('<div class="confirm__actions"><button type="button" class="btn btn--danger"><span class="btn__label">End class</span></button>');
    expect(html(h(ConfirmButton, { ...props, openerVariant: "ghost", children: "Remove" }))).toBe(
      '<button type="button" class="btn btn--ghost"><span class="btn__label">Remove</span></button>',
    );
  });

  it("IT1-KIT without openerVariant the first button keeps the confirm's look, as before", () => {
    expect(html(h(ConfirmButton, props))).toBe('<button type="button" class="btn btn--danger"><span class="btn__label">End class</span></button>');
    expect(html(h(ConfirmButton, { ...props, variant: "primary" }))).toBe('<button type="button" class="btn"><span class="btn__label">End class</span></button>');
  });
});

describe("QR", () => {
  it("names the code for screen readers, or hides it when a caption names it, and draws a 4-module quiet zone", () => {
    const named = html(h(QR, { value: "RCC-482913", size: 120 }));
    expect(named).toMatch(/^<figure class="qr" style="width:120px"><svg[^>]* role="img" aria-label="QR code"/);
    // A 21-module code with 4 modules of white on each side draws in a 29-unit viewBox (25 with 2).
    expect(named).toContain('viewBox="0 0 29 29"');
    const captioned = html(h(QR, { value: "RCC-482913", size: 120, label: "Scan to check in" }));
    expect(captioned).toContain('aria-hidden="true"');
    expect(captioned).not.toContain("aria-label");
    expect(captioned).toContain("<figcaption>Scan to check in</figcaption>");
  });
});
