'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useOptimistic, useRef, useState } from 'react';
import { answer, answerFor, type ActionResult } from '@/app/actions';
import { AddFamilyInline } from './AddFamilyInline';
import { NextStep } from './NextStep';
import { FamilyWhatsApp, WhatsAppMark, type Member } from './WhatsApp';
import { remindAbout } from '@/lib/whatsapp';
import type { NextStep as Step } from '@/lib/next-step';
import type { Answer, Holiday, Household } from '@/lib/types';
import { formatDayAndDate } from '@/lib/dates';
import { holidayEmoji } from '@/lib/holiday-emoji';
import {
  BackButton,
  DatePill,
  ErrorNote,
  Title,
  card,
  chipButton,
  field,
  primaryButton,
  quietButton,
  secondaryButton,
  sectionHeading,
} from './ui';

type Props = {
  holiday: Holiday;
  households: Household[];
  current: Answer | undefined;
  /** Resolved from the id on the answer — the log itself stores no names. */
  host: { id: string; name: string; members: Member[] } | undefined;
  daysAway: number;
  /** Which person gave this answer. */
  answeredBy: string;
  /** True when it was written because a guest said they were coming here. */
  impliedByGuest: boolean;
  /** Our family's standing join link, for writing to families nobody has joined. */
  inviteUrl: string;
  /** Households that said they are coming to us. Only meaningful when hosting. */
  guests: { id: string; name: string; members: Member[] }[];
  /** Where everyone in the circle is. Empty until we have answered ourselves. */
  circleStatus: {
    id: string;
    name: string;
    kind: string;
    hostName: string;
    byName: string;
    /** Answered on their behalf by somebody in the circle — so it can be corrected. */
    byProxy: boolean;
    members: Member[];
  }[];
  /** How many families are on our list, for what to promise before answering. */
  circleSize: number;
  /**
   * Our own family. Answering on somebody's behalf has to be able to say they
   * are coming to us — which is the commonest thing there is to say for the
   * grandfather who will never open the app — and a list of everyone but us
   * could not say it.
   */
  us: { id: string; name: string };
  /** The app's own address, for a reminder that carries a way in. */
  appUrl: string;
  /** The one thing worth doing next, or nothing when there is nothing. */
  nextStep: Step;
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

type Towards = 'later' | 'earlier';

/** Which way the last move went, so the holiday arriving knows where to enter from. */
const CAME_FROM = 'holidaytracer:came-from';

function whenLabel(daysAway: number): string {
  if (daysAway <= 0) return 'היום';
  if (daysAway === 1) return 'מחר';
  return `בעוד ${daysAway} ימים`;
}



export function AnswerForm({
  holiday,
  households,
  current,
  host,
  daysAway,
  answeredBy,
  impliedByGuest,
  inviteUrl,
  guests,
  circleStatus,
  circleSize,
  us,
  appUrl,
  nextStep,
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

  /**
   * Leaving for a neighbouring holiday. The holiday being left slides away in
   * the direction of travel and the one arriving comes in from the other side,
   * so a move reads as a move rather than as the screen simply changing. Which
   * way it came from has to survive the navigation, hence the note to self.
   */
  const pageTo = (towards: Towards) => {
    const to = towards === 'later' ? laterKey : earlierKey;
    if (!to) return;
    try {
      sessionStorage.setItem(CAME_FROM, towards);
    } catch {
      // Private mode, or storage turned off: the arrival just won't animate.
    }
    const el = slider.current;
    if (el) {
      el.style.transition = 'transform 170ms ease-in, opacity 170ms ease-in';
      el.style.transform = `translateX(${towards === 'later' ? '55%' : '-55%'})`;
      el.style.opacity = '0';
      // If the navigation never lands, don't leave the screen blank.
      window.setTimeout(() => {
        if (slider.current === el) offsetBy(0, true);
      }, 800);
    }
    router.push(href(to));
  };

  useEffect(() => {
    const el = slider.current;
    if (!el) return;
    let towards = '';
    try {
      towards = sessionStorage.getItem(CAME_FROM) ?? '';
      sessionStorage.removeItem(CAME_FROM);
    } catch {
      // Nothing stored means nothing to play.
    }
    if (towards !== 'later' && towards !== 'earlier') return;
    el.animate(
      [
        { transform: `translateX(${towards === 'later' ? '-55%' : '55%'})`, opacity: 0 },
        { transform: 'translateX(0)', opacity: 1 },
      ],
      { duration: 240, easing: 'cubic-bezier(0.22, 0.61, 0.36, 1)' },
    );
  }, [holiday.key]);

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

    // The holidays lie right to left, the next one to the left of this one. To
    // bring it into view the strip has to travel rightwards under the window —
    // so dragging rightwards moves forward, the mirror of a left-to-right page.
    // With nothing to reach for in that direction, the page resists.
    from.dx = dx;
    offsetBy((dx > 0 ? laterKey : earlierKey) ? dx : dx / 5, false);
  };

  const onTouchEnd = () => {
    const from = drag.current;
    drag.current = null;
    if (!from || from.axis !== 'x' || Math.abs(from.dx) < 55) {
      offsetBy(0, true);
      return;
    }
    pageTo(from.dx > 0 ? 'later' : 'earlier');
  };

  return (
    <div
      className="flex flex-col gap-5 [touch-action:pan-y]"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/*
        Only this panel travels: the holiday and the answer that belongs to it.
        Everything around it — who you are, the pager, the tab bar — stays where
        it is, so it is obvious what is being paged.

        The clip matters. A panel sliding past the edge of the screen widens the
        page, and in a right-to-left document only the overflow to the left is
        scrollable — so moving forward, and only forward, ended with the tab bar
        and the header jumping as the page settled to its new width. Clipping at
        the viewport edge (hence the negative margin against the page padding)
        keeps the slide from changing the width at all. `clip` rather than
        `hidden`: it does not turn this into a scroll container.
      */}
      <div className="-mx-5 overflow-x-clip px-5">
      <div ref={slider} className="flex flex-col gap-6">
        <header className="flex flex-col items-center gap-1 text-center">
          <span className="text-5xl leading-none" aria-hidden="true">
            {holidayEmoji(holiday)}
          </span>
          <div className="mt-1 flex w-full items-center justify-between gap-2">
            <Step to={earlierKey} label="החג הקודם" points="earlier" onGo={pageTo} />
            <p className="font-display grow text-4xl leading-tight font-bold text-balance text-ink">
              {holiday.nameHe}
            </p>
            <Step to={laterKey} label="החג הבא" points="later" onGo={pageTo} />
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
                  {/* The number itself is gone: nobody wants to ring the host,
                      they want to write to them. */}
                  <p className="font-display text-3xl leading-snug font-bold text-balance text-brand">
                    מתארחים אצל{' '}
                    {host?.name ?? households.find((h) => h.id === shown.hostHouseholdId)?.name}
                    {host && (
                      /* Inline, so it stays on the line with the name rather than
                         dropping underneath it. */
                      <span className="ms-1.5 inline-block align-middle">
                        <FamilyWhatsApp
                          familyName={host.name}
                          members={host.members}
                          inviteUrl={inviteUrl}
                        />
                      </span>
                    )}
                  </p>
                  {hostDisagrees && (
                    <p className="mt-1 rounded-xl border border-line bg-ground px-3 py-2 text-sm text-muted">
                      <span aria-hidden="true">⚠️ </span>
                      שימו לב — הם ענו שהם מתארחים
                    </p>
                  )}
                </>
              )}
              {answeredBy && (
                <p className="text-sm text-muted">
                  {impliedByGuest ? `לפי ${answeredBy}, שאמרו שהם מגיעים אליכם` : `ענו: ${answeredBy}`}
                </p>
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

              {shown.kind === 'hosting' && <Guests guests={guests} inviteUrl={inviteUrl} />}
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
                  forHouseholdId: '',
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
                  {/* With nobody on the list there is nothing to be a guest at,
                      so the button would open an empty dropdown. Pointing at
                      building the circle is the honest thing to offer instead. */}
                  <button
                    type="button"
                    onClick={() => setChoosingHost(true)}
                    className={primaryButton}
                  >
                    {households.length === 0 ? 'הוספת המשפחות שלנו' : 'מתארחים אצל…'}
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
              ) : households.length === 0 ? (
                <p className="text-center text-sm text-muted">
                  עוד אין מי שתתארחו אצלו. הוסיפו את המשפחות שלכם למטה — כל משפחה
                  שתוסיפו תביא איתה הצעות למשפחות שהיא מכירה.
                </p>
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

      {/* A family's own date is a holiday like any other, so the way to them is
          among the holidays rather than behind our own name. */}
      <Link
        href="/occasions"
        className="text-center text-sm font-bold text-brand underline underline-offset-4"
      >
        המועדים שלנו →
      </Link>

      {/* Before answering, say what answering is *for*. Only with a circle to
          reveal: promising to show where everybody is, to somebody who has
          nobody on their list yet, is a promise the next screen cannot keep. */}
      {!answered && !choosingHost && circleSize > 0 && (
        <p className="text-center text-sm text-muted">
          כשתענו, תראו כאן איפה {circleSize === 1 ? 'המשפחה השנייה' : `${circleSize} המשפחות`} שלכם בחג הזה.
        </p>
      )}

      {!answered && choosingHost && (
        <AddFamilyInline
          inviteUrl={inviteUrl}
          onAdded={(householdId) => {
            // Straight into the dropdown they were looking in: adding a family
            // and then having to find it again is the friction this removes.
            const select = hostSelect.current;
            if (select) select.value = householdId;
            router.refresh();
          }}
        />
      )}

      {answered && circleStatus.length > 0 && (
        <Circle
          families={circleStatus}
          reminder={remindAbout(
            holiday.nameHe,
            formatDayAndDate(holiday.date),
            circleStatus.filter((f) => f.kind !== 'none').length + (answered ? 1 : 0),
            circleStatus.length + 1,
            appUrl,
          )}
          holidayKey={holiday.key}
          hosts={[us, ...households]}
        />
      )}

      {/* With nobody in the circle there is no list to hang it off, and this is
          the screen where that is felt — so it stands on its own, just here. */}
      {answered && circleStatus.length === 0 && (
        <Link
          href="/families"
          className="text-center text-sm font-bold text-brand underline underline-offset-4"
        >
          להוסיף משפחות למעגל →
        </Link>
      )}

      <NextStep step={nextStep} />

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
  onGo,
}: {
  to: string | undefined;
  label: string;
  points: Towards;
  onGo: (towards: Towards) => void;
}) {
  const shape = 'grid h-12 w-12 shrink-0 place-items-center rounded-full';
  if (!to) return <span aria-hidden="true" className={shape} />;

  // In a right-to-left page, later is to the left.
  const d = points === 'later' ? 'M15 5 L8 12 L15 19' : 'M9 5 L16 12 L9 19';
  return (
    <Link
      href={`/?h=${encodeURIComponent(to)}`}
      aria-label={label}
      // Tapping and swiping should look the same; the href stays so the link is
      // a real link — prefetched, and it still works if the click never runs.
      onClick={(e) => {
        e.preventDefault();
        onGo(points);
      }}
      className={`${shape} border border-line bg-surface text-brand transition active:scale-95`}
    >
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" aria-hidden="true">
        <path d={d} stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </Link>
  );
}

