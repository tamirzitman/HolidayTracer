'use client';

import { useEffect, useState } from 'react';

/**
 * Handing the browser to WhatsApp, and coming back to a usable screen.
 *
 * A one-tap invite has to make the link before it can send it, so the button
 * says "רגע…" while that happens. Then it hands off — and on a phone WhatsApp
 * opens over this page rather than replacing it, so nothing here runs again.
 * Left alone, the button says "רגע…" for ever, and the only way out is a
 * reload.
 *
 * So the wait is cleared the moment the hand-off is issued, and again whenever
 * the page is shown — which covers coming back from WhatsApp, and the restore
 * from the back-forward cache that a real navigation leaves behind.
 */
export function useHandoff(): {
  busy: boolean;
  start: () => void;
  stop: () => void;
  go: (url: string) => void;
} {
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const clear = () => setBusy(false);
    window.addEventListener('pageshow', clear);
    document.addEventListener('visibilitychange', clear);
    return () => {
      window.removeEventListener('pageshow', clear);
      document.removeEventListener('visibilitychange', clear);
    };
  }, []);

  return {
    busy,
    start: () => setBusy(true),
    stop: () => setBusy(false),
    go: (url: string) => {
      window.location.href = url;
      setBusy(false);
    },
  };
}
