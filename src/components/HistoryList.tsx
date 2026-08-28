'use client';

import { useActionState, useState } from 'react';
import { editHistory, type ActionResult } from '@/app/actions';
import { ErrorNote, card, field, primaryButton, quietButton, secondaryButton } from './ui';

type Entry = {
  key: string;
  name: string;
  date: string;
  kind: 'hosting' | 'guest' | null;
  hostId: string;
  hostName: string;
};

const formatDate = (date: string) => date.split('-').reverse().map(Number).join('.');

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

  return (
    <ul className={`${card} divide-y divide-line p-0`}>
      {entries.map((entry) => {
        const open = editing === entry.key;
        return (
          <li key={entry.key} className="flex flex-col gap-2 px-5 py-4">
            <div className="flex items-baseline justify-between gap-3">
              <div className="flex flex-col gap-0.5">
                <span className="font-display text-lg font-bold text-ink">{entry.name}</span>
                <span className={entry.kind ? 'text-muted' : 'text-sm text-muted'}>
                  {entry.kind === 'hosting'
                    ? 'אירחנו'
                    : entry.kind === 'guest'
                      ? `היינו אצל ${entry.hostName}`
                      : 'לא נרשם'}
                </span>
                <span className="text-sm text-muted">{formatDate(entry.date)}</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setAsGuest(entry.kind === 'guest');
                  setEditing(open ? null : entry.key);
                }}
                className={quietButton}
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
