'use client';

import { useActionState, useCallback, useEffect, useState } from 'react';
import { useCloseOnAway } from '@/lib/dismiss';
import { addFamilyNow, newInviteLink, type AddedFamily } from '@/app/actions';
import { WhatsAppMark } from './WhatsApp';
import { inviteVia } from '@/lib/whatsapp';
import { colorOf } from '@/lib/circle-colors';
import {
  BackButton,
  Busy,
  ErrorNote,
  card,
  field,
  primaryButton,
  quietButton,
  secondaryButton,
  sectionHeading,
} from './ui';

/**
 * For the moment somebody is answering and their host simply is not in the list.
 * Adding here is deliberately small: a name is enough, a number is better.
 *
 * The family you just added is the one you were about to answer at, so it is
 * chosen for you the moment it exists — going back to hunt for it in the
 * dropdown was the whole friction this was meant to remove. And a family with a
 * number nobody has signed in with is one you can invite on the spot.
 */
export function AddFamilyInline({
  onAdded,
  onClose,
  circles = [],
  startOpen = false,
}: {
  onAdded?: (householdId: string) => void;
  /**
   * Folded away again. Opened by a ＋ that already said what it is for, this
   * has no business leaving its own "לא מוצאים?" link behind when it closes —
   * a way in that was not there before the ＋ was pressed.
   */
  onClose?: () => void;
  /** Our circles, so a new family can be placed in one while we are adding it. */
  circles?: { id: string; name: string; color: string }[];
  /** Opened by something else — a ＋ that has already said what it is for. */
  startOpen?: boolean;
}) {
  const [state, formAction, pending] = useActionState<AddedFamily, FormData>(addFamilyNow, {});
  const [open, setOpen] = useState(startOpen);
  // Which result has been dismissed. The action's own state keeps the household
  // it made for as long as the component lives, so closing had to be something
  // the component remembers — without it "סגירה" set open to false and the card
  // went on rendering, because it is reached before the open check.
  const [dismissed, setDismissed] = useState('');
  // A link made for the number just typed: theirs alone, and spent once they
  // are in. Falls back to the family's general link if minting one fails.
  const [personal, setPersonal] = useState('');
  const showing = Boolean(state.householdId) && dismissed !== (state.savedAt ?? '');
  const box = useCloseOnAway<HTMLDivElement>(
    showing,
    useCallback(() => {
      setDismissed(state.savedAt ?? '');
      setOpen(false);
    }, [state.savedAt]),
  );

  useEffect(() => {
    if (state.householdId) onAdded?.(state.householdId);
  }, [state.savedAt, state.householdId, onAdded]);

  useEffect(() => {
    let live = true;
    setPersonal('');
    if (!state.invitePhone) return;
    newInviteLink('family', state.invitePhone)
      .then((made) => {
        if (live && made.token) setPersonal(`${window.location.origin}/join/${made.token}`);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [state.savedAt, state.invitePhone]);

  const close = () => {
    setDismissed(state.savedAt ?? '');
    setOpen(false);
    onClose?.();
  };

  if (state.householdId && dismissed !== (state.savedAt ?? '')) {
    return (
      <div ref={box} className={`${card} flex flex-col gap-3 text-center`}>
        {/* A way back that is not the one word at the bottom: the arrow, and
            tapping anywhere off the card. */}
        <div className="flex items-center gap-2">
          <BackButton onClick={close} />
        </div>
        <p className="font-display text-xl font-bold text-ink">
          {state.name} נוספו, וכבר נבחרו
        </p>
        {state.invitePhone && personal ? (
          <>
            <p className="text-sm text-muted">
              הם עוד לא באפליקציה. שלחו להם קישור ויוכלו לענות בעצמם.
            </p>
            <a
              href={inviteVia(personal, state.invitePhone)}
              target="_blank"
              rel="noopener noreferrer"
              className={`${primaryButton} inline-flex items-center justify-center gap-2`}
            >
              <WhatsAppMark />
              הזמנה בוואטסאפ
            </a>
            {personal && (
              <p className="text-xs text-muted">
                הקישור אישי להם — נסגר אחרי שהם נרשמים.
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-muted">אפשר להמשיך ולאשר את התשובה.</p>
        )}

      </div>
    );
  }

  // Opened from outside, closing means going away entirely: the ＋ that opened
  // it is the way back in.
  if (!open && startOpen) return null;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`${quietButton} text-center`}
      >
        לא מוצאים? הוסיפו משפחה
      </button>
    );
  }

  return (
    <form action={formAction} className={`${card} flex flex-col gap-3`}>
      <div className="flex items-center gap-2">
        <BackButton onClick={close} />
        <h2 className={sectionHeading}>הוספת משפחה</h2>
      </div>

      {/* One box. Two — first names and a surname — asked people to take a
          name apart before writing it down, and the grey example says the shape
          better than a pair of labels did. */}
      <label className="flex flex-col gap-2">
        <span className="text-sm font-semibold text-muted">איך הם ייקראו אצלכם?</span>
        <input
          name="familyName"
          type="text"
          placeholder="עמוס וליאת כהן"
          className={field}
        />
      </label>

      {/* Which side of the family they are on, while we are here. Whoever is
          adding them knows it now; asking again later on another screen is a
          second errand for the same fact. */}
      {circles.length > 0 && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-semibold text-muted">לאיזה מעגל?</legend>
          <div className="flex flex-wrap gap-2">
            {circles.map((circle) => (
              <label
                key={circle.id}
                className="inline-flex items-center gap-2 rounded-full border border-line px-3 py-1.5 text-sm has-checked:border-brand has-checked:bg-brand-wash"
              >
                <input type="checkbox" name="circle" value={circle.id} className="h-4 w-4 accent-brand" />
                <span
                  className="h-2.5 w-2.5 rounded-full ring-1 ring-black/10"
                  style={{ backgroundColor: colorOf(circle.color) }}
                  aria-hidden="true"
                />
                <span className="text-ink">{circle.name}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {/* Optional, and typed: choosing from contacts is its own control beside
          this one, and it takes several at a time. */}
      <label className="flex flex-col gap-2">
        <span className="text-sm font-semibold text-muted">מספר טלפון (לא חובה)</span>
        <input
          name="familyPhone"
          type="tel"
          inputMode="tel"
          dir="ltr"
          autoComplete="off"
          placeholder="050-123-4567"
          title="עם מספר הם יוכלו להיכנס בעצמם ולענות בעצמם. בלעדיו אפשר לענות שהתארחתם אצלם, ולהשלים את המספר בהמשך."
          className={field}
        />
      </label>

      <ErrorNote>{state.error}</ErrorNote>

      <button type="submit" disabled={pending} className={secondaryButton}>
        <Busy busy={pending}>הוספה</Busy>
      </button>

    </form>
  );
}
