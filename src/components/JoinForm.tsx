'use client';

import { useActionState } from 'react';
import { register, type ActionResult } from '@/app/actions';
import { formatPhone } from '@/lib/phone';
import { ErrorNote, Title, card, field, primaryButton } from './ui';

/**
 * Arriving on an invite. The link itself says whether this person is starting a
 * new family or joining the inviter's — so nobody has to type a phone number.
 */
export function JoinForm({
  phone,
  token,
  invitedBy,
  kind,
}: {
  phone: string;
  token: string;
  invitedBy: string;
  kind: 'family' | 'household';
}) {
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(register, {});

  return (
    <form action={formAction} className={`${card} flex flex-col gap-5`}>
      <input type="hidden" name="token" value={token} />

      <div className="flex flex-col gap-2 text-center">
        <span className="text-4xl" aria-hidden="true">👋</span>
        <Title>
          {kind === 'household' ? `הצטרפות ל${invitedBy}` : `${invitedBy} הזמינו אתכם`}
        </Title>
        <p className="text-muted">
          המספר <span dir="ltr">{formatPhone(phone)}</span> עוד לא מוכר לנו.
        </p>
      </div>

      <label className="flex flex-col gap-2">
        <span className="text-sm font-semibold text-muted">איך קוראים לכם?</span>
        <input name="name" type="text" autoComplete="name" required className={field} />
      </label>

      {kind === 'family' && (
        <label className="flex flex-col gap-2">
          <span className="text-sm font-semibold text-muted">איך המשפחה שלכם תופיע לאחרים?</span>
          <input name="householdName" type="text" required placeholder="דנה ויוסי" className={field} />
        </label>
      )}

      <ErrorNote>{state.error}</ErrorNote>

      <button type="submit" disabled={pending} className={primaryButton}>
        {pending ? 'רגע…' : 'סיום'}
      </button>
    </form>
  );
}