/** Where the rest of the circle is — visible only once you have answered. */
function Circle({
  families,
  reminder,
  holidayKey,
  hosts,
}: {
  families: {
    id: string;
    name: string;
    kind: string;
    hostName: string;
    byName: string;
    byProxy: boolean;
  }[];
  /** Where the reminder for this holiday goes. */
  reminder: string;
  holidayKey: string;
  /** Whom they might be at, for answering on their behalf. */
  hosts: { id: string; name: string }[];
}) {
  const said = (kind: string, hostName: string) => {
    if (kind === 'hosting') return 'מארחים';
    if (kind === 'guest') return `אצל ${hostName}`;
    if (kind === 'away') return 'לא מגיעים';
    return 'עוד לא ענו';
  };

  return (
    <section className={`${card} flex flex-col gap-1 p-0`}>
      <div className="flex items-baseline justify-between gap-2 px-5 pt-4 pb-1">
        <h2 className={sectionHeading}>איפה כולם</h2>
        {/* The nudge belongs to this list, so it sits on it — small, and named,
            rather than a button the width of the screen sitting underneath
            attached to nothing. */}
        <a
          href={reminder}
          target="_blank"
          rel="noopener noreferrer"
          title="שיתוף תזכורת בוואטסאפ"
          className="inline-flex shrink-0 items-center gap-1.5 text-xs font-bold text-brand"
        >
          <WhatsAppMark />
          תזכורת
        </a>
      </div>
      <ul className="divide-y divide-line">
        {families.map((family) => (
          <li key={family.id} className="flex flex-col gap-2 px-5 py-3">
            {/* Wraps rather than squeezes. With the text scaled up, a row that
                insists on one line gives all its width to the status and
                truncates the name to nothing — which is the half that matters. */}
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <div className="min-w-0 grow basis-40">
                <p className="font-semibold break-words text-ink">{family.name}</p>
                {family.byName && (
                  <p className="text-xs text-muted">
                    ענו: {family.byName}
                    {family.byProxy && ' · בשבילם'}
                  </p>
                )}
              </div>
              {/* No WhatsApp mark here. One on every row of a ten-family list is
                  noise, and the two places worth writing from — the host you are
                  going to, and the families coming to you — carry one. */}
              <span
                className={
                  family.kind === 'none'
                    ? 'text-sm text-muted'
                    : 'text-sm font-semibold text-brand'
                }
              >
                {said(family.kind, family.hostName)}
              </span>
            </div>
            {/* A gap, or an answer somebody gave for them, can be filled in by
                anyone here — the grandfather who will never open the app. An
                answer they gave themselves is theirs, and is not offered. */}
            {(family.kind === 'none' || family.byProxy) && (
              <AnswerForThem
                family={family}
                holidayKey={holidayKey}
                hosts={hosts.filter((h) => h.id !== family.id)}
              />
            )}
          </li>
        ))}
      </ul>

      {/* Attached to the list it is about: a family missing from these rows is
          the reason to go and add one. */}
      <Link
        href="/families"
        className="border-t border-line px-5 py-3 text-sm font-bold text-brand underline underline-offset-4"
      >
        חסרה כאן משפחה? להוסיף או להזמין →
      </Link>
    </section>
  );
}

