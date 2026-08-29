'use client';

import { inviteVia } from '@/lib/whatsapp';
import { WhatsAppMark } from './WhatsApp';
import { useState } from 'react';
import { connectContacts, newInviteLink, type ContactResult } from '@/app/actions';
import { contactPickerAvailable, pickContacts } from '@/lib/contacts';
import { formatPhone } from '@/lib/phone';
import { ErrorNote, secondaryButton } from './ui';


/**
 * Picks families out of the phone's address book. Numbers already in the app are
 * connected straight away; the rest get a WhatsApp invite addressed to them.
 *
 * Chrome on Android only — everywhere else this renders nothing and the plain
 * invite link is the way in.
 */
export function ContactPicker() {
  const [available] = useState(contactPickerAvailable);
  const [result, setResult] = useState<ContactResult | null>(null);
  const [inviteUrl, setInviteUrl] = useState('');
  const [busy, setBusy] = useState(false);

  if (!available) return null;

  async function choose() {
    setBusy(true);
    setResult(null);
    try {
      const picked = await pickContacts();
      if (picked.length === 0) return;

      const outcome = await connectContacts(picked);
      setResult(outcome);

      if (outcome.missing.length > 0 && !inviteUrl) {
        const token = await newInviteLink('family');
        setInviteUrl(`${window.location.origin}/join/${token}`);
      }
    } catch {
      setResult({ connected: [], already: [], missing: [], error: 'לא הצלחנו לפתוח את אנשי הקשר' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <button type="button" onClick={choose} disabled={busy} className={secondaryButton}>
        {busy ? 'רגע…' : 'בחירה מאנשי הקשר'}
      </button>

      {result && (
        <div className="flex flex-col gap-2 text-sm">
          <ErrorNote>{result.error}</ErrorNote>

          {result.connected.length > 0 && (
            <p className="font-semibold text-brand">נוספו: {result.connected.join(', ')}</p>
          )}
          {result.already.length > 0 && (
            <p className="text-muted">כבר ברשימה: {result.already.join(', ')}</p>
          )}

          {result.missing.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-muted">עוד לא באפליקציה — שלחו להם הזמנה:</p>
              <ul className="flex flex-col gap-2">
                {result.missing.map((contact) => (
                  <li
                    key={contact.phone}
                    className="flex items-center justify-between gap-3 rounded-xl border border-line bg-ground px-3 py-2"
                  >
                    <span className="grow">
                      <span className="font-semibold text-ink">{contact.name || 'איש קשר'}</span>{' '}
                      <span dir="ltr" className="text-xs text-muted">
                        {formatPhone(contact.phone)}
                      </span>
                    </span>
                    {inviteUrl && (
                      <a
                        href={inviteVia(inviteUrl, contact.phone)}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`הזמנת ${contact.name || 'איש קשר'} לאפליקציה בוואטסאפ`}
                        title="הזמנה לאפליקציה"
                        className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-whatsapp transition active:scale-95"
                      >
                        <WhatsAppMark invite />
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.connected.length === 0 &&
            result.already.length === 0 &&
            result.missing.length === 0 &&
            !result.error && <p className="text-muted">לא נבחר אף איש קשר.</p>}
        </div>
      )}
    </div>
  );
}
