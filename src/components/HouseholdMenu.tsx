'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { signOut } from '@/app/actions';
import { WhatsAppMark } from './WhatsApp';
import { shareApp } from '@/lib/whatsapp';

/**
 * Who you are signed in as, in the same place on every screen, and the few
 * things that belong to you rather than to the screen you happen to be on.
 *
 * Occasions live here rather than behind a ＋ on the holiday screen: adding one
 * is not the only reason to open that page, and editing one through an "add"
 * button reads wrong.
 */
export function HouseholdMenu({ householdName, appUrl }: { householdName: string; appUrl: string }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const escape = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

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
        <span className="truncate">{householdName}</span>
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
            <span aria-hidden="true">🗓️</span>
            המועדים שלנו
          </Link>

          {/* Not an invite: no token, so it introduces nobody to anybody. */}
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
            שיתוף האפליקציה
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
