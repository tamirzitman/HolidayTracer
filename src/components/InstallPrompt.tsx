'use client';

import { useEffect, useRef, useState } from 'react';
import { BRAND, brandGround } from '@/lib/brand';
import { Mark } from './Mark';

/** Chrome hands this over when it is willing to install the app itself. */
type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

const PUT_OFF = 'holidaytracer:install-put-off';

/** Opened from the home screen already: there is nothing to offer. */
function alreadyInstalled(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/**
 * An offer to put the app on the phone's home screen.
 *
 * This is a family app opened a handful of times a year, which is exactly the
 * kind nobody can find again: the link is somewhere in a WhatsApp thread from
 * last Pesach. On the home screen it is where every other app is.
 *
 * Two paths, because the platforms do not agree. Chrome hands over an event and
 * will do the installing itself — but only when it judges the app installable,
 * and one of its conditions is a service worker this app has not got, so the
 * event may simply never arrive. Safari has no API at all and never will. So
 * the offer waits a moment for Chrome, and otherwise says how to do it by hand
 * in the words of whichever platform is asking. Everybody gets a way in.
 *
 * Put off once and it stays put off — this is a suggestion, and a suggestion
 * that keeps coming back is a nag.
 */
export function InstallPrompt() {
  const [offer, setOffer] = useState<InstallEvent | null>(null);
  const [byHand, setByHand] = useState<'ios' | 'menu' | null>(null);
  const [gone, setGone] = useState(false);
  const chromeSpoke = useRef(false);

  useEffect(() => {
    if (alreadyInstalled()) return;
    try {
      if (localStorage.getItem(PUT_OFF) === 'yes') return;
    } catch {
      // Private mode, or storage turned off. Offering again is the lesser harm.
    }

    const take = (e: Event) => {
      e.preventDefault();
      chromeSpoke.current = true;
      setOffer(e as InstallEvent);
      setByHand(null);
    };
    window.addEventListener('beforeinstallprompt', take);

    // Long enough for Chrome to speak first, short enough that nobody notices
    // the wait. If it stays quiet, say how to do it by hand instead.
    const onIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const waiting = window.setTimeout(() => {
      if (!chromeSpoke.current) setByHand(onIos ? 'ios' : 'menu');
    }, 1200);

    // Installed from under us — by the browser's own menu, say.
    const done = () => setGone(true);
    window.addEventListener('appinstalled', done);

    return () => {
      window.removeEventListener('beforeinstallprompt', take);
      window.removeEventListener('appinstalled', done);
      window.clearTimeout(waiting);
    };
  }, []);

  if (gone || (!offer && !byHand)) return null;

  const putOff = () => {
    try {
      localStorage.setItem(PUT_OFF, 'yes');
    } catch {
      // Then it comes back next time. Nothing worth breaking the tap over.
    }
    setGone(true);
  };

  const install = async () => {
    if (!offer) return;
    await offer.prompt();
    // Whatever they chose, the browser will not offer this event again now.
    await offer.userChoice.catch(() => undefined);
    setGone(true);
  };

  return (
    <div className="mx-auto w-full max-w-md px-5 pt-3">
      <div className="flex items-start gap-3 rounded-2xl border border-line bg-surface p-3.5">
        <span
          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl"
          style={{ background: brandGround('130% 110% at 50% 30%') }}
        >
          <Mark className="h-6 w-7" style={{ color: BRAND.gold }} />
        </span>

        <div className="flex min-w-0 grow flex-col gap-1.5">
          <p className="text-sm font-bold text-ink">להוסיף את האפליקציה למסך הבית?</p>
          <p className="text-xs leading-relaxed text-muted">
            {offer
              ? 'כך היא נפתחת בנגיעה אחת, בלי לחפש את הקישור בוואטסאפ מלפני חצי שנה.'
              : byHand === 'ios'
                ? 'בכפתור השיתוף של הדפדפן, ואז «הוספה למסך הבית».'
                : 'בתפריט הדפדפן, ואז «הוספה למסך הבית» או «התקנת אפליקציה».'}
          </p>
          <div className="mt-1 flex items-center gap-4">
            {offer && (
              <button
                type="button"
                onClick={install}
                className="shrink-0 rounded-full border border-brand bg-brand px-4 py-1.5 text-sm font-bold whitespace-nowrap text-ground transition active:scale-95"
              >
                הוספה
              </button>
            )}
            <button type="button" onClick={putOff} className="text-xs font-semibold text-muted">
              לא עכשיו
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
