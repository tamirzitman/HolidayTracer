'use client';

import { useEffect, useRef, type RefObject } from 'react';

/**
 * Anything that opens over the page closes when you touch something else, or
 * press Escape — the way every menu is expected to behave. A menu that only
 * closes by tapping the thing that opened it reads as stuck.
 *
 * Returns the ref to put on the element that counts as "inside".
 */
export function useCloseOnAway<T extends HTMLElement>(
  open: boolean,
  close: () => void,
): RefObject<T | null> {
  const box = useRef<T>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent | TouchEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) close();
    };
    const escape = (e: KeyboardEvent) => e.key === 'Escape' && close();
    // Touch as well as mouse: on a phone a tap elsewhere is the whole of how
    // anybody expects to dismiss this.
    document.addEventListener('mousedown', away);
    document.addEventListener('touchstart', away);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('touchstart', away);
      document.removeEventListener('keydown', escape);
    };
  }, [open, close]);

  return box;
}
