import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import { BottomNav } from '@/components/BottomNav';
import { Footer } from '@/components/Footer';
import { HouseholdMenu } from '@/components/HouseholdMenu';
import { findPerson, getHousehold, unansweredUpcoming } from '@/lib/data';
import { getSessionPhone } from '@/lib/session';
import { usingLocalSheet } from '@/lib/sheet';
import './globals.css';

export const metadata: Metadata = {
  title: 'איפה אתם בחג?',
  description: 'מי מארח ומי מתארח, חג אחרי חג',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'איפה בחג' },
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/favicon.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
  },
  /*
   * Every invitation this app sends is a WhatsApp link, and until now each one
   * arrived as a bare address — which is what a stranger's link looks like too.
   * These are what turns it into a card with the app's mark on it, so an
   * invitation from a sister reads as an invitation.
   */
  openGraph: {
    type: 'website',
    locale: 'he_IL',
    siteName: 'איפה אתם בחג?',
    title: 'איפה אתם בחג?',
    description: 'מי מארח ומי מתארח, חג אחרי חג',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'איפה אתם בחג?' }],
  },
  twitter: { card: 'summary_large_image', images: ['/og.png'] },
};

/**
 * The iPhone screens worth naming a launch image for: the pixel size the file
 * is drawn at, then the CSS size and pixel ratio iOS matches the link against.
 * Kept beside the tags rather than in the generator — the generator draws
 * whatever sizes it is told, and this is the list of what the page asks for.
 */
const SPLASH = [
  [1170, 2532, 390, 844, 3],
  [1179, 2556, 393, 852, 3],
  [1284, 2778, 428, 926, 3],
  [1290, 2796, 430, 932, 3],
  [1125, 2436, 375, 812, 3],
  [828, 1792, 414, 896, 2],
  [750, 1334, 375, 667, 2],
] as const;

export const viewport: Viewport = {
  themeColor: '#7c2740',
  width: 'device-width',
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // The tab bar only makes sense once there is somewhere to go.
  const phone = await getSessionPhone();
  const person = phone ? await findPerson(phone) : undefined;
  const household = person ? await getHousehold(person.householdId) : undefined;
  const signedIn = Boolean(person);

  // What each tab is holding. History is never marked: see BottomNav.
  // The circles tab is never marked either: nothing accumulates there waiting
  // to be dealt with — families arrive on the list already, through a circle.
  const unanswered = person ? await unansweredUpcoming(person.householdId) : [];
  const waiting = {
    '/': unanswered.length > 0,
    '/families': false,
  };

  const head = await headers();
  const appUrl = `${head.get('x-forwarded-proto') ?? 'http'}://${head.get('host') ?? 'localhost'}`;

  return (
    <html lang="he" dir="rtl">
      <head>
        {/* Which store this server is on, so a test run can refuse to touch a
            real sheet. It costs one tag on a laptop and nothing anywhere else:
            a deployment has a SHEET_ID and never renders it. */}
        {usingLocalSheet() && <meta name="holidaytracer-store" content="local" />}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Frank+Ruhl+Libre:wght@400;500;700&family=Assistant:wght@400;600;700&display=swap"
        />
        {/* What iOS holds on screen while the app opens from the home screen.
            It matches on exact device sizes and nothing else, so each screen it
            is worth naming gets its own; anything not here opens on the same
            deep red the manifest names, which is what these are made of, so
            nobody meets a white flash either way. */}
        {SPLASH.map(([w, h, cssW, cssH, ratio]) => (
          <link
            key={`${w}x${h}`}
            rel="apple-touch-startup-image"
            href={`/splash-${w}x${h}.png`}
            media={`(device-width: ${cssW}px) and (device-height: ${cssH}px) and (-webkit-device-pixel-ratio: ${ratio})`}
          />
        ))}
      </head>
      <body className="min-h-dvh">
        {/* Set PLAYGROUND on a deployment pointed at a scratch sheet. Knowing
            which one you are looking at cannot depend on remembering which tab
            is which. */}
        {process.env.PLAYGROUND && (
          <p className="sticky top-0 z-50 bg-brand px-4 py-1.5 text-center text-xs font-bold text-white">
            סביבת ניסיון · הנתונים כאן לא אמיתיים · אפשר להיכנס עם כל מספר
          </p>
        )}
        {/* Who you are, in the same place on every screen — not only on the one
            that happens to ask a question. */}
        {signedIn && (
          <div className="mx-auto flex w-full max-w-md justify-center px-5 pt-5">
            <HouseholdMenu
              householdName={household?.name ?? ''}
              personName={person?.name ?? ''}
              appUrl={appUrl}
            />
          </div>
        )}
        <main
          className={`mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5 ${
            signedIn ? 'pt-4 pb-[calc(8rem+env(safe-area-inset-bottom))]' : 'pt-10 pb-10'
          }`}
        >
          {children}
        </main>
        {/* After the screen rather than inside it: `main` fills the viewport and
            centres what it holds, so anything added to it would be centred with
            the content instead of ending it. */}
        <Footer signedIn={signedIn} />
        {signedIn && <BottomNav waiting={waiting} />}
      </body>
    </html>
  );
}
