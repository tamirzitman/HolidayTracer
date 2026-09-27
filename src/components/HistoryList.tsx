'use client';

import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useRef, useState } from 'react';
import { editHistory, type ActionResult } from '@/app/actions';
import { AddFamilyInline } from './AddFamilyInline';
import { AnswerForThem } from './AnswerForm';
import { CircleDots, CircleLegend } from './Circles';
import { colorOf } from '@/lib/circle-colors';
import { formatDayAndDate } from '@/lib/dates';
import {
  BackButton,
  Busy,
  ErrorNote,
  ChevronIcon,
  HostCandle,
  Tag,
  card,
  chipButton,
  field,
  miniButton,
  primaryButton,
  quietButton,
  secondaryButton,
} from './ui';

type Entry = {
  key: string;
  name: string;
  date: string;
  kind: 'hosting' | 'guest' | 'away' | null;
  hostId: string;
  hostName: string;
  /** Which person in the family gave this answer. */
  byName: string;
  /** What each family in our circle said about this holiday, in circle order. */
  others: Other[];
};

type Other = {
  id: string;
  name: string;
  kind: string;
  hostName: string;
  byName: string;
  /** Said for them by somebody in the circle — so it can still be corrected. */
  byProxy: boolean;
};


/** Past holidays, correctable. A holiday nobody answered can be filled in too. */
export function HistoryList({
  entries,
  families,
  hostsFor,
  circles,
  tags,
}: {
  entries: Entry[];
  families: { id: string; name: string }[];
  /** Per family, whom *they* could have been at — their list, not ours. */
  hostsFor: Record<string, { id: string; name: string }[]>;
  /** Our circles, for the legend that says what the colours on the rows mean. */
  circles: { id: string; name: string; color: string }[];
  /** Which circles each family is in — the same dots as everywhere else. */
  tags: Record<string, { id: string; name: string; color: string }[]>;
  /** Our standing join link, for a family added here that is not in the app. */
}) {
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(editHistory, {});
  const [editing, setEditing] = useState<string | null>(null);
  // Which row has everybody else's answers open. Apart from `editing`, so
  // filling in our own row does not fold away the families under it.
  const [showing, setShowing] = useState<string | null>(null);
  const [asGuest, setAsGuest] = useState(false);
  const hostSelect = useRef<HTMLSelectElement>(null);
  const router = useRouter();

  // A save came back: close the row rather than leaving "שמירה" sitting there.
  useEffect(() => {
    if (state.savedAt) setEditing(null);
  }, [state.savedAt]);

  return (
    <div className="flex flex-col gap-2">
      {/* The holiday screen names its colours in the headings it groups by.
          This list is in date order and cannot, so the names are said once
          here — otherwise a dot beside a host is a colour and nothing more. */}
      <CircleLegend circles={circles} />
      <ul className={`${card} divide-y divide-line p-0`}>
        {entries.map((entry) => {
          const open = editing === entry.key;
          // Whose circles this row is coloured by: the family we were at.
          const hostTags = (entry.kind === 'guest' && tags[entry.hostId]) || [];
          // The years we hosted have no other family to colour them by, so they
          // were the only answered rows here with nothing down the edge at all
          // — the ones most worth finding, left blank.
          const weHosted = entry.kind === 'hosting';
          const stripe = weHosted
            ? 'var(--color-host)'
            : hostTags.length === 0
              ? 'transparent'
              : hostTags.length === 1
                ? colorOf(hostTags[0].color)
                : `linear-gradient(to bottom, ${hostTags.map((t) => colorOf(t.color)).join(', ')})`;
          return (
            <li
              key={entry.key}
              // The anchor a past holiday's card on the question screen links
              // to. Landing on this tab and then hunting the year for the row
              // you just came from is the errand that link exists to remove.
              id={entry.key}
              className={`flex scroll-mt-20 gap-3 px-5 py-4 target:ring-2 target:ring-brand/40 target:ring-inset ${
                weHosted ? 'bg-host-wash/60' : entry.kind ? '' : 'bg-brand-wash/40'
              }`}
            >
              {/* The same strip down the edge as on the holiday screen, so the
                  year can be scanned for one circle without reading the names. */}
              <span
                className="w-1 shrink-0 self-stretch rounded-full"
                style={{ background: stripe }}
                aria-hidden="true"
              />
              <div className="flex min-w-0 grow flex-col gap-2">
                <div className="flex items-baseline justify-between gap-3">
                  <div className="flex grow flex-col gap-1">
                    <span className="font-display text-lg font-bold text-ink">{entry.name}</span>
                    {entry.kind ? (
                      <span
                        className={`inline-flex w-fit items-center gap-1.5 ${
                          weHosted ? 'text-host' : 'text-brand'
                        }`}
                      >
                        {weHosted ? <HostCandle /> : <span aria-hidden="true">✓</span>}
                        <span className="font-semibold">
                          {entry.kind === 'hosting'
                            ? 'אירחנו'
                            : entry.kind === 'guest'
                              ? `היינו אצל ${entry.hostName}`
                              : 'לא היינו'}
                        </span>
                        <CircleDots tags={hostTags} />
                      </span>
                    ) : (
                      <Tag tone="brand">חסר</Tag>
                    )}
                    <span className="text-sm text-muted">
                      {formatDayAndDate(entry.date)}
                      {entry.byName && ` · ענו: ${entry.byName}`}
                    </span>
                  </div>
                  {open ? (
                    <BackButton onClick={() => setEditing(null)} />
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setAsGuest(entry.kind === 'guest');
                        setEditing(entry.key);
                      }}
                      className={entry.kind ? `${quietButton} shrink-0` : chipButton}
                    >
                      {entry.kind ? 'עריכה' : 'מילוי'}
                    </button>
                  )}
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
                          <Busy busy={pending}>שמירה</Busy>
                        </button>
                        <button
                          type="button"
                          onClick={() => setAsGuest(false)}
                          className={`${quietButton} self-center`}
                        >
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
                          className={`${quietButton} self-center`}
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
                      onAdded={(householdId) => {
                        const select = hostSelect.current;
                        if (select) select.value = householdId;
                        router.refresh();
                      }}
                    />
                  </div>
                )}

                {/* The rest of the circle for this holiday, behind one line so
                    a year of rows stays a year of rows. The grandfather who
                    never opens the app has a history too, and the only people
                    who can fill it in are the ones who were at the table. */}
                {entry.others.length > 0 && (
                  <Others
                    entry={entry}
                    open={showing === entry.key}
                    onToggle={() => setShowing(showing === entry.key ? null : entry.key)}
                    hostsFor={hostsFor}
                    tags={tags}
                  />
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Past tense, as on a past holiday's card: the moment to answer has gone. */
function said(kind: string, hostName: string): string {
  if (kind === 'hosting') return 'אירחו';
  if (kind === 'guest') return `היו אצל ${hostName}`;
  if (kind === 'away') return 'לא הגיעו';
  return 'לא ענו';
}

/**
 * Where everyone else was, for one past holiday — the circle list from the
 * holiday screen, with the same rule about whose answer is whose: a gap, or
 * something said for them, can be filled in by anyone here; what a family said
 * for itself stands.
 */
function Others({
  entry,
  open,
  onToggle,
  hostsFor,
  tags,
}: {
  entry: Entry;
  open: boolean;
  onToggle: () => void;
  hostsFor: Record<string, { id: string; name: string }[]>;
  tags: Record<string, { id: string; name: string; color: string }[]>;
}) {
  const answered = entry.others.filter((o) => o.kind !== 'none').length;
  return (
    <div className="flex flex-col gap-2">
      {/* Closed, a button that says what opens and how much of it is filled
          in. Open, the same arrow that steps back everywhere else — a word for
          closing here and an arrow there read as two different things. */}
      {open ? (
        <div className="flex items-center gap-2">
          <BackButton onClick={onToggle} />
          <p className="text-xs text-muted">
            איפה היו כולם · {answered}/{entry.others.length}
          </p>
        </div>
      ) : (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={false}
          className={`${miniButton} self-start`}
        >
          איפה היו כולם · {answered}/{entry.others.length}
          <ChevronIcon className="h-3.5 w-3.5 text-brand" />
        </button>
      )}
      {open && (
        <ul className="flex flex-col divide-y divide-line rounded-2xl border border-line">
          {entry.others.map((family) => (
            <li key={family.id} className="flex flex-col gap-2 px-3 py-2.5">
              <div className="flex items-baseline justify-between gap-x-3">
                <div className="min-w-0 grow">
                  <p className="flex items-center gap-1.5 font-semibold text-ink">
                    <span className="truncate">{family.name}</span>
                    <CircleDots tags={tags[family.id] ?? []} />
                  </p>
                  {family.byName && (
                    <p className="text-xs text-muted">
                      ענו: {family.byName}
                      {family.byProxy && ' · בשבילם'}
                    </p>
                  )}
                </div>
                <span
                  className={`w-2/5 shrink-0 text-start text-sm ${
                    family.kind === 'none' ? 'text-muted' : 'font-semibold text-brand'
                  }`}
                >
                  {said(family.kind, family.hostName)}
                </span>
              </div>
              {(family.kind === 'none' || family.byProxy) && (
                <AnswerForThem
                  family={family}
                  holidayKey={entry.key}
                  hosts={hostsFor[family.id] ?? []}
                  past
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
