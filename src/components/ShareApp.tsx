import { WhatsAppMark } from './WhatsApp';
import { shareApp } from '@/lib/whatsapp';

/**
 * Telling somebody the app exists. Not an invitation — no token, so it
 * introduces nobody to anybody — which is why it sits at the foot of the page
 * rather than among the things that put people on each other's lists.
 */
export function ShareApp({ appUrl }: { appUrl: string }) {
  return (
    <footer className="pb-2 text-center">
      <a
        href={shareApp(appUrl)}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 text-xs font-semibold text-muted"
      >
        <span className="text-whatsapp">
          <WhatsAppMark />
        </span>
        שיתוף האפליקציה
      </a>
    </footer>
  );
}
