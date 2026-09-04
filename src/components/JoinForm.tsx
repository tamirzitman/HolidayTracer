'use client';

import { useActionState, useState } from 'react';
import { register, type ActionResult } from '@/app/actions';
import { formatPhone } from '@/lib/phone';
import { ErrorNote, Title, card, field, primaryButton, quietButton, secondaryButton } from './ui';

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
  canClaim,
  joiningAs,
  onLeave,
}: {
  phone: string;
  token: string;
  invitedBy: string;
  kind: 'family' | 'household';
  /**
   * The family this link makes them. Set, there is nothing to ask about the
   * family at all — the link already said which one, and it was sent to them.
   */
  joiningAs: string;
  /** Families already on the inviter's list, which this newcomer may belong to. */
  /**
   * Families the inviter knows that this person might be. `joined` separates
   * the two quite different cases: a family added by name that nobody has
   * signed into, and a family a relative is already signed into.
   */
  claimable: { id: string; name: string; joined: boolean }[];
  /**
   * Whether this link lets them claim one of those. Only a link aimed at their
   * number does: saying "we are that family" is the same claim as typing that
   * family's number, and a forwarded group link is not good enough for either.
   */
  canClaim: boolean;
  /**
   * Leaving half-way. Refreshing keeps the cookie, so without this a number
   * typed one digit wrong is a screen there is no way off.
   */
  onLeave: () => void;
}) {
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(register, {});
  const [claim, setClaim] = useState('');
  // The family name is not built from yours. A household is usually a couple —
  // "עמוס וליאת כהן" — so filling it in from one person's name is wrong more
  // often than right, and a wrong answer already in the box is worse than an
  // empty one: people accept it. An example in grey says the shape instead.
  // Claiming an existing family is the rarer path, so it waits behind a line of
  // text rather than sitting in the way of everyone who is genuinely new.
  const [claiming, setClaiming] = useState(false);

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
          נרשמים עם המספר <span dir="ltr">{formatPhone(phone)}</span>
        </p>
        <button
          type="button"
          onClick={() => onLeave()}
          className="text-sm font-semibold text-muted underline underline-offset-4"
        >
          זה לא המספר שלי — יציאה
        </button>
      </div>

      {/* Two questions that look like one. The names are about *you*; the
          family below is about which household you belong to. Unlabelled, they
          read as alternatives — hence a heading on each. */}
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-semibold text-muted">איך קוראים לכם?</legend>
      <div className="flex gap-2">
        <label className="flex grow flex-col gap-2">
          <span className="text-sm font-semibold text-muted">שם פרטי</span>
          <input
            name="firstName"
            type="text"
            autoComplete="given-name"
            required
            className={field}
          />
        </label>
        <label className="flex grow flex-col gap-2">
          <span className="text-sm font-semibold text-muted">שם משפחה</span>
          <input
            name="surname"
            type="text"
            autoComplete="family-name"
            required
            className={field}
          />
        </label>
      </div>

      </fieldset>

      {kind === 'family' && joiningAs && (
        <p className="rounded-2xl bg-brand-wash px-4 py-3 text-center text-sm text-ink">
          נרשמים בתור <span className="font-bold">{joiningAs}</span> — כפי ש{invitedBy} רשמו אתכם.
        </p>
      )}

      {kind === 'family' && !joiningAs && (
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-2 text-sm font-semibold text-muted">המשפחה שלכם</legend>

          {!claim && (
            <label className="flex flex-col gap-2">
              <span className="text-sm font-semibold text-muted">
                איך היא תיקרא לאחרים?
              </span>
              <input
                name="householdName"
                type="text"
                required
                placeholder="עמוס וליאת כהן"
                className={field}
              />
            </label>
          )}

          {/* Most people arriving on a link are new. The ones somebody already
              added by name are the exception, and an exception should not be a
              dropdown everybody has to read past. */}
          {claimable.length > 0 && !canClaim && (
            <p className="text-xs text-muted">
              המשפחה שלכם כבר ברשימה? כדי להצטרף אליה צריך קישור אישי — בקשו ממי
              שהוסיף אתכם לשלוח לכם אחד מהאפליקציה.
            </p>
          )}

          {claimable.length > 0 &&
            canClaim &&
            (claiming || claim ? (
              <label className="flex flex-col gap-2">
                <span className="text-sm font-semibold text-muted">בחרו את המשפחה שלכם</span>
                <select
                  name="claimHouseholdId"
                  value={claim}
                  onChange={(e) => setClaim(e.target.value)}
                  className={field}
                >
                  <option value="">אנחנו משפחה חדשה</option>
                  {/* Two groups, because they are two different things: being
                      the first of your family in, or joining somebody who is
                      already here. Unlabelled they read as one list of names. */}
                  {claimable.some((h) => !h.joined) && (
                    <optgroup label="נוספו בשם, ועוד לא נרשמו">
                      {claimable
                        .filter((h) => !h.joined)
                        .map((h) => (
                          <option key={h.id} value={h.id}>
                            {h.name}
                          </option>
                        ))}
                    </optgroup>
                  )}
                  {claimable.some((h) => h.joined) && (
                    <optgroup label="כבר באפליקציה — תצטרפו אליהם">
                      {claimable
                        .filter((h) => h.joined)
                        .map((h) => (
                          <option key={h.id} value={h.id}>
                            {h.name}
                          </option>
                        ))}
                    </optgroup>
                  )}
                </select>
                <span className="text-xs text-muted">
                  {claim && claimable.find((h) => h.id === claim)?.joined
                    ? 'מישהו מהמשפחה כבר נרשם — אתם מצטרפים אליו, ותראו את אותן התשובות.'
                    : 'כך לא ייווצרו שתי רשומות לאותה משפחה.'}
                </span>
              </label>
            ) : (
              <button
                type="button"
                onClick={() => setClaiming(true)}
                className="flex w-full items-center gap-3 rounded-2xl border border-brand/40 bg-brand-wash px-4 py-3.5 text-start transition active:scale-[0.99]"
              >
                <span className="text-xl" aria-hidden="true">👪</span>
                <span className="grow">
                  <span className="block text-sm font-bold text-brand">
                    המשפחה שלנו כבר ברשימה
                  </span>
                  <span className="block text-xs text-muted">
                    מישהו כבר הוסיף אתכם? בחרו בשם שלכם במקום לפתוח משפחה חדשה.
                  </span>
                </span>
                <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-brand" fill="none" aria-hidden="true">
                  <path d="M15 5 L8 12 L15 19" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            ))}

        </fieldset>
      )}

      <ErrorNote>{state.error}</ErrorNote>

      {invitedBy ? (
        <>
          {/* Two answers, both spelled out. Tapping a link is not consent to
              being put on somebody's list — and these links get forwarded. */}
          <button
            type="submit"
            name="connect"
            value="yes"
            disabled={pending}
            className={primaryButton}
          >
            {pending ? 'רגע…' : `סיום — ולהצטרף ל${invitedBy}`}
          </button>
          <button
            type="submit"
            name="connect"
            value="no"
            disabled={pending}
            className={secondaryButton}
          >
            להירשם בלי להתחבר ל{invitedBy}
          </button>
        </>
      ) : (
        <button type="submit" disabled={pending} className={primaryButton}>
          {pending ? 'רגע…' : 'סיום'}
        </button>
      )}
    </form>
  );
}
