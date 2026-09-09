'use client';

import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useState } from 'react';
import { useHandoff } from '@/lib/handoff';
import {
  deleteFamily,
  dropFamily,
  renameFamily,
  nameOurHousehold,
  newInviteLink,
  type ActionResult,
} from '@/app/actions';
import { AddFamilyInline } from './AddFamilyInline';
import { ContactPicker } from './ContactPicker';
import { Circles, CircleDots, type CircleView } from './Circles';
import { WhatsAppMark, type Member } from './WhatsApp';
import { inviteVia } from '@/lib/whatsapp';
import {
  BackButton,
  Busy,
  CheckIcon,
  CopyIcon,
  CrossIcon,
  ErrorNote,
  IconButton,
  PencilIcon,
  PlusIcon,
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
  ownName,
  circles,
  tags,
  standing,
}: {
  families: Family[];
  /** The people in our own household, for a link that lets one of them in elsewhere. */
  ownMembers: Member[];
  /** This family's standing join link, for the families nobody has joined yet. */
  inviteUrl: string;
  /** What our own household is called. */
  ownName: string;
  /** The circles we are in, as we named and coloured them. */
  circles: CircleView[];
  /** Which of our circles each family is in, for the dots on their row. */
  tags: Record<string, { id: string; name: string; color: string }[]>;
  /** What can still be done to each family: renamed, deleted, or only dropped. */
  standing: Record<string, { addedByUs: boolean; joined: boolean; answeredFor: boolean }>;
}) {
  const [link, setLink] = useState('');
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState<'family' | 'household' | null>(null);
  const [linkError, setLinkError] = useState('');
  const { busy: sharing, start: startShare, stop: stopShare, go: goShare } = useHandoff();
  const [addingFamily, setAddingFamily] = useState(false);
  const [openFamily, setOpenFamily] = useState<string | null>(null);
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

  /**
   * Copying the invitation, and nothing else. It used to mint the link and then
   * show a second layout with a full-width copy button — two taps and a change
   * of scenery for one small errand.
   */
  async function copyLink() {
    setBusy('family');
    setLinkError('');
    try {
      const made = await newInviteLink('family');
      if (!made.token) {
        setLinkError(made.error ?? 'משהו השתבש, נסו שוב');
        return;
      }
      const url = `${window.location.origin}/join/${made.token}`;
      try {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2500);
      } catch {
        // Some browsers will not write to the clipboard after an await. Show
        // the link rather than losing it.
        setLink(url);
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col items-center gap-2 text-center">
        <Title>המעגלים שלי</Title>
        <p className="text-muted">רק המשפחות שכאן מופיעות כשאתם עונים על חג.</p>
      </header>

      <section id="families" className={`${card} flex flex-col gap-1 p-0`}>
        <div className="flex items-baseline justify-between gap-2 px-5 pt-4 pb-1">
          <h2 className={sectionHeading}>המשפחות שלנו</h2>
          {/* Adding one from the top of the list it goes into, rather than from
              the panel at the foot of a long screen. */}
          <IconButton label="הוספת משפחה" onClick={() => setAddingFamily(true)}>
            <PlusIcon />
          </IconButton>
        </div>
        {addingFamily && (
          <div className="flex flex-col gap-3 px-5 pb-3">
            <AddFamilyInline
              inviteUrl={inviteUrl}
              circles={circles}
              startOpen
              onClose={() => setAddingFamily(false)}
              onAdded={() => {
                setAddingFamily(false);
                router.refresh();
              }}
            />
            {/* Beside typing a name rather than at the foot of the screen, and
                the only way into contacts now: this one takes several at a
                time, which is what anybody opening an address book wants. */}
            <ContactPicker />
          </div>
        )}
        {families.length === 0 ? (
          <p className="p-6 text-center text-muted">עדיין אין אף משפחה — אפשר להוסיף כאן למעלה.</p>
        ) : (
          <ul className="divide-y divide-line">
            {families.map((family) => (
              <li key={family.id} className="flex flex-col gap-2 px-5 py-3.5">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  {/* The row opens what can be done about the family, the same
                      way a circle's row does. */}
                  <button
                    type="button"
                    onClick={() => setOpenFamily(openFamily === family.id ? null : family.id)}
                    aria-expanded={openFamily === family.id}
                    className="flex min-w-0 grow basis-40 flex-col text-start"
                  >
                    <span className="flex flex-wrap items-center gap-2 font-semibold break-words text-ink">
                      {family.name}
                      <CircleDots tags={tags[family.id] ?? []} />
                    </span>
                    {/* Say what the state actually is. "טרם הצטרפו" left people
                        guessing whether the family was missing something, when
                        all it means is that nobody from it has opened the app. */}
                    <span className="text-sm text-muted">
                      {family.members.length === 0
                        ? 'עוד לא נרשמו לאפליקציה'
                        : family.members.map((m) => m.name).join(', ')}
                    </span>
                  </button>
                  {/* The invitation belongs on the row of the family it is for.
                      The link carries who they are, so opening it asks their name
                      and nothing else — no list to find themselves in, and no
                      family name to invent. */}
                  <RowInvite householdId={family.id} members={family.members} />
                </div>

                {openFamily === family.id && (
                  <FamilyRow
                    family={family}
                    standing={standing[family.id] ?? { addedByUs: false, joined: true, answeredFor: true }}
                    onDone={() => {
                      setOpenFamily(null);
                      router.refresh();
                    }}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      <Circles circles={circles} families={families.map((f) => ({ id: f.id, name: f.name }))} />

      {/* Our own house, for the same reason: the person to invite into it is a
          row, not a kind of invitation to pick out of a list. */}
      <section className={`${card} flex flex-col gap-1 p-0`}>
        <h2 className={`px-5 pt-4 pb-1 ${sectionHeading}`}>הבית שלנו</h2>
        <OwnHouse name={ownName} members={ownMembers} />
      </section>

      <div id="invite" className={`${card} flex flex-col gap-3`}>
        <h2 className={sectionHeading}>הזמנה</h2>

        {link ? (
          <>
            {/* The clipboard refused — a browser that will not write outside a
                tap it recognises. The link itself, then, to copy by hand. */}
            <input
              readOnly
              dir="ltr"
              value={link}
              onFocus={(e) => e.currentTarget.select()}
              aria-label="קישור ההזמנה"
              className={`${field} text-sm`}
            />
            <button type="button" onClick={copy} className={secondaryButton}>
              {copied ? 'הקישור הועתק ✓' : 'העתקת הקישור'}
            </button>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={shareLink}
                disabled={busy !== null || sharing}
                className={`${primaryButton} inline-flex grow items-center justify-center gap-2`}
              >
                <WhatsAppMark />
                <Busy busy={sharing}>הזמנה בוואטסאפ</Busy>
              </button>
              {/* The same link, for pasting anywhere else — a mark beside the
                  button rather than a second line of words under it. */}
              <IconButton
                label={copied ? 'הקישור הועתק' : 'העתקת קישור הזמנה'}
                busy={busy === 'family' && !copied}
                disabled={sharing}
                onClick={copyLink}
              >
                {copied ? <CheckIcon /> : <CopyIcon />}
              </IconButton>
            </div>
            <p className="-mt-1 text-center text-xs text-muted">
              לקבוצת המשפחה, או למי שעוד לא ברשימה למעלה.
            </p>
            <ErrorNote>{linkError}</ErrorNote>

            {/* Adding a family by name, on the screen that is about families.
                Until now this lived only beside the holiday question, and the
                contact picker beneath it is Chrome-on-Android only — so half
                the family had no way to add anybody from here at all. */}
            <div className="mt-1 flex flex-col gap-3 border-t border-line pt-3">
              <AddFamilyInline
                inviteUrl={inviteUrl}
                circles={circles}
                onAdded={() => router.refresh()}
              />
            </div>
          </>
        )}
      </div>

    </div>
  );
}

/**
 * Our own family's row, and the one thing about it that is ours to change.
 *
 * The name is often not ours to begin with — somebody added us from a name in
 * their phone before we ever opened the app — so correcting it is a common
 * errand, not a settings-screen rarity. It belongs on the row that shows the
 * name, rather than three taps deep behind the menu under our own name.
 */
function OwnHouse({ name, members }: { name: string; members: Member[] }) {
  const [editing, setEditing] = useState(false);
  // Inviting a partner or a grown child. It lived under the menu at the top of
  // every screen, which is not where anybody looks for it — this row is what it
  // is about.
  const { busy: adding, start, stop, go } = useHandoff();
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    nameOurHousehold,
    {},
  );
  useEffect(() => {
    if (state.savedAt) setEditing(false);
  }, [state.savedAt]);

  if (editing) {
    return (
      <form action={formAction} className="flex flex-col gap-2 px-5 py-3.5">
        <label className="flex flex-col gap-2">
          <span className="text-sm font-semibold text-muted">איך המשפחה שלנו תיקרא לאחרים?</span>
          <input
            name="householdName"
            type="text"
            defaultValue={name}
            required
            autoFocus
            className={field}
          />
        </label>
        <ErrorNote>{state.error}</ErrorNote>
        <div className="flex items-center gap-4">
          <button type="submit" disabled={pending} className={chipButton}>
            <Busy busy={pending}>שמירה</Busy>
          </button>
          <button type="button" onClick={() => setEditing(false)} className={quietButton}>
            ביטול
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-3.5">
      <div className="min-w-0 grow basis-40">
        <p className="font-semibold break-words text-ink">{name}</p>
        <span className="text-sm text-muted">
          {members.length === 0 ? 'רק אתם' : members.map((m) => m.name).join(', ')}
        </span>
      </div>
      <IconButton label="שינוי שם המשפחה שלנו" onClick={() => setEditing(true)}>
        <PencilIcon />
      </IconButton>
      <button
        type="button"
        disabled={adding}
        onClick={async () => {
          start();
          const made = await newInviteLink('household', '');
          if (!made.token) {
            stop();
            return;
          }
          go(inviteVia(`${window.location.origin}/join/${made.token}`));
        }}
        className={`${chipButton} inline-flex items-center gap-2`}
      >
        <WhatsAppMark />
        <Busy busy={adding}>הוספת בן בית</Busy>
      </button>
    </div>
  );
}

/**
 * What can still be done about a family on our list.
 *
 * Three states, and which one a family is in is not a matter of taste: a name
 * we typed is ours to fix or take back; a family somebody has signed into, or
 * that an answer names, is a record, and all we can do is stop carrying it.
 */
function FamilyRow({
  family,
  standing,
  onDone,
}: {
  family: Family;
  standing: { addedByUs: boolean; joined: boolean; answeredFor: boolean };
  onDone: () => void;
}) {
  const [name, setName] = useState(family.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);

  const canRename = standing.addedByUs && !standing.joined;
  const canDelete = canRename && !standing.answeredFor;

  async function run(work: () => Promise<ActionResult>) {
    setBusy(true);
    setError('');
    const result = await work();
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    onDone();
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-brand-wash p-3">
      {canRename ? (
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-muted">איך הם נקראים אצלנו</span>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={`${field} py-2 text-base`}
            />
            <IconButton
              label="שמירת השם"
              busy={busy}
              disabled={!name.trim() || name === family.name}
              onClick={() => run(() => renameFamily(family.id, name))}
            >
              <CheckIcon />
            </IconButton>
          </div>
        </label>
      ) : (
        <p className="text-xs text-muted">
          {standing.joined
            ? 'מישהו מהמשפחה כבר נרשם — השם שלהם לשנות.'
            : 'הוסיפו אותם מרשימה של מישהו אחר, אז השם לא שלנו לשנות.'}
        </p>
      )}

      <ErrorNote>{error}</ErrorNote>

      {confirming ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-ink">
            {canDelete
              ? `למחוק את «${family.name}»? אף אחד עוד לא נרשם אליהם ואין עליהם תשובות, אז הם ייעלמו גם אצל השאר.`
              : `להסיר את «${family.name}» מהרשימה שלנו? הם יישארו אצל כל השאר, עם כל מה שענו.`}
          </p>
          <div className="flex items-center gap-4">
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                run(() => (canDelete ? deleteFamily(family.id) : dropFamily(family.id)))
              }
              className="rounded-full border border-danger px-4 py-1.5 text-sm font-bold text-danger transition active:scale-95 disabled:opacity-50"
            >
              <Busy busy={busy}>{canDelete ? 'כן, למחוק' : 'כן, להסיר'}</Busy>
            </button>
            <button type="button" onClick={() => setConfirming(false)} className="text-sm text-muted">
              ביטול
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="inline-flex items-center gap-2 self-start text-sm font-semibold text-danger"
        >
          <CrossIcon />
          {canDelete ? 'מחיקת המשפחה' : 'הסרה מהרשימה שלנו'}
        </button>
      )}
    </div>
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
        <Busy busy={busy}>הזמנה בוואטסאפ</Busy>
      </button>
      <ErrorNote>{error}</ErrorNote>
    </div>
  );
}
