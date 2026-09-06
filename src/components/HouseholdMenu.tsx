'use client';

import Link from 'next/link';
import { useCallback, useState } from 'react';
import { useCloseOnAway } from '@/lib/dismiss';
import { signOut } from '@/app/actions';
import { OccasionIcon } from './ui';

/**
 * Who you are signed in as, in the same place on every screen, and the few
 * things that belong to you rather than to the screen you happen to be on.
 *
 * Occasions live here rather than behind a ＋ on the holiday screen: adding one
 * is not the only reason to open that page, and editing one through an "add"
 * button reads wrong.
 */
export function HouseholdMenu({
  householdName,
  personName,
}: {
  householdName: string;
  /** Which of us is signed in. The household name alone leaves that unsaid on a
   *  phone two people share, and it is the first thing worth knowing. */
  personName: string;
}) {
  const [open, setOpen] = useState(false);
  const box = useCloseOnAway<HTMLDivElement>(open, useCallback(() => setOpen(false), []));

  const item = 'flex w-full items-center gap-2.5 px-4 py-3 text-sm font-semibold text-ink';

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-brand/25 bg-brand-wash px-4 py-2 text-sm font-bold text-brand"
      >
        <span aria-hidden="true">🏡</span>
        <span className="truncate">
          {personName ? `${personName.split(' ')[0]} · ` : ''}
          {householdName}
        </span>
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" fill="none" aria-hidden="true">
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute start-1/2 z-50 mt-1 w-56 -translate-x-1/2 overflow-hidden rounded-2xl border border-line bg-surface shadow-lg rtl:translate-x-1/2"
        >
          <Link href="/occasions" onClick={() => setOpen(false)} className={item} role="menuitem">
            <OccasionIcon className="h-4 w-4" />
            המועדים שלנו
          </Link>

          <form action={signOut} className="border-t border-line">
            <button type="submit" className={`${item} text-muted`} role="menuitem">
              <span aria-hidden="true">🚪</span>
              יציאה
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
