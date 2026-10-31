// #/ui: every color token and every kit part in every state, light and dark side by side, for
// design reviews and screenshots. The ratios are measured from what the browser draws.
// #/ui/projector shows the projector layout at the window's size. docs/design.md says when to
// use each part.
import { useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ConvexError } from "convex/values";
import { useRoute } from "../blocks/router";
import { Big, Card, Status } from "../blocks/ui";
import { Badge, Banner, Button, ConfirmButton, EmptyState, Field, Projector, Segmented, Skeleton, Stat, Tabs, type ButtonVariant } from "../blocks/kit";
import { PAIRS, contrastRatio, parseColor, toHex, type Pair } from "../styles/contrast";
import "../styles/uikit.css";

export default function UIKit() {
  const [, sub] = useRoute();
  if (sub === "projector") return <ProjectorSample />;
  return (
    <main className="page page--wide">
      <h1>UI kit</h1>
      <p className="muted">When to use each part: docs/design.md in the repo.</p>
      <p>
        <a className="btn btn--secondary" href="#/ui/projector">
          Projector layout
        </a>
      </p>
      <div className="uikit">
        <Theme name="light" />
        <Theme name="dark" />
      </div>
    </main>
  );
}

function Theme({ name }: { name: "light" | "dark" }) {
  const id = useId();
  return (
    <section className="uikit__theme" data-theme={name} aria-labelledby={id}>
      <h2 id={id}>{name === "light" ? "Light" : "Dark"}</h2>
      <Section title="Colors">
        <Swatches />
      </Section>
      <Section title="Contrast">
        <ContrastTable />
      </Section>
      <Section title="Type">
        <TypeSamples />
      </Section>
      <Section title="Buttons">
        <Buttons />
      </Section>
      <Section title="Fields">
        <Fields />
      </Section>
      <Section title="Tabs and choices">
        <Choices />
      </Section>
      <Section title="Badges and banners">
        <BadgesAndBanners />
      </Section>
      <Section title="Status lines">
        <Status kind="loading">Loading the slide…</Status>
        <Status kind="empty">Waiting for the professor to start the slides.</Status>
        <Status kind="error">The quiz didn't load. Check the connection.</Status>
      </Section>
      <Section title="Numbers">
        <Big value={42} label="checked in" />
        <div className="row">
          <Stat value={42} label="Checked in" accent />
          <Stat value={7} label="Late" />
          <Stat value={3} label="Lost on this slide" />
        </div>
      </Section>
      <Section title="Cards, lists and tables">
        <CardsAndTables />
      </Section>
      <Section title="Empty, loading and confirm">
        <EmptyAndConfirm />
      </Section>
    </section>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="uikit__section">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

// Reads the colors the browser drew on an element, once it's on the screen.
function useDrawn<T extends HTMLElement>(read: (style: CSSStyleDeclaration) => string) {
  const ref = useRef<T>(null);
  const [text, setText] = useState("…");
  useLayoutEffect(() => {
    if (ref.current) setText(read(getComputedStyle(ref.current)));
  }, [read]);
  return [ref, text] as const;
}

const COLORS: [string, string][] = [
  ["--bg", "The page"],
  ["--surface", "Cards and fields"],
  ["--fill", "Table heads, grey badges, skeletons"],
  ["--text", "Words"],
  ["--muted", "Hints, times, labels"],
  ["--line", "Dividers only"],
  ["--line-strong", "Field and button edges"],
  ["--accent", "Links, the main button, big numbers"],
  ["--accent-text", "Words on --accent"],
  ["--accent-soft", "Chosen option, success"],
  ["--accent-soft-text", "Words on --accent-soft"],
  ["--error", "Error words, the danger button"],
  ["--error-text", "Words on --error"],
  ["--error-soft", "Error banner"],
  ["--error-soft-text", "Words on --error-soft"],
  ["--live", "The Live badge"],
  ["--live-text", "Words on --live"],
  ["--warn", "Warning banner"],
  ["--warn-text", "Words on --warn"],
  ["--code-bg", "Code"],
  ["--code-text", "Words in code"],
  ["--focus", "The keyboard focus ring"],
];

const hexOfFill = (s: CSSStyleDeclaration) => {
  const rgb = parseColor(s.backgroundColor);
  return rgb ? toHex(rgb) : "?";
};

function Swatches() {
  return (
    <ul className="uikit-swatches">
      {COLORS.map(([token, use]) => (
        <Swatch key={token} token={token} use={use} />
      ))}
    </ul>
  );
}

function Swatch({ token, use }: { token: string; use: string }) {
  const [ref, hex] = useDrawn<HTMLSpanElement>(hexOfFill);
  return (
    <li className="uikit-swatch">
      <span ref={ref} className="uikit-swatch__chip" style={{ background: `var(${token})` }} />
      <code>{token}</code>
      <span className="ledger">{hex}</span>
      <span className="muted">{use}</span>
    </li>
  );
}

const ratioDrawn = (s: CSSStyleDeclaration) => {
  const fg = parseColor(s.color);
  const bg = parseColor(s.backgroundColor);
  return fg && bg ? contrastRatio(fg, bg).toFixed(2) : "?";
};

function ContrastTable() {
  return (
    <ul className="list uikit-pairs">
      {PAIRS.map((p) => (
        <PairRow key={p.fg + p.bg} pair={p} />
      ))}
    </ul>
  );
}

function PairRow({ pair: { fg, bg, min, use } }: { pair: Pair }) {
  const [ref, ratio] = useDrawn<HTMLSpanElement>(ratioDrawn);
  const low = Number(ratio) < min;
  return (
    <li className="uikit-pair">
      <span ref={ref} className="uikit-sample" style={{ color: `var(${fg})`, background: `var(${bg})` }}>
        {min === 4.5 ? "Aa" : <span className="uikit-sample__ring" />}
      </span>
      <span>
        <code>{fg}</code> on <code>{bg}</code>
        <br />
        <b>{ratio}:1</b> <span className="muted">needs {min}:1</span> {low && <Badge tone="error">Too low</Badge>}
        <br />
        <span className="muted">{use}</span>
      </span>
    </li>
  );
}

function TypeSamples() {
  return (
    <>
      <TypeRole name="--fs-h1, h1" size="28 to 40px">
        <p className="text-h1">Page title</p>
      </TypeRole>
      <TypeRole name="--fs-h2, h2" size="20 to 24px">
        <p className="text-h2">Card title</p>
      </TypeRole>
      <TypeRole name="--fs-h3, h3" size="18px">
        <p className="text-h3">Section in a card</p>
      </TypeRole>
      <TypeRole name="--fs-body" size="17px">
        <p>Students follow the slide on their phones and answer the quiz from their seats.</p>
      </TypeRole>
      <TypeRole name="--fs-small, .text-small" size="15px">
        <p className="text-small">Hints, times and table cells.</p>
      </TypeRole>
      <TypeRole name="--fs-label, .text-label" size="15px">
        <p className="text-label">Buttons and field names</p>
      </TypeRole>
      <TypeRole name="--fs-ledger, .ledger" size="13px">
        <p className="ledger">A-210 · Thu 2:30 PM · slide 12 of 30</p>
      </TypeRole>
      <p>
        Inline <code>checkin.pass.scan</code> code, and a <a href="#/ui">link in a sentence</a>.
      </p>
    </>
  );
}

function TypeRole({ name, size, children }: { name: string; size: string; children: ReactNode }) {
  return (
    <div className="uikit-type">
      {children}
      <p className="text-small muted">
        <code>{name}</code> · {size}
      </p>
    </div>
  );
}

const VARIANTS: [ButtonVariant, string][] = [
  ["primary", "Check in"],
  ["secondary", "Download CSV"],
  ["quiet", "Show all"],
  ["danger", "End class"],
];

function Buttons() {
  return (
    <>
      {VARIANTS.map(([variant, words]) => (
        <div key={variant}>
          <p className="text-label">{variant[0].toUpperCase() + variant.slice(1)}</p>
          <div className="uikit-states">
            <State name="Normal">
              <Button variant={variant}>{words}</Button>
            </State>
            <State name="Hover">
              <Button variant={variant} data-force="hover">
                {words}
              </Button>
            </State>
            <State name="Pressed">
              <Button variant={variant} data-force="active">
                {words}
              </Button>
            </State>
            <State name="Keyboard focus">
              <Button variant={variant} data-force="focus">
                {words}
              </Button>
            </State>
            <State name="Disabled">
              <Button variant={variant} disabled>
                {words}
              </Button>
            </State>
            <State name="Busy">
              <Button variant={variant} busy>
                {words}
              </Button>
            </State>
          </div>
        </div>
      ))}
      <p className="text-label">Small (laptop pages only), full width, and a link</p>
      <div className="uikit-states">
        <State name="Small">
          <Button small>Next slide</Button>
        </State>
        <State name="Small secondary">
          <Button small variant="secondary">
            Copy link
          </Button>
        </State>
        <State name="A link with class btn">
          <a className="btn btn--secondary" href="#/ui">
            Open the board
          </a>
        </State>
      </div>
      <Button block>Check in</Button>
    </>
  );
}

function State({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="uikit-state">
      <span className="ledger">{name}</span>
      {children}
    </div>
  );
}

function Fields() {
  const [email, setEmail] = useState("");
  const [late, setLate] = useState("5");
  const answer = useId();
  return (
    <>
      <Field label="Email" hint="The one you sign in with.">
        {(f) => <input {...f} type="email" value={email} placeholder="you@example.com" onChange={(e) => setEmail(e.target.value)} />}
      </Field>
      <Field label="Email" error="That email is missing an @.">
        {(f) => <input {...f} type="email" defaultValue="you.example.com" />}
      </Field>
      <Field label="Keyboard focus">{(f) => <input {...f} data-force="focus" defaultValue="Ana" />}</Field>
      <Field label="Disabled">{(f) => <input {...f} disabled defaultValue="Ana" />}</Field>
      <Field label="Late after">
        {(f) => (
          <select {...f} value={late} onChange={(e) => setLate(e.target.value)}>
            <option value="0">Class start</option>
            <option value="5">5 min</option>
            <option value="10">10 min</option>
          </select>
        )}
      </Field>
      <Field label="Your question">{(f) => <textarea {...f} placeholder="Ask about this slide" />}</Field>
      <p>
        <label>
          <input type="checkbox" defaultChecked /> Hide my name from the late banner
        </label>
      </p>
      <fieldset>
        <legend>Which planet is the largest?</legend>
        <label>
          <input type="radio" name={answer} defaultChecked /> Jupiter
        </label>
        <label>
          <input type="radio" name={answer} /> Saturn
        </label>
      </fieldset>
    </>
  );
}

function Choices() {
  const [size, setSize] = useState<"3" | "4" | "5">("4");
  const [kind, setKind] = useState<"quiz" | "vote">("quiz");
  return (
    <>
      <Tabs
        label="Professor view"
        tabs={[
          { id: "now", label: "Now", panel: <p>The slide, the quiz and who's lost.</p> },
          { id: "questions", label: "Questions", panel: <p>Student questions, most votes first.</p> },
          { id: "teams", label: "Teams", panel: <p>Teams and points.</p> },
        ]}
      />
      <div className="uikit-states">
        <State name="Hover">
          <div className="tabs__list">
            <button type="button" className="tabs__tab" data-force="hover">
              Questions
            </button>
          </div>
        </State>
        <State name="Keyboard focus">
          <div className="tabs__list">
            <button type="button" className="tabs__tab" data-force="focus">
              Questions
            </button>
          </div>
        </State>
      </div>
      <Segmented
        label="Team size"
        value={size}
        onChange={setSize}
        options={[
          { value: "3", label: "3" },
          { value: "4", label: "4" },
          { value: "5", label: "5" },
        ]}
      />
      <Segmented
        label="Quiz or vote (full width, for phones)"
        block
        value={kind}
        onChange={setKind}
        options={[
          { value: "quiz", label: "Quiz" },
          { value: "vote", label: "Vote" },
        ]}
      />
      <Segmented label="Disabled" disabled value="4" onChange={() => {}} options={[{ value: "3", label: "3" }, { value: "4", label: "4" }]} />
    </>
  );
}

function BadgesAndBanners() {
  return (
    <>
      <p className="row">
        <Badge>Slide 12 of 30</Badge>
        <Badge tone="accent">Checked in</Badge>
        <Badge tone="live">Live</Badge>
        <Badge tone="warn">5 min late</Badge>
        <Badge tone="error">Not checked in</Badge>
      </p>
      <Banner title="Class starts at 2:30 PM.">Scan your pass at the door when you walk in.</Banner>
      <Banner tone="success" title="You're checked in.">
        Your pass scanned at 2:27 PM.
      </Banner>
      <Banner tone="warn" title="You walked in 5 min late." />
      <Banner tone="error" title="The quiz didn't load." action={<Button variant="secondary">Try again</Button>}>
        Check the connection.
      </Banner>
    </>
  );
}

function CardsAndTables() {
  return (
    <>
      <Card title="Questions">
        <ul className="list">
          <li>Why does the loop stop at 9? · 6 votes</li>
          <li>Can you go back to the last slide? · 4 votes</li>
          <li>Is this on the midterm? · 2 votes</li>
        </ul>
      </Card>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">Team</th>
              <th scope="col">Right</th>
              <th scope="col">Per student</th>
              <th scope="col">Extra credit</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">Green</th>
              <td>6</td>
              <td>2.0</td>
              <td>+5</td>
            </tr>
            <tr>
              <th scope="row">Blue</th>
              <td>5</td>
              <td>1.7</td>
              <td>+3</td>
            </tr>
            <tr>
              <th scope="row">Red</th>
              <td>3</td>
              <td>1.0</td>
              <td>+1</td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}

const wait = (ms: number) => new Promise((done) => setTimeout(done, ms));

function EmptyAndConfirm() {
  return (
    <>
      <EmptyState title="No questions yet" action={<Button variant="secondary">Copy the student link</Button>}>
        Students ask from #/live on their phones.
      </EmptyState>
      <Skeleton />
      <Skeleton height="6rem" />
      <div className="uikit-states">
        <State name="Closed">
          <ConfirmButton question="Remove this question? Students won't see it again." confirm="Remove" onConfirm={() => wait(800)}>
            Remove
          </ConfirmButton>
        </State>
        <State name="Asking">
          <ConfirmButton defaultOpen question="Remove this question? Students won't see it again." confirm="Remove" onConfirm={() => wait(800)}>
            Remove
          </ConfirmButton>
        </State>
        <State name="Failed">
          <ConfirmButton
            defaultOpen
            question="End class for today?"
            confirm="End class"
            onConfirm={() => wait(800).then(() => Promise.reject(new ConvexError("That class already ended.")))}
          >
            End class
          </ConfirmButton>
        </State>
      </div>
    </>
  );
}

function ProjectorSample() {
  return (
    <Projector ledger="A-210 · Thu 2:30 PM · slide 12 of 30" title="Team board">
      <ol className="list uikit-board">
        <li>
          <b>1. Green</b> 6 right · 2.0 per student <Badge tone="accent">+5 extra credit</Badge>
        </li>
        <li>
          <b>2. Blue</b> 5 right · 1.7 per student <Badge>+3 extra credit</Badge>
        </li>
        <li>
          <b>3. Red</b> 3 right · 1.0 per student <Badge>+1 extra credit</Badge>
        </li>
      </ol>
      <Big value={42} label="checked in" />
      <p className="text-small">
        <a href="#/ui">Back to the UI kit</a>
      </p>
    </Projector>
  );
}
