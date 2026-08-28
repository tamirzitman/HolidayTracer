'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useOptimistic, useRef, useState } from 'react';
import { answer, type ActionResult } from '@/app/actions';
import { AddFamilyInline } from './AddFamilyInline';
import { formatPhone } from '@/lib/phone';
import type { Answer, Holiday, Household } from '@/lib/types';
import { formatDayAndDate } from '@/lib/dates';
import { holidayEmoji } from '@/lib/holiday-emoji';
import { DatePill, ErrorNote, Title, card, field, primaryButton, quietButton, secondaryButton } from './ui';

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
  /** Where everyone in the circle is. Empty until we have answered ourselves. */
  circleStatus: { id: string; name: string; kind: string; hostName: string }[];
  /** Set when our host answered that they are not hosting. */
  hostDisagrees: boolean;
  /** Neighbouring holidays inside the month-ahead window, if there are any. */
  earlierKey: string | undefined;
  laterKey: string | undefined;
  /** Where this holiday sits in the round of the year, for the pager. */
  position: { index: number; total: number };
};

/** The same height whether the holiday has been answered or not. */
const cardFloor = 'min-h-[17.5rem]';

function whenLabel(daysAway: number): string {
  if (daysAway <= 0) return 'היום';
  if (daysAway === 1) return 'מחר';
  return `בעוד ${daysAway} ימים`;
}



