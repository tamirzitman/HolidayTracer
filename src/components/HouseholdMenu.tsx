'use client';

import Link from 'next/link';
import { useCallback, useState } from 'react';
import { useCloseOnAway } from '@/lib/dismiss';
import { signOut } from '@/app/actions';
import { shareApp } from '@/lib/whatsapp';
import { WhatsAppMark } from './WhatsApp';
import { OccasionIcon } from './ui';

/**
 * Who you are signed in as, in the same place on every screen, and the few
 * things that belong to you rather than to the screen you happen to be on.
 *
 * Occasions live here rather than behind a ＋ on the holiday screen: adding one
 * is not the only reason to open that page, and editing one through an "add"
 * button reads wrong.
 *
 * So does telling a friend the app exists. It used to sit at the foot of every
 * screen beside the things that put families on each other's lists, where it
 * read as one of them — and it is not: it carries no token and introduces
 * nobody. It says "friends" now, and it is somewhere you go looking for it.
 */
export function HouseholdMenu({
  householdName,
  personName,
  appUrl,
}: {
  householdName: string;
  /** This app's own address, for telling a friend it exists. */
  appUrl: string;
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

          <a
            href={shareApp(appUrl)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
            className={`${item} border-t border-line`}
            role="menuitem"
          >
            <span className="text-whatsapp">
              <WhatsAppMark />
            </span>
            שיתוף עם חברים
          </a>

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
