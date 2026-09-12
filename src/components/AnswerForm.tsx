'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useOptimistic, useRef, useState } from 'react';
import { answer, answerFor, type ActionResult } from '@/app/actions';
import { AddFamilyRow } from './AddFamilyInline';
import { CircleDots } from './Circles';
import { groupKey } from '@/lib/circle-order';
import { NextStep } from './NextStep';
import { FamilyWhatsApp, WhatsAppMark, type Member } from './WhatsApp';
import { remindCircle } from '@/lib/whatsapp';
import { circleInviteLink } from '@/app/actions';
import { colorOf } from '@/lib/circle-colors';
import { useHandoff } from '@/lib/handoff';
import type { NextStep as Step } from '@/lib/next-step';
import type { Answer, Holiday, Household } from '@/lib/types';
import { formatDayAndDate } from '@/lib/dates';
import { holidayEmoji } from '@/lib/holiday-emoji';
import {
  BackButton,
  Busy,
  DatePill,
  ErrorNote,
  Title,
  card,
  chipButton,
  ClockIcon,
  field,
  HostCandle,
  hostButton,
  hostTint,
  miniButton,
  pastTint,
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
  /** Households that said they are coming to us. Only meaningful when hosting. */
  guests: { id: string; name: string; members: Member[] }[];
  /**
   * The other families on our list who named the same host as us. Only
   * meaningful when we are a guest, and only ever families we can already see:
   * who else is at a meal is the host's circle to know, not ours.
   */
  alsoComing: { id: string; name: string; members: Member[] }[];
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
   * Per family, the households *they* could say they are at — worked out from
   * their own list, not ours. Answering for somebody used to offer everyone we
   * know, including families they have never met, and the server then refused
   * the answer.
   */
  hostsFor: Record<string, { id: string; name: string }[]>;
  /** Which of our circles each family is in — the same dots as on the circles screen. */
  tags: Record<string, { id: string; name: string; color: string }[]>;
  /** Our circles, so a family added from here can be placed in one at once. */
  circles: { id: string; name: string; color: string }[];
  /** Families on our list that are in no circle — shown with the next step. */
  uncircled: { id: string; name: string }[];
  /** The one thing worth doing next, or nothing when there is nothing. */
  nextStep: Step;
  /**
   * This holiday has already been. The screen becomes a record of it rather
   * than a question: nothing to answer, nothing to correct — correcting is what
   * the history tab is for, and the way there is on the card.
   */
  isPast: boolean;
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
  if (daysAway === 0) return 'היום';
  if (daysAway === 1) return 'מחר';
  // Past holidays are on this screen now, so the label has to be able to look
  // backwards: "בעוד 0 ימים" was what a holiday last spring used to say.
  if (daysAway === -1) return 'אתמול';
  if (daysAway < 0) return `לפני ${Math.abs(daysAway)} ימים`;
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
  guests,
  alsoComing,
  circleStatus,
  hostsFor,
  circleSize,
  tags,
  circles,
  uncircled,
  nextStep,
  isPast,
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
            <span className={`font-semibold ${isPast ? 'text-muted' : 'text-ink'}`}>
              {whenLabel(daysAway)}
            </span>
          </DatePill>
        </header>

        {celebrating && <Celebration kind={shown?.kind} />}

        {/* Answered and unanswered holidays fill a card to different heights, and
            swiping through a half-filled year made the page grow and shrink under
            the finger. Both cards keep the same floor, so the space sits inside
            the card where it looks intended rather than as a hole beneath it. */}
        <div className="flex flex-col">
          {isPast ? (
            <PastHoliday
              holidayKey={holiday.key}
              answer={shown}
              hostName={host?.name ?? ''}
              answeredBy={answeredBy}
              atTheEnd={!earlierKey}
            />
          ) : answered ? (
            <div
              // The one answer that is about our own table. The same gold and
              // the same candle mark it in the history and on the button that
              // gives it, so the three read as one thing.
              style={shown.kind === 'hosting' ? hostTint : undefined}
              className={`${card} ${cardFloor} celebrate-card flex flex-col items-center justify-center gap-3 text-center`}
            >
              {shown.kind === 'hosting' ? (
                <>
                  <HostCandle className="h-10 w-10 text-host" />
                  <p className="font-display text-3xl font-bold text-host">אנחנו מארחים</p>
                </>
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
                          householdId={host.id}
                          familyName={host.name}
                          members={host.members}
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

              {shown.kind === 'hosting' && <Guests guests={guests} />}

              {/* The same list, read from the other side of the table. Hosting
                  told you who was coming; being a guest told you nothing, though
                  the app knew — everyone else who named the same host. */}
              {shown.kind === 'guest' && (
                <Guests
                  guests={alsoComing}
                  title="מגיעים לשם גם"
                  empty="עוד אף אחד לא אמר שהוא מגיע לשם"
                />
              )}
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
                  {/* Not the plain second option any more: it is the one
                      answer with a mark of its own, and the button that gives
                      it wears the mark. */}
                  <button
                    type="submit"
                    name="kind"
                    value="hosting"
                    disabled={pending}
                    className={hostButton}
                  >
                    <HostCandle className="h-5 w-5" />
                    אנחנו מארחים
                  </button>
                  {/* With nobody on the list there is nothing to be a guest at,
                      so the picker is simply not offered. Adding is the ＋ under
                      these options either way — one control, in one place, on a
                      screen where it used to be a link to somewhere else. */}
                  {households.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setChoosingHost(true)}
                      className={primaryButton}
                    >
                      מתארחים אצל…
                    </button>
                  )}
                  <button
                    type="submit"
                    name="kind"
                    value="away"
                    disabled={pending}
                    className={`${quietButton} self-center`}
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
                    <Busy busy={pending}>אישור</Busy>
                  </button>
                  <BackButton onClick={() => setChoosingHost(false)} />
                </>
              )}

              <ErrorNote>{state.error}</ErrorNote>
            </form>
          )}
        </div>
      </div>
      </div>

      {/* Directly under "לא מגיעים בכלל", which is where a family turns out to
          be missing: while reading the options and finding nobody to pick. The
          form cannot live inside the card — the card is a form itself — so it
          opens here, a thumb's width below the last option. */}
      {!answered && !isPast && (
        <AddFamilyRow
          circles={circles}
          onAdded={(householdId) => {
            // Straight into the dropdown they were looking in: adding a family
            // and then having to find it again is the friction this removes.
            const select = hostSelect.current;
            if (select) select.value = householdId;
            router.refresh();
          }}
        />
      )}

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
      {/* Before answering, say what answering is *for*. Only with a circle to
          reveal: promising to show where everybody is, to somebody who has
          nobody on their list yet, is a promise the next screen cannot keep.

          Nor can it keep "you will see where everyone is" — that was the whole
          list of families, and what actually appears is only whoever has
          answered so far, which on the day a holiday opens is nobody. So it
          says what is really behind it: who has already answered. */}
      {!answered && !isPast && !choosingHost && circleSize > 0 && (
        <p className="text-center text-sm text-muted">
          {circleSize === 1
            ? 'כשתענו, תוכלו לראות כאן אם המשפחה השנייה שלכם כבר ענתה על החג הזה.'
            : `כשתענו, תוכלו לראות כאן מי מ־${circleSize} המשפחות שלכם כבר ענה על החג הזה.`}
        </p>
      )}

      {/* Answered, with nobody to show for it: the same ＋, since the list this
          would otherwise hang off is not on screen. */}
      {answered && !isPast && circleStatus.length === 0 && (
        <AddFamilyRow circles={circles} onAdded={() => router.refresh()} />
      )}

      {answered && circleStatus.length > 0 && (
        <Circle
          families={circleStatus}
          circles={circles}
          holidayName={holiday.nameHe}
          when={formatDayAndDate(holiday.date)}
          holidayKey={holiday.key}
          hostsFor={hostsFor}
          readOnly={isPast}
          tags={tags}
        />
      )}

      <NextStep step={nextStep} uncircled={uncircled} circles={circles} />

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
/**
 * A nudge for one circle's group chat, in that circle's colour.
 *
 * One reminder used to go out with the app's plain address in it, which was the
 * wrong link twice over: it named no circle, so it introduced nobody, and
 * anybody not yet registered who followed it arrived as a household of their
 * own — from a message about where the family was eating. Each of these carries
 * the circle's own link, so the same tap reminds the people in it and lets the
 * ones who are not in yet join all of them.
 */
