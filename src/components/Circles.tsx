'use client';

import { CIRCLE_HINT } from '@/lib/naming';
import { useActionState, useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  addFamilyByName,
  addFamilyToCircle,
  circleInviteLink,
  leaveCircle,
  makeCircle,
  nameCircle,
  setCircleMember,
  type ActionResult,
} from '@/app/actions';
import { CIRCLE_COLORS, colorOf, colorName } from '@/lib/circle-colors';
import { useHandoff } from '@/lib/handoff';
import { inviteToCircle } from '@/lib/whatsapp';
import { WhatsAppMark } from './WhatsApp';
import {
  BackButton,
  Busy,
  ChevronIcon,
  CrossIcon,
  ErrorNote,
  FieldHint,
  IconButton,
  PlusIcon,
  card,
  chipButton,
  field,
  sectionHeading,
} from './ui';

export type CircleView = {
  id: string;
  name: string;
  color: string;
  /** Households in it besides us. */
  members: string[];
};

/**
 * A dot per circle a family is in. Several circles, several dots — a household
 * is often on both sides of a family at once.
 *
 * The name rides along as the title, because a colour on its own says nothing
 * to somebody who cannot tell these eight apart, and nothing at all to a screen
 * reader.
 */
export function CircleDots({
  tags,
}: {
  tags: { id: string; name: string; color: string }[];
}) {
  if (tags.length === 0) return null;
  return (
    <span className="inline-flex shrink-0 items-center gap-1" aria-label={`מעגלים: ${tags.map((t) => t.name).join(', ')}`}>
      {tags.map((tag) => (
        <span
          key={tag.id}
          title={tag.name}
          className="h-2.5 w-2.5 rounded-full ring-1 ring-black/10"
          style={{ backgroundColor: colorOf(tag.color) }}
        />
      ))}
    </span>
  );
}

/**
 * What the colours on this screen mean, said once at the top.
 *
 * On the holiday screen the names come free: the list is grouped by circle, so
 * every run of rows is under a heading that names it. A list ordered by
 * anything else — dates, say — cannot do that, and the dots on its rows are
 * decoration until something says which circle is which. This is that
 * something, and it is the same dot in the same colour.
 */
export function CircleLegend({
  circles,
}: {
  circles: { id: string; name: string; color: string }[];
}) {
  if (circles.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-1">
      <span className="text-xs text-muted">המעגלים שלכם</span>
      {circles.map((circle) => (
        <span key={circle.id} className="inline-flex items-center gap-1.5">
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/10"
            style={{ backgroundColor: colorOf(circle.color) }}
            aria-hidden="true"
          />
          <span className="text-xs font-bold text-ink">{circle.name}</span>
        </span>
      ))}
    </div>
  );
}

/**
 * The circles we are in, and what is in them.
 *
 * A circle is how families find each other here, and now the only way: everyone
 * in one is on everyone else's list, and its link brings whoever opens it into
 * all of them at once. It is still not about permissions — nothing here changes
 * who sees which holiday, or who may answer for whom.
 */
