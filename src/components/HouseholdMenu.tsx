'use client';

import Link from 'next/link';
import { useActionState, useCallback, useEffect, useState } from 'react';
import { useCloseOnAway } from '@/lib/dismiss';
import { useHandoff } from '@/lib/handoff';
import { nameOurHousehold, newInviteLink, signOut } from '@/app/actions';
import type { ActionResult } from '@/app/actions';
import { field } from './ui';
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
  phone,
}: {
  householdName: string;
  /** Which of us is signed in. The household name alone leaves that unsaid on a
   *  phone two people share, and it is the first thing worth knowing. */
  personName: string;
  /** Our own number, for a link that lets this same person in on another device. */
  phone: string;
}) {
  const [open, setOpen] = useState(false);
  const box = useCloseOnAway<HTMLDivElement>(open, useCallback(() => setOpen(false), []));
  // A link aimed at our own number. Signing in elsewhere needs somebody to
  // vouch, and the nearest somebody is us, from the phone that is already in.
  const [deviceLink, setDeviceLink] = useState<'idle' | 'busy' | string>('idle');

  // Our own name is often not ours to start with: somebody added us from their
  // contacts before we ever opened the app. Correcting it belongs here, under
  // the name itself, rather than on a settings screen we do not have.
  const [naming, setNaming] = useState(false);
  const [named, nameAction, namePending] = useActionState<ActionResult, FormData>(
    nameOurHousehold,
    {},
  );
  useEffect(() => {
    if (named.savedAt) setNaming(false);
  }, [named.savedAt]);

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

  async function linkForAnotherDevice() {
    setDeviceLink('busy');
    const made = await newInviteLink('household', phone);
    setDeviceLink(made.token ? `${window.location.origin}/join/${made.token}` : 'idle');
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

          {naming ? (
            <form action={nameAction} className="flex flex-col gap-2 border-t border-line px-4 py-3">
              <label className="text-xs font-semibold text-muted" htmlFor="household-name">
                שם המשפחה שלנו
              </label>
              <input
                id="household-name"
                name="householdName"
                type="text"
                defaultValue={householdName}
                required
                className={field}
              />
              {named.error && <p className="text-xs font-semibold text-brand">{named.error}</p>}
              <div className="flex items-center gap-4">
                <button type="submit" disabled={namePending} className="text-sm font-bold text-brand">
                  {namePending ? 'רגע…' : 'שמירה'}
                </button>
                <button type="button" onClick={() => setNaming(false)} className="text-sm font-semibold text-muted">
                  ביטול
                </button>
              </div>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setNaming(true)}
              className={`${item} border-t border-line`}
              role="menuitem"
            >
              <span aria-hidden="true">✏️</span>
              שינוי שם המשפחה
            </button>
          )}

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

          {deviceLink === 'idle' || deviceLink === 'busy' ? (
            <button
              type="button"
              onClick={linkForAnotherDevice}
              disabled={deviceLink === 'busy'}
              className={`${item} border-t border-line`}
              role="menuitem"
            >
              <span aria-hidden="true">📱</span>
              {deviceLink === 'busy' ? 'רגע…' : 'כניסה ממכשיר נוסף'}
            </button>
          ) : (
            <div className="flex flex-col gap-2 border-t border-line px-4 py-3">
              <p className="text-xs text-muted">
                קישור אישי למספר שלכם. שלחו לעצמכם ופתחו מהמכשיר השני — נסגר אחרי שימוש אחד.
              </p>
              <a
                href={inviteVia(deviceLink, phone)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setOpen(false)}
                className="inline-flex items-center gap-2 text-sm font-bold text-whatsapp"
              >
                <WhatsAppMark />
                שליחה לעצמי בוואטסאפ
              </a>
              <button
                type="button"
                onClick={() => navigator.clipboard.writeText(deviceLink).catch(() => {})}
                className="text-start text-sm font-semibold text-brand"
              >
                העתקת הקישור
              </button>
            </div>
          )}

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