function Reminders({
  circles,
  holidayName,
  when,
}: {
  circles: { id: string; name: string; color: string }[];
  holidayName: string;
  when: string;
}) {
  const { busy, start, stop, go } = useHandoff();
  const [sending, setSending] = useState('');
  const [error, setError] = useState('');

  // Nothing to remind: with no circle there is no group to send to, and the
  // families screen is where that gets fixed.
  if (circles.length === 0) return null;

  async function send(circle: { id: string; name: string }) {
    setSending(circle.id);
    setError('');
    start();
    const made = await circleInviteLink(circle.id);
    if (!made.token) {
      setError(made.error ?? 'משהו השתבש');
      setSending('');
      stop();
      return;
    }
    go(remindCircle(circle.name, holidayName, when, `${window.location.origin}/join/${made.token}`));
  }

  return (
    <div id="reminders" className="flex flex-col gap-2 px-5 pb-2">
      {/* On its own line, not inline with the first chip: sharing the wrapping
          row meant the first chip started after the label and every chip that
          wrapped started at the edge, so no two lines of them lined up. */}
      <span className="text-xs text-muted">תזכורת ל־</span>
      <div className="flex flex-wrap items-center gap-2">
        {circles.map((circle) => (
          <button
            key={circle.id}
            type="button"
            disabled={busy}
            onClick={() => send(circle)}
            className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-xs font-bold text-ink transition active:scale-95 disabled:opacity-50"
          >
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/10"
              style={{ backgroundColor: colorOf(circle.color) }}
              aria-hidden="true"
            />
            <span className="text-whatsapp">
              <WhatsAppMark />
            </span>
            <Busy busy={sending === circle.id && busy}>{circle.name}</Busy>
          </button>
        ))}
      </div>
      <ErrorNote>{error}</ErrorNote>
    </div>
  );
}

