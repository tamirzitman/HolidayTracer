'use client';

import { useActionState } from 'react';
import { createOccasion, deleteOccasion, type ActionResult } from '@/app/actions';
import { formatDayAndDate } from '@/lib/dates';
import { ErrorNote, Title, card, field, primaryButton, quietButton } from './ui';

/**
 * Dates one family adds for itself — most often simply another holiday, or the
 * day after one, that this family gathers on and others don't. They belong to
 * whoever added them: nobody else's list grows because of yours.
 */
export function OccasionsManager({
  occasions,
  today,
}: {
  occasions: { key: string; name: string; date: string }[];
  today: string;
}) {
  const [state, addAction, adding] = useActionState<ActionResult, FormData>(createOccasion, {});
  const [, removeAction] = useActionState<ActionResult, FormData>(deleteOccasion, {});

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col items-center gap-2 text-center">
        <span className="text-4xl" aria-hidden="true">🗓️</span>
        <Title>המועדים שלנו</Title>
        <p className="text-muted">תאריכים נוספים שרק המשפחה שלכם רואה.</p>
      </header>

      {occasions.length > 0 && (
        <ul className={`${card} divide-y divide-line p-0`}>
          {occasions.map((occasion) => (
            <li key={occasion.key} className="flex items-center gap-3 px-5 py-3.5">
              <div className="grow">
                <p className="font-semibold text-ink">{occasion.name}</p>
                <p className="text-sm text-muted">{formatDayAndDate(occasion.date)}</p>
              </div>
              <form action={removeAction}>
                <input type="hidden" name="holidayKey" value={occasion.key} />
                <button type="submit" className={`${quietButton} shrink-0`}>
                  הסרה
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}

      <form action={addAction} className={`${card} flex flex-col gap-3`}>
        <h2 className="font-display text-xl font-bold text-ink">הוספת מועד</h2>

        <label className="flex flex-col gap-2">
          <span className="text-sm font-semibold text-muted">שם</span>
          <input name="name" type="text" required placeholder="שם האירוע" className={field} />
        </label>

        <label className="flex flex-col gap-2">
          <span className="text-sm font-semibold text-muted">תאריך</span>
          <input name="date" type="date" required defaultValue={today} className={field} />
        </label>

        <ErrorNote>{state.error}</ErrorNote>

        <button type="submit" disabled={adding} className={primaryButton}>
          {adding ? 'רגע…' : 'הוספה'}
        </button>
      </form>
    </div>
  );
}
