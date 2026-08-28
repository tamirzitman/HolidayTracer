'use client';

import { useActionState, useState } from 'react';
import { addFamilyNow, type ActionResult } from '@/app/actions';
import { contactPickerAvailable, pickContacts } from '@/lib/contacts';
import { formatPhone } from '@/lib/phone';
import { ErrorNote, card, field, quietButton, secondaryButton } from './ui';

/**
 * For the moment somebody is answering and their host simply is not in the list.
 * Adding here is deliberately small: a name is enough, a number is better.
 */
export function AddFamilyInline() {
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(addFamilyNow, {});
  const [open, setOpen] = useState(false);
  const [picker] = useState(contactPickerAvailable);
  const [picked, setPicked] = useState<{ name: string; phone: string } | null>(null);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={`${quietButton} text-center`}>
        לא מוצאים? הוסיפו משפחה
      </button>
    );
  }

  async function choose() {
    const contacts = await pickContacts(false);
    if (contacts[0]) setPicked(contacts[0]);
  }

  return (
    <form action={formAction} className={`${card} flex flex-col gap-3`}>
      <h2 className="font-display text-xl font-bold text-ink">הוספת משפחה</h2>

      {picker && (
        <button type="button" onClick={choose} className={secondaryButton}>
          {picked ? 'בחירת איש קשר אחר' : 'בחירה מאנשי הקשר'}
        </button>
      )}

      <label className="flex flex-col gap-2">
        <span className="text-sm font-semibold text-muted">איך הם ייקראו אצלכם?</span>
        <input
          name="familyName"
          type="text"
          required
          defaultValue={picked?.name ?? ''}
          key={picked?.phone ?? 'empty'}
          placeholder="משפחת כהן"
          className={field}
        />
      </label>

      <input type="hidden" name="familyPhone" value={picked?.phone ?? ''} />

      {picked?.phone ? (
        <p dir="ltr" className="text-center text-sm text-muted">
          {formatPhone(picked.phone)}
        </p>
      ) : (
        <p className="text-xs text-muted">
          בלי מספר הם יופיעו כ״טרם הצטרפו״ — אפשר להשלים מספר בהמשך כדי שיוכלו להיכנס בעצמם.
        </p>
      )}

      <ErrorNote>{state.error}</ErrorNote>

      <button type="submit" disabled={pending} className={secondaryButton}>
        {pending ? 'רגע…' : 'הוספה'}
      </button>
      <button type="button" onClick={() => setOpen(false)} className={quietButton}>
        ביטול
      </button>
    </form>
  );
}