/** Three answers on somebody else's behalf, behind one quiet line. */
function AnswerForThem({
  family,
  holidayKey,
  hosts,
}: {
  family: { id: string; name: string; kind: string };
  holidayKey: string;
  hosts: { id: string; name: string }[];
}) {
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(answerFor, {});
  const [open, setOpen] = useState(false);
  const [asGuest, setAsGuest] = useState(false);

  useEffect(() => {
    if (state.savedAt) setOpen(false);
  }, [state.savedAt]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="self-start text-xs font-bold text-brand underline underline-offset-4"
      >
        {family.kind === 'none' ? 'לענות בשבילם' : 'לתקן בשבילם'}
      </button>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-2 rounded-2xl bg-brand-wash p-3">
      <input type="hidden" name="holidayKey" value={holidayKey} />
      <input type="hidden" name="householdId" value={family.id} />
      <div className="flex items-center gap-2">
        {/* One control, and it always means the same thing: back one step. Two
            of them — an arrow that closed the whole thing and a «חזרה» that
            went back one — read as the same word twice. */}
        <BackButton onClick={() => (asGuest ? setAsGuest(false) : setOpen(false))} />
        <p className="text-xs text-muted">איפה {family.name} בחג הזה?</p>
      </div>
      {asGuest ? (
        <>
          <input type="hidden" name="kind" value="guest" />
          <select name="hostHouseholdId" required defaultValue="" className={field}>
            <option value="" disabled>
              אצל מי?
            </option>
            {hosts.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </select>
          <button type="submit" disabled={pending} className={chipButton}>
            {pending ? 'רגע…' : 'שמירה'}
          </button>
        </>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button type="submit" name="kind" value="hosting" disabled={pending} className={chipButton}>
            מארחים
          </button>
          <button type="button" onClick={() => setAsGuest(true)} className={chipButton}>
            אצל…
          </button>
          <button type="submit" name="kind" value="away" disabled={pending} className={chipButton}>
            לא מגיעים
          </button>

        </div>
      )}
      <ErrorNote>{state.error}</ErrorNote>
    </form>
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
function Guests({
  guests,
  inviteUrl,
}: {
  guests: { id: string; name: string; members: Member[] }[];
  inviteUrl: string;
}) {
  return (
    <div className="mt-2 w-full border-t border-line pt-4">
      {guests.length === 0 ? (
        <p className="text-sm text-muted">עדיין אף אחד לא אמר שהוא מגיע</p>
      ) : (
        <>
          <p className="mb-2 text-sm font-semibold text-muted">מגיעים אליכם</p>
          <ul className="flex flex-col gap-1">
            {guests.map((g) => (
              <li key={g.id} className="flex items-center justify-between gap-2 text-ink">
                <span className="truncate">{g.name}</span>
                <FamilyWhatsApp familyName={g.name} members={g.members} inviteUrl={inviteUrl} />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
