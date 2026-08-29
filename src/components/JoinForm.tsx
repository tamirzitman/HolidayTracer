'use client';

import { useActionState, useState } from 'react';
import { register, type ActionResult } from '@/app/actions';
import { formatPhone } from '@/lib/phone';
import { ErrorNote, Title, card, field, primaryButton } from './ui';

/**
 * Signing up — with an invite or without one. An invite is only a shortcut: it
 * names who introduced you, offers their family to claim, and their circle to
 * start from. Arriving cold skips all three and simply asks who you are.
 */
export function JoinForm({
  phone,
  token,
  invitedBy,
  kind,
  claimable,
  circle,
}: {
  phone: string;
  token: string;
  invitedBy: string;
  kind: 'family' | 'household';
  /** Families already on the inviter's list, which this newcomer may belong to. */
  claimable: { id: string; name: string }[];
  /** The inviter's own circle, offered to the newcomer to start from. */
  circle: { id: string; name: string }[];
}) {
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(register, {});
  const [claim, setClaim] = useState('');
  // Ticked to begin with: most invitations go to people whose list would look
  // almost exactly like the inviter's — a parent's can be all of it. Trimming a
  // few is less work than picking a dozen, and there is one tap for the rest.
  const [share, setShare] = useState<string[]>(() => circle.map((h) => h.id));

  return (
    <form action={formAction} className={`${card} flex flex-col gap-5`}>
      <input type="hidden" name="token" value={token} />

      <div className="flex flex-col gap-2 text-center">
        <span className="text-4xl" aria-hidden="true">👋</span>
        <Title>
          {!invitedBy
            ? 'נעים להכיר'
            : kind === 'household'
              ? `הצטרפות ל${invitedBy}`
              : `${invitedBy} הזמינו אתכם`}
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
        <>
          {/* Somebody has very likely added this family already, so they could
              be answered at. Saying so here is what keeps one family from
              becoming two rows nobody can tell apart — and it works whatever
              number this person signs up with, which matching on the phone
              cannot. */}
          {claimable.length > 0 && (
            <label className="flex flex-col gap-2">
              <span className="text-sm font-semibold text-muted">המשפחה שלכם כבר ברשימה?</span>
              <select
                name="claimHouseholdId"
                value={claim}
                onChange={(e) => setClaim(e.target.value)}
                className={field}
              >
                <option value="">לא, אנחנו משפחה חדשה</option>
                {claimable.map((household) => (
                  <option key={household.id} value={household.id}>
                    {household.name}
                  </option>
                ))}
              </select>
              <span className="text-xs text-muted">
                אם מישהו כבר הוסיף אתכם — בחרו בשם שלכם, כדי שלא ייווצרו שתי משפחות נפרדות.
              </span>
            </label>
          )}

          {!claim && (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-sm font-semibold text-muted">
                איך המשפחה שלכם תופיע לאחרים?
              </legend>
              <div className="flex gap-2">
                <input
                  name="firstNames"
                  type="text"
                  required
                  placeholder="שמות פרטיים"
                  aria-label="שמות פרטיים"
                  className={`${field} grow`}
                />
                <input
                  name="surname"
                  type="text"
                  required
                  placeholder="שם משפחה"
                  aria-label="שם משפחה"
                  className={`${field} grow`}
                />
              </div>
              <span className="text-xs text-muted">
                יופיע כשם אחד — למשל «נעמה ויובל לייבוביץ׳».
              </span>
            </fieldset>
          )}

          {/* The whole point of arriving on somebody's invite: their list is
              probably most of yours. Deciding here costs the inviter nothing
              and saves the newcomer from an app with one family in it. */}
          {circle.length > 0 && (
            <fieldset className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between gap-2">
                <legend className="text-sm font-semibold text-muted">
                  {invitedBy} רואים גם את אלה. מי מהן רלוונטית לכם?
                </legend>
                <button
                  type="button"
                  onClick={() => setShare(share.length === 0 ? circle.map((h) => h.id) : [])}
                  className="shrink-0 text-xs font-bold text-brand underline underline-offset-4"
                >
                  {share.length === 0 ? 'סמנו הכל' : 'בטלו הכל'}
                </button>
              </div>
              <ul className="grid grid-cols-2 gap-1.5">
                {circle.map((family) => {
                  const on = share.includes(family.id);
                  return (
                    <li key={family.id}>
                      <label
                        className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                          on
                            ? 'border-brand/40 bg-brand-wash text-brand'
                            : 'border-line bg-surface text-muted'
                        }`}
                      >
                        <input
                          type="checkbox"
                          name="share"
                          value={family.id}
                          checked={on}
                          onChange={() =>
                            setShare((was) =>
                              was.includes(family.id)
                                ? was.filter((id) => id !== family.id)
                                : [...was, family.id],
                            )
                          }
                          className="h-4 w-4 shrink-0 accent-brand"
                        />
                        <span className="truncate">{family.name}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </fieldset>
          )}
        </>
      )}

      <ErrorNote>{state.error}</ErrorNote>

      <button type="submit" disabled={pending} className={primaryButton}>
        {pending ? 'רגע…' : 'סיום'}
      </button>
    </form>
  );
}
