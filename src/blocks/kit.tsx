// Block: the design kit. Parts that pages kept building by hand, in the GDG look. Styles are in
// src/styles/kit.css, the tokens in src/styles/tokens.css. docs/design.md shows each part with an
// example, and #/ui shows every part in every state, light and dark. The older parts (Screen,
// Card, Big, Status, Todo) stay in src/blocks/ui.tsx.
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentProps,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { Status } from "./ui";
import { pinnedSpace, setStackSpace } from "./stackSpace";

// ---------- Icon ----------
// The kit's glyphs, drawn by hand to the Phosphor Bold construction (a 256 grid, 24 stroke, round
// caps and joins, no fills), in currentColor and hidden from screen readers: the words beside a
// glyph carry its meaning. One meaning per glyph: the lock means "can't change", Sent is the check.
export type IconName =
  | "check"
  | "x"
  | "warning"
  | "clock"
  | "lock"
  | "eye"
  | "repeat"
  | "inbox"
  | "arrow-left"
  | "arrow-right"
  | "chevron-right";

const GLYPHS: Record<IconName, ReactNode> = {
  check: <path d="M40 144l56 56L216 80" />,
  x: <path d="M200 56L56 200M200 200L56 56" />,
  warning: (
    <>
      <path d="M128 100v44" />
      <path d="M114.2 40l-88 152A16 16 0 0 0 40 216h176a16 16 0 0 0 13.8-24l-88-152a16 16 0 0 0-27.6 0z" />
      <circle cx="128" cy="180" r="16" fill="currentColor" stroke="none" />
    </>
  ),
  clock: (
    <>
      <circle cx="128" cy="128" r="96" />
      <path d="M128 72v56h56" />
    </>
  ),
  lock: (
    <>
      <rect x="40" y="88" width="176" height="128" rx="8" />
      <path d="M92 88V56a36 36 0 0 1 72 0v32" />
    </>
  ),
  eye: (
    <>
      <path d="M128 56C48 56 16 128 16 128s32 72 112 72 112-72 112-72-32-72-112-72z" />
      <circle cx="128" cy="128" r="40" />
    </>
  ),
  repeat: <path d="M24 128a72 72 0 0 1 72-72h136M200 24l32 32-32 32M232 128a72 72 0 0 1-72 72H24M56 232l-32-32 32-32" />,
  inbox: (
    <>
      <rect x="32" y="48" width="192" height="160" rx="8" />
      <path d="M32 152h48l16 24h64l16-24h48" />
    </>
  ),
  "arrow-left": <path d="M216 128H40M112 56l-72 72 72 72" />,
  "arrow-right": <path d="M40 128h176M144 56l72 72-72 72" />,
  "chevron-right": <path d="M96 48l80 80-80 80" />,
};

export function Icon({ name, className }: { name: IconName; className?: string }) {
  return (
    <svg className={className ? `icon ${className}` : "icon"} viewBox="0 0 256 256" aria-hidden="true" focusable="false">
      {GLYPHS[name]}
    </svg>
  );
}

// ---------- Button ----------
export type ButtonVariant = "primary" | "secondary" | "quiet" | "danger";
// Every look a Button can take: the four above and the design system's others.
export type ButtonLook = ButtonVariant | "outline" | "tonal" | "neutral" | "raised" | "plain" | "danger-quiet" | "on-field" | "ghost";

// A button in one of these looks: primary (the one main action on a screen), secondary or outline
// (outlined; the same look), quiet (green words), plain (neutral words: Cancel, row actions),
// tonal (a quiet action with no primary nearby), neutral (a fill one rung off its bar), raised
// (the main action when the green field is on screen), danger (red, inside a confirm only),
// danger-quiet (red words), on-field (the white button on a green field) or ghost (a laptop row
// action). `size` "lg" is the 56 main action, "sm" the 32 laptop button (`small` is the same).
// `busy` keeps the width, shows a spinner and ignores presses while a request runs. Disabled keeps
// the button's shape on the neutral fill. `type` is "button" unless you pass "submit", so a Button
// inside a form never submits it by accident.
export function Button({
  variant = "primary",
  size,
  small,
  block,
  busy,
  className,
  type = "button",
  onClick,
  children,
  ...rest
}: ComponentProps<"button"> & { variant?: ButtonLook; size?: "sm" | "lg"; small?: boolean; block?: boolean; busy?: boolean }) {
  const cls = [
    "btn",
    variant !== "primary" && `btn--${variant}`,
    size === "lg" && "btn--lg",
    size === "sm" && "btn--sm",
    small && "btn--small",
    block && "btn--block",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <button
      {...rest}
      type={type}
      className={cls}
      aria-busy={busy || undefined}
      aria-disabled={busy || rest["aria-disabled"] || undefined}
      onClick={busy ? (e) => e.preventDefault() : onClick}
    >
      <span className="btn__label">{children}</span>
      {busy && <span className="btn__spinner" aria-hidden="true" />}
    </button>
  );
}

