'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { addSuggested, dismissSuggested, newInviteLink } from '@/app/actions';
import { AddFamilyInline } from './AddFamilyInline';
import { ContactPicker } from './ContactPicker';
import { WhatsAppMark, type Member } from './WhatsApp';
import { normalizePhone } from '@/lib/phone';
import { inviteVia } from '@/lib/whatsapp';
import {
  ErrorNote,
  Title,
  card,
  chipButton,
  field,
  primaryButton,
  secondaryButton,
} from './ui';

type Family = { id: string; name: string; members: Member[] };

export function FamiliesManager({
  families,
  ownMembers,
  inviteUrl,
  suggested,
}: {
  families: Family[];
  /** The people in our own household, for a link that lets one of them in elsewhere. */
  ownMembers: Member[];
  /** This family's standing join link, for the families nobody has joined yet. */
  inviteUrl: string;
  /** Families your families know and you don't, with how many of them know each. */
  suggested: { id: string; name: string; seenBy: number }[];
}) {
  const [link, setLink] = useState('');
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState<'family' | 'household' | null>(null);
  // Empty means a general link. A number makes it one person's, and single-use.
  const [sentTo, setSentTo] = useState('');
  const [linkError, setLinkError] = useState('');
  const circlePeople = families.flatMap((f) =>
    f.members.map((m) => ({ name: m.name, phone: m.phone, family: f.name })),
  );
  // The number in the box, if it is somebody already in the app. Compared
  // normalised, so a number typed with dashes still matches the one on file.
  const typed = sentTo.trim() ? normalizePhone(sentTo) : null;
  const known = typed
    ? [...ownMembers, ...circlePeople].find((m) => m.phone === typed)
    : undefined;
  const [adding, setAdding] = useState<string | null>(null);
  const router = useRouter();

  async function makeLink(kind: 'family' | 'household') {
    setBusy(kind);
    setLinkError('');
    try {
      const made = await newInviteLink(kind, sentTo);
      if (made.token) {
        setLink(`${window.location.origin}/join/${made.token}`);
        setCopied(false);
      } else {
        setLinkError(made.error ?? 'משהו השתבש, נסו שוב');
      }
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
          <div className="flex items-baseline justify-between gap-2 px-5 pt-4 pb-1">
            <h2 className="text-sm font-bold text-muted">מוצע להוספה</h2>
            {/* The case a parent's invitation makes: their list is all of yours,
                and taking it one row at a time is work for nothing. */}
            {suggested.length > 1 && (
              <button
                type="button"
                disabled={adding !== null}
                onClick={async () => {
                  setAdding('all');
                  try {
                    for (const family of suggested) await addSuggested(family.id);
                  } finally {
                    setAdding(null);
                  }
                }}
                className="shrink-0 text-xs font-bold text-brand underline underline-offset-4"
              >
                {adding === 'all' ? 'רגע…' : 'הוספת כולן'}
              </button>
            )}
          </div>
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

      <div id="invite" className={`${card} flex flex-col gap-3`}>
        <div className="flex items-center gap-2">
          {/* A way back that reads as one: an arrow, not a sentence. */}
          {link && (
            <button
              type="button"
              onClick={() => setLink('')}
              aria-label="חזרה"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-line text-ink transition active:scale-95"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
                <path d="M9 5l7 7-7 7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
          <h2 className="font-display text-xl font-bold text-ink">הזמנה</h2>
        </div>

        {link ? (
          <>
            <a
              href={inviteVia(link, sentTo)}
              target="_blank"
              rel="noreferrer"
              className={`${primaryButton} inline-flex items-center justify-center gap-2`}
            >
              <WhatsAppMark />
              {sentTo ? 'שליחה אליהם בוואטסאפ' : 'שליחה בוואטסאפ'}
            </a>
            <button type="button" onClick={copy} className={secondaryButton}>
              {copied ? 'הקישור הועתק ✓' : 'העתקת הקישור'}
            </button>
            <p className="text-center text-xs text-muted">
              {sentTo
                ? 'הקישור הזה אישי — הוא נסגר ברגע שהם נרשמים, וגם אם יועבר הלאה לא יכניס אף אחד אחר.'
                : 'הקישור פתוח לשבועיים ואפשר לשלוח אותו ליותר מאחד — נוח לקבוצה של המשפחה.'}
            </p>
          </>
        ) : (
          <>
            {/* Who it is for, outside any dropdown: a number, or a pick from the
                house or from the circle — each list named for what it holds,
                because a list of people behind a label saying "another number"
                is a list nobody expects. Optional, and empty by default: most
                links go to a group. */}
            <div className="flex flex-col gap-2">
              <span className="text-sm font-semibold text-muted">למי? (לא חובה)</span>
              <input
                value={sentTo}
                onChange={(e) => setSentTo(e.target.value)}
                type="tel"
                inputMode="tel"
                dir="ltr"
                autoComplete="off"
                placeholder="מספר טלפון"
                aria-label="מספר טלפון"
                className={field}
              />
              {(ownMembers.length > 0 || circlePeople.length > 0) && (
                <div className="flex gap-2">
                  {ownMembers.length > 0 && (
                    <select
                      aria-label="מהבית שלנו"
                      value={known?.phone ?? ''}
                      onChange={(e) => setSentTo(e.target.value)}
                      className={`${field} min-w-0 grow`}
                    >
                      <option value="">מהבית שלנו…</option>
                      {ownMembers.map((m) => (
                        <option key={m.phone} value={m.phone}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  )}
                  {circlePeople.length > 0 && (
                    <select
                      aria-label="מהמעגל"
                      value={known?.phone ?? ''}
                      onChange={(e) => setSentTo(e.target.value)}
                      className={`${field} min-w-0 grow`}
                    >
                      <option value="">מהמעגל…</option>
                      {circlePeople.map((m) => (
                        <option key={m.phone} value={m.phone}>
                          {m.name} · {m.family}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}
            </div>

            {known ? (
              /* Somebody already in the app needs no kind of invitation: the
                 link is a key to their own account on another phone, so there
                 is one honest button, not a choice that does not exist. */
              <>
                <button
                  type="button"
                  onClick={() => makeLink('family')}
                  disabled={busy !== null}
                  className={primaryButton}
                >
                  {busy ? 'רגע…' : `קישור כניסה ל${known.name}`}
                </button>
                <p className="text-center text-xs text-muted">
                  {known.name} כבר באפליקציה. הקישור מכניס אותם ממכשיר חדש, ונסגר אחרי
                  שימוש אחד.
                </p>
              </>
            ) : (
              /* Two things a newcomer can be, each said in the line beneath it. */
              <>
                <button
                  type="button"
                  onClick={() => makeLink('family')}
                  disabled={busy !== null}
                  className={primaryButton}
                >
                  {busy === 'family' ? 'רגע…' : 'הזמנת משפחה'}
                </button>
                <p className="-mt-1 text-center text-xs text-muted">
                  למשפחה שעוד לא באפליקציה — פותחת להם משפחה משלהם ומחברת אתכם.
                </p>
                <button
                  type="button"
                  onClick={() => makeLink('household')}
                  disabled={busy !== null}
                  className={secondaryButton}
                >
                  {busy === 'household' ? 'רגע…' : 'הזמנה לבית שלנו'}
                </button>
                <p className="-mt-1 text-center text-xs text-muted">
                  לבן זוג או ילד בוגר — מצרפת אותם למשק הבית שלכם, ותראו את אותן התשובות.
                </p>
              </>
            )}
            <ErrorNote>{linkError}</ErrorNote>

            {/* Adding a family by name, on the screen that is about families.
                Until now this lived only beside the holiday question, and the
                contact picker beneath it is Chrome-on-Android only — so half
                the family had no way to add anybody from here at all. */}
            <div className="mt-1 flex flex-col gap-3 border-t border-line pt-3">
              <AddFamilyInline inviteUrl={inviteUrl} onAdded={() => router.refresh()} />
              <ContactPicker />
            </div>
          </>
        )}
      </div>

    </div>
  );
}
