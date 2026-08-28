'use client';

import { useActionState, useEffect, useState } from 'react';
import { answer, type ActionResult } from '@/app/actions';
import { formatPhone } from '@/lib/phone';
import type { Answer, Holiday, Household } from '@/lib/types';
import { ErrorNote, Title, card, field, primaryButton, quietButton, secondaryButton } from './ui';

type Props = {
  holiday: Holiday;
  households: Household[];
  current: Answer | undefined;
  daysAway: number;
};

function whenLabel(daysAway: number): string {
  if (daysAway <= 0) return 'היום';
  if (daysAway === 1) return 'מחר';
  return `בעוד ${daysAway} ימים`;
}

export function AnswerForm({ holiday, households, current, daysAway }: Props) {
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(answer, {});
  const [choosingHost, setChoosingHost] = useState(false);
  const [editing, setEditing] = useState(false);

  // A new answer arrived from the server: drop out of editing and show it back.
  const answeredAt = current?.timestamp;
  useEffect(() => {
    setEditing(false);
    setChoosingHost(false);
  }, [answeredAt]);

  const answered = current && !editing;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col items-center gap-1 text-center">
        <p className="font-display text-4xl leading-tight font-bold text-ink">{holiday.nameHe}</p>
        <p className="text-sm text-muted">
          {holiday.hebrewDate} · {whenLabel(daysAway)}
        </p>
      </header>

      {answered ? (
        <div className={`${card} flex flex-col items-center gap-3 text-center`}>
          {current.kind === 'hosting' ? (
            <p className="font-display text-2xl font-bold text-brand">אנחנו מארחים</p>
          ) : (
            <>
              <p className="font-display text-2xl font-bold text-brand">
                מתארחים אצל {current.hostHouseholdName}
              </p>
              <HostPhone households={households} hostId={current.hostHouseholdId} />
            </>
          )}
          <button
            type="button"
            onClick={() => {
              setChoosingHost(false);
              setEditing(true);
            }}
            className={quietButton}
          >
            שינוי תשובה
          </button>
        </div>
      ) : (
        <form action={formAction} className={`${card} flex flex-col gap-3`}>
          <Title>איפה אתם בחג?</Title>

          {!choosingHost ? (
            <>
              <button
                type="submit"
                name="kind"
                value="hosting"
                disabled={pending}
                className={secondaryButton}
              >
                אנחנו מארחים
              </button>
              <button
                type="button"
                onClick={() => setChoosingHost(true)}
                className={primaryButton}
              >
                מתארחים אצל…
              </button>
            </>
          ) : (
            <>
              <input type="hidden" name="kind" value="guest" />
              <select name="hostHouseholdId" required defaultValue="" className={field}>
                <option value="" disabled>
                  בחרו משפחה
                </option>
                {households.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
              </select>
              <button type="submit" disabled={pending} className={primaryButton}>
                {pending ? 'רגע…' : 'אישור'}
              </button>
              <button type="button" onClick={() => setChoosingHost(false)} className={quietButton}>
                חזרה
              </button>
            </>
          )}

          <ErrorNote>{state.error}</ErrorNote>
        </form>
      )}
    </div>
  );
}

function HostPhone({ households, hostId }: { households: Household[]; hostId: string }) {
  const phone = households.find((h) => h.id === hostId)?.phone;
  if (!phone) return null;
  return (
    <a href={`tel:${phone}`} dir="ltr" className="text-sm font-semibold text-muted underline underline-offset-4">
      {formatPhone(phone)}
    </a>
  );
}
