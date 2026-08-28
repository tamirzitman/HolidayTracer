'use client';

import { useActionState, useState } from 'react';
import { register, type ActionResult } from '@/app/actions';
import { formatPhone } from '@/lib/phone';
import { ErrorNote, Title, card, field, primaryButton, quietButton } from './ui';

/**
 * Arriving on an invite. Either this person's family is already here — in which
 * case they attach to it by a number inside it — or they name a new one.
 */
export function JoinForm({
  phone,
  token,
  invitedBy,
}: {
  phone: string;
  token: string;
  invitedBy: string;
}) {
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(register, {});
  const [joining, setJoining] = useState(false);

  return (
    <form action={formAction} className={`${card} flex flex-col gap-5`}>
      <input type="hidden" name="token" value={token} />

      <div className="flex flex-col gap-2 text-center">
        <span className="text-4xl" aria-hidden="true">👋</span>
        <Title>{invitedBy} הזמינו אתכם</Title>
        <p className="text-muted">
          המספר <span dir="ltr">{formatPhone(phone)}</span> עוד לא מוכר לנו.
        </p>
      </div>

      <label className="flex flex-col gap-2">
        <span className="text-sm font-semibold text-muted">איך קוראים לכם?</span>
        <input name="name" type="text" autoComplete="name" required className={field} />
      </label>

      {joining ? (
        <label className="flex flex-col gap-2">
          <span className="text-sm font-semibold text-muted">מספר של מישהו מהמשפחה שכבר רשום</span>
          <input
            name="joinPhone"
            type="tel"
            inputMode="tel"
            dir="ltr"
            required
            placeholder="050-123-4567"
            className={`${field} text-center`}
          />
        </label>
      ) : (
        <label className="flex flex-col gap-2">
          <span className="text-sm font-semibold text-muted">איך המשפחה שלכם תופיע לאחרים?</span>
          <input name="householdName" type="text" required placeholder="דנה ויוסי" className={field} />
        </label>
      )}

      <ErrorNote>{state.error}</ErrorNote>

      <button type="submit" disabled={pending} className={primaryButton}>
        {pending ? 'רגע…' : 'סיום'}
      </button>

      <button type="button" onClick={() => setJoining(!joining)} className={quietButton}>
        {joining ? 'המשפחה שלנו עדיין לא רשומה' : 'מישהו מהמשפחה שלנו כבר רשום'}
      </button>
    </form>
  );
}
