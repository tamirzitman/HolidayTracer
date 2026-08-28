'use client';

import { useActionState } from 'react';
import { register, type ActionResult } from '@/app/actions';
import { formatPhone } from '@/lib/phone';
import type { Household } from '@/lib/types';
import { ErrorNote, Title, card, field, primaryButton } from './ui';

/**
 * A number the sheet doesn't know yet. The family list comes from the sheet and
 * cannot be added to from here — that is what keeps duplicates out.
 */
export function RegisterForm({ phone, households }: { phone: string; households: Household[] }) {
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(register, {});

  return (
    <form action={formAction} className={`${card} flex flex-col gap-5`}>
      <div className="flex flex-col gap-2">
        <Title>נעים להכיר</Title>
        <p className="text-muted">
          המספר <span dir="ltr">{formatPhone(phone)}</span> עוד לא מוכר לנו.
        </p>
      </div>

      <label className="flex flex-col gap-2">
        <span className="text-sm font-semibold text-muted">איך קוראים לכם?</span>
        <input name="name" type="text" autoComplete="name" required className={field} />
      </label>

      <label className="flex flex-col gap-2">
        <span className="text-sm font-semibold text-muted">איזו משפחה אתם?</span>
        <select name="householdId" required defaultValue="" className={field}>
          <option value="" disabled>
            בחרו מהרשימה
          </option>
          {households.map((h) => (
            <option key={h.id} value={h.id}>
              {h.name}
            </option>
          ))}
        </select>
      </label>

      <p className="text-sm text-muted">המשפחה שלכם עדיין לא ברשימה? בקשו להוסיף אתכם.</p>

      <ErrorNote>{state.error}</ErrorNote>

      <button type="submit" disabled={pending} className={primaryButton}>
        {pending ? 'רגע…' : 'סיום'}
      </button>
    </form>
  );
}