function Circle({
  families,
  circles,
  holidayName,
  when,
  holidayKey,
  hostsFor,
  readOnly,
  tags,
}: {
  families: {
    id: string;
    name: string;
    kind: string;
    hostName: string;
    byName: string;
    byProxy: boolean;
  }[];
  /** Our circles: a reminder goes to one of them, in its own colour. */
  circles: { id: string; name: string; color: string }[];
  holidayName: string;
  when: string;
  holidayKey: string;
  /** Per family, whom *they* might be at — see the note on the prop above. */
  hostsFor: Record<string, { id: string; name: string }[]>;
  /** A holiday that has been: what everyone said stands, and cannot be edited. */
  readOnly: boolean;
  tags: Record<string, { id: string; name: string; color: string }[]>;
}) {
  // Past tense for a holiday that has been. "עוד לא ענו" about last Pesach
  // reads as a question still open, when what it means is that nobody ever
  // answered it and the moment has gone.
  const said = (kind: string, hostName: string) => {
    if (kind === 'hosting') return readOnly ? 'אירחו' : 'מארחים';
    if (kind === 'guest') return readOnly ? `היו אצל ${hostName}` : `אצל ${hostName}`;
    if (kind === 'away') return readOnly ? 'לא הגיעו' : 'לא מגיעים';
    return readOnly ? 'לא ענו' : 'עוד לא ענו';
  };

  return (
    <section className={`${card} flex flex-col gap-1 p-0`}>
      <div className="flex items-baseline justify-between gap-2 px-5 pt-4 pb-1">
        <h2 className={sectionHeading}>{readOnly ? 'איפה היו כולם' : 'איפה כולם'}</h2>
      </div>
      {/* Nothing to remind anybody about once the holiday has been. */}
      {!readOnly && <Reminders circles={circles} holidayName={holidayName} when={when} />}
      <ul className="flex flex-col">
        {families.map((family, i) => {
          const myTags = tags[family.id] ?? [];
          // The same boundary the sort already drew, surfaced as a heading: a
          // list sorted by circle but shown as one undifferentiated column of
          // small dots was information nobody could take in without reading it
          // line by line. This is the same grouping, just named.
          const key = groupKey(myTags);
          const changed = i === 0 || key !== groupKey(tags[families[i - 1].id] ?? []);
          // One colour reads as a strip; more than one is a family standing
          // between circles, so the strip is striped rather than picking one.
          const stripe =
            myTags.length === 0
              ? 'transparent'
              : myTags.length === 1
                ? colorOf(myTags[0].color)
                : `linear-gradient(to bottom, ${myTags.map((t) => colorOf(t.color)).join(', ')})`;

          return (
            <li key={family.id}>
              {changed && (
                <div className="flex items-center gap-2 border-t border-line bg-ground px-5 py-1.5 first:border-t-0">
                  <CircleDots tags={myTags} />
                  <span className="text-xs font-bold text-muted">
                    {myTags.length === 0 ? 'בלי מעגל משותף' : myTags.map((t) => t.name).join(' + ')}
                  </span>
                </div>
              )}
              <div className="flex items-stretch gap-3 border-t border-line px-5 py-3 first:border-t-0">
                {/* The strip a group's heading names in words. Scanning it down
                    the edge finds a family's circle without reading its dots. */}
                <span
                  className="w-1 shrink-0 self-stretch rounded-full"
                  style={{ background: stripe }}
                  aria-hidden="true"
                />
                <div className="flex min-w-0 grow flex-col gap-2">
                  {/* Two columns that hold, rather than a row that wraps. Wrapping
                      dropped a long answer — "אצל נעמה ויובל לייבוביץ'" — onto its
                      own line while short ones stayed put, so the answers ran down
                      the middle of the card instead of down one edge. Each column
                      now keeps its side and wraps inside it. */}
                  <div className="flex items-baseline justify-between gap-x-3">
                    <div className="min-w-0 grow">
                      <p className="truncate font-semibold text-ink">{family.name}</p>
                      {family.byName && (
                        <p className="text-xs text-muted">
                          ענו: {family.byName}
                          {family.byProxy && ' · בשבילם'}
                        </p>
                      )}
                    </div>
                    {/* No WhatsApp mark here. One on every row of a ten-family
                        list is noise, and the two places worth writing from — the
                        host you are going to, and the families coming to you —
                        carry one. */}
                    <span
                      className={`w-2/5 shrink-0 text-start text-sm ${
                        family.kind === 'none' ? 'text-muted' : 'font-semibold text-brand'
                      }`}
                    >
                      {said(family.kind, family.hostName)}
                    </span>
                  </div>
                  {/* A gap, or an answer somebody gave for them, can be filled in
                      by anyone here — the grandfather who will never open the
                      app. An answer they gave themselves is theirs, and is not
                      offered. */}
                  {!readOnly && (family.kind === 'none' || family.byProxy) && (
                    <AnswerForThem
                      family={family}
                      holidayKey={holidayKey}
                      hosts={hostsFor[family.id] ?? []}
                    />
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {/* Attached to the list it is about: a family missing from these rows is
          the reason to go and add one. */}
      <Link
        href="/families"
        className="inline-flex items-center gap-2 border-t border-line px-5 py-3 text-sm font-bold text-brand"
      >
        <span className="grid h-5 w-5 place-items-center rounded-full border border-brand" aria-hidden="true">
          <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none">
            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          </svg>
        </span>
        הוספת משפחה
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
        className={`${miniButton} self-start`}
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
            <Busy busy={pending}>שמירה</Busy>
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

/**
 * A holiday that has already been.
 *
 * The screen stops asking and starts recording: what we said, who said it, and
 * the way to the row in the history where it can still be put right. Read-only
 * on purpose — correcting the past is one job, and it lives in one place, so
 * the two screens do not both half-do it.
 *
 * The way out is the point of coming here. Somebody swiping back is looking for
 * "where were we last Pesach", and having found it, the next thing they want is
 * the rest of the year — which is the history tab, and the link says so at the
 * far end of the strip where the swiping runs out.
 */
function PastHoliday({
  holidayKey,
  answer,
  hostName,
  answeredBy,
  atTheEnd,
}: {
  holidayKey: string;
  answer: Answer | undefined;
  hostName: string;
  answeredBy: string;
  /** The oldest holiday the strip reaches. The rest is in the history tab. */
  atTheEnd: boolean;
}) {
  const said = (): string => {
    if (!answer) return '';
    if (answer.kind === 'hosting') return 'אירחנו';
    if (answer.kind === 'away') return 'לא היינו';
    return `היינו אצל ${hostName}`;
  };

  return (
    <div
      style={pastTint}
      className={`${card} ${cardFloor} flex flex-col items-center justify-center gap-3 text-center`}
    >
      {/* Said outright rather than left to be worked out from the date: the
          card otherwise looks exactly like the one asking about next week. */}
      <span className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-xs font-bold text-muted">
        <ClockIcon />
        חג שעבר
      </span>

      {answer ? (
        <>
          {answer.kind === 'hosting' ? (
            <span className="flex items-center gap-2 text-host">
              <HostCandle className="h-7 w-7" />
              <span className="font-display text-3xl font-bold">אירחנו</span>
            </span>
          ) : (
            <p className="font-display text-3xl leading-snug font-bold text-balance text-ink">
              {said()}
            </p>
          )}
          {answeredBy && <p className="text-sm text-muted">ענו: {answeredBy}</p>}
        </>
      ) : (
        <p className="font-display text-2xl leading-snug font-bold text-balance text-muted">
          לא ענינו על החג הזה
        </p>
      )}

      <Link href={`/history#${encodeURIComponent(holidayKey)}`} className={`${quietButton} self-center`}>
        {answer ? 'לתקן בהיסטוריה' : 'למלא בהיסטוריה'}
      </Link>

      {atTheEnd && (
        <p className="mt-1 max-w-xs border-t border-line pt-3 text-xs leading-relaxed text-muted">
          עד כאן אפשר להחליק — שנה אחורה. כל מה שהיה לפני כן נמצא בטאב ההיסטוריה.
        </p>
      )}
    </div>
  );
}

/** Who said they are coming to us — the whole reward for answering "we're hosting". */
function Guests({
  guests,
  title = 'מגיעים אליכם',
  empty = 'עדיין אף אחד לא אמר שהוא מגיע',
}: {
  guests: { id: string; name: string; members: Member[] }[];
  title?: string;
  empty?: string;
}) {
  return (
    <div className="mt-2 w-full border-t border-line pt-4">
      {guests.length === 0 ? (
        <p className="text-sm text-muted">{empty}</p>
      ) : (
        <>
          <p className="mb-2 text-sm font-semibold text-muted">{title}</p>
          <ul className="flex flex-col gap-1">
            {guests.map((g) => (
              <li key={g.id} className="flex items-center justify-between gap-2 text-ink">
                <span className="truncate">{g.name}</span>
                <FamilyWhatsApp householdId={g.id} familyName={g.name} members={g.members} />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
