'use client';

import Link from 'next/link';
import { useCallback, useState } from 'react';
import { useCloseOnAway } from '@/lib/dismiss';
import { useHandoff } from '@/lib/handoff';
import { newInviteLink, signOut } from '@/app/actions';
import { WhatsAppMark } from './WhatsApp';
import { inviteVia } from '@/lib/whatsapp';

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

  // Bringing a partner or a grown child into our house. Ours to do, so it
  // belongs under our own name rather than on a row in a list of families.
  const { busy: addingMember, start, stop, go } = useHandoff();

  async function addToOurHouse() {
    start();
    const made = await newInviteLink('household', '');
    if (!made.token) {
      stop();
      return;
    }
    // One tap through to WhatsApp: a window opened after the wait would be
    // blocked as a pop-up, so navigate instead.
    setOpen(false);
    go(inviteVia(`${window.location.origin}/join/${made.token}`));
  }

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
            <span aria-hidden="true">🗓️</span>
            המועדים שלנו
          </Link>

          <button
            type="button"
            onClick={addToOurHouse}
            disabled={addingMember}
            className={`${item} border-t border-line`}
            role="menuitem"
          >
            <span className="text-whatsapp">
              <WhatsAppMark />
            </span>
            {addingMember ? 'רגע…' : 'הוספת בן בית'}
          </button>

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
