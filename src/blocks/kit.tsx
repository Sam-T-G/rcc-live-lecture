// Block: the design kit. Parts that pages kept building by hand, in the GDG look. Styles are in
// src/styles/kit.css, the tokens in src/styles/tokens.css. docs/design.md shows each part with an
// example, and #/ui shows every part in every state, light and dark. The older parts (Screen,
// Card, Big, Status, Todo) stay in src/blocks/ui.tsx.
import { useEffect, useId, useRef, useState, type ComponentProps, type KeyboardEvent, type ReactNode } from "react";
import { Status } from "./ui";

export type ButtonVariant = "primary" | "secondary" | "quiet" | "danger";

// A button in one of four looks: primary (the one main action on a screen), secondary
// (outlined), quiet (words only) or danger (red, for what can't be undone). `busy` keeps the
// width, shows a spinner and ignores presses while a request runs. `small` is for laptop pages
// only; phones keep the 48px button. `type` is "button" unless you pass "submit", so a Button
// inside a form never submits it by accident.
export function Button({
  variant = "primary",
  small,
  block,
  busy,
  className,
  type = "button",
  onClick,
  children,
  ...rest
}: ComponentProps<"button"> & { variant?: ButtonVariant; small?: boolean; block?: boolean; busy?: boolean }) {
  const cls = ["btn", variant !== "primary" && `btn--${variant}`, small && "btn--small", block && "btn--block", className]
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

// Tabs over one panel at a time (the professor view's sections). Left and right arrows, Home
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

export type Tone = "neutral" | "accent" | "live" | "warn" | "error";

// A short label on something: "Live", "Late", "3 of 4", "Ended". The words carry the meaning;
// the color only repeats it.
export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`badge badge--${tone}`}>{children}</span>;
}

// A box that says how something went or what to do next. An error banner is announced at once
// (role alert); the others are read when they change (role status).
export function Banner({
  tone = "info",
  title,
  action,
  children,
}: {
  tone?: "info" | "success" | "warn" | "error";
  title?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className={`banner banner--${tone}`} role={tone === "error" ? "alert" : "status"}>
      <div className="banner__body">
        {title && <p className="banner__title">{title}</p>}
        {children && <div className="banner__text">{children}</div>}
      </div>
      {action && <div className="banner__action">{action}</div>}
    </div>
  );
}

// Banners pinned to the bottom of every screen (the late banner), above the iPhone home bar.
export function BannerStack({ children }: { children: ReactNode }) {
  return <div className="banner-stack">{children}</div>;
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
// ("No questions yet. Students ask from #/live."), with an optional action.
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
// unhandled rejection. `defaultOpen` starts it asking (#/ui uses it).
export function ConfirmButton({
  children,
  question,
  confirm,
  cancel = "Cancel",
  onConfirm,
  onError,
  variant = "danger",
  disabled,
  defaultOpen,
}: {
  children: ReactNode;
  question: ReactNode;
  confirm: ReactNode;
  cancel?: ReactNode;
  onConfirm: () => unknown;
  onError?: (error: unknown) => void;
  variant?: "danger" | "primary";
  disabled?: boolean;
  defaultOpen?: boolean;
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

  if (!open)
    return (
      <Button ref={opener} variant={variant} disabled={disabled} onClick={() => show(true)}>
        {children}
      </Button>
    );
  return (
    <div
      className="confirm"
      role="group"
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
