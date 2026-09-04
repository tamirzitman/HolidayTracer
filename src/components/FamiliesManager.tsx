'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { addSuggested, dismissSuggested, newInviteLink, restoreSuggested } from '@/app/actions';
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
  quietButton,
  secondaryButton,
} from './ui';

type Family = { id: string; name: string; members: Member[] };

export function FamiliesManager({
  families,
  ownMembers,
  inviteUrl,
  suggested,
  hidden,
  ownName,
}: {
  families: Family[];
  /** The people in our own household, for a link that lets one of them in elsewhere. */
  ownMembers: Member[];
  /** This family's standing join link, for the families nobody has joined yet. */
  inviteUrl: string;
  /** Families your families know and you don't, with which of them vouch. */
  suggested: { id: string; name: string; seenBy: string[] }[];
  /** Families turned down before, so a mistaken tap can be taken back. */
  hidden: { id: string; name: string }[];
  /** What our own household is called. */
  ownName: string;
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

      <section id="families" className={`${card} flex flex-col gap-1 p-0`}>
        {families.length === 0 ? (
          <p className="p-6 text-center text-muted">עדיין אין אף משפחה. הזמינו מישהו למטה.</p>
        ) : (
          <ul className="divide-y divide-line">
            {families.map((family) => (
              <li key={family.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-3.5">
                <div className="min-w-0 grow basis-40">
                  <p className="font-semibold break-words text-ink">{family.name}</p>
                  {/* Say what the state actually is. "טרם הצטרפו" left people
                      guessing whether the family was missing something, when
                      all it means is that nobody from it has opened the app. */}
                  <span className="text-sm text-muted">
                    {family.members.length === 0
                      ? 'עוד לא נרשמו לאפליקציה'
                      : family.members.map((m) => m.name).join(', ')}
                  </span>
                </div>
                {/* The invitation belongs on the row of the family it is for.
                    The link carries who they are, so opening it asks their name
                    and nothing else — no list to find themselves in, and no
                    family name to invent. */}
                <RowInvite householdId={family.id} members={family.members} />
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
              <li key={family.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-3.5">
                <div className="min-w-0 grow basis-40">
                  <p className="font-semibold break-words text-ink">{family.name}</p>
                  {/* Who vouches, not how many: with a handful of families the
                      names are quicker to read than a count is to interpret. */}
                  <p className="text-sm text-muted">
                    מכירים אותם: {family.seenBy.slice(0, 2).join(', ')}
                    {family.seenBy.length > 2 && ` ועוד ${family.seenBy.length - 2}`}
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

      {/* Our own house, for the same reason: the person to invite into it is a
          row, not a kind of invitation to pick out of a list. */}
      <section className={`${card} flex flex-col gap-1 p-0`}>
        <h2 className="px-5 pt-4 pb-1 text-sm font-bold text-muted">הבית שלנו</h2>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-3.5">
          <div className="min-w-0 grow basis-40">
            <p className="font-semibold break-words text-ink">{ownName}</p>
            <span className="text-sm text-muted">
              {ownMembers.length === 0 ? 'רק אתם' : ownMembers.map((m) => m.name).join(', ')}
            </span>
          </div>
          <RowInvite householdId="" members={ownMembers} kind="household" />
        </div>
      </section>

      <HiddenSuggestions hidden={hidden} />

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
            <button
              type="button"
              onClick={() => makeLink('family')}
              disabled={busy !== null}
              className={primaryButton}
            >
              {busy === 'family' ? 'רגע…' : 'קישור הזמנה'}
            </button>
            <p className="-mt-1 text-center text-xs text-muted">
              לקבוצת המשפחה, או למי שעוד לא ברשימה למעלה. מי שפותח פותח משפחה
              משלו ומתחבר אליכם. להזמין משפחה שכבר ברשימה — הכפתור על השורה שלה.
            </p>
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

/**
 * The families turned down before. Folded away by default — it is a correction,
 * not a list anybody needs — and one line when there is nothing to correct.
 *
 * It exists because dismissing sits one tap from adding: the two are easy to
 * confuse, and a hiding nobody can see is a mistake nobody can undo.
 */
function HiddenSuggestions({ hidden }: { hidden: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  if (hidden.length === 0) return null;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="self-center text-xs font-semibold text-muted underline underline-offset-4"
      >
        {hidden.length === 1 ? 'משפחה אחת מוסתרת' : `${hidden.length} משפחות מוסתרות`}
      </button>
    );
  }

  return (
    <section className={`${card} flex flex-col gap-1 p-0`}>
      <div className="flex items-baseline justify-between gap-2 px-5 pt-4 pb-1">
        <h2 className="text-sm font-bold text-muted">מוסתרות מההצעות</h2>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="shrink-0 text-xs font-bold text-brand underline underline-offset-4"
        >
          סגירה
        </button>
      </div>
      <ul className="divide-y divide-line">
        {hidden.map((family) => (
          <li key={family.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-3">
            <p className="min-w-0 grow basis-40 break-words text-ink">{family.name}</p>
            <button
              type="button"
              disabled={busy === family.id}
              onClick={async () => {
                setBusy(family.id);
                try {
                  await restoreSuggested(family.id);
                } finally {
                  setBusy(null);
                }
              }}
              className={chipButton}
            >
              {busy === family.id ? 'רגע…' : 'להציע שוב'}
            </button>
          </li>
        ))}
      </ul>
      <p className="px-5 pb-3 text-xs text-muted">
        להציע שוב לא מחבר אתכם — הן פשוט חוזרות לרשימת ההצעות.
      </p>
    </section>
  );
}

/**
 * The link for one row, whichever kind that row needs.
 *
 * A family nobody has signed in from needs an invitation, and the link carries
 * which family they are, so opening it asks their name and nothing else. A
 * family already in the app needs the other thing entirely — a way back in on a
 * new phone — and that is a link aimed at one of their numbers. Both belong on
 * the row, because the row is what says who is meant; neither is a kind of
 * invitation to pick out of a list.
 */
function RowInvite({
  householdId,
  members,
  kind = 'family',
}: {
  householdId: string;
  members: Member[];
  kind?: 'family' | 'household';
}) {
  const [state, setState] = useState<'idle' | 'busy' | { link: string } | { error: string }>('idle');
  const [who, setWho] = useState('');

  // Our own house always offers to bring somebody new into it; a family on the
  // list offers that only while nobody from it has signed in.
  const invites = kind === 'household' || members.length === 0;
  const done = typeof state === 'object' && 'link' in state;

  async function make(forPhone: string, forHouseholdId: string) {
    setState('busy');
    const made = await newInviteLink(kind, forPhone, forHouseholdId);
    setState(
      made.token
        ? { link: `${window.location.origin}/join/${made.token}` }
        : { error: made.error ?? 'משהו השתבש' },
    );
  }

  if (done) {
    const link = (state as { link: string }).link;
    return (
      <div className="flex w-full flex-wrap items-center gap-3">
        <a
          href={inviteVia(link, who)}
          target="_blank"
          rel="noreferrer"
          className={`${chipButton} inline-flex items-center gap-2`}
        >
          <WhatsAppMark />
          שליחה
        </a>
        <button
          type="button"
          onClick={() => navigator.clipboard.writeText(link).catch(() => {})}
          className="text-xs font-semibold text-brand underline underline-offset-4"
        >
          העתקה
        </button>
        <span className="basis-full text-xs text-muted">הקישור נסגר אחרי שימוש אחד.</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <div className="flex flex-wrap items-center gap-2">
        {invites && (
          <button
            type="button"
            disabled={state === 'busy'}
            onClick={() => make('', householdId)}
            className={chipButton}
          >
            {state === 'busy' ? 'רגע…' : kind === 'household' ? 'הזמנה לבית' : 'הזמנה'}
          </button>
        )}
        {members.length === 1 && (
          <button
            type="button"
            disabled={state === 'busy'}
            onClick={() => {
              setWho(members[0].phone);
              return make(members[0].phone, '');
            }}
            className={quietButton}
          >
            {state === 'busy' ? 'רגע…' : 'קישור כניסה'}
          </button>
        )}
        {members.length > 1 && (
          <>
            <select
              aria-label="קישור כניסה למי"
              value={who}
              onChange={(e) => setWho(e.target.value)}
              className={`${field} w-auto py-2 text-sm`}
            >
              <option value="">קישור כניסה ל…</option>
              {members.map((m) => (
                <option key={m.phone} value={m.phone}>
                  {m.name}
                </option>
              ))}
            </select>
            {who && (
              <button
                type="button"
                disabled={state === 'busy'}
                onClick={() => make(who, '')}
                className={quietButton}
              >
                {state === 'busy' ? 'רגע…' : 'יצירה'}
              </button>
            )}
          </>
        )}
      </div>
      {typeof state === 'object' && 'error' in state && <ErrorNote>{state.error}</ErrorNote>}
    </div>
  );
}
