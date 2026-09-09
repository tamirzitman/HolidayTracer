'use client';

import { useActionState } from 'react';
import { signIn, type ActionResult } from '@/app/actions';
import { Busy, ErrorNote, Title, card, field, primaryButton } from './ui';

/**
 * The front door, and the first screen an invitation lands on.
 *
 * Arriving on a link, the name of whoever sent it is not enough on its own:
 * somebody handed a link in a family group has no idea what they are about to
 * type their number into. One line says what this is and one says what the
 * circle is called — enough to decide, and not a page about an app that takes
 * two taps to use.
 */
export function SignInForm({
  invitedBy,
  circleName,
  token,
}: { invitedBy?: string; circleName?: string; token?: string } = {}) {
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(signIn, {});

  return (
    <form action={formAction} className={`${card} flex flex-col gap-5`}>
      {token && <input type="hidden" name="next" value={`/join/${token}`} />}
      <div className="flex flex-col gap-2">
        {invitedBy && (
          <span className="text-4xl" aria-hidden="true">
            👋
          </span>
        )}
        <Title>
          {!invitedBy
            ? 'איפה אתם בחג?'
            : circleName
              ? `${invitedBy} הזמינו אתכם למעגל`
              : `${invitedBy} הזמינו אתכם`}
        </Title>
        {circleName && <p className="text-lg font-bold text-brand">«{circleName}»</p>}
        {invitedBy && (
          <p className="text-muted">
            כאן עוקבים אחרי מי מארח בכל חג: עונים בשתי נגיעות, ורואים מיד איפה כל השאר.
            {circleName && ' כל מי שנכנס מהקישור הזה מצטרף לכל המעגל.'}
          </p>
        )}
        <p className="text-muted">הזינו את מספר הטלפון שלכם. פעם אחת, ונזכור אתכם.</p>
      </div>

      <label className="flex flex-col gap-2">
        <span className="text-sm font-semibold text-muted">מספר טלפון</span>
        <input
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          dir="ltr"
          required
          placeholder="050-123-4567"
          className={`${field} text-center`}
        />
      </label>

      <ErrorNote>{state.error}</ErrorNote>

      <button type="submit" disabled={pending} className={primaryButton}>
        <Busy busy={pending}>כניסה</Busy>
      </button>
    </form>
  );
}
