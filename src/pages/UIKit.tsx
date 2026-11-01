// #/ui: every color token and every kit part in every state, light and dark side by side, for
// design reviews and screenshots. The ratios are measured from what the browser draws.
// #/ui/projector shows the projector layout at the window's size, and #/ui/projector/dark the
// same layout dark. Any other part after #/ui shows "No page". docs/design.md says when to use
// each part.
import { useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Link, useRoute } from "../blocks/router";
import { Big, Card, Screen, Status } from "../blocks/ui";
import { QR } from "../blocks/qr";
import {
  Badge,
  Banner,
  BannerStack,
  Bars,
  Button,
  Choice,
  ConfirmButton,
  EmptyState,
  Field,
  Icon,
  Notice,
  Projector,
  Row,
  Rows,
  Segmented,
  Skeleton,
  SlideTrack,
  Stat,
  Switch,
  Tabs,
  TeamChip,
  StateChip,
  type ButtonLook,
  type IconName,
} from "../blocks/kit";
import { PAIRS, contrastRatio, parseColor, toHex, type Pair } from "../styles/contrast";
import "../styles/uikit.css";

export default function UIKit() {
  const parts = useRoute();
  const [, sub, theme] = parts;
  if (sub === "projector" && parts.length <= 3 && (theme === undefined || theme === "dark"))
    return <ProjectorSample theme={theme === "dark" ? "dark" : "light"} />;
  if (parts.length > 1)
    return (
      <Screen title={`No page at #/${parts.join("/")}`}>
        <p><Link to="">Go home</Link></p>
      </Screen>
    );
  return (
    <main className="page page--wide">
      <h1>UI kit</h1>
      <p className="muted">When to use each part: docs/design.md in the repo.</p>
      <p className="row">
        <a className="btn btn--secondary" href="#/ui/projector">
          Projector layout
        </a>
        <a className="btn btn--secondary" href="#/ui/projector/dark">
          Projector layout, dark
        </a>
      </p>
      <div className="uikit">
        <Theme name="light" />
        <Theme name="dark" />
      </div>
      {/* The host's slide track spans the page, as on #/host: in a half-width column its title
          has no room. */}
      <div className="uikit-wide">
        <WideTrack name="light" />
        <WideTrack name="dark" />
      </div>
    </main>
  );
}

