'use client';

import { useActionState } from 'react';
import { acceptInvite, type ActionResult } from '@/app/actions';
import { ErrorNote, Title, card, primaryButton, quietButton } from './ui';

/**
 * Somebody already in the app has opened an invite link. Connecting is not
 * something to do because a link was tapped: these links get forwarded, and a
 * friend who opens one out of curiosity should end up with the app, not on your
 * list. So it is asked, plainly, with the other answer given equal room.
 *
 * A circle link says so, because it is a bigger answer than the other: yes puts
 * every family in that circle on their list, and them on every one of those.
 */
export function ConnectPrompt({
  token,
  invitedBy,
  circleName,
}: {
  token: string;
  invitedBy: string;
  /** Set when the link is a circle's. Then joining is joining everybody in it. */
  circleName: string;
}) {
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(acceptInvite, {});

  return (
    <form action={formAction} className={`${card} flex flex-col gap-4 text-center`}>
      <input type="hidden" name="token" value={token} />
      <span className="text-4xl" aria-hidden="true">🤝</span>
      <Title>
        {circleName ? `${invitedBy} מזמינים אתכם למעגל «${circleName}»` : `${invitedBy} מזמינים אתכם`}
      </Title>
      <p className="text-muted">
        {circleName
          ? `אם תצטרפו, כל המשפחות ב«${circleName}» יופיעו ברשימה שלכם ואתם ברשימה שלהן — ותראו מה כל אחת ענתה על כל חג.`
          : `אם תצטרפו, ${invitedBy} יופיעו ברשימה שלכם ואתם ברשימה שלהם — ותראו מה כל אחד ענה על כל חג.`}
      </p>

      <ErrorNote>{state.error}</ErrorNote>

      <button type="submit" name="connect" value="yes" disabled={pending} className={primaryButton}>
        {pending ? 'רגע…' : circleName ? `להצטרף ל«${circleName}»` : `להצטרף ל${invitedBy}`}
      </button>
      <button type="submit" name="connect" value="no" disabled={pending} className={quietButton}>
        לא, רק רציתי את האפליקציה
      </button>
    </form>
  );
}
