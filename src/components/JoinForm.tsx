'use client';

import { useActionState, useState } from 'react';
import { register, type ActionResult } from '@/app/actions';
import { formatPhone } from '@/lib/phone';
import { CirclePicker } from './CirclePicker';
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
  const [firstName, setFirstName] = useState('');
  const [surname, setSurname] = useState('');
  // Follows the two name fields until it is edited, and then stops following.
  const [touched, setTouched] = useState(false);
  const suggested = familyName(firstName, surname);
  const [typed, setHouseholdRaw] = useState('');
  const household = touched ? typed : suggested;
  const setHousehold = (value: string) => setHouseholdRaw(value);
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

      {/* One question about names, not two. Asking "what are you called?" and
          then "what will your family be called?" left people answering the same
          thing twice and unsure which was which. Your own name is asked in its
          two halves, and the family name follows from them — already filled in,
          and yours to change into whatever the family actually goes by. */}
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

      {kind === 'family' && (
        <>
          {!claim && (
            <label className="flex flex-col gap-2">
              <span className="text-sm font-semibold text-muted">
                איך המשפחה שלכם תיקרא לאחרים?
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

          {claimable.length > 0 && (
            <label className="flex flex-col gap-2">
              <span className="text-sm font-semibold text-muted">או שאתם כבר ברשימה?</span>
              <select
                name="claimHouseholdId"
                value={claim}
                onChange={(e) => setClaim(e.target.value)}
                className={field}
              >
                <option value="">לא, אנחנו משפחה חדשה</option>
                {claimable.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
              </select>
              <span className="text-xs text-muted">
                אם מישהו כבר הוסיף אתכם — בחרו בשם שלכם, כדי שלא ייווצרו שתי משפחות נפרדות.
              </span>
            </label>
          )}

          {/* The whole point of arriving on somebody's invite: their list is
              probably most of yours. Deciding here costs the inviter nothing
              and saves the newcomer from an app with one family in it. */}
          <CirclePicker
            name="share"
            families={circle}
            chosen={share}
            onChange={setShare}
            legend={`${invitedBy} רואים גם את אלה. מי מהן רלוונטית לכם?`}
          />
        </>
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