// What <Field> hands to the input, select or textarea it wraps: spread it on.
export type FieldControl = { id: string; "aria-describedby"?: string; "aria-invalid"?: true };

// A labeled field with an optional hint and error, both said before the field, so a phone's
// keyboard never covers the error:
//   <Field label="Email" hint="The one you check in with" error={err}>
//     {(f) => <input {...f} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />}
//   </Field>
export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  children: (control: FieldControl) => ReactNode;
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      {hint && (
        <p className="field__hint" id={hintId}>
          {hint}
        </p>
      )}
      {error && (
        <p className="field__error" id={errorId}>
          {error}
        </p>
      )}
      {children({ id, "aria-describedby": [errorId, hintId].filter(Boolean).join(" ") || undefined, "aria-invalid": error ? true : undefined })}
    </div>
  );
}

export type Tab = { id: string; label: ReactNode; panel: ReactNode };

// Tabs over one panel at a time; a closed panel unmounts (#/host keeps its own tab bar for that). Left and right arrows, Home
// and End move between tabs. Pass `value` and `onChange` to keep the tab in your own state (or
// in the URL); leave them out and the first tab starts open.
export function Tabs({ label, tabs, value, onChange }: { label: string; tabs: Tab[]; value?: string; onChange?: (id: string) => void }) {
  const [own, setOwn] = useState(tabs[0]?.id);
  const base = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const current = tabs.find((t) => t.id === (value ?? own)) ?? tabs[0];
  const at = current ? tabs.indexOf(current) : -1;

  function pick(id: string) {
    if (value === undefined) setOwn(id);
    onChange?.(id);
  }
  function onKey(e: KeyboardEvent, i: number) {
    const n = tabs.length;
    const keys: Record<string, number> = { ArrowRight: (i + 1) % n, ArrowLeft: (i - 1 + n) % n, Home: 0, End: n - 1 };
    const next = keys[e.key];
    if (next === undefined) return;
    e.preventDefault();
    refs.current[next]?.focus();
    pick(tabs[next].id);
  }

  return (
    <div className="tabs">
      <div className="tabs__list" role="tablist" aria-label={label}>
        {tabs.map((t, i) => (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`${base}-tab-${i}`}
            className="tabs__tab"
            aria-selected={i === at}
            aria-controls={i === at ? `${base}-panel` : undefined}
            tabIndex={i === at ? 0 : -1}
            onClick={() => pick(t.id)}
            onKeyDown={(e) => onKey(e, i)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {current && (
        <div className="tabs__panel" role="tabpanel" id={`${base}-panel`} aria-labelledby={`${base}-tab-${at}`} tabIndex={0}>
          {current.panel}
        </div>
      )}
    </div>
  );
}

export type Choice<T extends string> = { value: T; label: ReactNode };

// Pick one of a few options (team size 3, 4 or 5; Quiz or Vote). Real radio buttons, so arrow
// keys and screen readers work. `block` shares the full width between the options (phones);
// `hideLabel` keeps the label for screen readers only.
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  disabled,
  block,
  hideLabel,
}: {
  label: ReactNode;
  options: Choice<T>[];
  value: T | null;
  onChange: (value: T) => void;
  disabled?: boolean;
  block?: boolean;
  hideLabel?: boolean;
}) {
  const name = useId();
  return (
    <fieldset className="seg-field" disabled={disabled}>
      <legend className={hideLabel ? "sr-only" : undefined}>{label}</legend>
      <div className={block ? "seg seg--block" : "seg"}>
        {options.map((o) => (
          <label key={o.value} className="seg__option">
            <input className="seg__input" type="radio" name={name} value={o.value} checked={o.value === value} onChange={() => onChange(o.value)} />
            <span className="seg__label">{o.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export type Tone = "neutral" | "accent" | "live" | "warn" | "error" | "place";

// A short label on something that differs between items in one list and that the reader acts
// on: "Late", "5 min late", "Permanent". The words carry the meaning; the color only repeats it.
// accent draws as the in state, warn as open, error as stop; live is retired and draws as a
// green state word; place ("1st", "2nd, tied") draws as the ledger's bare place numeral, no
// chip. StateChip has the state tones and their glyphs.
export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`badge badge--${tone}`}>{children}</span>;
}

// The state tones: in (right, sent, paired, added), open (private, needs you), stop (refused,
// failed), wait (ended, dismissed), quiet (a type fact such as AI draft), and Badge's tones.
export type StateTone = Tone | "in" | "open" | "stop" | "wait" | "quiet";

// A badge for a state, with its glyph before the words: check (Kept, Paired), eye (Shared with
// students), lock (Private, Permanent), clock (late), x (Refused), repeat (Ended).
export function StateChip({ tone, glyph, children }: { tone: StateTone; glyph?: IconName; children: ReactNode }) {
  return (
    <span className={`badge badge--${tone}`}>
      {glyph && <Icon name={glyph} />}
      {children}
    </span>
  );
}

const BANNER_GLYPH = { info: "inbox", success: "check", warn: "warning", error: "warning" } as const;

// A box that says how something went or what to do next: the state's fill, its glyph, the title,
// one line and one action at the end. An error banner is announced at once (role alert); the
// others are read when they change (role status). `bar` pins it full width under the app bar
// (the sign-in ending); `inset` draws it as the card on a green field or the stage card.
export function Banner({
  tone = "info",
  title,
  action,
  bar,
  inset,
  children,
}: {
  tone?: "info" | "success" | "warn" | "error";
  title?: ReactNode;
  action?: ReactNode;
  bar?: boolean;
  inset?: boolean;
  children?: ReactNode;
}) {
  const cls = `banner banner--${tone}${bar ? " banner--bar" : ""}${inset ? " banner--inset" : ""}`;
  return (
    <div className={cls} role={tone === "error" ? "alert" : "status"}>
      <Icon name={BANNER_GLYPH[tone]} />
      <div className="banner__body">
        {title && <p className="banner__title">{title}</p>}
        {children && <div className="banner__text">{children}</div>}
      </div>
      {action && <div className="banner__action">{action}</div>}
    </div>
  );
}

// Banners pinned to the bottom of every screen (the sign-in warning, SignInEnding), above the
// iPhone home bar. While it shows, the page keeps room under its last line for it and the late
// banner sits above it (stackSpace.ts).
export function BannerStack({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const root = document.documentElement;
    const measure = () => setStackSpace(root, el, pinnedSpace(el.getBoundingClientRect(), window.innerHeight, getComputedStyle(el).position));
    measure();
    const seen = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(measure);
    seen?.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      seen?.disconnect();
      window.removeEventListener("resize", measure);
      setStackSpace(root, el, undefined);
    };
  }, []);
  return (
    <div ref={ref} className="banner-stack">
      {children}
    </div>
  );
}

// An error or warning with no part of its own to sit in (a sign-in that failed, not checked in):
// the state's fill, its glyph hanging before the words, an optional action under them. Never on
// the green field; a message that stands in for a region's content takes that content's slot.
export function Notice({ tone = "stop", action, children }: { tone?: "stop" | "warn" | "plain"; action?: ReactNode; children: ReactNode }) {
  return (
    <div className={tone === "stop" ? "notice" : `notice notice--${tone}`} role={tone === "stop" ? "alert" : "status"}>
      <Icon name={tone === "plain" ? "clock" : "warning"} />
      <div>{children}</div>
      {action && <div className="notice__action">{action}</div>}
    </div>
  );
}

// A switch for one setting that applies at once: a real button with role="switch", the knob on
// the spatial track. Where it picks between options, use Segmented instead.
export function Switch({
  checked,
  onChange,
  disabled,
  children,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button type="button" role="switch" className="switch" aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)}>
      <span className="switch__track" aria-hidden="true" />
      <span>{children}</span>
    </button>
  );
}

// A team: its color chip and its written name, always together (live.groups gives `color` and
// `label`). The chip is the one 16 swatch with an ink edge; the stage scales it.
export function TeamChip({ color, label }: { color: string; label: ReactNode }) {
  return (
    <span className={`team group--${color}`}>
      <span className="team__chip" aria-hidden="true" />
      {label}
    </span>
  );
}

// The slide track (#/host): the lecture's own timeline with a count over each slide. `counts[i]`
// is slide i's count: a number for a slide already shown (0 prints muted), null for one not
// reached (prints nothing). `at` is the current slide's index, drawn with a filled segment and a
// bold number; its count is the same size as the rest. `where` (the slide and its title),
// `label` (what the counts are, on their baseline) and `end` (a room count) are the page's words.
export function SlideTrack({
  counts,
  at,
  where,
  label,
  end,
}: {
  counts: (number | null)[];
  at: number | null;
  where?: ReactNode;
  label?: ReactNode;
  end?: ReactNode;
}) {
  const n = counts.length;
  return (
    <div className="track">
      <div className="track__where">{where}</div>
      <div className="track__lane" style={{ "--slides": n } as CSSProperties}>
        <span className="track__rl" style={{ gridRow: 1, gridColumn: 1 }}>
          {label}
        </span>
        {counts.map((c, i) => (
          <span
            key={`n${i}`}
            className={c === 0 ? "track__n track__n--zero" : "track__n"}
            style={{ gridRow: 1, gridColumn: i + 2 }}
          >
            {c ?? ""}
          </span>
        ))}
        {counts.map((_, i) => (
          <span
            key={`s${i}`}
            className={i === at ? "track__seg track__seg--now" : "track__seg"}
            style={{ gridRow: 2, gridColumn: i + 2 }}
            aria-hidden="true"
          />
        ))}
        {counts.map((_, i) => (
          <span key={`i${i}`} className={i === at ? "track__i track__i--now" : "track__i"} style={{ gridRow: 3, gridColumn: i + 2 }}>
            {i + 1}
          </span>
        ))}
      </div>
      {end && <div className="track__room">{end}</div>}
    </div>
  );
}

// A laptop table or list as ruled rows: in a sunken well with a raised head (`well`, the default)
// on the page or in a card, or straight on its card (`well={false}`, for a chart). `cols` is the
// grid's columns (`"minmax(0, 1fr) 120px 96px"`), shared by the head and every Row, so each cell
// sits on its head's edges. `head` is the column labels; put `className="end"` on a numeric
// cell to right-align it.
export function Rows({ head, cols, well = true, children }: { head?: ReactNode[]; cols?: string; well?: boolean; children?: ReactNode }) {
  return (
    <div className={well ? "ruled ruled--well" : "ruled"} style={cols ? ({ "--rcols": cols } as CSSProperties) : undefined}>
      {head && (
        <div className="ruled__head">
          {head.map((h, i) => (
            <span key={i}>{h}</span>
          ))}
        </div>
      )}
      {children}
    </div>
  );
}

// One row of Rows. `selected` is a fill step in the same columns; `fresh` tints a row just added
// (st-in) for a moment; `confirm` is the in-row confirm risen to the overlay.
export function Row({ selected, fresh, confirm, children }: { selected?: boolean; fresh?: boolean; confirm?: boolean; children: ReactNode }) {
  const cls = ["ruled__row", selected && "is-selected", fresh && "is-new", confirm && "is-confirm"].filter(Boolean).join(" ");
  return <div className={cls}>{children}</div>;
}

// An answer choice: the letter tile and the full words, 72 tall, the same letter on phone, host
// and stage. `state` draws picked or sent (the ring), sending (busy), error (the red ring), right
// (st-in) or out (after sending); `word` is the state's word and glyph at the end ("Sent").
// On the green field by default; `onPage` draws it on the page.
export function Choice({
  letter,
  state,
  word,
  onPage,
  children,
  ...rest
}: Omit<ComponentProps<"button">, "type"> & {
  letter: string;
  state?: "picked" | "sending" | "sent" | "error" | "right" | "out";
  word?: ReactNode;
  onPage?: boolean;
}) {
  const cls = [
    "choice",
    onPage && "choice--on-page",
    (state === "picked" || state === "sent") && "is-picked",
    state === "sent" && "is-locked",
    state === "error" && "is-error",
    state === "right" && "is-right",
    state === "out" && "is-out",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <button {...rest} type="button" className={cls} aria-busy={state === "sending" || undefined}>
      <span className="letter">{letter}</span>
      <span>{children}</span>
      {word && (
        <span className="choice__state">
          {state === "sending" && <Icon name="clock" className="choice__clock" />}
          {word}
        </span>
      )}
    </button>
  );
}

export type Bar = { letter: string; label: ReactNode; count: number; right?: boolean; lead?: boolean; mine?: boolean; tag?: ReactNode };

// One bar chart for phone results, host and stage: each choice's letter, words, track, and its
// count and percent on the label line. While a poll is open no bar is green (mark the leading
// one `lead`); after it ends the `right` one fills green. `tag` is the plain words on the label
// line ("Right answer", "Your answer"). `hero` gives the right row the st-in fill and ring where
// it is the screen's first thing; `stage` sizes it for the projector.
export function Bars({ bars, hero, stage }: { bars: Bar[]; hero?: boolean; stage?: boolean }) {
  const total = bars.reduce((a, b) => a + b.count, 0);
  const cls = ["bars", hero && "bars--hero", stage && "bars--stage"].filter(Boolean).join(" ");
  return (
    <div className={cls}>
      {bars.map((b) => {
        const share = total ? b.count / total : 0;
        const row = ["barrow", b.right && "is-right", b.lead && "is-lead", b.mine && "is-mine"].filter(Boolean).join(" ");
        return (
          <div key={b.letter} className={row}>
            <span className="letter">{b.letter}</span>
            <span className="barrow__text">
              <span className="barrow__label">
                <span className="barrow__name">{b.label}</span>
                {b.tag && <span className="barrow__tag">{b.tag}</span>}
              </span>
              <span className="barrow__track">
                <span className="barrow__fill" style={{ "--f": share } as CSSProperties} />
              </span>
            </span>
            <span className="barrow__n">
              <span>{b.count}</span>
              <span className="barrow__pct">{Math.round(share * 100)}%</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

// A number with what it counts under it, for a row of counts on a laptop page. <Big> (ui.tsx)
// is the one number read from across a room.
export function Stat({ value, label, accent }: { value: ReactNode; label: ReactNode; accent?: boolean }) {
  return (
    <div className={accent ? "stat stat--accent" : "stat"}>
      <span className="stat__value">{value}</span>
      <span className="stat__label">{label}</span>
    </div>
  );
}

// What a list shows before it has anything: say what will show up and how it gets there
// ("No questions yet. Students ask from the Live slides page on their phones."), with an
// optional action. Name the page people see, never a #/ route.
export function EmptyState({ title, children, action }: { title: ReactNode; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <p className="empty__title">{title}</p>
      {children && <p className="empty__text">{children}</p>}
      {action && <div className="empty__action">{action}</div>}
    </div>
  );
}

// Grey lines (or one block of `height`) where content will land, so nothing jumps when it
// arrives. Screen readers hear `label`.
export function Skeleton({ lines = 3, height, label = "Loading" }: { lines?: number; height?: string; label?: string }) {
  return (
    <div className="skeleton" role="status">
      {height ? (
        <span className="skeleton__block" style={{ height }} aria-hidden="true" />
      ) : (
        Array.from({ length: lines }, (_, i) => <span key={i} className="skeleton__line" aria-hidden="true" />)
      )}
      <span className="sr-only">{label}</span>
    </div>
  );
}

// A button for something that can't be undone (End class, Remove). The first press asks
// `question` with two buttons: `confirm` runs onConfirm, Cancel (or Escape) goes back. The box
// closes when onConfirm finishes. When it throws, the box stays open so the person can try again
// and shows the error under the question (a ConvexError's words, or "Something went wrong. Try
// again."); pass `onError` to show it on the page instead. The error never escapes as an
// unhandled rejection. `defaultOpen` starts it asking (#/ui uses it). The question box takes the
// button's place; with `overlay` it opens as a sheet centered on a scrim over the page instead,
// for a confirm that ends something for everyone (End class, Delete a question from every phone).
// `openerVariant` draws the first button in another look while the confirming button keeps
// `variant`, so red fills only inside the confirm: End class beside Download extra credit is
// "outline", a row's Remove or Unpair "ghost". Left out, the first button takes `variant`.
export function ConfirmButton({
  children,
  question,
  confirm,
  cancel = "Cancel",
  onConfirm,
  onError,
  variant = "danger",
  openerVariant,
  disabled,
  defaultOpen,
  overlay,
}: {
  children: ReactNode;
  question: ReactNode;
  confirm: ReactNode;
  cancel?: ReactNode;
  onConfirm: () => unknown;
  onError?: (error: unknown) => void;
  variant?: "danger" | "primary";
  openerVariant?: ButtonLook;
  disabled?: boolean;
  defaultOpen?: boolean;
  overlay?: boolean;
}) {
  const [open, setOpen] = useState(!!defaultOpen);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const opener = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const pressed = useRef(false); // focus moves only after a press, never on the first render
  const questionId = useId();

  useEffect(() => {
    if (pressed.current) (open ? cancelRef : opener).current?.focus();
  }, [open]);

  function show(next: boolean) {
    pressed.current = true;
    setError("");
    setOpen(next);
  }
  async function run() {
    setBusy(true);
    setError("");
    try {
      await onConfirm();
      show(false);
    } catch (e) {
      if (onError) onError(e);
      else setError(errorWords(e));
    } finally {
      setBusy(false);
    }
  }

  const opening = (
    <Button ref={opener} variant={openerVariant ?? variant} disabled={overlay && open ? true : disabled} onClick={() => show(true)}>
      {children}
    </Button>
  );
  if (!open) return opening;
  const box = (
    <div
      className={overlay ? "sheet confirm" : "confirm"}
      role={overlay ? "dialog" : "group"}
      aria-modal={overlay || undefined}
      aria-labelledby={questionId}
      onKeyDown={(e) => {
        if (e.key === "Escape" && !busy) show(false);
      }}
    >
      <p className="confirm__question" id={questionId}>
        {question}
      </p>
      {error && <Status kind="error">{error}</Status>}
      <div className="confirm__actions">
        <Button variant={variant} busy={busy} onClick={() => void run()}>
          {confirm}
        </Button>
        <Button ref={cancelRef} variant="secondary" disabled={busy} onClick={() => show(false)}>
          {cancel}
        </Button>
      </div>
    </div>
  );
  if (!overlay) return box;
  return (
    <>
      {opening}
      <div className="scrim">{box}</div>
    </>
  );
}

// The words a ConvexError("text") carries, or a plain line for anything else.
function errorWords(e: unknown) {
  const data = (e as { data?: unknown } | null)?.data;
  return typeof data === "string" ? data : "Something went wrong. Try again.";
}

// The room's screen (#/checkin/stage, #/live/leaderboard): presentation.md's 1920 x 1080 sizes
// (heading 92, body 48, ledger 32, Big number 240), scaled to the window. Light unless you pass
// another theme, because decks run light in A-210 and a dark ground washes out on a projector.
export function Projector({
  ledger,
  title,
  theme = "light",
  children,
}: {
  ledger?: ReactNode;
  title?: ReactNode;
  theme?: "light" | "dark" | "system";
  children?: ReactNode;
}) {
  return (
    <main className="projector" data-theme={theme === "system" ? undefined : theme}>
      {ledger && <p className="ledger">{ledger}</p>}
      {title && <h1>{title}</h1>}
      {children}
    </main>
  );
}

// ---------- calm ----------
// Reduced motion for scripted moves (MOTION.md "Reduced motion"): true when the person asked their
// device for less motion. A FLIP or a WAAPI animation asks calm() right before it moves anything,
// so a setting changed while the page is open counts on the next move; when it says true, jump to
// the end state (the words and fills still change). CSS moves don't need it: the --sp* tokens are
// already 0 under reduced motion. Off a browser (tests, the server) it says false.
const REDUCE = "(prefers-reduced-motion: reduce)";

function reduceQuery(): MediaQueryList | null {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia(REDUCE) : null;
}

export function calm(): boolean {
  return reduceQuery()?.matches ?? false;
}

// Calls `listener` with calm()'s new answer each time the setting changes, for a part that has to
// redraw when it does. Returns the function that stops listening.
export function onCalmChange(listener: (calm: boolean) => void): () => void {
  const query = reduceQuery();
  if (!query || typeof query.addEventListener !== "function") return () => {};
  const changed = (e: MediaQueryListEvent) => listener(e.matches);
  query.addEventListener("change", changed);
  return () => query.removeEventListener("change", changed);
}
