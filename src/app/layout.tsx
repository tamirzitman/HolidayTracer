import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import { BottomNav } from '@/components/BottomNav';
import { HouseholdMenu } from '@/components/HouseholdMenu';
import { findPerson, getHousehold } from '@/lib/data';
import { getSessionPhone } from '@/lib/session';
import './globals.css';

export const metadata: Metadata = {
  title: 'איפה אתם בחג?',
  description: 'מי מארח ומי מתארח, חג אחרי חג',
};

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

  const head = await headers();
  const appUrl = `${head.get('x-forwarded-proto') ?? 'http'}://${head.get('host') ?? 'localhost'}`;

  return (
    <html lang="he" dir="rtl">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Frank+Ruhl+Libre:wght@400;500;700&family=Assistant:wght@400;600;700&display=swap"
        />
      </head>
      <body className="min-h-dvh">
        {/* Set PLAYGROUND on a deployment pointed at a scratch sheet. Knowing
            which one you are looking at cannot depend on remembering which tab
            is which. */}
        {process.env.PLAYGROUND && (
          <p className="sticky top-0 z-50 bg-brand px-4 py-1.5 text-center text-xs font-bold text-white">
            סביבת ניסיון · הנתונים כאן לא אמיתיים
          </p>
        )}
        {/* Who you are, in the same place on every screen — not only on the one
            that happens to ask a question. */}
        {signedIn && (
          <div className="mx-auto flex w-full max-w-md justify-center px-5 pt-5">
            <HouseholdMenu householdName={household?.name ?? ''} appUrl={appUrl} />
          </div>
        )}
        <main
          className={`mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5 ${
            signedIn ? 'pt-4 pb-28' : 'pt-10 pb-10'
          }`}
        >
          {children}
        </main>
        {signedIn && <BottomNav />}
      </body>
    </html>
  );
}
