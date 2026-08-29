'use client';

import { useActionState, useState } from 'react';
import { register, type ActionResult } from '@/app/actions';
import { formatPhone } from '@/lib/phone';
import { familyName } from '@/lib/names';
import { ErrorNote, Title, card, field, primaryButton, quietButton } from './ui';

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
}: {
  phone: string;
  token: string;
  invitedBy: string;
  kind: 'family' | 'household';
  /** Families already on the inviter's list, which this newcomer may belong to. */
  claimable: { id: string; name: string }[];
}) {
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(register, {});
  const [claim, setClaim] = useState('');
  const [firstName, setFirstName] = useState('');
  const [surname, setSurname] = useState('');
  // Follows the two name fields until it is edited, and then stops following.
  const [touched, setTouched] = useState(false);
  const suggested = familyName(firstName, surname);
  const [typed, setHouseholdRaw] = useState('');
  const household = touched ? typed : suggested;
  const setHousehold = (value: string) => setHouseholdRaw(value);
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
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
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
            value={surname}
            onChange={(e) => setSurname(e.target.value)}
            className={field}
          />
        </label>
      </div>

      </fieldset>

      {kind === 'family' && (
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
                value={household}
                onChange={(e) => {
                  setTouched(true);
                  setHousehold(e.target.value);
                }}
                placeholder="דנה ויוסי כהן"
                className={field}
              />
              <span className="text-xs text-muted">
                אפשר לשנות — למשל להוסיף את בן או בת הזוג.
              </span>
            </label>
          )}

          {/* Most people arriving on a link are new. The ones somebody already
              added by name are the exception, and an exception should not be a
              dropdown everybody has to read past. */}
          {claimable.length > 0 &&
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
                  {claimable.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.name}
                    </option>
                  ))}
                </select>
                <span className="text-xs text-muted">
                  כך לא ייווצרו שתי רשומות לאותה משפחה.
                </span>
              </label>
            ) : (
              <button
                type="button"
                onClick={() => setClaiming(true)}
                className="text-start text-sm font-semibold text-brand underline underline-offset-4"
              >
                המשפחה שלנו כבר ברשימה
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
            className={quietButton}
          >
            רק להירשם, בלי להתחבר לאף אחד
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
