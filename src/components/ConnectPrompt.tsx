'use client';

import { useActionState } from 'react';
import { acceptInvite, type ActionResult } from '@/app/actions';
import { ErrorNote, Title, card, primaryButton, quietButton } from './ui';

/**
 * Somebody already in the app has opened an invite link. Connecting two
 * households is not something to do because a link was tapped: these links get
 * forwarded, and a friend who opens one out of curiosity should end up with the
 * app, not on your list. So it is asked, plainly, with the other answer given
 * equal room.
 */
export function ConnectPrompt({ token, invitedBy }: { token: string; invitedBy: string }) {
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(acceptInvite, {});

  return (
    <form action={formAction} className={`${card} flex flex-col gap-4 text-center`}>
      <input type="hidden" name="token" value={token} />
      <span className="text-4xl" aria-hidden="true">🤝</span>
      <Title>{invitedBy} מזמינים אתכם</Title>
      <p className="text-muted">
        אם תצטרפו, {invitedBy} יופיעו ברשימה שלכם ואתם ברשימה שלהם — ותראו מה כל אחד
        ענה על כל חג.
      </p>

      <ErrorNote>{state.error}</ErrorNote>

      <button type="submit" name="connect" value="yes" disabled={pending} className={primaryButton}>
        {pending ? 'רגע…' : `להצטרף ל${invitedBy}`}
      </button>
      <button type="submit" name="connect" value="no" disabled={pending} className={quietButton}>
        לא, רק רציתי את האפליקציה
      </button>
    </form>
  );
}
