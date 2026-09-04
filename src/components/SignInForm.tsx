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
  // Dismissing the turned-away screen: the same form again, with the number
  // cleared, since the likeliest reason to be here is a digit typed wrong.
  const [retry, setRetry] = useState(0);

  if (state.blocked && retry === 0) {
    return <KnownNumber phone={typed} onRetry={() => setRetry(1)} />;
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
          key={retry}
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          dir="ltr"
          required
          placeholder="050-123-4567"
          onChange={(e) => {
            setTyped(e.target.value);
            setRetry(0);
          }}
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