export function Circles({
  circles,
  families,
  startWith = '',
}: {
  circles: CircleView[];
  families: { id: string; name: string }[];
  /**
   * A family to open the new-circle form with, already ticked. Arrived here
   * from "מעגל חדש" beside a family in no circle, so the circle it is asking
   * for is a circle *with them in it* — making one and then coming back to find
   * them again is the trip this saves.
   */
  startWith?: string;
}) {
  const router = useRouter();
  const [making, setMaking] = useState(Boolean(startWith));
  const [open, setOpen] = useState<string | null>(null);
  // Leaving is asked before it is done. It is held here rather than inside the
  // editor so that folding the row away puts the question back unanswered.
  const [leaving, setLeaving] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  return (
    <section className={`${card} flex flex-col gap-1 p-0`} id="circles">
      <div className="flex items-baseline justify-between gap-2 px-5 pt-4 pb-1">
        <h2 className={sectionHeading}>המעגלים שלנו</h2>
        {!making && (
          // The same ＋ as the one that adds a family below it: both head a
          // section, both are the only way into the thing they open, and a
          // smaller grey one beside a bigger filled one reads as the lesser of
          // the two rather than as the other of the same kind.
          <IconButton label="מעגל חדש" big filled onClick={() => setMaking(true)}>
            <PlusIcon className="h-5 w-5" />
          </IconButton>
        )}
      </div>

      {circles.length === 0 && !making && (
        <p className="px-5 pb-4 text-sm text-muted">
          מעגל הוא צד אחד של המשפחה. כל מי שבתוכו רואה את כולם, ומי שנכנס
          מקישור ההזמנה מצטרף לכולם בבת אחת.
        </p>
      )}

      {making && (
        <NewCircle families={families} startWith={startWith} onDone={() => setMaking(false)} />
      )}

      {circles.length > 0 && (
        <ul className="divide-y divide-line">
          {circles.map((circle) => (
            <li key={circle.id} className="flex flex-col gap-2 px-5 py-3">
              {/* The row is the control. A pencil beside it asked people to aim
                  at a small target for the only thing the row does. */}
              {/* Never wrapped: the chevron is the last thing on the line and
                  stays on it, so every row's mark sits on the same edge — a
                  long name used to push it onto a line of its own. */}
              <button
                type="button"
                onClick={() => setOpen(open === circle.id ? null : circle.id)}
                aria-expanded={open === circle.id}
                className="flex w-full items-center gap-3 text-start"
              >
                <span
                  className="h-3.5 w-3.5 shrink-0 rounded-full ring-1 ring-black/10"
                  style={{ backgroundColor: colorOf(circle.color) }}
                  aria-hidden="true"
                />
                <span className="min-w-0 grow font-semibold break-words text-ink">
                  {circle.name}
                </span>
                <span className="shrink-0 text-sm text-muted">
                  {circle.members.length === 0
                    ? 'רק אתם'
                    : `${circle.members.length} משפחות`}
                </span>
                <ChevronIcon open={open === circle.id} />
              </button>

              {/* Inviting the circle is the errand people come here for most, so
                  it is on the row rather than behind opening it. */}
              <CircleInvite circleId={circle.id} name={circle.name} />

              {open === circle.id && (
                <CircleEditor
                  circle={circle}
                  families={families}
                  leaving={leaving === circle.id}
                  busy={busy === circle.id}
                  onAskLeave={() => setLeaving(circle.id)}
                  onCancelLeave={() => setLeaving(null)}
                  onLeave={async () => {
                    setBusy(circle.id);
                    await leaveCircle(circle.id);
                    setBusy(null);
                    setLeaving(null);
                    router.refresh();
                  }}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Naming a circle and ticking the families that belong to it, in one pass. */
function NewCircle({
  families,
  startWith = '',
  onDone,
}: {
  families: { id: string; name: string }[];
  /** Ticked from the start: the family this circle is being made for. */
  startWith?: string;
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(makeCircle, {});
  // Families made while filling this in, held only until the list from the
  // server catches up — adding one revalidates this screen, so a moment later
  // the same family arrives in `families` and this copy is the same household
  // written twice.
  const [extra, setExtra] = useState<{ id: string; name: string }[]>([]);
  // Ticked by id rather than left to the DOM. A family added here is ticked
  // because adding it here already said it belongs, and which of the two
  // arrivals renders first is a race an uncontrolled box would take its answer
  // from.
  const [ticked, setTicked] = useState<string[]>(startWith ? [startWith] : []);
  useEffect(() => {
    if (state.savedAt) onDone();
  }, [state.savedAt, onDone]);

  const shown = [...families, ...extra.filter((e) => !families.some((f) => f.id === e.id))];

  return (
    <form action={formAction} className="flex flex-col gap-3 border-t border-line px-5 py-4">
      <div className="flex items-center gap-2">
        <BackButton onClick={onDone} />
        <h3 className={sectionHeading}>מעגל חדש</h3>
      </div>
      <label className="flex flex-col gap-2">
        <span className="text-sm font-semibold text-muted">איך תקראו למעגל?</span>
        <input name="name" type="text" required placeholder="משפחות כץ ולוי" className={field} />
        <FieldHint>{CIRCLE_HINT}</FieldHint>
      </label>

      <fieldset className="flex flex-col gap-1">
        <legend className="mb-2 text-sm font-semibold text-muted">מי שייך אליו?</legend>
        {shown.map((family) => (
          <label
            key={family.id}
            className="flex items-center gap-3 rounded-xl border border-line bg-ground px-3 py-2"
          >
            <input
              type="checkbox"
              name="member"
              value={family.id}
              checked={ticked.includes(family.id)}
              onChange={(e) =>
                setTicked((was) =>
                  e.target.checked
                    ? [...was, family.id]
                    : was.filter((id) => id !== family.id),
                )
              }
              className="h-5 w-5 shrink-0 accent-brand"
            />
            <span className="min-w-0 break-words text-ink">{family.name}</span>
          </label>
        ))}
        {/* A family nobody has added yet — which is every family when the list
            is empty, and a circle with nothing to tick is a dead end. */}
        <NewFamilyHere
          label="משפחה חדשה למעגל"
          onAdded={(family: { id: string; name: string }) => {
            setExtra((was) => (was.some((e) => e.id === family.id) ? was : [...was, family]));
            setTicked((was) => (was.includes(family.id) ? was : [...was, family.id]));
          }}
        />
      </fieldset>

      <ErrorNote>{state.error}</ErrorNote>

      <button type="submit" disabled={pending} className={chipButton}>
        <Busy busy={pending}>יצירת המעגל</Busy>
      </button>
    </form>
  );
}

/**
 * Editing one circle: who is in it, what we call it, what colour we see it in,
 * and the way out of it.
 *
 * The name and the colour are ours alone — the other side of the family calls
 * the same circle something else, and neither of us overwrites the other.
 */
function CircleEditor({
  circle,
  families,
  leaving,
  busy: leavingBusy,
  onAskLeave,
  onCancelLeave,
  onLeave,
}: {
  circle: CircleView;
  families: { id: string; name: string }[];
  leaving: boolean;
  busy: boolean;
  onAskLeave: () => void;
  onCancelLeave: () => void;
  onLeave: () => void;
}) {
  const router = useRouter();
  // Refreshing the list is a second round trip after the write, and it is the
  // one that puts the new family on screen. Inside a transition it is something
  // we can still be waiting on — without it the ＋ went quiet the moment the
  // write returned and the row appeared a second later out of nowhere, which
  // read as a tap that had not worked.
  const [refreshing, startRefresh] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [name, setName] = useState(circle.name);
  const [color, setColor] = useState(circle.color);
  // Ticked now, saved after. The box is bound to the sheet, and the sheet is a
  // round trip away — so without this the tick springs back and the row reads
  // as broken until the answer lands. A refusal puts it back where it was.
  const [members, setMembers] = useState(circle.members);
  // …and taken from the sheet again whenever it says something new. Seeded once
  // and never re-read, this held the membership as it was when the editor
  // opened: a family added from the field below landed in the circle on the
  // server and sat here unticked, so it looked as though adding had not put it
  // anywhere and wanted a tick of its own.
  const fromSheet = circle.members.join(',');
  useEffect(() => {
    setMembers(fromSheet ? fromSheet.split(',') : []);
  }, [fromSheet]);

  // Who is in, and who is left to choose from — the second shrinking as the
  // first grows, which is the whole point of showing them apart.
  const [look, setLook] = useState('');
  const [pickingColor, setPickingColor] = useState(false);
  const inside = families.filter((f) => members.includes(f.id));
  const outside = families.filter((f) => !members.includes(f.id));
  const shown = look.trim()
    ? outside.filter((f) => f.name.includes(look.trim()))
    : outside;

  async function toggle(householdId: string, inCircle: boolean) {
    const before = members;
    setMembers(inCircle ? [...members, householdId] : members.filter((m) => m !== householdId));
    setBusy(householdId);
    setError('');
    const result = await setCircleMember(circle.id, householdId, inCircle);
    if (result.error) {
      setError(result.error);
      setMembers(before);
    }
    setBusy(null);
    router.refresh();
  }

  async function label(nextName: string, nextColor: string) {
    setBusy('label');
    setError('');
    const result = await nameCircle(circle.id, nextName, nextColor);
    if (result.error) setError(result.error);
    setBusy(null);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-brand-wash p-3">
      {/* Who is in, and separately who could be.
          One list of every family with ticks against some of them made the
          answer to "who is in this circle" something you had to assemble by
          reading thirty rows and remembering which were ticked — and the ones
          already in were the bulk of it, in the way of the few that were not.
          The members are said outright; the list to choose from is only what is
          left, and it gets shorter as it is used. */}
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold text-muted">
          {inside.length === 0 ? 'עוד אף משפחה במעגל' : `במעגל · ${inside.length}`}
        </span>
        {inside.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {inside.map((family) => (
              <button
                key={family.id}
                type="button"
                disabled={busy === family.id}
                onClick={() => toggle(family.id, false)}
                aria-label={`להוציא את ${family.name} מהמעגל`}
                className="inline-flex items-center gap-1.5 rounded-full border border-brand/40 bg-surface px-3 py-1 text-xs font-bold text-brand transition active:scale-95 disabled:opacity-50"
              >
                <Busy busy={busy === family.id}>{family.name}</Busy>
                <CrossIcon />
              </button>
            ))}
          </div>
        )}
      </div>

      <fieldset className="flex flex-col gap-1">
        <legend className="mb-1 text-xs font-semibold text-muted">
          {outside.length === 0 ? 'כל המשפחות שלכם כאן' : 'להוסיף למעגל'}
        </legend>
        {/* Only worth a search box when the list is long enough to scroll past
            what you are looking for. */}
        {outside.length > 7 && (
          <input
            type="search"
            value={look}
            onChange={(e) => setLook(e.target.value)}
            placeholder="חיפוש משפחה"
            aria-label="חיפוש משפחה להוספה למעגל"
            className="mb-1 w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted"
          />
        )}
        {shown.map((family) => (
          <button
            key={family.id}
            type="button"
            disabled={busy === family.id}
            onClick={() => toggle(family.id, true)}
            className="flex items-center gap-3 rounded-xl bg-surface px-3 py-2 text-start transition active:scale-[0.99] disabled:opacity-50"
          >
            <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full border border-brand text-brand">
              <PlusIcon className="h-3 w-3" />
            </span>
            <span className="min-w-0 break-words text-ink">
              <Busy busy={busy === family.id}>{family.name}</Busy>
            </span>
          </button>
        ))}
        {outside.length > 0 && shown.length === 0 && (
          <p className="px-3 py-2 text-sm text-muted">אין משפחה בשם הזה ברשימה שלכם.</p>
        )}
        {/* A family nobody has added yet. Ticking a list of families we already
            have is no use when the one we mean is not in it, and going away to
            add them loses the circle we were in the middle of filling. */}
        <NewInCircle
          circleId={circle.id}
          pending={refreshing}
          onAdded={() => startRefresh(() => router.refresh())}
        />
      </fieldset>

      {/* Name and colour are one change with one button, the way making a circle
          is. They used to save themselves — the name when the field lost focus,
          the colour the instant a swatch was tapped — so there was nothing to
          press and no moment that said it had been kept, while the screen
          beside it had a plain «יצירת המעגל». Two ways of saving the same kind
          of thing, on one screen. */}
      <label className="flex flex-col gap-1">
        <span className="text-xs font-semibold text-muted">איך אנחנו קוראים לו</span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={field}
        />
      </label>

      {/* Folded away. Eight swatches and a caption took a third of the panel
          for something chosen once and rarely looked at again, while the thing
          people actually came to change — who is in — was below it. One dot
          that opens them. */}
      <div className="flex flex-col gap-1">
        <button
          type="button"
          onClick={() => setPickingColor((was) => !was)}
          aria-expanded={pickingColor}
          className="inline-flex w-fit items-center gap-2 text-xs font-semibold text-muted transition active:scale-95"
        >
          <span
            className="h-4 w-4 shrink-0 rounded-full ring-1 ring-black/10"
            style={{ backgroundColor: colorOf(color) }}
            aria-hidden="true"
          />
          הצבע שלו אצלנו · {colorName(color)}
          <ChevronIcon open={pickingColor} />
        </button>
        {pickingColor && (
          <div className="flex flex-wrap gap-2 pt-1">
            {CIRCLE_COLORS.map((option) => (
              <button
                key={option.key}
                type="button"
                aria-label={option.label}
                title={option.label}
                aria-pressed={color === option.key}
                onClick={() => setColor(option.key)}
                className={`h-7 w-7 rounded-full ring-1 ring-black/10 transition active:scale-95 ${
                  color === option.key ? 'outline-2 outline-offset-2 outline-brand' : ''
                }`}
                style={{ backgroundColor: option.hex }}
              />
            ))}
          </div>
        )}
      </div>

      {(name.trim() !== circle.name || color !== circle.color) && (
        <button
          type="button"
          disabled={!name.trim() || busy === 'label'}
          onClick={() => label(name.trim() || circle.name, color)}
          className={chipButton}
        >
          <Busy busy={busy === 'label'}>שמירת השם והצבע</Busy>
        </button>
      )}

      <ErrorNote>{error}</ErrorNote>

      {/* Leaving lives here, at the end, rather than as a small grey ✕ beside
          the pencil. It is not a tidying-up gesture — it takes us out of
          something other people are in — so it is marked as what it is, and it
          asks first. */}
      <div className="border-t border-line pt-3">
        {leaving ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-ink">
              יציאה מ«{circle.name}» מוציאה <b>אתכם</b> מהמעגל. המשפחות שבו יישארו
              במעגל שלכם, והמעגל ימשיך להתקיים אצל השאר.
            </p>
            <div className="flex items-center gap-4">
              <button
                type="button"
                disabled={leavingBusy}
                onClick={onLeave}
                className="rounded-full border border-danger px-4 py-1.5 text-sm font-bold text-danger transition active:scale-95 disabled:opacity-50"
              >
                <Busy busy={leavingBusy}>כן, לצאת מהמעגל</Busy>
              </button>
              <button type="button" onClick={onCancelLeave} className="text-sm text-muted">
                ביטול
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={onAskLeave}
            className="inline-flex items-center gap-2 text-sm font-semibold text-danger"
          >
            <CrossIcon />
            יציאה מהמעגל
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * The circle's own invitation.
 *
 * Its link carries the circle, so whoever opens it is asked which of *these*
 * families they are and lands among all of them. It used to be the household's
 * general link with the circle's name written into the message — which said
 * "everyone here joins us all" and delivered an introduction to the sender
 * alone.
 *
 * Minted on the tap, like every other link here: the token has to exist before
 * there is anything to send, and a window opened after that wait is blocked as
 * a pop-up, so this navigates the tab instead. WhatsApp takes over, and Back
 * comes home.
 */
function CircleInvite({ circleId, name }: { circleId: string; name: string }) {
  const { busy, start, stop, go } = useHandoff();
  const [error, setError] = useState('');

  async function invite() {
    start();
    setError('');
    const made = await circleInviteLink(circleId);
    if (!made.token) {
      setError(made.error ?? 'משהו השתבש');
      stop();
      return;
    }
    go(inviteToCircle(name, `${window.location.origin}/join/${made.token}`));
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={invite}
        disabled={busy}
        aria-label={`הזמנה ל${name} בוואטסאפ`}
        title="מי שנכנס מהקישור מצטרף לכל המעגל"
        className="inline-flex items-center gap-2 self-start text-sm font-bold text-whatsapp disabled:opacity-50"
      >
        <WhatsAppMark />
        <Busy busy={busy}>הזמנה למעגל</Busy>
      </button>
      <ErrorNote>{error}</ErrorNote>
    </div>
  );
}

/**
 * Adding a family to the circle we are filling, without leaving it.
 *
 * A name is enough — the same shape as adding one anywhere else — and it lands
 * in our list and in this circle in one go, since being here at all is saying
 * which circle they belong to.
 */
function NewInCircle({
  circleId,
  pending,
  onAdded,
}: {
  circleId: string;
  /** The list is still coming back. The ＋ stays busy until it has. */
  pending: boolean;
  onAdded: () => void;
}) {
  return (
    <NewFamilyField
      label="משפחה חדשה למעגל"
      pending={pending}
      onSubmit={async (name) => {
        const result = await addFamilyToCircle(circleId, name);
        if (result.error) return { error: result.error };
        onAdded();
        return {};
      }}
    />
  );
}

/** A family for the circle being made: added to our list, and ticked here. */
function NewFamilyHere({
  onAdded,
  label,
}: {
  onAdded: (family: { id: string; name: string }) => void;
  label: string;
}) {
  return (
    <NewFamilyField
      label={label}
      onSubmit={async (name) => {
        const made = await addFamilyByName(name);
        if (made.error || !made.id) return { error: made.error ?? 'משהו השתבש' };
        onAdded({ id: made.id, name: made.name ?? name });
        return {};
      }}
    />
  );
}

/** The field itself: a name, and a ＋ that means add. */
function NewFamilyField({
  label,
  pending = false,
  onSubmit,
}: {
  label: string;
  /** Work still going on above us — the ＋ says so too. */
  pending?: boolean;
  onSubmit: (name: string) => Promise<{ error?: string }>;
}) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const box = useRef<HTMLInputElement>(null);

  async function add() {
    if (!name.trim()) return;
    setBusy(true);
    setError('');
    const result = await onSubmit(name.trim());
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setName('');
    // Straight on to the next one. A circle is filled in a handful of names,
    // and reaching for the field again between each is most of the work.
    box.current?.focus();
  }

  return (
    <div className="flex flex-col gap-1 pt-1">
      <div className="flex items-center gap-2">
        <input
          ref={box}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
          placeholder={label}
          aria-label={label}
          className={`${field} py-2 text-base`}
        />
        {/* Busy while the write goes out, and dimmed rather than dead before
            there is anything to add: an unlit ＋ that never answers reads as a
            broken button, and the second tap is somebody trying again. */}
        <IconButton
          label={`הוספה — ${label}`}
          busy={busy || pending}
          disabled={!name.trim()}
          filled
          onClick={add}
        >
          <PlusIcon />
        </IconButton>
      </div>
      <ErrorNote>{error}</ErrorNote>
    </div>
  );
}
