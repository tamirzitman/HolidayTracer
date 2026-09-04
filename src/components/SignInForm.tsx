'use client';

import { useActionState, useState } from 'react';
import { signIn, type ActionResult } from '@/app/actions';
import { formatPhone } from '@/lib/phone';
import { askForLink } from '@/lib/whatsapp';
import { WhatsAppMark } from './WhatsApp';
import { ErrorNote, Title, card, field, primaryButton, quietButton } from './ui';

export function SignInForm({ invitedBy, token }: { invitedBy?: string; token?: string } = {}) {
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(signIn, {});
  const [typed, setTyped] = useState('');
  // Dismissing the turned-away screen. The result object is what is dismissed,
  // not a counter: each submit yields a fresh result, so a new refusal shows
  // again, while typing into the form does not bring the old one back.
  const [dismissed, setDismissed] = useState<ActionResult | null>(null);

  if (state.blocked && dismissed !== state) {
    return <KnownNumber phone={typed} onRetry={() => setDismissed(state)} />;
  }

  return (
    <form action={formAction} className={`${card} flex flex-col gap-5`}>
      {token && <input type="hidden" name="next" value={`/join/${token}`} />}
      <div className="flex flex-col gap-2">
        {invitedBy && (
          <span className="text-4xl" aria-hidden="true">
            👋
          </span>
        )}
        <Title>{invitedBy ? `${invitedBy} הזמינו אתכם` : 'איפה אתם בחג?'}</Title>
        <p className="text-muted">הזינו את מספר הטלפון שלכם. פעם אחת, ונזכור אתכם.</p>
      </div>

      <label className="flex flex-col gap-2">
        <span className="text-sm font-semibold text-muted">מספר טלפון</span>
        <input
          key={dismissed ? 'again' : 'first'}
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          dir="ltr"
          required
          placeholder="050-123-4567"
          onChange={(e) => setTyped(e.target.value)}
          className={`${field} text-center`}
        />
      </label>

      <ErrorNote>{state.error}</ErrorNote>

      <button type="submit" disabled={pending} className={primaryButton}>
        {pending ? 'רגע…' : 'כניסה'}
      </button>
    </form>
  );
}

/**
 * A known number, typed on a device nothing vouches for. Not an error screen:
 * it says what will let them in and hands them the way to ask for it.
 *
 * Deliberately names nobody. Whoever could send the link is exactly the list of
 * this person's family, and this screen is shown to anyone who types the
 * number — so the asking goes out with no recipient, and they choose.
 */
function KnownNumber({ phone, onRetry }: { phone: string; onRetry: () => void }) {
  return (
    <div className={`${card} flex flex-col gap-4 text-center`}>
      <span className="text-4xl" aria-hidden="true">🔐</span>
      <Title>המספר הזה כבר מוכר</Title>
      {/* Which number. Without it there is no way to tell a refusal from a
          digit typed wrong, and the way out is to notice it is not yours. */}
      {phone && (
        <p className="text-lg font-bold text-ink" dir="ltr">
          {formatPhone(phone) || phone}
        </p>
      )}
      <p className="text-muted">
        כדי להיכנס ממכשיר חדש צריך קישור אישי ממישהו מהמשפחה — מי שגר איתכם, או
        מישהו מהמעגל שלכם. הם שולחים אותו מהאפליקציה, בנגיעה.
      </p>
      <a
        href={askForLink(formatPhone(phone) || phone)}
        target="_blank"
        rel="noopener noreferrer"
        className={`${primaryButton} inline-flex items-center justify-center gap-2`}
      >
        <WhatsAppMark />
        לבקש קישור בוואטסאפ
      </a>
      <p className="text-xs text-muted">כבר קיבלתם קישור? פתחו אותו מהטלפון הזה.</p>
      <button type="button" onClick={onRetry} className={quietButton}>
        זה לא המספר שלי
      </button>
    </div>
  );
}
