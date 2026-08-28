export const card =
  'rounded-2xl border border-line bg-surface p-6 shadow-[0_12px_32px_-16px_rgba(36,27,31,0.25)]';

export const primaryButton =
  'block w-full rounded-xl border border-brand bg-brand px-4 py-4 text-center text-lg font-bold text-ground ' +
  'transition-opacity disabled:opacity-50';

export const secondaryButton =
  'block w-full rounded-xl border border-brand bg-surface px-4 py-4 text-center text-lg font-bold text-brand ' +
  'transition-opacity disabled:opacity-50';

export const field =
  'w-full rounded-xl border border-line bg-surface px-4 py-3 text-lg text-ink ' +
  'placeholder:text-muted focus:border-brand';

export const quietButton = 'text-sm font-semibold text-brand underline underline-offset-4';

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
