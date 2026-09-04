/**
 * The one thing worth doing next.
 *
 * The app is three screens and a handful of actions, and knowing which of them
 * you are meant to be on is not obvious from any of them. Rather than a tour or
 * a wizard, each screen ends with a single line naming the next useful thing and
 * linking straight to it — so the app can be used without first working out how
 * it is arranged.
 *
 * History is deliberately not among these. A year of past holidays is not
 * something anybody sits down and completes, and a prompt that keeps asking for
 * it would be noise on every screen forever. It is there when somebody wants it.
 */
export type NextStep = { href: string; label: string; hint: string } | undefined;

export function nextStep(state: {
  /** Families on our list. */
  circleSize: number;
  /** Circles suggested to us and not yet decided on. */
  suggestions: number;
  /** Upcoming holidays we have not answered. */
  unanswered: number;
  /** The nearest unanswered holiday, when there is one. */
  nextHolidayKey?: string;
  nextHolidayName?: string;
  /** Which screen is asking. */
  on: 'holiday' | 'families' | 'history';
}): NextStep {
  // Nobody on the list is the one state where nothing else in the app works:
  // no host to pick, no circle to reveal, nothing to compare.
  if (state.circleSize === 0) {
    return state.on === 'families'
      ? undefined
      : {
          href: '/families',
          label: 'להוסיף את המשפחות שלנו',
          hint: 'בלי אף משפחה אין אצל מי להתארח, ואין מה לראות בחג.',
        };
  }

  if (state.suggestions > 0 && state.on !== 'families') {
    return {
      href: '/families',
      label:
        state.suggestions === 1
          ? 'יש משפחה שמוצעת להוספה'
          : `יש ${state.suggestions} משפחות שמוצעות להוספה`,
      hint: 'המשפחות שלכם מכירות אותן, ואתם עוד לא.',
    };
  }

  if (state.unanswered > 0 && state.on !== 'holiday') {
    return {
      href: state.nextHolidayKey ? `/?h=${state.nextHolidayKey}` : '/',
      label: state.nextHolidayName
        ? `עוד לא עניתם על ${state.nextHolidayName}`
        : 'עוד לא עניתם על החג הקרוב',
      hint: 'תשובה אחת, ואתם רואים איפה כל השאר.',
    };
  }

  return undefined;
}
