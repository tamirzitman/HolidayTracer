'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { newInviteLink, signOut } from '@/app/actions';
import { WhatsAppMark } from './WhatsApp';
import { inviteVia, shareApp } from '@/lib/whatsapp';

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
  appUrl,
  phone,
}: {
  householdName: string;
  appUrl: string;
  /** Our own number, for a link that lets this same person in on another device. */
  phone: string;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  // A link aimed at our own number. Signing in elsewhere needs somebody to
  // vouch, and the nearest somebody is us, from the phone that is already in.
  const [deviceLink, setDeviceLink] = useState<'idle' | 'busy' | string>('idle');

  async function linkForAnotherDevice() {
    setDeviceLink('busy');
    const made = await newInviteLink('household', phone);
    setDeviceLink(made.token ? `${window.location.origin}/join/${made.token}` : 'idle');
  }

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
