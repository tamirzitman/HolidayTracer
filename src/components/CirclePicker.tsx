'use client';

import { colorOf } from '@/lib/circle-colors';
import { miniButton } from './ui';

/**
 * A grid of families to tick, all ticked to begin with — and, above it, the
 * circles as a way of ticking them a group at a time.
 *
 * Used wherever the answer is almost always "all of them" but sometimes is not:
 * the circle a newcomer starts from, and who can see a family's own occasion.
 * Starting ticked is the point — trimming two is less work than picking twelve,
 * and there is one button for the case where hardly any of them apply.
 *
 * The circles matter most on the longer lists. "Who sees this date" is nearly
 * always a side of the family rather than a set of households somebody assembled
 * one at a time, and on a list of twenty that is twenty decisions instead of
 * one. A chip is filled when everybody in it is ticked, half when some are — so
 * it also reads as a summary of what has been chosen, which a column of
 * checkboxes never does.
 */
export function CirclePicker({
  name,
  families,
  chosen,
  onChange,
  legend,
  circles = [],
  tags = {},
}: {
  /** Form field name; every ticked family is submitted under it. */
  name: string;
  families: { id: string; name: string }[];
  chosen: string[];
  onChange: (next: string[]) => void;
  legend: string;
  /** Our circles, for picking a whole side of the family at once. */
  circles?: { id: string; name: string; color: string }[];
  /** Which circles each family is in. */
  tags?: Record<string, { id: string; name: string; color: string }[]>;
}) {
  if (families.length === 0) return null;
  const all = families.map((f) => f.id);

  /** The families on this list that belong to a circle. */
  const membersOf = (circleId: string) =>
    families.filter((f) => (tags[f.id] ?? []).some((t) => t.id === circleId)).map((f) => f.id);

  const worthShowing = circles.filter((c) => membersOf(c.id).length > 0);

  return (
    <fieldset className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <legend className="text-sm font-semibold text-muted">{legend}</legend>
        <button
          type="button"
          onClick={() => onChange(chosen.length === 0 ? all : [])}
          className={miniButton}
        >
          {chosen.length === 0 ? 'סמנו הכל' : 'בטלו הכל'}
        </button>
      </div>

      {worthShowing.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {worthShowing.map((circle) => {
            const mine = membersOf(circle.id);
            const on = mine.filter((id) => chosen.includes(id));
            const whole = on.length === mine.length;
            const some = on.length > 0 && !whole;
            return (
              <button
                key={circle.id}
                type="button"
                aria-pressed={whole}
                onClick={() =>
                  onChange(
                    whole
                      ? chosen.filter((id) => !mine.includes(id))
                      : [...new Set([...chosen, ...mine])],
                  )
                }
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold transition active:scale-95 ${
                  whole
                    ? 'border-brand/40 bg-brand-wash text-brand'
                    : 'border-line bg-surface text-muted'
                }`}
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/10"
                  style={{
                    backgroundColor: colorOf(circle.color),
                    // Half-filled says "some of these", which is a state a tick
                    // box cannot show and this list is often in.
                    opacity: whole ? 1 : some ? 0.45 : 0.25,
                  }}
                  aria-hidden="true"
                />
                {circle.name}
                {some && <span className="font-normal">· {on.length}/{mine.length}</span>}
              </button>
            );
          })}
        </div>
      )}
      <ul className="grid grid-cols-2 gap-1.5">
        {families.map((family) => {
          const on = chosen.includes(family.id);
          return (
            <li key={family.id}>
              <label
                className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                  on ? 'border-brand/40 bg-brand-wash text-brand' : 'border-line bg-surface text-muted'
                }`}
              >
                <input
                  type="checkbox"
                  name={name}
                  value={family.id}
                  checked={on}
                  onChange={() =>
                    onChange(on ? chosen.filter((id) => id !== family.id) : [...chosen, family.id])
                  }
                  className="h-4 w-4 shrink-0 accent-brand"
                />
                <span className="truncate">{family.name}</span>
              </label>
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}
