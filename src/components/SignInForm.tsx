'use client';

import { useActionState } from 'react';
import { signIn, type ActionResult } from '@/app/actions';
import { ErrorNote, Title, card, field, primaryButton } from './ui';

export function SignInForm({ invitedBy, token }: { invitedBy?: string; token?: string } = {}) {
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
        <Title>{invitedBy ? `${invitedBy} הזמינו אתכם` : 'איפה אתם בחג?'}</Title>
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
        {pending ? 'רגע…' : 'כניסה'}
      </button>
    </form>
  );
}
