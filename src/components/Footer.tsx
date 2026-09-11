'use client';

import { usePathname } from 'next/navigation';
import { mutedButton } from './ui';

/** Which screen somebody was looking at, in words a bug report can carry. */
function screenName(pathname: string): string {
  if (pathname === '/') return 'מסך החג';
  if (pathname.startsWith('/families')) return 'מסך המעגלים';
  if (pathname.startsWith('/history')) return 'מסך ההיסטוריה';
  if (pathname.startsWith('/occasions')) return 'מסך המועדים';
  if (pathname.startsWith('/join')) return 'מסך ההצטרפות';
  return pathname;
}

/**
 * The end of every screen, and deliberately not part of it.
 *
 * Three things live here and nothing else: which version is on the screen, a
 * way to say something is broken, and the fact that this was written with AI
 * and can be wrong. A rule and a gap separate it from the app, because a version
 * number that reads as content is a version number people try to tap.
 *
 * The address is written out rather than hidden behind a word: somebody who
 * would rather write from their own mail app needs to be able to read it.
 */
export function Footer({ signedIn }: { signedIn: boolean }) {
  const pathname = usePathname();
  // Inlined at build time from package.json — see next.config.ts. The footer
  // cannot show a version the release does not have.
  const version = process.env.NEXT_PUBLIC_APP_VERSION ?? '';

  // A plain mailto produces "לא עובד" with nothing to go on. This one arrives
  // already saying which version and which screen, which is most of a bug
  // report — and costs the person sending it exactly one tap either way.
  const subject = `איפה אתם בחג? — בעיה בגרסה ${version}`;
  const body = `מה קרה?\n\n\n\n—\n${screenName(pathname)} · גרסה ${version}`;
  const mailto =
    `mailto:tamirzitman@gmail.com?subject=${encodeURIComponent(subject)}` +
    `&body=${encodeURIComponent(body)}`;

  return (
    <footer
      className={`mx-auto w-full max-w-md px-5 ${
        // Clear of the tab bar, which is fixed over everything.
        signedIn ? 'pb-[calc(7rem+env(safe-area-inset-bottom))]' : 'pb-10'
      }`}
    >
      <div className="flex flex-col items-center gap-3 border-t border-line pt-6 text-center">
        {/* The version alone, without the app's name in front of it. The name
            is already the title of the sign-in screen and of the question this
            app asks, and a second copy of it down here is both a repetition and
            a trap: anything looking for that text by name — the test suite did —
            finds the footer on every screen instead of the screen it meant. */}
        <p className="text-xs font-semibold text-muted">גרסה {version}</p>

        <a href={mailto} className={mutedButton}>
          משהו לא עובד? כתבו לי
        </a>
        <p className="text-xs text-muted" dir="ltr">
          tamirzitman@gmail.com
        </p>

        <p className="max-w-xs text-xs leading-relaxed text-muted">
          האפליקציה נבנתה בעזרת בינה מלאכותית — ייתכנו טעויות. אם משהו נראה לא
          נכון, זה שווה הודעה.
        </p>
      </div>
    </footer>
  );
}
