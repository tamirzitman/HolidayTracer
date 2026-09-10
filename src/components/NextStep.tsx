import Link from 'next/link';
import type { NextStep as Step } from '@/lib/next-step';
import { Uncircled } from './Uncircled';

/**
 * The foot of a screen: the next useful thing, and anything left half-done.
 *
 * The line itself is one line on purpose — quiet enough to ignore and specific
 * enough to act on, never a list of options, because a list is the problem it
 * exists to solve. The families in no circle sit beside it because they are the
 * other kind of thing left open, and because there is nowhere else they show as
 * anything but a row without a dot.
 */
export function NextStep({
  step,
  uncircled = [],
  circles = [],
}: {
  step: Step;
  /** Families on our list that are in no circle at all. */
  uncircled?: { id: string; name: string }[];
  /** Ours, to drop them into. */
  circles?: { id: string; name: string; color: string }[];
}) {
  if (!step && uncircled.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <Uncircled families={uncircled} circles={circles} />
      {step && <StepLine step={step} />}
    </div>
  );
}

function StepLine({ step }: { step: NonNullable<Step> }) {
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
