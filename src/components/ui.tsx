export const card =
  'rounded-3xl border border-line bg-surface p-7 shadow-[0_18px_48px_-24px_rgba(0,0,0,0.45)]';

export const primaryButton =
  'block w-full rounded-2xl border border-brand bg-brand px-4 py-4 text-center text-lg font-bold text-ground ' +
  'shadow-[0_10px_24px_-12px_var(--color-brand)] transition active:scale-[0.98] disabled:opacity-50';

export const secondaryButton =
  'block w-full rounded-2xl border border-brand/60 bg-brand-wash px-4 py-4 text-center text-lg font-bold text-brand ' +
  'transition active:scale-[0.98] disabled:opacity-50';

export const field =
  'w-full rounded-2xl border border-line bg-ground px-4 py-3.5 text-lg text-ink ' +
  'placeholder:text-muted focus:border-brand';

export const quietButton = 'text-sm font-semibold text-brand underline underline-offset-4';

/** A small call to action that sits inside a row, rather than filling it. */
export const chipButton =
  'shrink-0 rounded-full border border-brand bg-brand px-4 py-1.5 text-sm font-bold whitespace-nowrap text-ground';

/** The date and countdown, as one quiet pill rather than loose grey text. */
export function DatePill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface/70 px-3.5 py-1.5 text-sm text-muted">
      {children}
    </span>
  );
}

export function Title({ children }: { children: React.ReactNode }) {
  return (
    <h1 className="font-display text-3xl leading-tight font-bold text-balance text-ink">{children}</h1>
  );
}

export function ErrorNote({ children }: { children?: string }) {
  if (!children) return null;
  return (
    <p role="alert" className="rounded-lg bg-brand-wash px-3 py-2 text-sm font-semibold text-brand">
      {children}
    </p>
  );
}

/**
 * The one way back out of anything opened in place — a disclosure, a form, a
 * link that has been made. An arrow reads as "back" without a word for it, and
 * one shape everywhere means it never has to be read twice.
 */
export function BackButton({ onClick, label = 'חזרה' }: { onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-line text-ink transition active:scale-95"
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
        <path d="M9 5l7 7-7 7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

/**
 * Turning, so a tap that has gone out to the sheet does not look ignored.
 *
 * Sized in em so it matches whatever it sits in: the same mark in a chip and in
 * a button the width of the screen.
 */
export function Spinner({ className = 'h-[1.15em] w-[1.15em]' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`${className} inline-block animate-spin align-[-0.15em]`}
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.4" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

/**
 * What a button says while it is working.
 *
 * It used to say "רגע…" — a word that does not move, which on a slow line
 * reads as a button that has changed its mind about what it is called rather
 * than one that is busy. The turning circle says the same thing without
 * claiming to be the label, and the label stays for anything that reads the
 * page instead of looking at it.
 */
export function Busy({ busy, children }: { busy: boolean; children: React.ReactNode }) {
  if (!busy) return <>{children}</>;
  return (
    <>
      <Spinner />
      <span className="sr-only">{children}</span>
    </>
  );
}

/**
 * A control that is only an icon: no label beside it, the name carried by
 * aria-label and title instead.
 *
 * For the errands that repeat on every row of a list, where a word each would
 * be four words of furniture — and where the shape is already understood: ✕
 * takes away, a pencil edits, ＋ adds. Anything whose meaning is not obvious
 * from its shape keeps its text.
 */
export function IconButton({
  label,
  onClick,
  disabled,
  busy = false,
  filled = false,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  /**
   * Working. A mark that does not change while a write goes out reads as a tap
   * that did nothing, and the second tap is somebody trying again.
   */
  busy?: boolean;
  /**
   * The button that finishes what the field beside it started. A bare mark next
   * to a text box is decoration until somebody guesses otherwise; filled in, it
   * is plainly the thing to press, and plainly greyed while there is nothing to
   * press it for.
   */
  filled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      aria-label={label}
      aria-busy={busy || undefined}
      title={label}
      className={`grid h-8 w-8 shrink-0 place-items-center rounded-full transition active:scale-95 disabled:opacity-40 ${
        filled ? 'bg-brand text-ground' : 'text-brand'
      }`}
    >
      {busy ? <Spinner className="h-4 w-4" /> : children}
    </button>
  );
}

export function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
      <path
        d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17v3z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function CrossIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

export function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
      <rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="2" />
      <path
        d="M15 5.5A2.5 2.5 0 0 0 12.5 3h-7A2.5 2.5 0 0 0 3 5.5v7A2.5 2.5 0 0 0 5.5 15"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * An occasion of ours: the tab bar's calendar with a star on it. A person drawn
 * inside a date square is mush at this size — the star reads at a glance, and
 * says "one of ours" without pretending to be a portrait.
 */
export function OccasionIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <path
        d="M7 3v3M17 3v3M4 9h16M5 6h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="m12 11.6 1.13 2.29 2.52.37-1.82 1.78.43 2.51L12 17.36l-2.26 1.19.43-2.51-1.82-1.78 2.52-.37L12 11.6Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
      <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

/**
 * A section's name. One size for all of them: the same kind of thing was
 * appearing at two weights with no rule saying which, so a heading's size read
 * as meaning something it did not.
 */
export const sectionHeading = 'text-sm font-bold text-muted';
