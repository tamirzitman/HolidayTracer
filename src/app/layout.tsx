import type { Metadata, Viewport } from 'next';
import { BottomNav } from '@/components/BottomNav';
import { findPerson } from '@/lib/data';
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
  const signedIn = phone ? Boolean(await findPerson(phone)) : false;

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
        <main
          className={`mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5 pt-10 ${
            signedIn ? 'pb-28' : 'pb-10'
          }`}
        >
          {children}
        </main>
        {signedIn && <BottomNav />}
      </body>
    </html>
  );
}
