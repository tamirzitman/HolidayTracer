'use client';

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
  CrossIcon,
  ErrorNote,
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
}: {
  circles: CircleView[];
  families: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [making, setMaking] = useState(false);
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
          <IconButton label="מעגל חדש" onClick={() => setMaking(true)}>
            <PlusIcon />
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
        <NewCircle families={families} onDone={() => setMaking(false)} />
      )}

      {circles.length > 0 && (
        <ul className="divide-y divide-line">
          {circles.map((circle) => (
            <li key={circle.id} className="flex flex-col gap-2 px-5 py-3">
              {/* The row is the control. A pencil beside it asked people to aim
                  at a small target for the only thing the row does. */}
              <button
                type="button"
                onClick={() => setOpen(open === circle.id ? null : circle.id)}
                aria-expanded={open === circle.id}
                className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 text-start"
              >
                <span
                  className="h-3.5 w-3.5 shrink-0 rounded-full ring-1 ring-black/10"
                  style={{ backgroundColor: colorOf(circle.color) }}
                  aria-hidden="true"
                />
                <span className="min-w-0 grow basis-32 font-semibold break-words text-ink">
                  {circle.name}
                </span>
                <span className="text-sm text-muted">
                  {circle.members.length === 0
                    ? 'רק אתם'
                    : `${circle.members.length} משפחות`}
                </span>
                <svg
                  viewBox="0 0 24 24"
                  className={`h-4 w-4 shrink-0 text-muted transition ${
                    open === circle.id ? 'rotate-180' : ''
                  }`}
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="M6 9l6 6 6-6"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
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
  onDone,
}: {
  families: { id: string; name: string }[];
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(makeCircle, {});
  // Families made while filling this in. They are ticked, since adding one here
  // is saying it belongs.
  const [extra, setExtra] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    if (state.savedAt) onDone();
  }, [state.savedAt, onDone]);

  return (
    <form action={formAction} className="flex flex-col gap-3 border-t border-line px-5 py-4">
      <div className="flex items-center gap-2">
        <BackButton onClick={onDone} />
        <h3 className={sectionHeading}>מעגל חדש</h3>
      </div>
      <label className="flex flex-col gap-2">
        <span className="text-sm font-semibold text-muted">איך תקראו למעגל?</span>
        <input name="name" type="text" required placeholder="צד אבא" className={field} />
      </label>

      <fieldset className="flex flex-col gap-1">
        <legend className="mb-2 text-sm font-semibold text-muted">מי שייך אליו?</legend>
        {[...families, ...extra].map((family) => (
          <label
            key={family.id}
            className="flex items-center gap-3 rounded-xl border border-line bg-ground px-3 py-2"
          >
            <input
              type="checkbox"
              name="member"
              value={family.id}
              defaultChecked={extra.some((e) => e.id === family.id)}
              className="h-5 w-5 shrink-0 accent-brand"
            />
            <span className="min-w-0 break-words text-ink">{family.name}</span>
          </label>
        ))}
        {/* A family nobody has added yet — which is every family when the list
            is empty, and a circle with nothing to tick is a dead end. */}
        <NewFamilyHere
          label="משפחה חדשה למעגל"
          onAdded={(family: { id: string; name: string }) =>
            setExtra((was) => [...was, family])
          }
        />
      </fieldset>

      <ErrorNote>{state.error}</ErrorNote>

      <button type="submit" disabled={pending} className={chipButton}>
        {pending ? 'רגע…' : 'יצירת המעגל'}
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
      <fieldset className="flex flex-col gap-1">
        <legend className="mb-1 text-xs font-semibold text-muted">מי במעגל</legend>
        {families.map((family) => {
          const inCircle = members.includes(family.id);
          return (
            <label
              key={family.id}
              className="flex items-center gap-3 rounded-xl bg-surface px-3 py-2"
            >
              <input
                type="checkbox"
                checked={inCircle}
                disabled={busy === family.id}
                onChange={() => toggle(family.id, !inCircle)}
                className="h-5 w-5 shrink-0 accent-brand"
              />
              <span className="min-w-0 break-words text-ink">{family.name}</span>
            </label>
          );
        })}
        {/* A family nobody has added yet. Ticking a list of families we already
            have is no use when the one we mean is not in it, and going away to
            add them loses the circle we were in the middle of filling. */}
        <NewInCircle
          circleId={circle.id}
          pending={refreshing}
          onAdded={() => startRefresh(() => router.refresh())}
        />
      </fieldset>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-semibold text-muted">איך אנחנו קוראים לו</span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name.trim() && name !== circle.name && label(name, color)}
          className={field}
        />
      </label>

      <div className="flex flex-col gap-1">
        <span className="text-xs font-semibold text-muted">הצבע שלו אצלנו</span>
        <div className="flex flex-wrap gap-2">
          {CIRCLE_COLORS.map((option) => (
            <button
              key={option.key}
              type="button"
              aria-label={option.label}
              title={option.label}
              aria-pressed={color === option.key}
              onClick={() => {
                setColor(option.key);
                label(name || circle.name, option.key);
              }}
              className={`h-7 w-7 rounded-full ring-1 ring-black/10 transition active:scale-95 ${
                color === option.key ? 'outline-2 outline-offset-2 outline-brand' : ''
              }`}
              style={{ backgroundColor: option.hex }}
            />
          ))}
        </div>
        <span className="text-xs text-muted">{colorName(color)}</span>
      </div>

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
                {leavingBusy ? 'רגע…' : 'כן, לצאת מהמעגל'}
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
        {busy ? 'רגע…' : 'הזמנה למעגל'}
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