export function AnswerForm({
  holiday,
  households,
  householdName,
  current,
  host,
  daysAway,
  guests,
  circleStatus,
  hostDisagrees,
  earlierKey,
  laterKey,
  position,
}: Props) {
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(answer, {});
  const [choosingHost, setChoosingHost] = useState(false);
  const [editing, setEditing] = useState(false);
  const router = useRouter();

  // Show the answer the instant it is given; the sheet catches up behind it.
  const [optimistic, setOptimistic] = useOptimistic<Answer | undefined, Answer>(
    current,
    (_prev, next) => next,
  );

  // Opening the list should be one tap, not two.
  const hostSelect = useRef<HTMLSelectElement>(null);
  useEffect(() => {
    if (!choosingHost) return;
    const select = hostSelect.current;
    if (!select) return;
    select.focus();
    try {
      (select as HTMLSelectElement & { showPicker?: () => void }).showPicker?.();
    } catch {
      // Not every browser will open it for us; the field is focused either way.
    }
  }, [choosingHost]);

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

  const shown = optimistic;
  const answered = shown && !editing;

  // Both neighbours are fetched up front, so a swipe lands on a page that is
  // already there instead of waiting for a round trip.
  const href = (key: string) => `/?h=${encodeURIComponent(key)}`;
  useEffect(() => {
    for (const key of [earlierKey, laterKey]) if (key) router.prefetch(href(key));
  }, [earlierKey, laterKey, router]);

  // Swiping beats aiming at a small arrow, but only if the page moves with the
  // finger — a gesture that does nothing until it is released feels broken. The
  // offset is written straight to the node so dragging doesn't re-render.
  const slider = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; axis: 'x' | 'y' | null; dx: number } | null>(null);

  const offsetBy = (x: number, settle: boolean) => {
    const el = slider.current;
    if (!el) return;
    el.style.transition = settle ? 'transform 220ms ease-out, opacity 220ms ease-out' : 'none';
    el.style.transform = `translateX(${x}px)`;
    el.style.opacity = String(1 - Math.min(Math.abs(x) / 260, 0.45));
  };

  const onTouchStart = (e: React.TouchEvent) => {
    drag.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, axis: null, dx: 0 };
  };

  const onTouchMove = (e: React.TouchEvent) => {
    const from = drag.current;
    if (!from) return;
    const dx = e.touches[0].clientX - from.x;
    const dy = e.touches[0].clientY - from.y;

    // Decide once whether this is a sideways gesture or a scroll, so a swipe
    // that drifts doesn't turn into a page that jitters.
    if (!from.axis) {
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
      from.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    }
    if (from.axis !== 'x') return;

    // In a right-to-left page the next holiday sits to the left, so dragging
    // leftwards brings it in. With nothing to reach for, the page resists.
    from.dx = dx;
    offsetBy((dx < 0 ? laterKey : earlierKey) ? dx : dx / 5, false);
  };

  const onTouchEnd = () => {
    const from = drag.current;
    drag.current = null;
    offsetBy(0, true);
    if (!from || from.axis !== 'x' || Math.abs(from.dx) < 55) return;
    const to = from.dx < 0 ? laterKey : earlierKey;
    if (to) router.push(href(to));
  };

  return (
    <div
      className="flex flex-col gap-5 [touch-action:pan-y]"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* Who you are, and adding a date of your own. Both hold still while the
          holidays travel past them. */}
      <div className="flex w-full flex-wrap items-center justify-center gap-2">
        {householdName && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-brand/25 bg-brand-wash px-4 py-2.5 text-sm font-bold text-brand">
            <span aria-hidden="true">🏡</span>
            {householdName}
          </span>
        )}
        <Link
          href="/occasions"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-line px-4 py-2.5 text-sm font-bold text-muted transition hover:border-brand/40 hover:text-brand"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
            <path d="M12 5.5v13M5.5 12h13" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
          </svg>
          מועד
        </Link>
      </div>

      {/* Only this panel travels: the holiday and the answer that belongs to it.
          Everything around it — who you are, the pager, the tab bar — stays
          where it is, so it is obvious what is being paged. */}
      <div ref={slider} className="flex flex-col gap-6">
        <header className="flex flex-col items-center gap-1 text-center">
          <span className="text-5xl leading-none" aria-hidden="true">
            {holidayEmoji(holiday.key)}
          </span>
          <div className="mt-1 flex w-full items-center justify-between gap-2">
            <Step to={earlierKey} label="החג הקודם" points="earlier" />
            <p className="font-display grow text-4xl leading-tight font-bold text-balance text-ink">
              {holiday.nameHe}
            </p>
            <Step to={laterKey} label="החג הבא" points="later" />
          </div>
          <DatePill>
            <span>{formatDayAndDate(holiday.date)}</span>
            <span aria-hidden="true" className="text-line">|</span>
            <span className="font-semibold text-ink">{whenLabel(daysAway)}</span>
          </DatePill>
        </header>

        {celebrating && <Celebration kind={shown?.kind} />}

        {/* Answered and unanswered holidays fill a card to different heights, and
            swiping through a half-filled year made the page grow and shrink under
            the finger. Both cards keep the same floor, so the space sits inside
            the card where it looks intended rather than as a hole beneath it. */}
        <div className="flex flex-col">
          {answered ? (
            <div className={`${card} ${cardFloor} celebrate-card flex flex-col items-center justify-center gap-3 text-center`}>
              {shown.kind === 'hosting' ? (
                <p className="font-display text-3xl font-bold text-brand">אנחנו מארחים</p>
              ) : shown.kind === 'away' ? (
                <p className="font-display text-3xl font-bold text-brand">לא מגיעים</p>
              ) : (
                <>
                  <p className="font-display text-3xl leading-snug font-bold text-balance text-brand">
                    מתארחים אצל{' '}
                    {host?.name ?? households.find((h) => h.id === shown.hostHouseholdId)?.name}
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
                    <p className="mt-1 rounded-xl border border-line bg-ground px-3 py-2 text-sm text-muted">
                      <span aria-hidden="true">⚠️ </span>
                      שימו לב — הם ענו שהם מתארחים
                    </p>
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

              {shown.kind === 'hosting' && <Guests guests={guests} />}
            </div>
          ) : (
            <form
              action={(data) => {
                const kind = String(data.get('kind') ?? '') as Answer['kind'];
                const hostId = String(data.get('hostHouseholdId') ?? '');
                setOptimistic({
                  timestamp: new Date().toISOString(),
                  holidayKey: holiday.key,
                  kind,
                  hostHouseholdId: hostId,
                  byPhone: '',
                  householdId: '',
                });
                formAction(data);
              }}
              className={`${card} ${cardFloor} flex flex-col justify-center gap-3`}
            >
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
                  <button
                    type="submit"
                    name="kind"
                    value="away"
                    disabled={pending}
                    className={quietButton}
                  >
                    לא מגיעים בכלל
                  </button>
                </>
              ) : (
                <>
                  <input type="hidden" name="kind" value="guest" />
                  <select
                    ref={hostSelect}
                    name="hostHouseholdId"
                    required
                    defaultValue=""
                    className={field}
                  >
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
      </div>

      {/* Under the panel, where a pager belongs: without it the year looks like
          one holiday and nothing says the page moves at all. */}
      {position.total > 1 && (
        <div className="flex flex-col items-center gap-1.5">
          <div className="flex items-center justify-center gap-1.5">
            {Array.from({ length: position.total }, (_, i) => (
              <span
                key={i}
                aria-hidden="true"
                className={`h-1.5 rounded-full transition-all ${
                  i === position.index ? 'w-5 bg-brand' : 'w-1.5 bg-line'
                }`}
              />
            ))}
          </div>
          <p className="text-xs text-muted">
            {position.index + 1} מתוך {position.total} · החליקו לצדדים
          </p>
        </div>
      )}

      {!answered && choosingHost && <AddFamilyInline />}

      {answered && circleStatus.length > 0 && <Circle families={circleStatus} />}

    </div>
  );
}

/**
 * One step through the holidays inside the window. A link rather than a button,
 * so the chosen holiday lives in the URL and survives a refresh.
 *
 * The chevron is drawn, not typed: ‹ and › are mirrored by the browser in a
 * right-to-left page, so a typed glyph points the wrong way.
 */
function Step({
  to,
  label,
  points,
}: {
  to: string | undefined;
  label: string;
  points: 'earlier' | 'later';
}) {
  const shape = 'grid h-12 w-12 shrink-0 place-items-center rounded-full';
  if (!to) return <span aria-hidden="true" className={shape} />;

  // In a right-to-left page, later is to the left.
  const d = points === 'later' ? 'M15 5 L8 12 L15 19' : 'M9 5 L16 12 L9 19';
  return (
    <Link
      href={`/?h=${encodeURIComponent(to)}`}
      aria-label={label}
      className={`${shape} border border-line bg-surface text-brand transition active:scale-95`}
    >
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" aria-hidden="true">
        <path d={d} stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </Link>
  );
}

/** Where the rest of the circle is — visible only once you have answered. */
function Circle({ families }: { families: { id: string; name: string; kind: string; hostName: string }[] }) {
  const said = (kind: string, hostName: string) => {
    if (kind === 'hosting') return 'מארחים';
    if (kind === 'guest') return `אצל ${hostName}`;
    if (kind === 'away') return 'לא מגיעים';
    return 'עוד לא ענו';
  };

  return (
    <section className={`${card} flex flex-col gap-1 p-0`}>
      <h2 className="px-5 pt-4 pb-1 text-sm font-bold text-muted">איפה כולם</h2>
      <ul className="divide-y divide-line">
        {families.map((family) => (
          <li key={family.id} className="flex items-baseline justify-between gap-3 px-5 py-3">
            <span className="font-semibold text-ink">{family.name}</span>
            <span className={family.kind === 'none' ? 'text-sm text-muted' : 'text-sm font-semibold text-brand'}>
              {said(family.kind, family.hostName)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** A small flourish the moment an answer lands. Silent for anyone who asked for less motion. */
function Celebration({ kind }: { kind: AnswerKindLike }) {
  const emoji = kind === 'hosting' ? '🎉' : kind === 'away' ? '👋' : '🍽️';
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

type AnswerKindLike = 'hosting' | 'guest' | 'away' | undefined;

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
