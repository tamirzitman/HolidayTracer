'use client';

import Link from 'next/link';
import { useActionState, useEffect, useRef, useState } from 'react';
import { answer, type ActionResult } from '@/app/actions';
import { formatPhone } from '@/lib/phone';
import type { Answer, Holiday, Household } from '@/lib/types';
import { ErrorNote, Title, card, field, primaryButton, quietButton, secondaryButton } from './ui';

type Props = {
  holiday: Holiday;
  households: Household[];
  /** Which family the person answering belongs to — so nobody answers for the wrong one. */
  householdName: string;
  current: Answer | undefined;
  /** Resolved from the id on the answer — the log itself stores no names. */
  host: { name: string; phone: string } | undefined;
  daysAway: number;
  /** Households that said they are coming to us. Only meaningful when hosting. */
  guests: { id: string; name: string }[];
  /** Set when our host answered that they are not hosting. */
  hostDisagrees: boolean;
  /** Neighbouring holidays inside the month-ahead window, if there are any. */
  earlierKey: string | undefined;
  laterKey: string | undefined;
};

function whenLabel(daysAway: number): string {
  if (daysAway <= 0) return 'היום';
  if (daysAway === 1) return 'מחר';
  return `בעוד ${daysAway} ימים`;
}

/** 2026-09-11 → 11.9.2026 */
function formatDate(date: string): string {
  const [y, m, d] = date.split('-');
  return `${Number(d)}.${Number(m)}.${y}`;
}

export function AnswerForm({
  holiday,
  households,
  householdName,
  current,
  host,
  daysAway,
  guests,
  hostDisagrees,
  earlierKey,
  laterKey,
}: Props) {
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(answer, {});
  const [choosingHost, setChoosingHost] = useState(false);
  const [editing, setEditing] = useState(false);

  // A new answer arrived from the server: drop out of editing and show it back,
  // and mark the moment worth a small celebration.
  const answeredAt = current?.timestamp;
  const seen = useRef(answeredAt);
  const [celebrating, setCelebrating] = useState(false);

  useEffect(() => {
    setEditing(false);
    setChoosingHost(false);
    if (!answeredAt || answeredAt === seen.current) return;
    seen.current = answeredAt;
    setCelebrating(true);
    const timer = setTimeout(() => setCelebrating(false), 2000);
    return () => clearTimeout(timer);
  }, [answeredAt]);

  const answered = current && !editing;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col items-center gap-1 text-center">
        {householdName && (
          <span className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1 text-sm font-semibold text-muted">
            <span aria-hidden="true">🏡</span>
            {householdName}
          </span>
        )}
        <div className="flex w-full items-center justify-center gap-1">
          <Step to={earlierKey} label="החג הקודם" glyph="›" />
          <p className="font-display grow text-4xl leading-tight font-bold text-balance text-ink">
            {holiday.nameHe}
          </p>
          <Step to={laterKey} label="החג הבא" glyph="‹" />
        </div>
        <p className="text-sm text-muted">
          {formatDate(holiday.date)} · {whenLabel(daysAway)}
        </p>
      </header>

      {celebrating && <Celebration kind={current?.kind} />}

      {answered ? (
        <div className={`${card} celebrate-card flex flex-col items-center gap-3 text-center`}>
          {current.kind === 'hosting' ? (
            <p className="font-display text-2xl font-bold text-brand">אנחנו מארחים</p>
          ) : (
            <>
              <p className="font-display text-2xl font-bold text-brand">
                מתארחים אצל {host?.name}
              </p>
              {host?.phone && (
                <a
                  href={`tel:${host.phone}`}
                  dir="ltr"
                  className="text-sm font-semibold text-muted underline underline-offset-4"
                >
                  {formatPhone(host.phone)}
                </a>
              )}
              {hostDisagrees && (
                <p className="text-sm text-muted">שימו לב — הם ענו שהם מתארחים</p>
              )}
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

          {current.kind === 'hosting' && <Guests guests={guests} />}
        </div>
      ) : (
        <form action={formAction} className={`${card} flex flex-col gap-3`}>
          <input type="hidden" name="holidayKey" value={holiday.key} />
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

      <Link href="/history" className={`${quietButton} text-center`}>
        איפה היינו בחגים קודמים
      </Link>
    </div>
  );
}

/**
 * One step through the holidays inside the window. A link rather than a button,
 * so the chosen holiday lives in the URL and survives a refresh.
 */
function Step({ to, label, glyph }: { to: string | undefined; label: string; glyph: string }) {
  const shape = 'grid h-10 w-10 shrink-0 place-items-center rounded-full text-2xl';
  if (!to) return <span aria-hidden="true" className={`${shape} text-transparent`} />;
  return (
    <Link href={`/?h=${encodeURIComponent(to)}`} aria-label={label} className={`${shape} text-brand`}>
      {glyph}
    </Link>
  );
}

/** A small flourish the moment an answer lands. Silent for anyone who asked for less motion. */
function Celebration({ kind }: { kind: AnswerKindLike }) {
  const emoji = kind === 'hosting' ? '🎉' : '🍽️';
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 top-[18vh] z-50 grid place-items-center"
    >
      <div className="relative grid place-items-center">
        <div className="celebrate-burst text-6xl">{emoji}</div>
        {['✨', '🎊', '✨', '🎊', '✨', '🎊'].map((sparkle, i) => (
          <span key={i} className={`celebrate-spark celebrate-spark-${i} absolute text-2xl`}>
            {sparkle}
          </span>
        ))}
      </div>
    </div>
  );
}

type AnswerKindLike = 'hosting' | 'guest' | undefined;

/** Who said they are coming to us — the whole reward for answering "we're hosting". */
function Guests({ guests }: { guests: { id: string; name: string }[] }) {
  return (
    <div className="mt-2 w-full border-t border-line pt-4">
      {guests.length === 0 ? (
        <p className="text-sm text-muted">עדיין אף אחד לא אמר שהוא מגיע</p>
      ) : (
        <>
          <p className="mb-2 text-sm font-semibold text-muted">מגיעים אליכם</p>
          <ul className="flex flex-col gap-1">
            {guests.map((g) => (
              <li key={g.id} className="text-ink">
                {g.name}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
