import Link from 'next/link';
import type { NextStep as Step } from '@/lib/next-step';

/**
 * One line, at the bottom of a screen, naming the next useful thing. Quiet
 * enough to ignore and specific enough to act on — never a list of options,
 * because a list is the problem it exists to solve.
 */
export function NextStep({ step }: { step: Step }) {
  if (!step) return null;

  return (
    <Link
      href={step.href}
      className="flex items-center gap-3 rounded-2xl border border-brand/30 bg-brand-wash px-4 py-3.5 text-start transition active:scale-[0.99]"
    >
      <span className="grow">
        <span className="block text-sm font-bold text-brand">{step.label}</span>
        <span className="block text-xs text-muted">{step.hint}</span>
      </span>
      <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-brand" fill="none" aria-hidden="true">
        <path d="M15 5 L8 12 L15 19" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </Link>
  );
}
