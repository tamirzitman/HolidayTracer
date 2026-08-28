'use client';

import { useActionState } from 'react';
import { signIn, type ActionResult } from '@/app/actions';
import { ErrorNote, Title, card, field, primaryButton } from './ui';

export function SignInForm() {
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(signIn, {});

  return (
    <form action={formAction} className={`${card} flex flex-col gap-5`}>
      <div className="flex flex-col gap-2">
        <Title>איפה אתם בחג?</Title>
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
