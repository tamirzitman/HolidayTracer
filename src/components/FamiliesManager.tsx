'use client';

import { useState } from 'react';
import { addSuggested, dismissSuggested, newInviteLink } from '@/app/actions';
import { ContactPicker } from './ContactPicker';
import { WhatsAppMark, type Member } from './WhatsApp';
import { inviteText } from '@/lib/whatsapp';
import { Title, card, chipButton, primaryButton, quietButton, secondaryButton } from './ui';

type Family = { id: string; name: string; members: Member[] };

export function FamiliesManager({
  families,
  inviteUrl,
  suggested,
}: {
  families: Family[];
  /** This family's standing join link, for the families nobody has joined yet. */
  inviteUrl: string;
  /** Families your families know and you don't, with how many of them know each. */
  suggested: { id: string; name: string; seenBy: number }[];
}) {
  const [link, setLink] = useState('');
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState<'family' | 'household' | null>(null);
  const [adding, setAdding] = useState<string | null>(null);

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
        <Title>המעגלים שלי</Title>
        <p className="text-muted">רק המשפחות שכאן מופיעות כשאתם עונים על חג.</p>
      </header>

      <section className={`${card} flex flex-col gap-1 p-0`}>
        {families.length === 0 ? (
          <p className="p-6 text-center text-muted">עדיין אין אף משפחה. הזמינו מישהו למטה.</p>
        ) : (
          <ul className="divide-y divide-line">
            {families.map((family) => (
              <li key={family.id} className="flex items-center gap-3 px-5 py-3.5">
                <div className="min-w-0 grow">
                  <p className="truncate font-semibold text-ink">{family.name}</p>
                  {/* Say what the state actually is. "טרם הצטרפו" left people
                      guessing whether the family was missing something, when
                      all it means is that nobody from it has opened the app. */}
                  <span className="text-sm text-muted">
                    {family.members.length === 0
                      ? 'עוד לא נרשמו לאפליקציה'
                      : family.members.map((m) => m.name).join(', ')}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      {/* Circles drift apart as people add families of their own. Rather than ask
          anyone to keep the lists in step, this reads the overlap off the
          connections that already exist. */}
      {suggested.length > 0 && (
        <section className={`${card} flex flex-col gap-1 p-0`}>
          <h2 className="px-5 pt-4 pb-1 text-sm font-bold text-muted">מוצע להוספה</h2>
          <ul className="divide-y divide-line">
            {suggested.map((family) => (
              <li key={family.id} className="flex items-center gap-3 px-5 py-3.5">
                <div className="min-w-0 grow">
                  <p className="truncate font-semibold text-ink">{family.name}</p>
                  <p className="text-sm text-muted">
                    {family.seenBy === 1
                      ? 'משפחה אחת שלכם רואה אותם'
                      : `${family.seenBy} מהמשפחות שלכם רואות אותם`}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    disabled={adding === family.id}
                    onClick={async () => {
                      setAdding(family.id);
                      try {
                        await addSuggested(family.id);
                      } finally {
                        setAdding(null);
                      }
                    }}
                    className={chipButton}
                  >
                    {adding === family.id ? 'רגע…' : 'הוספה'}
                  </button>
                  {/* Turned down for good. Without this the families you have
                      decided against are exactly the ones that keep coming
                      back, because your families keep vouching for them. */}
                  <button
                    type="button"
                    disabled={adding === family.id}
                    aria-label={`להסיר את ${family.name} מההצעות`}
                    title="לא להציע שוב"
                    onClick={async () => {
                      setAdding(family.id);
                      try {
                        await dismissSuggested(family.id);
                      } finally {
                        setAdding(null);
                      }
                    }}
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted transition active:scale-95"
                  >
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
                      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
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
              href={`https://wa.me/?text=${encodeURIComponent(inviteText(link))}`}
              target="_blank"
              rel="noreferrer"
              className={`${primaryButton} inline-flex items-center justify-center gap-2`}
            >
              <WhatsAppMark />
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
            {/*
              A second button here made a household invite — attaching a spouse or
              a grown child to *your* house instead of opening a new one. It earned
              too little for the room it took, so it is off the screen; the kind is
              still carried end to end (newInviteLink → readInvite → register), so
              putting it back is this button again and nothing else:

              <button type="button" onClick={() => makeLink('household')}
                disabled={busy !== null} className={secondaryButton}>
                {busy === 'household' ? 'רגע…' : 'הזמנה לבית שלנו'}
              </button>
            */}
            <p className="text-center text-xs text-muted">
              כל מי שנכנס דרך הקישור פותח משפחה משלו, ומתחבר אליכם.
            </p>

            <div className="mt-1 border-t border-line pt-3">
              <ContactPicker />
            </div>
          </>
        )}
      </div>

    </div>
  );
}
