'use client';

import { useActionState, useEffect, useState } from 'react';
import { editHistory, type ActionResult } from '@/app/actions';
import { formatDayAndDate } from '@/lib/dates';
import { ErrorNote, card, chipButton, field, primaryButton, quietButton, secondaryButton } from './ui';

type Entry = {
  key: string;
  name: string;
  date: string;
  kind: 'hosting' | 'guest' | 'away' | null;
  hostId: string;
  hostName: string;
};


/** Past holidays, correctable. A holiday nobody answered can be filled in too. */
export function HistoryList({
  entries,
  families,
}: {
  entries: Entry[];
  families: { id: string; name: string }[];
}) {
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(editHistory, {});
  const [editing, setEditing] = useState<string | null>(null);
  const [asGuest, setAsGuest] = useState(false);

  // A save came back: close the row rather than leaving "שמירה" sitting there.
  useEffect(() => {
    if (state.savedAt) setEditing(null);
  }, [state.savedAt]);

  return (
    <ul className={`${card} divide-y divide-line p-0`}>
      {entries.map((entry) => {
        const open = editing === entry.key;
        return (
          <li
            key={entry.key}
            className={`flex flex-col gap-2 px-5 py-4 ${entry.kind ? '' : 'bg-brand-wash/40'}`}
          >
            <div className="flex items-baseline justify-between gap-3">
              <div className="flex grow flex-col gap-1">
                <span className="font-display text-lg font-bold text-ink">{entry.name}</span>
                {entry.kind ? (
                  <span className="inline-flex w-fit items-center gap-1.5 text-brand">
                    <span aria-hidden="true">✓</span>
                    <span className="font-semibold">
                      {entry.kind === 'hosting'
                        ? 'אירחנו'
                        : entry.kind === 'guest'
                          ? `היינו אצל ${entry.hostName}`
                          : 'לא היינו'}
                    </span>
                  </span>
                ) : (
                  <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-brand/30 bg-surface px-2.5 py-0.5 text-sm font-bold text-brand">
                    חסר
                  </span>
                )}
                <span className="text-sm text-muted">{formatDayAndDate(entry.date)}</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setAsGuest(entry.kind === 'guest');
                  setEditing(open ? null : entry.key);
                }}
                className={entry.kind || open ? `${quietButton} shrink-0` : chipButton}
              >
                {open ? 'ביטול' : entry.kind ? 'עריכה' : 'מילוי'}
              </button>
            </div>

            {open && (
              <form action={formAction} className="flex flex-col gap-2 pt-1">
                <input type="hidden" name="holidayKey" value={entry.key} />
                {asGuest ? (
                  <>
                    <input type="hidden" name="kind" value="guest" />
                    <select
                      name="hostHouseholdId"
                      required
                      defaultValue={entry.hostId}
                      className={field}
                    >
                      <option value="" disabled>
                        בחרו משפחה
                      </option>
                      {families.map((family) => (
                        <option key={family.id} value={family.id}>
                          {family.name}
                        </option>
                      ))}
                    </select>
                    <button type="submit" disabled={pending} className={primaryButton}>
                      {pending ? 'רגע…' : 'שמירה'}
                    </button>
                    <button type="button" onClick={() => setAsGuest(false)} className={quietButton}>
                      בעצם אירחנו
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="submit"
                      name="kind"
                      value="hosting"
                      disabled={pending}
                      className={secondaryButton}
                    >
                      אירחנו
                    </button>
                    <button type="button" onClick={() => setAsGuest(true)} className={primaryButton}>
                      התארחנו אצל…
                    </button>
                    <button
                      type="submit"
                      name="kind"
                      value="away"
                      disabled={pending}
                      className={quietButton}
                    >
                      לא היינו בכלל
                    </button>
                  </>
                )}
                <ErrorNote>{state.error}</ErrorNote>
              </form>
            )}
          </li>
        );
      })}
    </ul>
  );
}
