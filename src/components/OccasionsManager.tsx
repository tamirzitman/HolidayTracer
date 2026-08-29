'use client';

import { useActionState, useEffect, useState } from 'react';
import {
  createOccasion,
  deleteOccasion,
  shareOccasionWith,
  type ActionResult,
} from '@/app/actions';
import { CirclePicker } from './CirclePicker';
import { formatDayAndDate } from '@/lib/dates';
import { ErrorNote, Title, card, chipButton, field, primaryButton, quietButton } from './ui';

type Family = { id: string; name: string };
type Occasion = { key: string; name: string; date: string; sharedWith: string[] };

/**
 * Dates one family adds for itself — most often simply another holiday, or the
 * day after one, that this family gathers on and others don't.
 *
 * An occasion nobody else can see is one nobody else can answer about, which
 * makes it useless for a gathering. So it goes out to the whole circle unless
 * you say otherwise, and saying otherwise is a tick.
 */
export function OccasionsManager({
  occasions,
  circle,
  today,
}: {
  occasions: Occasion[];
  circle: Family[];
  today: string;
}) {
  const [state, addAction, adding] = useActionState<ActionResult, FormData>(createOccasion, {});
  const [, removeAction] = useActionState<ActionResult, FormData>(deleteOccasion, {});
  const [share, setShare] = useState<string[]>(() => circle.map((f) => f.id));

  // A saved occasion clears the form, so the next one starts from everyone again.
  useEffect(() => {
    if (state.savedAt) setShare(circle.map((f) => f.id));
  }, [state.savedAt, circle]);

  const audience = (occasion: Occasion) => {
    if (circle.length === 0) return 'רק אתם';
    if (occasion.sharedWith.length === 0) return 'פרטי — רק אתם רואים';
    if (occasion.sharedWith.length === circle.length) return 'כל המעגל שלכם רואה';
    return `${occasion.sharedWith.length} מתוך ${circle.length} מהמשפחות שלכם`;
  };

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col items-center gap-2 text-center">
        <span className="text-4xl" aria-hidden="true">🗓️</span>
        <Title>המועדים שלנו</Title>
        <p className="text-muted">תאריכים נוספים שאתם נפגשים בהם, ואחרים לא.</p>
      </header>

      {occasions.length > 0 && (
        <ul className={`${card} divide-y divide-line p-0`}>
          {occasions.map((occasion) => (
            <Row
              key={occasion.key}
              occasion={occasion}
              circle={circle}
              audience={audience(occasion)}
              removeAction={removeAction}
            />
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

        <CirclePicker
          name="share"
          families={circle}
          chosen={share}
          onChange={setShare}
          legend="מי רואה את המועד הזה?"
        />

        <ErrorNote>{state.error}</ErrorNote>

        <button type="submit" disabled={adding} className={primaryButton}>
          {adding ? 'רגע…' : 'הוספה'}
        </button>
      </form>
    </div>
  );
}

function Row({
  occasion,
  circle,
  audience,
  removeAction,
}: {
  occasion: Occasion;
  circle: Family[];
  audience: string;
  removeAction: (formData: FormData) => void;
}) {
  const [state, shareAction, saving] = useActionState<ActionResult, FormData>(shareOccasionWith, {});
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<string[]>(occasion.sharedWith);

  // Close on the way back from a save, so the button stops looking unpressed.
  useEffect(() => {
    if (state.savedAt) setOpen(false);
  }, [state.savedAt]);

  return (
    <li className="flex flex-col gap-3 px-5 py-3.5">
      <div className="flex items-center gap-3">
        <div className="min-w-0 grow">
          <p className="truncate font-semibold text-ink">{occasion.name}</p>
          <p className="text-sm text-muted">{formatDayAndDate(occasion.date)}</p>
          <p className="text-xs text-muted">{audience}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {circle.length > 0 && (
            <button type="button" onClick={() => setOpen(!open)} className={chipButton}>
              {open ? 'ביטול' : 'מי רואה'}
            </button>
          )}
          <form action={removeAction}>
            <input type="hidden" name="holidayKey" value={occasion.key} />
            <button type="submit" className={`${quietButton} shrink-0`}>
              הסרה
            </button>
          </form>
        </div>
      </div>

      {open && (
        <form action={shareAction} className="flex flex-col gap-3 border-t border-line pt-3">
          <input type="hidden" name="holidayKey" value={occasion.key} />
          <CirclePicker
            name="share"
            families={circle}
            chosen={chosen}
            onChange={setChosen}
            legend="מי רואה את המועד הזה?"
          />
          <ErrorNote>{state.error}</ErrorNote>
          <button type="submit" disabled={saving} className={primaryButton}>
            {saving ? 'רגע…' : 'שמירה'}
          </button>
        </form>
      )}
    </li>
  );
}
