'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { addContacts, connectContacts, type ContactResult } from '@/app/actions';
import { contactPickerAvailable, pickContacts } from '@/lib/contacts';
import { formatPhone } from '@/lib/phone';
import { ErrorNote, secondaryButton } from './ui';


/**
 * Picks families out of the phone's address book. Numbers already in the app are
 * connected straight away; the rest are offered for adding, and once confirmed
 * they become families on our list — the name out of our phone, tied to their
 * number, so whoever signs in from it can put the name right.
 *
 * Chrome on Android only — everywhere else this renders nothing and the plain
 * invite link is the way in.
 */
export function ContactPicker() {
  const [available] = useState(contactPickerAvailable);
  const [result, setResult] = useState<ContactResult | null>(null);
  const [busy, setBusy] = useState(false);
  // The ones nobody has signed in from, waiting to be confirmed: the address
  // book hands back whatever was tapped, and a wrong tap should not become a
  // family. Ticked by default — confirming is the point, not re-choosing.
  const [pending, setPending] = useState<{ name: string; phone: string }[]>([]);
  const [chosen, setChosen] = useState<string[]>([]);
  const [added, setAdded] = useState<string[]>([]);
  const router = useRouter();

  if (!available) return null;

  async function choose() {
    setBusy(true);
    setResult(null);
    setAdded([]);
    try {
      const picked = await pickContacts();
      if (picked.length === 0) return;

      const outcome = await connectContacts(picked);
      setResult(outcome);
      setPending(outcome.missing);
      setChosen(outcome.missing.map((c) => c.phone));
    } catch {
      setResult({ connected: [], already: [], missing: [], error: 'לא הצלחנו לפתוח את אנשי הקשר' });
    } finally {
      setBusy(false);
    }
  }

  async function addChosen() {
    setBusy(true);
    try {
      const outcome = await addContacts(pending.filter((c) => chosen.includes(c.phone)));
      setAdded(outcome.added);
      setPending([]);
      router.refresh();
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

          {added.length > 0 && (
            <p className="font-semibold text-brand">נוספו: {added.join(', ')}</p>
          )}

          {/* Confirmed before anything is written: the picker hands back
              whatever was tapped, and the names come from somebody's phone —
              worth a look before they become families on the list. */}
          {pending.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-muted">
                עוד לא באפליקציה. אלה ייווספו כמשפחות אצלכם — אפשר לענות עליהן מיד:
              </p>
              <ul className="flex flex-col gap-1">
                {pending.map((contact) => (
                  <li key={contact.phone}>
                    <label className="flex items-center gap-3 rounded-xl border border-line bg-ground px-3 py-2">
                      <input
                        type="checkbox"
                        checked={chosen.includes(contact.phone)}
                        onChange={() =>
                          setChosen(
                            chosen.includes(contact.phone)
                              ? chosen.filter((p) => p !== contact.phone)
                              : [...chosen, contact.phone],
                          )
                        }
                        className="h-5 w-5 shrink-0 accent-brand"
                      />
                      <span className="min-w-0 grow">
                        <span className="font-semibold break-words text-ink">
                          {contact.name || 'איש קשר'}
                        </span>{' '}
                        <span dir="ltr" className="text-xs text-muted">
                          {formatPhone(contact.phone)}
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={addChosen}
                disabled={busy || chosen.length === 0}
                className={secondaryButton}
              >
                {busy
                  ? 'רגע…'
                  : chosen.length === 1
                    ? 'הוספת המשפחה'
                    : `הוספת ${chosen.length} משפחות`}
              </button>
              <p className="text-xs text-muted">
                השם נלקח מאנשי הקשר שלכם. מי שייכנס עם המספר הזה יוכל לתקן אותו.
              </p>
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
