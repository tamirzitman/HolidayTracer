'use client';

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  leaveCircle,
  makeCircle,
  nameCircle,
  setCircleMember,
  type ActionResult,
} from '@/app/actions';
import { CIRCLE_COLORS, colorOf, colorName } from '@/lib/circle-colors';
import { ErrorNote, card, chipButton, field, quietButton, sectionHeading } from './ui';

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
 * They do one thing: inside a circle, one family vouching for somebody is
 * enough to suggest them, where outside it takes two. So this screen is about
 * grouping families, not about permissions — nothing here changes who sees
 * which holiday.
 */
export function Circles({
  circles,
  families,
}: {
  circles: CircleView[];
  families: { id: string; name: string }[];
}) {
  const [making, setMaking] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  return (
    <section className={`${card} flex flex-col gap-1 p-0`} id="circles">
      <div className="flex items-baseline justify-between gap-2 px-5 pt-4 pb-1">
        <h2 className={sectionHeading}>המעגלים שלנו</h2>
        {!making && (
          <button
            type="button"
            onClick={() => setMaking(true)}
            className="shrink-0 text-xs font-bold text-brand underline underline-offset-4"
          >
            מעגל חדש
          </button>
        )}
      </div>

      {circles.length === 0 && !making && (
        <p className="px-5 pb-4 text-sm text-muted">
          מעגל מסמן משפחות ששייכות לאותו צד — וכשמשפחה אחת מהמעגל מכירה מישהו, זה
          מספיק כדי להציע אותו לכם. בלי מעגל צריך שתי משפחות שיכירו.
        </p>
      )}

      {making && (
        <NewCircle families={families} onDone={() => setMaking(false)} />
      )}

      {circles.length > 0 && (
        <ul className="divide-y divide-line">
          {circles.map((circle) => (
            <li key={circle.id} className="flex flex-col gap-2 px-5 py-3">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span
                  className="h-3.5 w-3.5 shrink-0 rounded-full ring-1 ring-black/10"
                  style={{ backgroundColor: colorOf(circle.color) }}
                  aria-hidden="true"
                />
                <p className="min-w-0 grow basis-32 font-semibold break-words text-ink">
                  {circle.name}
                </p>
                <span className="text-sm text-muted">
                  {circle.members.length === 0
                    ? 'רק אתם'
                    : `${circle.members.length} משפחות`}
                </span>
                <button
                  type="button"
                  onClick={() => setOpen(open === circle.id ? null : circle.id)}
                  aria-expanded={open === circle.id}
                  className={quietButton}
                >
                  {open === circle.id ? 'סגירה' : 'עריכה'}
                </button>
              </div>

              {open === circle.id && (
                <CircleEditor circle={circle} families={families} />
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
  useEffect(() => {
    if (state.savedAt) onDone();
  }, [state.savedAt, onDone]);

  return (
    <form action={formAction} className="flex flex-col gap-3 border-t border-line px-5 py-4">
      <label className="flex flex-col gap-2">
        <span className="text-sm font-semibold text-muted">איך תקראו למעגל?</span>
        <input name="name" type="text" required placeholder="צד אבא" className={field} />
      </label>

      <fieldset className="flex flex-col gap-1">
        <legend className="mb-2 text-sm font-semibold text-muted">מי שייך אליו?</legend>
        {families.length === 0 ? (
          <p className="text-sm text-muted">עוד אין משפחות במעגל שלכם.</p>
        ) : (
          families.map((family) => (
            <label
              key={family.id}
              className="flex items-center gap-3 rounded-xl border border-line bg-ground px-3 py-2"
            >
              <input
                type="checkbox"
                name="member"
                value={family.id}
                className="h-5 w-5 shrink-0 accent-brand"
              />
              <span className="min-w-0 break-words text-ink">{family.name}</span>
            </label>
          ))
        )}
      </fieldset>

      <ErrorNote>{state.error}</ErrorNote>

      <div className="flex items-center gap-4">
        <button type="submit" disabled={pending} className={chipButton}>
          {pending ? 'רגע…' : 'יצירת המעגל'}
        </button>
        <button type="button" onClick={onDone} className={quietButton}>
          ביטול
        </button>
      </div>
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
}: {
  circle: CircleView;
  families: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [name, setName] = useState(circle.name);
  const [color, setColor] = useState(circle.color);
  const [leaving, setLeaving] = useState(false);
  // Ticked now, saved after. The box is bound to the sheet, and the sheet is a
  // round trip away — so without this the tick springs back and the row reads
  // as broken until the answer lands. A refusal puts it back where it was.
  const [members, setMembers] = useState(circle.members);

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

      {leaving ? (
        <div className="flex items-center gap-4">
          <button
            type="button"
            disabled={busy === 'leave'}
            onClick={async () => {
              setBusy('leave');
              await leaveCircle(circle.id);
              setBusy(null);
              router.refresh();
            }}
            className={quietButton}
          >
            {busy === 'leave' ? 'רגע…' : 'כן, לצאת מהמעגל'}
          </button>
          <button type="button" onClick={() => setLeaving(false)} className="text-sm text-muted">
            ביטול
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => setLeaving(true)} className="self-start text-sm text-muted underline underline-offset-4">
          לצאת מהמעגל
        </button>
      )}

      <p className="text-xs text-muted">
        השם והצבע הם שלנו בלבד — מי שאיתנו במעגל רואה אותו בשם שהוא נתן לו. משפחה
        שמישהו אחר הוסיף, רק הוא יכול להוציא.
      </p>
    </div>
  );
}
