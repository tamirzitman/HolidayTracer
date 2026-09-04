'use client';

import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useRef, useState } from 'react';
import { editHistory, type ActionResult } from '@/app/actions';
import { AddFamilyInline } from './AddFamilyInline';
import { formatDayAndDate } from '@/lib/dates';
import { ErrorNote, card, chipButton, field, primaryButton, quietButton, secondaryButton } from './ui';

type Entry = {
  key: string;
  name: string;
  date: string;
  kind: 'hosting' | 'guest' | 'away' | null;
  hostId: string;
  hostName: string;
  /** Which person in the family gave this answer. */
  byName: string;
};


/** Past holidays, correctable. A holiday nobody answered can be filled in too. */
export function HistoryList({
  entries,
  families,
  inviteUrl,
}: {
  entries: Entry[];
  families: { id: string; name: string }[];
  /** Our standing join link, for a family added here that is not in the app. */
  inviteUrl: string;
}) {
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(editHistory, {});
  const [editing, setEditing] = useState<string | null>(null);
  const [asGuest, setAsGuest] = useState(false);
  const hostSelect = useRef<HTMLSelectElement>(null);
  const router = useRouter();

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
                <span className="text-sm text-muted">
                  {formatDayAndDate(entry.date)}
                  {entry.byName && ` · ענו: ${entry.byName}`}
                </span>
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
                      ref={hostSelect}
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

            {/* Filling in a year of history runs into families nobody has added
                yet — the whole reason a row is blank. Being sent to another
                screen to add one, and then having to find your way back to this
                row, is where people give up.

                Outside the form above, not inside it: this renders a form of its
                own, and a form nested in a form is dropped by the browser, which
                would leave its button quietly submitting the wrong one. */}
            {open && asGuest && (
              <div className="pt-1">
                <AddFamilyInline
                  inviteUrl={inviteUrl}
                  onAdded={(householdId) => {
                    const select = hostSelect.current;
                    if (select) select.value = householdId;
                    router.refresh();
                  }}
                />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
