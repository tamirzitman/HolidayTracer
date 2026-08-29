'use client';

import { useEffect, useRef, useState } from 'react';
import { chatWith, inviteVia } from '@/lib/whatsapp';

export type Member = { name: string; phone: string };

/**
 * The WhatsApp glyph. The same mark stands for both errands, because both end
 * up in the same app; an invite carries a small ＋ so the two never blur into
 * each other. Nothing else in the app is allowed to invent a third mark.
 */
export function WhatsAppMark({ invite = false }: { invite?: boolean }) {
  return (
    <span className="relative inline-flex">
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
        <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91S17.5 2 12.04 2Zm5.8 14.16c-.24.68-1.4 1.3-1.95 1.38-.5.07-1.13.1-1.82-.11a16.6 16.6 0 0 1-1.65-.61c-2.9-1.25-4.8-4.17-4.94-4.36-.15-.19-1.19-1.58-1.19-3.02 0-1.44.75-2.14 1.02-2.44.27-.29.59-.37.78-.37h.56c.18 0 .42-.07.66.5.24.58.82 2.02.9 2.16.07.15.12.32.02.51-.1.19-.15.31-.29.48-.15.17-.31.38-.44.51-.15.14-.3.3-.13.59.17.29.75 1.24 1.61 2 1.11.99 2.04 1.3 2.33 1.44.29.15.46.12.63-.07.17-.19.73-.85.92-1.15.19-.29.39-.24.65-.14.27.09 1.7.8 1.99.95.29.14.48.22.55.34.07.12.07.7-.17 1.38Z" />
      </svg>
      {invite && (
        /* Drawn, not typed: a "+" character at this size renders as a notch in
           the glyph rather than as a plus. */
        <span
          aria-hidden="true"
          className="absolute -end-1.5 -top-1.5 grid h-4 w-4 place-items-center rounded-full bg-current ring-2 ring-surface"
        >
          <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="none">
            <path
              d="M6 2v8M2 6h8"
              stroke="var(--color-surface)"
              strokeWidth="2.6"
              strokeLinecap="round"
            />
          </svg>
        </span>
      )}
    </span>
  );
}

const touch =
  'grid h-9 w-9 shrink-0 place-items-center rounded-full text-whatsapp transition active:scale-95';

/**
 * The mark beside a family's name.
 *
 * A family somebody has joined gets a message; one nobody has joined gets an
 * invite, since there is nobody there to write to yet. Where a family has more
 * than one person registered, the mark opens a short list rather than guessing
 * which of them you meant.
 */
export function FamilyWhatsApp({
  familyName,
  members,
  inviteUrl,
}: {
  familyName: string;
  members: Member[];
  /** The inviter's standing join link, for families nobody has joined. */
  inviteUrl: string;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);

  if (members.length === 0) {
    return (
      <a
        href={inviteVia(inviteUrl)}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`הזמנת ${familyName} לאפליקציה בוואטסאפ`}
        title={`הזמנת ${familyName}`}
        className={touch}
      >
        <WhatsAppMark invite />
      </a>
    );
  }

  if (members.length === 1) {
    return (
      <a
        href={chatWith(members[0].phone)}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`הודעה ל${members[0].name} בוואטסאפ`}
        title={`הודעה ל${members[0].name}`}
        className={touch}
      >
        <WhatsAppMark />
      </a>
    );
  }

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((was) => !was)}
        aria-label={`הודעה ל${familyName} בוואטסאפ`}
        aria-expanded={open}
        className={touch}
      >
        <WhatsAppMark />
      </button>
      {open && (
        <ul className="absolute end-0 z-20 mt-1 min-w-36 overflow-hidden rounded-2xl border border-line bg-surface shadow-lg">
          {members.map((member) => (
            <li key={member.phone}>
              <a
                href={chatWith(member.phone)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-ink"
              >
                <span className="text-whatsapp">
                  <WhatsAppMark />
                </span>
                {member.name}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
