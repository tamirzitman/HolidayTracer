'use client';

import { useActionState, useEffect, useState } from 'react';
import { addFamilyNow, type AddedFamily } from '@/app/actions';
import { WhatsAppMark } from './WhatsApp';
import { contactPickerAvailable, pickContacts } from '@/lib/contacts';
import { inviteVia } from '@/lib/whatsapp';
import { formatPhone } from '@/lib/phone';
import { ErrorNote, card, field, primaryButton, quietButton, secondaryButton } from './ui';

/**
 * For the moment somebody is answering and their host simply is not in the list.
 * Adding here is deliberately small: a name is enough, a number is better.
 *
 * The family you just added is the one you were about to answer at, so it is
 * chosen for you the moment it exists — going back to hunt for it in the
 * dropdown was the whole friction this was meant to remove. And a family with a
 * number nobody has signed in with is one you can invite on the spot.
 */
export function AddFamilyInline({ onAdded, inviteUrl, circles }: {
  onAdded?: (householdId: string) => void;
  inviteUrl: string;
  /** Circle names already in use. Asked about only when there is a choice. */
  circles: string[];
}) {
  const [state, formAction, pending] = useActionState<AddedFamily, FormData>(addFamilyNow, {});
  const [open, setOpen] = useState(false);
  const [picker] = useState(contactPickerAvailable);
  const [picked, setPicked] = useState<{ name: string; phone: string } | null>(null);

  useEffect(() => {
    if (state.householdId) onAdded?.(state.householdId);
  }, [state.savedAt, state.householdId, onAdded]);

  if (state.householdId) {
    return (
      <div className={`${card} flex flex-col gap-3 text-center`}>
        <p className="font-display text-xl font-bold text-ink">
          {state.name} נוספו, וכבר נבחרו
        </p>
        {state.invitePhone ? (
          <>
            <p className="text-sm text-muted">
              הם עוד לא באפליקציה. שלחו להם קישור ויוכלו לענות בעצמם.
            </p>
            <a
              href={inviteVia(inviteUrl, state.invitePhone)}
              target="_blank"
              rel="noopener noreferrer"
              className={`${primaryButton} inline-flex items-center justify-center gap-2`}
            >
              <WhatsAppMark />
              הזמנה בוואטסאפ
            </a>
          </>
        ) : (
          <p className="text-sm text-muted">אפשר להמשיך ולאשר את התשובה.</p>
        )}
        <button type="button" onClick={() => setOpen(false)} className={quietButton}>
          סגירה
        </button>
      </div>
    );
  }

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

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-semibold text-muted">איך הם ייקראו אצלכם?</legend>
        {/* Split the same way as registering a family, so names made here and
            names made there come out looking alike. A picked contact goes into
            the first names, since that is what an address book usually holds. */}
        <div className="flex gap-2" key={picked?.phone ?? 'empty'}>
          <input
            name="familyFirstNames"
            type="text"
            defaultValue={picked?.name ?? ''}
            placeholder="שמות פרטיים"
            aria-label="שמות פרטיים"
            className={`${field} grow`}
          />
          <input
            name="familySurname"
            type="text"
            placeholder="שם משפחה"
            aria-label="שם משפחה"
            className={`${field} grow`}
          />
        </div>
      </fieldset>

      {/* Typed as well as picked. The contact picker only exists in Chrome on
          Android, and half the family is on an iPhone — leaving them no way at
          all to attach a number would make the picker's absence a dead end. */}
      <label className="flex flex-col gap-2">
        <span className="text-sm font-semibold text-muted">מספר טלפון (לא חובה)</span>
        <input
          name="familyPhone"
          type="tel"
          inputMode="tel"
          dir="ltr"
          autoComplete="off"
          defaultValue={picked?.phone ? formatPhone(picked.phone) : ''}
          key={picked?.phone ?? 'empty'}
          placeholder="050-123-4567"
          className={field}
        />
      </label>

      {circles.length > 1 && (
        <label className="flex flex-col gap-2">
          <span className="text-sm font-semibold text-muted">לאיזה מעגל?</span>
          <select name="familyCircle" defaultValue={circles[0]} className={field}>
            {circles.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
      )}
      {circles.length === 1 && <input type="hidden" name="familyCircle" value={circles[0]} />}

      <p className="text-xs text-muted">
        עם מספר הם יוכלו להיכנס בעצמם, ואפשר לכתוב להם בוואטסאפ. בלעדיו אפשר
        לענות שהתארחתם אצלם, אבל הם לא יוכלו להיכנס — אפשר להשלים בהמשך.
      </p>

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
