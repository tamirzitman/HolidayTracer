'use client';

import { useActionState, useState } from 'react';
import { addFamily, hide, newInviteLink, type ActionResult } from '@/app/actions';
import { formatPhone } from '@/lib/phone';
import { ErrorNote, Title, card, field, primaryButton, quietButton, secondaryButton } from './ui';

type Family = { id: string; name: string; phone: string };

export function FamiliesManager({
  householdName,
  families,
}: {
  householdName: string;
  families: Family[];
}) {
  const [addState, addAction, adding] = useActionState<ActionResult, FormData>(addFamily, {});
  const [hideState, hideAction] = useActionState<ActionResult, FormData>(hide, {});
  const [link, setLink] = useState('');
  const [copied, setCopied] = useState(false);

  async function makeLink() {
    const token = await newInviteLink();
    const url = `${window.location.origin}/join/${token}`;
    setLink(url);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col items-center gap-2 text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-brand/25 bg-brand-wash px-3.5 py-1.5 text-sm font-bold text-brand">
          <span aria-hidden="true">🏡</span>
          {householdName}
        </span>
        <Title>המשפחות שלי</Title>
        <p className="text-muted">רק המשפחות שכאן מופיעות כשאתם עונים על חג.</p>
      </header>

      <section className={`${card} flex flex-col gap-1 p-0`}>
        {families.length === 0 ? (
          <p className="p-6 text-center text-muted">עדיין אין אף משפחה. הזמינו מישהו למטה.</p>
        ) : (
          <ul className="divide-y divide-line">
            {families.map((family) => (
              <li key={family.id} className="flex items-center gap-3 px-5 py-3.5">
                <div className="grow">
                  <p className="font-semibold text-ink">{family.name}</p>
                  {family.phone && (
                    <a href={`tel:${family.phone}`} dir="ltr" className="text-sm text-muted">
                      {formatPhone(family.phone)}
                    </a>
                  )}
                </div>
                <form action={hideAction}>
                  <input type="hidden" name="householdId" value={family.id} />
                  <button type="submit" className="text-sm font-semibold text-muted underline underline-offset-4">
                    הסתרה
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
      <ErrorNote>{hideState.error}</ErrorNote>

      <form action={addAction} className={`${card} flex flex-col gap-3`}>
        <h2 className="font-display text-xl font-bold text-ink">הוספת משפחה שכבר רשומה</h2>
        <p className="text-sm text-muted">הזינו מספר טלפון של מישהו מהמשפחה הזו.</p>
        <input
          name="phone"
          type="tel"
          inputMode="tel"
          dir="ltr"
          required
          placeholder="050-123-4567"
          className={`${field} text-center`}
        />
        <ErrorNote>{addState.error}</ErrorNote>
        <button type="submit" disabled={adding} className={secondaryButton}>
          {adding ? 'רגע…' : 'הוספה'}
        </button>
      </form>

      <div className={`${card} flex flex-col gap-3`}>
        <h2 className="font-display text-xl font-bold text-ink">הזמנת משפחה חדשה</h2>
        <p className="text-sm text-muted">
          שלחו את הקישור למשפחה שעוד לא באפליקציה. אפשר לשלוח אותו לכמה משפחות.
        </p>
        {link ? (
          <>
            <p dir="ltr" className="rounded-2xl border border-line bg-ground px-4 py-3 text-center text-sm break-all text-ink">
              {link}
            </p>
            <p className="text-center text-sm text-muted">
              {copied ? 'הקישור הועתק' : 'העתיקו את הקישור ושלחו אותו'}
            </p>
          </>
        ) : (
          <button type="button" onClick={makeLink} className={primaryButton}>
            יצירת קישור הזמנה
          </button>
        )}
      </div>

      <p className="text-center text-sm text-muted">
        הסתרה מסירה משפחה מהרשימה שלכם בלבד — הם עדיין רואים אתכם.
      </p>
    </div>
  );
}
