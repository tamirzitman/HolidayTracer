'use client';

/**
 * A grid of families to tick, all ticked to begin with.
 *
 * Used wherever the answer is almost always "all of them" but sometimes is not:
 * the circle a newcomer starts from, and who can see a family's own occasion.
 * Starting ticked is the point — trimming two is less work than picking twelve,
 * and there is one button for the case where hardly any of them apply.
 */
export function CirclePicker({
  name,
  families,
  chosen,
  onChange,
  legend,
}: {
  /** Form field name; every ticked family is submitted under it. */
  name: string;
  families: { id: string; name: string }[];
  chosen: string[];
  onChange: (next: string[]) => void;
  legend: string;
}) {
  if (families.length === 0) return null;
  const all = families.map((f) => f.id);

  return (
    <fieldset className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <legend className="text-sm font-semibold text-muted">{legend}</legend>
        <button
          type="button"
          onClick={() => onChange(chosen.length === 0 ? all : [])}
          className="shrink-0 text-xs font-bold text-brand underline underline-offset-4"
        >
          {chosen.length === 0 ? 'סמנו הכל' : 'בטלו הכל'}
        </button>
      </div>
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
