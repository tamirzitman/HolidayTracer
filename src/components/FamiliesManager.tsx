'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useHandoff } from '@/lib/handoff';
import { addSuggested, dismissSuggested, newInviteLink, restoreSuggested } from '@/app/actions';
import { AddFamilyInline } from './AddFamilyInline';
import { ContactPicker } from './ContactPicker';
import { WhatsAppMark, type Member } from './WhatsApp';
import { inviteVia } from '@/lib/whatsapp';
import {
  BackButton,
  ErrorNote,
  Title,
  card,
  chipButton,
  field,
  primaryButton,
  quietButton,
  secondaryButton,
  sectionHeading,
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
  const [linkError, setLinkError] = useState('');
  const { busy: sharing, start: startShare, stop: stopShare, go: goShare } = useHandoff();
  const [adding, setAdding] = useState<string | null>(null);
  const [hiding, setHiding] = useState<string | null>(null);
  const router = useRouter();

  async function makeLink(kind: 'family' | 'household') {
    setBusy(kind);
    setLinkError('');
    try {
      const made = await newInviteLink(kind);
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

  // Mint and leave in one tap. The window has to be navigated rather than
  // opened, since a pop-up after the wait is blocked.
  async function shareLink() {
    startShare();
    const made = await newInviteLink('family');
    if (!made.token) {
      stopShare();
      setLinkError(made.error ?? 'משהו השתבש, נסו שוב');
      return;
    }
    goShare(inviteVia(`${window.location.origin}/join/${made.token}`));
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
            <h2 className={sectionHeading}>מוצע להוספה</h2>
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
                      back, because your families keep vouching for them.
                      Asked first, like everything else that takes away — this
                      one sits a thumb's width from "הוספה". */}
                  {hiding === family.id ? (
                    <button
                      type="button"
                      disabled={adding === family.id}
                      onClick={async () => {
                        setAdding(family.id);
                        try {
                          await dismissSuggested(family.id);
                        } finally {
                          setAdding(null);
                          setHiding(null);
                        }
                      }}
                      className={quietButton}
                    >
                      {adding === family.id ? 'רגע…' : 'כן, להסתיר'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={adding === family.id}
                      aria-label={`להסיר את ${family.name} מההצעות`}
                      title="לא להציע שוב"
                      onClick={() => setHiding(family.id)}
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted transition active:scale-95"
                    >
                      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
                        <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                      </svg>
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Our own house, for the same reason: the person to invite into it is a
          row, not a kind of invitation to pick out of a list. */}
      <section className={`${card} flex flex-col gap-1 p-0`}>
        <h2 className={`px-5 pt-4 pb-1 ${sectionHeading}`}>הבית שלנו</h2>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-3.5">
          <div className="min-w-0 grow basis-40">
            <p className="font-semibold break-words text-ink">{ownName}</p>
            <span className="text-sm text-muted">
              {ownMembers.length === 0 ? 'רק אתם' : ownMembers.map((m) => m.name).join(', ')}
            </span>
          </div>
        </div>
      </section>

      <HiddenSuggestions hidden={hidden} />

      <div id="invite" className={`${card} flex flex-col gap-3`}>
        <div className="flex items-center gap-2">
          {link && <BackButton onClick={() => setLink('')} />}
          <h2 className={sectionHeading}>הזמנה</h2>
        </div>

        {link ? (
          <>
            <a
              href={inviteVia(link)}
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
            <p className="text-center text-xs text-muted">
              הקישור פתוח לשבועיים ואפשר לשלוח אותו ליותר מאחד — נוח לקבוצה של המשפחה.
            </p>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={shareLink}
              disabled={busy !== null || sharing}
              className={`${primaryButton} inline-flex items-center justify-center gap-2`}
            >
              <WhatsAppMark />
              {sharing ? 'רגע…' : 'הזמנה בוואטסאפ'}
            </button>
            {/* The same link, for pasting anywhere else. Minting it and *then*
                choosing where to send it was two taps for the one thing almost
                everybody does with it. */}
            <button
              type="button"
              onClick={() => makeLink('family')}
              disabled={busy !== null || sharing}
              className={quietButton}
            >
              {busy === 'family' ? 'רגע…' : 'או להעתיק קישור'}
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
        <h2 className={sectionHeading}>מוסתרות מההצעות</h2>
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
            {/* Adding is what somebody opening this list is usually here for,
                so it is the button. Sending one back to the offers first and
                adding it there was two taps for one decision. */}
            <button
              type="button"
              disabled={busy === family.id}
              onClick={async () => {
                setBusy(family.id);
                try {
                  await addSuggested(family.id);
                } finally {
                  setBusy(null);
                }
              }}
              className={chipButton}
            >
              {busy === family.id ? 'רגע…' : 'הוספה'}
            </button>
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
              className={quietButton}
            >
              להציע שוב
            </button>
          </li>
        ))}
      </ul>
      <p className="px-5 pb-3 text-xs text-muted">
        «הוספה» מחברת אתכם עכשיו. «להציע שוב» רק מחזירה אותן לרשימת ההצעות.
      </p>
    </section>
  );
}

/**
 * An invitation for one row.
 *
 * Only a family nobody has signed in from needs one, and the link carries which
 * family they are, so opening it asks their name and nothing else. A family
 * already in the app needs nothing from this row: getting in is a phone number,
 * so the way-back-in link that used to live behind a menu here has no errand.
 */
function RowInvite({ householdId, members }: { householdId: string; members: Member[] }) {
  const { busy, start, stop, go } = useHandoff();
  const [error, setError] = useState('');

  // Already in the app: nothing to offer. Signing in is a phone number.
  if (members.length > 0) return null;

  /**
   * One tap, all the way to WhatsApp. The link has to be made first, and a
   * window opened after that wait is blocked as a pop-up — so this navigates
   * the tab instead, which is not. WhatsApp takes over, and Back returns here.
   */
  async function invite() {
    start();
    setError('');
    const made = await newInviteLink('family', '', householdId);
    if (!made.token) {
      setError(made.error ?? 'משהו השתבש');
      stop();
      return;
    }
    go(inviteVia(`${window.location.origin}/join/${made.token}`, ''));
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        disabled={busy}
        onClick={invite}
        className={`${chipButton} inline-flex items-center gap-2`}
      >
        <WhatsAppMark />
        {busy ? 'רגע…' : 'הזמנה בוואטסאפ'}
      </button>
      <ErrorNote>{error}</ErrorNote>
    </div>
  );
}