function WideTrack({ name }: { name: "light" | "dark" }) {
  return (
    <section className="uikit__theme" data-theme={name}>
      <Section title="Slide track">
        <SlideTrack
          counts={[0, 2, 0, 3, null, null, null, null]}
          at={3}
          where={
            <>
              <span className="track__of">Slide 4 of 8</span>
              <span className="track__title">Capacitors in a circuit</span>
            </>
          }
          label="Lost"
          end={
            <span className="roomn">
              <span className="roomn__n">38</span>
              <span className="roomn__l">checked in</span>
            </span>
          }
        />
      </Section>
    </section>
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
        <Numbers />
      </Section>
      <Section title="Surfaces">
        <Surfaces />
      </Section>
      <Section title="Cards, lists and tables">
        <HeadingLines />
        <CardsAndTables />
      </Section>
      <Section title="Rows">
        <RowsSample />
      </Section>
      <Section title="Glyph set">
        <Glyphs />
      </Section>
      <Section title="Answer choices and bars">
        <ChoicesAndBars />
      </Section>
      <Section title="Empty, loading and confirm">
        <EmptyAndConfirm />
        <States />
      </Section>
      <Section title="Pass and QR">
        <PassSample />
      </Section>
      <Section title="Door iPad parts, at 0.7">
        <KioskParts />
      </Section>
      <Section title="Projector parts, at 0.42">
        <ProjectorParts />
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
  ["--well", "Sunken: rows, tables, readouts"],
  ["--page", "The ground"],
  ["--raised", "Cards, a table head in a well, fields"],
  ["--bar", "Neutral badges, letter tiles, bar tracks"],
  ["--overlay", "Sheets and confirms"],
  ["--chrome", "The sticky bars"],
  ["--on-raised", "A part inside a card: a tile, a track"],
  ["--text", "Words"],
  ["--muted", "Hints, times, labels"],
  ["--line", "Dividers only"],
  ["--line-strong", "Field and button edges"],
  ["--accent", "The one filled button, the live number"],
  ["--on-accent", "Words on --accent"],
  ["--accent-soft", "A tonal fill"],
  ["--field", "The color field: a live or done state"],
  ["--field-tile", "A tile on the field"],
  ["--field-letter", "The letter on a tile on the field"],
  ["--tile-out", "A tile left out after sending"],
  ["--st-in", "Right, sent, paired, added"],
  ["--st-open", "Private, sign-in ending, needs you"],
  ["--st-stop", "Refused, failed"],
  ["--st-wait", "Ended, already checked in, waiting"],
  ["--st-stop-fill", "The door's refused flood"],
  ["--error", "Error words, the danger button"],
  ["--warn", "The late banner"],
  ["--bar-rest", "A poll bar that isn't the lead"],
  ["--cam", "The camera's ground"],
  ["--focus", "The keyboard focus ring"],
  ["--code-bg", "Code"],
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
      <TypeRole name="--t-display, .headline" size="32px / 700">
        <p className="headline">You’re checked in.</p>
      </TypeRole>
      <TypeRole name="--t-h2, .question" size="24px / 700">
        <p className="question">What does a capacitor store?</p>
      </TypeRole>
      <TypeRole name="--t-ledger, .t-ledger" size="13px / 500, badges and chips">
        <p className="t-ledger">Paired</p>
      </TypeRole>
      <TypeRole name=".code" size="Google Sans Code">
        <p className="code">
          482<span className="code__gap" />913
        </p>
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

const VARIANTS: [ButtonLook, string][] = [
  ["primary", "Check in"],
  ["secondary", "Download CSV"],
  ["quiet", "Show all"],
  ["danger", "End class"],
  ["tonal", "I’m lost"],
  ["neutral", "I’m lost"],
  ["raised", "Follow the slides"],
  ["plain", "Cancel"],
  ["ghost", "Keep"],
  ["danger-quiet", "Delete"],
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
        <State name="Large (the 56 main action)">
          <Button size="lg">End the quiz</Button>
        </State>
        <State name="Icon buttons">
          <span className="cluster">
            <Button variant="neutral" className="btn--icon" aria-label="Back">
              <Icon name="arrow-left" />
            </Button>
            <Button variant="neutral" className="btn--icon" aria-label="Next" disabled>
              <Icon name="arrow-right" />
            </Button>
          </span>
        </State>
      </div>
      <Button block>Check in</Button>
      <p className="text-label">On the color field</p>
      <div className="color-field uikit-states">
        <State name="On the field">
          <Button variant="on-field">Follow the slides</Button>
        </State>
        <State name="Disabled on the field">
          <Button variant="on-field" disabled>
            Follow the slides
          </Button>
        </State>
      </div>
      <p className="text-label">Text links outside a sentence</p>
      <div className="uikit-states">
        <State name="Link">
          <button type="button" className="link">
            Follow the slides <Icon name="chevron-right" />
          </button>
        </State>
        <State name="Small link (laptop)">
          <button type="button" className="link link--sm">
            Attendance <Icon name="chevron-right" />
          </button>
        </State>
        <State name="Plain link">
          <button type="button" className="link link--plain">
            Sign out
          </button>
        </State>
      </div>
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
  const [on, setOn] = useState(true);
  const answer = useId();
  const role = useId();
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
      <Field label="Code on their phone">{(f) => <input {...f} className="input input--code" defaultValue="RCC-482913" />}</Field>
      <label className="checkrow">
        <input type="checkbox" defaultChecked />
        <span>Hide my name from the late banner</span>
      </label>
      <p className="row">
        <Switch checked={on} onChange={setOn}>
          Group by topic with AI
        </Switch>
        <Switch checked={false} onChange={() => {}} disabled>
          Group by topic with AI
        </Switch>
      </p>
      <fieldset className="rolepick">
        <legend>Role</legend>
        {ROLES.map(([value, word]) => (
          <label key={value} className="rolepick__row">
            <input type="radio" name={role} value={value} defaultChecked={value === "professor"} />
            <span>{word}</span>
          </label>
        ))}
      </fieldset>
    </>
  );
}

const ROLES: [string, string][] = [
  ["professor", "Professor"],
  ["scanner", "Scanner"],
  ["admin", "Admin"],
];

function Choices() {
  const [size, setSize] = useState<"3" | "4" | "5">("4");
  const [kind, setKind] = useState<"quiz" | "vote">("quiz");
  return (
    <>
      <Tabs
        label="Attendance"
        tabs={[
          { id: "today", label: "This class", panel: <p>28 checked in · 3 late</p> },
          { id: "past", label: "Past classes", panel: <p>Oct 29 · 31 checked in · 4 late</p> },
        ]}
      />
      <div className="uikit-states">
        <State name="Hover">
          <div className="tabs__list">
            <button type="button" className="tabs__tab" data-force="hover">
              Past classes
            </button>
          </div>
        </State>
        <State name="Pressed">
          <div className="tabs__list">
            <button type="button" className="tabs__tab" data-force="active">
              Past classes
            </button>
          </div>
        </State>
        <State name="Keyboard focus">
          <div className="tabs__list">
            <button type="button" className="tabs__tab" data-force="focus">
              Past classes
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
      <div className="uikit-states">
        <State name="Hover on 3">
          <SegmentedState force="hover" />
        </State>
        <State name="Keyboard focus on 4">
          <SegmentedState force="focus" />
        </State>
      </div>
    </>
  );
}

// <Segmented>'s markup by hand, with "4" chosen and `force` drawn on one option: hover on "3",
// the keyboard focus ring on "4".
function SegmentedState({ force }: { force: "hover" | "focus" }) {
  const name = useId();
  const on = force === "hover" ? "3" : "4";
  return (
    <fieldset className="seg-field">
      <legend className="sr-only">Team size</legend>
      <div className="seg">
        {["3", "4", "5"].map((v) => (
          <label key={v} className="seg__option">
            <input className="seg__input" type="radio" name={name} value={v} defaultChecked={v === "4"} />
            <span className="seg__label" data-force={v === on ? force : undefined}>
              {v}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

const TEAMS: [string, string][] = [
  ["red", "Red"],
  ["yellow", "Yellow"],
  ["green", "Green"],
  ["orange", "Orange"],
  ["purple", "Purple"],
  ["pink", "Pink"],
  ["teal", "Teal"],
  ["brown", "Brown"],
  ["gray", "Gray"],
  ["navy", "Navy"],
  ["lime", "Lime"],
  ["blue", "Blue"],
];

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
      <p className="row">
        <StateChip tone="in" glyph="check">
          Paired
        </StateChip>
        <StateChip tone="in" glyph="eye">
          Shared with students
        </StateChip>
        <StateChip tone="open" glyph="lock">
          Private
        </StateChip>
        <StateChip tone="open" glyph="clock">
          4 min late
        </StateChip>
        <StateChip tone="stop" glyph="x">
          Refused
        </StateChip>
        <StateChip tone="wait" glyph="repeat">
          Ended
        </StateChip>
        <StateChip tone="quiet">AI draft</StateChip>
      </p>
      <p className="cluster">
        {TEAMS.map(([color, label]) => (
          <TeamChip key={color} color={color} label={label} />
        ))}
      </p>
      <p className="cluster">
        <span className="teamline group--purple">
          <span className="team__chip" aria-hidden="true" />
          You’re on Purple
        </span>
        <span className="credit">+5</span>
        <span className="ln ln--zero">+0</span>
      </p>
      <Notice>The server didn’t accept that sign-in.</Notice>
      <Notice tone="warn" action={<Button size="sm">Check in</Button>}>
        Check in to answer, ask and join a team.
      </Notice>
      <Notice tone="plain">Answer sent. Results show when the professor ends the quiz.</Notice>
      <div className="color-field">
        <Banner tone="error" inset title="The quiz didn't load." action={<Button variant="on-field">Try again</Button>} />
      </div>
      <p className="row">
        {/* The host's Offline slot: its word comes with the COPY pass. */}
        <span className="offline">
          <Icon name="warning" />
        </span>
      </p>
      <Banner title="Class starts at 2:30 PM.">Scan your pass at the door when you walk in.</Banner>
      <Banner tone="success" title="You're checked in.">
        Your pass scanned at 2:27 PM.
      </Banner>
      <Banner tone="warn" title="You walked in 5 min late." />
      <Banner tone="error" title="The quiz didn't load." action={<Button variant="secondary">Try again</Button>}>
        Check the connection.
      </Banner>
      <Banner
        tone="success"
        title="You're checked in."
        action={
          <a className="btn" href="#/live">
            Follow the slides
          </a>
        }
      />
      <p className="text-label">Banner stack (on a page it's pinned to the bottom of the screen)</p>
      <div className="uikit-pinned">
        <BannerStack>
          <Banner tone="warn" title="⏰ Ana walked in 4 min late." />
          <Banner tone="warn" title="⏰ Leo walked in 6 min late." />
        </BannerStack>
      </div>
    </>
  );
}

// A focal card's heading line: the title with its state word, the facts under it, the action at
// the right, open and ended.
function HeadingLines() {
  return (
    <div className="uikit-hcards">
      <div className="hcard">
        <div className="hline">
          <h4 className="hline__t">
            Ask the room <span className="stateword stateword--open">Open</span>
          </h4>
          <p className="facts facts-list">
            <span>Quiz</span>
            <span>AI draft</span>
          </p>
          <div className="hline__end">
            <Button size="lg">End the quiz</Button>
          </div>
        </div>
      </div>
      <div className="hcard">
        <div className="hline">
          <h4 className="hline__t">
            Ask the room <span className="stateword stateword--ended">Ended</span>
          </h4>
          <p className="facts facts-list">
            <span>Quiz</span>
            <span>AI draft</span>
          </p>
          <div className="hline__end">
            <Button variant="outline">Draft with AI</Button>
            <Button variant="outline">Write my own</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Every Icon name, so a glyph added to the kit shows here (the type fails without it).
const GLYPH_NAMES = Object.keys({
  check: 1,
  x: 1,
  warning: 1,
  clock: 1,
  lock: 1,
  eye: 1,
  repeat: 1,
  inbox: 1,
  "arrow-left": 1,
  "arrow-right": 1,
  "chevron-right": 1,
} satisfies Record<IconName, 1>) as IconName[];

function Glyphs() {
  return (
    <Rows head={["24", "64", "Name"]} cols="48px 88px minmax(0, 1fr)">
      {GLYPH_NAMES.map((name) => (
        <Row key={name}>
          <span data-glyph={name}>
            <Icon name={name} className="uikit-glyph--24" />
          </span>
          <span>
            <Icon name={name} className="icon--d uikit-glyph--64" />
          </span>
          <code className="uikit-glyph__name">{name}</code>
        </Row>
      ))}
    </Rows>
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
        Students ask from the Live slides page on their phones.
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
        <State name="Busy">
          <ConfirmState busy />
        </State>
        <State name="Failed">
          <ConfirmState error="That class already ended." />
        </State>
      </div>
    </>
  );
}

// <ConfirmButton>'s open box by hand, in the two states only a press reaches: `busy` (onConfirm
// is running: the confirm button spins and Cancel is off) and `error` (onConfirm threw: the box
// stays open with the error under the question). UIKit.test.ts checks it against the real one.
function ConfirmState({ busy, error }: { busy?: boolean; error?: string }) {
  const id = useId();
  return (
    <div className="confirm" role="group" aria-labelledby={id}>
      <p className="confirm__question" id={id}>
        End class for today?
      </p>
      {error && <Status kind="error">{error}</Status>}
      <div className="confirm__actions">
        <Button variant="danger" busy={busy}>
          End class
        </Button>
        <Button variant="secondary" disabled={busy}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

// ConfirmButton with `overlay`, open, drawn in place: on a page its scrim covers the screen.
function OverlayConfirm() {
  const id = useId();
  return (
    <div className="scrim uikit-scrim">
      <div className="sheet confirm" role="dialog" aria-labelledby={id}>
        <p className="confirm__question" id={id}>
          End class for today?
        </p>
        <div className="confirm__actions">
          <Button variant="danger">End class</Button>
          <Button variant="secondary">Cancel</Button>
        </div>
      </div>
    </div>
  );
}

function Numbers() {
  return (
    <>
      <div className="readouts">
        <div className="readout readout--lead">
          <span className="readout__l">Checked in</span>
          <span className="readout__n">38</span>
        </div>
        <div className="readout">
          <span className="readout__l">Late</span>
          <span className="readout__n">4</span>
        </div>
        <div className="readout">
          <span className="readout__l">Lost on this slide</span>
          <span className="readout__n readout__n--zero">0</span>
        </div>
      </div>
      <p className="tally tally--accent">
        <span className="tally__lead n-lg">
          62<span className="num__unit">%</span>
        </span>
        <span className="tally__w">got it right</span>
        <span className="tally__line">
          <b>21</b> of <b>38</b> answered
        </span>
      </p>
      <p className="cluster">
        <span className="num n-hero">14</span>
        <span className="num n-md">
          2:31<span className="num__unit">PM</span>
        </span>
        <span className="num n-sm">19</span>
        <span className="skel skel--num n-md" aria-hidden="true" />
      </p>
    </>
  );
}

function Surfaces() {
  return (
    <div className="uikit-surfaces">
      <div className="well">
        <span className="small">Well: rows, tables, readouts</span>
      </div>
      <div className="card">
        <span className="small">Card</span>
      </div>
      <div className="focal">
        <span className="small">Focal: the one first thing</span>
      </div>
      <div className="sheet">
        <span className="small">Sheet: a confirm</span>
      </div>
      <div className="color-field">
        <span className="small">Color field: a live or done state</span>
      </div>
      <div className="bar bar--static">
        <span className="bar__title">Live quiz</span>
        <span className="bar__end whoami">Ana</span>
      </div>
    </div>
  );
}

function RowsSample() {
  return (
    <>
      <Rows head={["Name", "Checked in", <span className="end">Late</span>]} cols="minmax(0, 1fr) 96px 64px">
        <Row>
          <span>Ana</span>
          <span className="reg__time">2:27 PM</span>
          <span className="end ln ln--zero">0</span>
        </Row>
        <Row selected>
          <span>Leo</span>
          <span className="reg__time">2:33 PM</span>
          <span className="end ln ln--late">3</span>
        </Row>
        <Row fresh>
          <span>Mia</span>
          <span className="reg__time">2:35 PM</span>
          <span className="end ln ln--late">5</span>
        </Row>
        <Row confirm>
          <span className="confirm-q">
            <Icon name="warning" />
            Remove Mia from this class?
          </span>
          <span className="cluster">
            <Button size="sm" variant="danger">
              Remove
            </Button>
            <Button size="sm" variant="plain">
              Cancel
            </Button>
          </span>
        </Row>
      </Rows>
      <div className="card">
        <p className="card-title">In a card</p>
        <Rows head={["Team", <span className="end">Right</span>]} cols="minmax(0, 1fr) 72px">
          <Row>
            <TeamChip color="teal" label="Teal" />
            <span className="end ln">6</span>
          </Row>
          <Row>
            <TeamChip color="purple" label="Purple" />
            <span className="end ln">5</span>
          </Row>
        </Rows>
      </div>
      <div className="state state--inline">
        <span className="state__text">Shows after you end the quiz.</span>
      </div>
    </>
  );
}

function ChoicesAndBars() {
  return (
    <>
      <div className="qfield uikit-qfield">
        <p className="qfield__q">What does a capacitor store?</p>
        <div className="choices">
          <Choice letter="A">Charge</Choice>
          <Choice letter="B" state="picked" aria-pressed>
            Current
          </Choice>
          {/* The state words (Sending, Sent) come with the COPY pass. */}
          <Choice letter="C" state="sending">
            Resistance
          </Choice>
          <Choice letter="D" state="error" word={<>Try again</>}>
            Voltage
          </Choice>
        </div>
      </div>
      <div className="qfield uikit-qfield">
        <div className="choices">
          <Choice letter="A" state="sent" word={<Icon name="check" />}>
            Charge
          </Choice>
          <Choice letter="B" state="out">
            Current
          </Choice>
        </div>
        <p className="lockline">
          <Icon name="lock" />
          Answer sent. Results show when the professor ends the quiz.
        </p>
      </div>
      <div className="choices">
        <Choice letter="A" onPage state="right" word={<><Icon name="check" />Right answer</>}>
          Charge
        </Choice>
        <Choice letter="B" onPage>
          Current
        </Choice>
      </div>
      <Bars
        bars={[
          { letter: "A", label: "Charge", count: 19, lead: true },
          { letter: "B", label: "Current", count: 7 },
          { letter: "C", label: "Resistance", count: 4 },
          { letter: "D", label: "Voltage", count: 0 },
        ]}
      />
      <Bars
        hero
        bars={[
          { letter: "A", label: "Charge", count: 19, right: true, tag: <><Icon name="check" />Right answer</> },
          { letter: "B", label: "Current", count: 7, mine: true, tag: "Your answer" },
          { letter: "C", label: "Resistance", count: 4 },
        ]}
      />
    </>
  );
}

function States() {
  return (
    <>
      <div className="state state--inline">
        <span className="state__text">No quiz or vote yet.</span>
      </div>
      <div className="state state--error">
        <Icon name="warning" />
        <p className="state__title">The quiz didn't load.</p>
        <Button size="sm">Try again</Button>
      </div>
      <p className="loading-line">Loading the scores…</p>
      <div className="skel-lines" aria-hidden="true">
        <span className="skel" />
        <span className="skel" />
        <span className="skel" />
      </div>
      <OverlayConfirm />
    </>
  );
}

function PassSample() {
  return (
    <div className="uikit-states">
      <div className="pass uikit-pass">
        <QR value="RCC-482913" size={200} />
        <p className="small">Ana</p>
        <p className="code">
          482<span className="code__gap" />913
        </p>
      </div>
      <div className="uikit-pass">
        <p className="qr--wait uikit-wait">Getting a new code…</p>
      </div>
      <div className="uikit-stubcol">
        <section className="stub">
          <h4 className="lockup">
            <Icon name="check" className="icon--d" />
            You’re checked in.
          </h4>
          <p className="stub__name">Ana</p>
          <hr className="perf" />
          <div className="stub__times">
            <p>
              <span className="stub__l">Checked in</span>
              <span className="stub__v">
                2:27<span className="stub__u">PM</span>
              </span>
            </p>
            <p>
              <span className="stub__l">Late after</span>
              <span className="stub__v">
                2:35<span className="stub__u">PM</span>
              </span>
            </p>
          </div>
          <p className="teamline group--purple">
            <span className="team__chip" aria-hidden="true" />
            You’re on Purple
          </p>
        </section>
      </div>
    </div>
  );
}

const kioskScale = { "--k-u": "0.7px" } as CSSProperties;
const stageScale = { "--stage-u": "0.42px" } as CSSProperties;

function KioskParts() {
  const code = useId();
  return (
    <div className="uikit-scaled" data-surface="kiosk" style={kioskScale}>
      <div className="k-bar">
        <span className="roomn">
          <span className="roomn__n num">38</span>
          <span className="roomn__l">checked in</span>
        </span>
        <span className="k-bar__door">Check-in kiosk</span>
      </div>
      <div className="door__panel door__panel--in uikit-band">
        <div className="door__status">
          <p className="lockup">
            <Icon name="check" />
            Checked in
          </p>
          <p className="door__name">Ana</p>
        </div>
      </div>
      <div className="door__panel door__panel--already uikit-band">
        <div className="door__status">
          <p className="lockup">
            <Icon name="repeat" />
            Already checked in
          </p>
          <p className="door__name">Leo</p>
        </div>
      </div>
      <div className="door__panel door__panel--stop uikit-band">
        <div className="door__status">
          <p className="lockup">
            <Icon name="x" />
            Try again
          </p>
          <p className="door__prompt">That code isn't a pass. Ask them to open their pass again.</p>
        </div>
      </div>
      <button type="button" className="camstart uikit-camstart">
        <Icon name="arrow-right" />
        <span>Start check-in</span>
      </button>
      <div className="door__strip">
        <label className="k-label" htmlFor={code}>
          Code on your pass
        </label>
        <div className="codein">
          <input id={code} className="input input--code" defaultValue="RCC-482913" />
          <Button>Check in</Button>
        </div>
      </div>
      <div className="pair__body">
        <div className="pair__group">
          <span className="pair__label">pairing code</span>
          <span className="pair__code">
            482<span className="pair__gap" />913
          </span>
          <span className="pair__until">The code works until 2:51 PM.</span>
        </div>
      </div>
    </div>
  );
}

function ProjectorParts() {
  return (
    <div className="uikit-scaled uikit-stage" data-surface="projector" style={stageScale}>
      <div className="stage-card uikit-stage-card">
        <div className="stage-card__top">
          <span className="stage-card__scan">Scan to check in</span>
        </div>
        <QR value="https://example.edu/checkin" size={220} />
        <p className="stage-card__count">
          <span className="num">38</span>
          <span className="stage-card__label">checked in</span>
        </p>
      </div>
      <div className="stage-card stage-card--poll uikit-stage-card">
        <p className="stage-card__count">
          <span className="num">38</span>
          <span className="stage-card__label">checked in</span>
        </p>
      </div>
      <p className="pnote">
        <Icon name="clock" />
        <span>
          <b>Phones aren't getting these slides.</b>
        </span>
      </p>
      <p className="lower3">
        <Icon name="clock" />
        <span>Ana walked in 4 min late.</span>
      </p>
      <div className="bars--stage bars">
        <div className="barrow is-right">
          <span className="letter">A</span>
          <span className="barrow__text">
            <span className="barrow__label">
              <span className="barrow__name">Charge</span>
              <span className="barrow__tag">
                <Icon name="check" />
                Right answer
              </span>
            </span>
            <span className="barrow__track">
              <span className="barrow__fill" style={{ "--f": 0.63 } as CSSProperties} />
            </span>
          </span>
          <span className="barrow__n">
            <span>19</span>
            <span className="barrow__pct">63%</span>
          </span>
        </div>
      </div>
      <div className="lbgrid">
        <div className="first">
          <span className="first__rank">
            1<span className="first__ord">st</span>
          </span>
          <span className="first__team">
            <span className="team__chip group--teal" aria-hidden="true" />
            Teal
          </span>
          <span className="first__credit">+5 extra credit</span>
        </div>
        <div className="pledger">
          <div className="pledger__head">
            <span>Place</span>
            <span>Team</span>
            <span className="n">Right</span>
            <span className="n">Per student</span>
            <span className="n">Extra credit</span>
          </div>
          <div className="pledger__row">
            <span className="pledger__place">2</span>
            <TeamChip color="purple" label="Purple" />
            <span className="n">5</span>
            <span className="n">1.7</span>
            <span className="n">+3</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// The way back to #/ui sits in the ledger line: one more line under the Big number made the
// stage taller than a 1920 x 1080 screen.
function ProjectorSample({ theme }: { theme: "light" | "dark" }) {
  return (
    <Projector
      theme={theme}
      ledger={
        <>
          A-210 · Thu 2:30 PM · slide 12 of 30 · <a href="#/ui">Back to the UI kit</a>
        </>
      }
      title="Team board"
    >
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
    </Projector>
  );
}
