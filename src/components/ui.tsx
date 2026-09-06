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
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted transition active:scale-95 disabled:opacity-50"
    >
      {children}
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
 * An occasion of our own: the same calendar the tab bar uses for a holiday,
 * with a person on it. A birthday or a memorial is a holiday somebody made, so
 * it says so in the same language rather than in a word.
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
      <circle cx="12" cy="13.5" r="1.9" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M8.6 18.5c0-1.6 1.5-2.8 3.4-2.8s3.4 1.2 3.4 2.8"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
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
