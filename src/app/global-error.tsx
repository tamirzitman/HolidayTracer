'use client';

import { useState } from 'react';
import { card, primaryButton, Spinner, Title } from '@/components/ui';
import './globals.css';

/**
 * What is left on screen when the spreadsheet cannot be read.
 *
 * Here rather than in an error.tsx because the root layout reads the sheet
 * too — who you are, what is waiting — so when Google has a bad minute it is
 * the layout that fails first, and only this file stands in for that. The
 * alternative was Next's own page: English, white, and saying the app broke,
 * to somebody at a holiday table who only wanted to see where the family is
 * eating. Almost always it is the network or Google, and trying again is the
 * whole answer.
 */
export default function GlobalError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const [trying, setTrying] = useState(false);
  return (
    <html lang="he" dir="rtl">
      <body className="min-h-dvh">
        <title>איפה אתם בחג?</title>
        <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5 py-10">
          <div className={`${card} flex flex-col gap-5`}>
            <Title>משהו לא נטען</Title>
            <p className="text-lg text-muted">
              לא הצלחנו להגיע לרשימה כרגע. כנראה החיבור או רגע עמוס — שום דבר לא נמחק.
            </p>
            <button
              type="button"
              className={primaryButton}
              disabled={trying}
              onClick={() => {
                setTrying(true);
                retry();
                // retry() re-renders in place when it works; when it does not,
                // this screen comes back and the button has to be usable again.
                setTimeout(() => setTrying(false), 4000);
              }}
            >
              {trying ? <Spinner /> : 'לנסות שוב'}
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
