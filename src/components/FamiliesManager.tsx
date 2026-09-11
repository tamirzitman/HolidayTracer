'use client';

import { HOUSEHOLD_HINT } from '@/lib/naming';
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
import { colorOf } from '@/lib/circle-colors';
import { groupKey } from '@/lib/circle-order';
import { WhatsAppMark, type Member } from './WhatsApp';
import { inviteVia } from '@/lib/whatsapp';
import {
  BackButton,
  Busy,
  CheckIcon,
  ChevronIcon,
  CrossIcon,
  ErrorNote,
  FieldHint,
  IconButton,
  PencilIcon,
  PlusIcon,
  Title,
  card,
  chipButton,
  field,
  quietButton,
  sectionHeading,
} from './ui';

type Family = { id: string; name: string; members: Member[] };

export function FamiliesManager({
  families,
  ownMembers,
  ownName,
  circles,
  tags,
  standing,
  startWith,
}: {
  families: Family[];
  /** The people in our own household, for a link that lets one of them in elsewhere. */
  ownMembers: Member[];
  /** This family's standing join link, for the families nobody has joined yet. */
  /** What our own household is called. */
  ownName: string;
  /** The circles we are in, as we named and coloured them. */
  circles: CircleView[];
  /** Which of our circles each family is in, for the dots on their row. */
  tags: Record<string, { id: string; name: string; color: string }[]>;
  /** What can still be done to each family: renamed, deleted, or only dropped. */
  standing: Record<string, { addedByUs: boolean; joined: boolean; answeredFor: boolean }>;
  /** A family to start a new circle with, when we arrived here to make one. */
  startWith: string;
}) {
  const [addingFamily, setAddingFamily] = useState(false);
  const [openFamily, setOpenFamily] = useState<string | null>(null);
  const router = useRouter();

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col items-center gap-2 text-center">
        <Title>המעגלים שלי</Title>
        <p className="text-muted">רק המשפחות שכאן מופיעות כשאתם עונים על חג.</p>
      </header>

      {/* The circles come first. They are what the screen is called, and what
          decides who is on the list underneath — a list of families above the
          thing that fills it read as the point, with the circles as a footnote
          about it. */}
      <Circles
        circles={circles}
        families={families.map((f) => ({ id: f.id, name: f.name }))}
        startWith={startWith}
      />

      <section id="families" className={`${card} flex flex-col gap-1 p-0`}>
        <div className="flex items-baseline justify-between gap-2 px-5 pt-4 pb-1">
          <h2 className={sectionHeading}>המשפחות שלנו</h2>
          {/* Adding one from the top of the list it goes into, rather than from
              the panel at the foot of a long screen. */}
          {/* The same ＋ as the one on a circle's field, at the size of a mark
              that is the only way in rather than one errand among several. It
              was a small grey outline, and people looked past it for a sentence
              to tap — which is why there used to be one at the foot of the
              screen as well, saying the same thing twice. */}
          <IconButton label="הוספת משפחה" big filled onClick={() => setAddingFamily(true)}>
            <PlusIcon className="h-5 w-5" />
          </IconButton>
        </div>
        {addingFamily && (
          <div className="flex flex-col gap-3 px-5 pb-3">
            {/* Left open on purpose, exactly as the ＋ on the holiday screen
                leaves it: the card that comes back is where a family added with
                a number is invited, and folding the panel away the moment they
                were added took that with it. */}
            <AddFamilyInline
              circles={circles}
              startOpen
              onClose={() => setAddingFamily(false)}
              onAdded={() => router.refresh()}
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
          <ul className="flex flex-col">
            {families.map((family, i) => {
              const myTags = tags[family.id] ?? [];
              // The same grouping "איפה כולם" draws, from the same sort and the
              // same boundary function — this list is already ordered by circle,
              // and showed it only as a row of small dots nobody could take in
              // without reading line by line.
              const key = groupKey(myTags);
              const changed = i === 0 || key !== groupKey(tags[families[i - 1].id] ?? []);
              // One colour is a strip; more than one is a family standing
              // between circles, so it is striped rather than picking one.
              const stripe =
                myTags.length === 0
                  ? 'transparent'
                  : myTags.length === 1
                    ? colorOf(myTags[0].color)
                    : `linear-gradient(to bottom, ${myTags.map((t) => colorOf(t.color)).join(', ')})`;

              return (
              <li key={family.id}>
              {changed && (
                <div
                  data-circle-group
                  className="flex items-center gap-2 border-t border-line bg-ground px-5 py-1.5 first:border-t-0"
                >
                  <CircleDots tags={myTags} />
                  <span className="text-xs font-bold text-muted">
                    {myTags.length === 0 ? 'עוד לא במעגל' : myTags.map((t) => t.name).join(' + ')}
                  </span>
                </div>
              )}
              <div className="flex items-stretch gap-3 border-t border-line px-5 py-3.5 first:border-t-0">
                {/* The strip the heading above names in words, so the list can
                    be scanned down its edge without reading the dots. */}
                <span
                  data-circle-strip
                  className="w-1 shrink-0 self-stretch rounded-full"
                  style={{ background: stripe }}
                  aria-hidden="true"
                />
                <div className="flex min-w-0 grow flex-col gap-2">
                {/* Name and chevron on one line, the chevron last and never
                    wrapped: every row's mark then sits on the same edge, and the
                    eye can run down them. Anything else the row carries goes
                    underneath, where it cannot push the mark around. */}
                <div className="flex items-center gap-3">
                  {/* The row opens what can be done about the family, the same
                      way a circle's row does. */}
                  <button
                    type="button"
                    onClick={() => setOpenFamily(openFamily === family.id ? null : family.id)}
                    aria-expanded={openFamily === family.id}
                    className="flex min-w-0 grow flex-col text-start"
                  >
                    {/* No dots on the row any more: the heading above says
                        which circle this run of families is in, and the strip
                        repeats it down the edge. A third copy on every line was
                        the noise the grouping exists to remove. */}
                    <span className="font-semibold break-words text-ink">{family.name}</span>
                    {/* Say what the state actually is. "טרם הצטרפו" left people
                        guessing whether the family was missing something, when
                        all it means is that nobody from it has opened the app. */}
                    <span className="text-sm text-muted">
                      {family.members.length === 0
                        ? 'עוד לא נרשמו לאפליקציה'
                        : family.members.map((m) => m.name).join(', ')}
                    </span>
                  </button>
                  {/* The mark that says there is something under this row. A row
                      that only reveals itself once tapped has told nobody it can
                      be tapped. */}
                  <button
                    type="button"
                    onClick={() => setOpenFamily(openFamily === family.id ? null : family.id)}
                    aria-expanded={openFamily === family.id}
                    aria-label={`מה אפשר לעשות עם ${family.name}`}
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-full transition active:scale-95"
                  >
                    <ChevronIcon open={openFamily === family.id} />
                  </button>
                </div>

                {/* The invitation belongs on the row of the family it is for.
                    The link carries who they are, so opening it asks their name
                    and nothing else — no list to find themselves in, and no
                    family name to invent. */}
                <RowInvite householdId={family.id} members={family.members} />

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
                </div>
              </div>
              </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Our own house, last: it is the one row on this screen that is not
          about somebody else. */}
      <section className={`${card} flex flex-col gap-1 p-0`}>
        <h2 className={`px-5 pt-4 pb-1 ${sectionHeading}`}>הבית שלנו</h2>
        <OwnHouse name={ownName} members={ownMembers} />
      </section>

    </div>
  );
}

/**
 * Our own family's row, and what is ours to do about it.
 *
 * The name is often not ours to begin with — somebody added us from a name in
 * their phone before we ever opened the app — so correcting it is a common
 * errand, not a settings-screen rarity. It and the way to let a partner or a
 * grown child in both live under the row, which opens like every other row on
 * this screen; on the row itself they made a line about one household read as a
 * row of controls.
 */
function OwnHouse({ name, members }: { name: string; members: Member[] }) {
  const [open, setOpen] = useState(false);
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
          <FieldHint>{HOUSEHOLD_HINT}</FieldHint>
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
    <div className="flex flex-col gap-2 px-5 py-3.5">
      {/* The row opens what can be done about our own house, the same way a
          family's row and a circle's row do. Two errands live under it —
          correcting the name, and letting a partner or a grown child in — and
          both sat on the row itself, which made a row about one household look
          like a row of controls. */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className="flex min-w-0 grow flex-col text-start"
        >
          <span className="font-semibold break-words text-ink">{name}</span>
          <span className="text-sm text-muted">
            {members.length === 0 ? 'רק אתם' : members.map((m) => m.name).join(', ')}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-label="מה אפשר לעשות עם הבית שלנו"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full transition active:scale-95"
        >
          <ChevronIcon open={open} />
        </button>
      </div>

      {open && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-brand-wash p-3">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-2 text-sm font-semibold text-brand"
          >
            <PencilIcon />
            שינוי שם המשפחה
          </button>
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
      )}
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

  // The same shape as a circle's invitation, and named the same way: what the
  // link carries. A pill the width of the row said the same errand was a bigger
  // one here than there, and the two sit a thumb apart.
  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        disabled={busy}
        onClick={invite}
        className="inline-flex items-center gap-2 self-start text-sm font-bold text-whatsapp disabled:opacity-50"
      >
        <WhatsAppMark />
        <Busy busy={busy}>הזמנה למשפחה</Busy>
      </button>
      <ErrorNote>{error}</ErrorNote>
    </div>
  );
}
