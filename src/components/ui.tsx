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

/**
 * The second choice on a screen — cancel, correct, "no thanks", the option
 * under the two obvious ones. It used to be underlined text, which on a phone
 * is a small target with nothing around it and reads as a link out of the app
 * rather than as something that happens here. Same weight in the hierarchy, an
 * actual button to press.
 *
 * `w-fit` so it does not stretch to the width of a column it sits in; add
 * `self-center` where the column wants it under something full-width.
 */
export const quietButton =
  'inline-flex w-fit items-center justify-center gap-1.5 rounded-full border border-line bg-surface ' +
  'px-4 py-2 text-sm font-semibold text-brand transition active:scale-95 disabled:opacity-50';

/** The same shape for a way out that is not the thing to do: grey, not brand. */
export const mutedButton =
  'inline-flex w-fit items-center justify-center gap-1.5 rounded-full border border-line bg-surface ' +
  'px-4 py-2 text-sm font-semibold text-muted transition active:scale-95 disabled:opacity-50';

/** The smallest of the three, for a control that sits inside a row of text. */
export const miniButton =
  'inline-flex w-fit shrink-0 items-center justify-center rounded-full border border-line bg-surface ' +
  'px-2.5 py-1 text-xs font-bold text-brand transition active:scale-95 disabled:opacity-50';

/**
 * The candle from the app's own mark, standing for us hosting.
 *
 * It appears wherever the answer is that the table is ours — the holiday, the
 * button that says so, the years in the history — and nowhere else, so it is
 * worth one glance down a screen to find them. Deliberately a shape and not
 * only a colour: a circle's colour can be the same warm gold, and a flame can
 * never be mistaken for a circle's dot.
 */
export function HostCandle({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      {/* The whole candle, not the flame alone. On the candle in the mark the
          flame is read by what it sits on; lifted off it, a teardrop on its own
          is a drop of something. */}
      <path d="M12 2 C14.8 6 15.6 8.4 12 10.8 C8.4 8.4 9.2 6 12 2 Z" />
      <rect x="9.1" y="11" width="5.8" height="9" rx="1.5" />
      <rect x="6.3" y="20" width="11.4" height="2.2" rx="1.1" />
    </svg>
  );
}

/**
 * The card, tinted for the one answer that is about our own table. Written as a
 * style rather than another class: `card` already sets a background and a
 * border, and a utility appended after it wins or loses on the order the
 * stylesheet happens to be generated in, which here meant it silently lost.
 */
/**
 * A holiday that has already been. Quieter than a live card on purpose — the
 * screen is a record at that point, not a question, and swiping into last
 * spring should look different the moment it arrives rather than only read
 * differently once the date is checked.
 */
export const pastTint = {
  backgroundColor: 'var(--color-ground)',
  borderStyle: 'dashed',
} as const;

export const hostTint = {
  backgroundColor: 'var(--color-host-wash)',
  borderColor: 'color-mix(in srgb, var(--color-host) 45%, transparent)',
} as const;

/** Said aloud, since the flame beside it is drawn and carries no words. */
export const HOSTING = 'אנחנו מארחים';

/**
 * The strip down the edge of a row we hosted. The circles mark a row by whose
 * table it was; this marks the rows that were ours, in the one place where that
 * is the answer and there is no other family to colour it by.
 */
export const hostStrip = 'w-1 shrink-0 self-stretch rounded-full bg-host';

/**
 * The button that says the table is ours. The shape of `secondaryButton`, in
 * the host colour rather than the brand's — so on the one screen where all
 * three answers sit together, this is the one that looks like the thing it
 * leads to.
 */
export const hostButton =
  'flex w-full items-center justify-center gap-2 rounded-2xl border border-host/60 bg-host-wash px-4 py-4 ' +
  'text-center text-lg font-bold text-host transition active:scale-[0.98] disabled:opacity-50';

/** The line under a field that says what belongs in it. */
export function FieldHint({ children }: { children: React.ReactNode }) {
  return <span className="text-xs leading-relaxed text-muted">{children}</span>;
}

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
  big = false,
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
  /**
   * Bigger, for a mark that is the only way into something rather than one of
   * several errands on a row. A ＋ the size of a row's tidy-up mark reads as
   * furniture, and people look past it for a sentence to tap.
   */
  big?: boolean;
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
      className={`grid shrink-0 place-items-center rounded-full transition active:scale-95 disabled:opacity-40 ${
        big ? 'h-10 w-10' : 'h-8 w-8'
      } ${filled ? 'bg-brand text-ground' : 'text-brand'}`}
    >
      {busy ? <Spinner className={big ? 'h-5 w-5' : 'h-4 w-4'} /> : children}
    </button>
  );
}

/** A clock, for a holiday that has already been. */
export function ClockIcon({ className = 'h-3.5 w-3.5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
      <path d="M12 7v5l3 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
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

export function PlusIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

/**
 * The mark on anything that opens and shuts. It turns to point down when the
 * thing is open, which is the whole of how a row says it has more under it —
 * a row that only reveals its meaning once tapped has told nobody anything.
 */
export function ChevronIcon({ open = false, className = 'h-4 w-4' }: { open?: boolean; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`${className} shrink-0 text-muted transition ${open ? 'rotate-180' : ''}`}
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M6 9l6 6 6-6"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * A section's name. One size for all of them: the same kind of thing was
 * appearing at two weights with no rule saying which, so a heading's size read
 * as meaning something it did not.
 */
export const sectionHeading = 'text-sm font-bold text-muted';
