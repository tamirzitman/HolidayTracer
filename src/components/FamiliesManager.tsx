'use client';

import { useActionState, useState } from 'react';
import { hide, newInviteLink, unhide, type ActionResult } from '@/app/actions';
import { ContactPicker } from './ContactPicker';
import { formatPhone } from '@/lib/phone';
import { ErrorNote, Title, card, field, primaryButton, quietButton, secondaryButton } from './ui';

type Family = { id: string; name: string; phone: string };

export function FamiliesManager({
  householdName,
  families,
  hidden,
}: {
  householdName: string;
  families: Family[];
  hidden: { id: string; name: string }[];
}) {
  const [hideState, hideAction] = useActionState<ActionResult, FormData>(hide, {});
  const [, unhideAction] = useActionState<ActionResult, FormData>(unhide, {});
  const [link, setLink] = useState('');
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState<'family' | 'household' | null>(null);

  const message = (url: string) => `הצטרפו אלינו — עונים בשתי נגיעות איפה אתם בחג:\n${url}`;

  async function makeLink(kind: 'family' | 'household') {
    setBusy(kind);
    try {
      const token = await newInviteLink(kind);
      setLink(`${window.location.origin}/join/${token}`);
      setCopied(false);
    } finally {
      setBusy(null);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
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
                  {family.phone ? (
                    <a href={`tel:${family.phone}`} dir="ltr" className="text-sm text-muted">
                      {formatPhone(family.phone)}
                    </a>
                  ) : (
                    <span className="text-sm text-muted">טרם הצטרפו</span>
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

      {hidden.length > 0 && (
        <section className={`${card} flex flex-col gap-1 p-0`}>
          <h2 className="px-5 pt-4 pb-1 text-sm font-bold text-muted">מוסתרות</h2>
          <ul className="divide-y divide-line">
            {hidden.map((family) => (
              <li key={family.id} className="flex items-center gap-3 px-5 py-3">
                <span className="grow text-muted">{family.name}</span>
                <form action={unhideAction}>
                  <input type="hidden" name="householdId" value={family.id} />
                  <button type="submit" className="text-sm font-bold text-brand underline underline-offset-4">
                    החזרה
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className={`${card} flex flex-col gap-3`}>
        <h2 className="font-display text-xl font-bold text-ink">הזמנה</h2>
        <p className="text-sm text-muted">
          שולחים קישור בוואטסאפ. מי שפותח אותו מתחבר אליכם — גם אם הוא כבר באפליקציה.
        </p>

        {link ? (
          <>
            <a
              href={`https://wa.me/?text=${encodeURIComponent(message(link))}`}
              target="_blank"
              rel="noreferrer"
              className={primaryButton}
            >
              שליחה בוואטסאפ
            </a>
            <button type="button" onClick={copy} className={secondaryButton}>
              {copied ? 'הקישור הועתק ✓' : 'העתקת הקישור'}
            </button>
            <button type="button" onClick={() => setLink('')} className={quietButton}>
              קישור אחר
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => makeLink('family')}
              disabled={busy !== null}
              className={primaryButton}
            >
              {busy === 'family' ? 'רגע…' : 'הזמנת משפחה'}
            </button>
            <button
              type="button"
              onClick={() => makeLink('household')}
              disabled={busy !== null}
              className={secondaryButton}
            >
              {busy === 'household' ? 'רגע…' : `הזמנה לבית שלנו`}
            </button>
            <p className="text-center text-xs text-muted">
              “הזמנת משפחה” פותחת בית חדש. “הזמנה לבית שלנו” מצרפת מישהו אליכם — בן זוג, ילד שגדל.
            </p>

            <div className="mt-1 border-t border-line pt-3">
              <ContactPicker />
            </div>
          </>
        )}
      </div>

      <p className="text-center text-sm text-muted">
        הסתרה מסירה משפחה מהרשימה שלכם בלבד — הם עדיין רואים אתכם.
      </p>
    </div>
  );
}
