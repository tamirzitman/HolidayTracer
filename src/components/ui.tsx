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
 * A section's name. One size for all of them: the same kind of thing was
 * appearing at two weights with no rule saying which, so a heading's size read
 * as meaning something it did not.
 */
export const sectionHeading = 'text-sm font-bold text-muted';
