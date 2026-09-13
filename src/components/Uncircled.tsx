'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { setCircleMember } from '@/app/actions';
import { colorOf } from '@/lib/circle-colors';
import { Busy, ErrorNote, PlusIcon, card, sectionHeading } from './ui';

/**
 * The families on our list that are in no circle at all.
 *
 * A family outside every circle is invisible in all the places a circle does
 * the work: it gets no colour on any row, no reminder goes to it, and the
 * circle links that bring everybody else in do not carry it. Nothing said so —
 * the only sign was a row with no dot on it, which reads as an absence rather
 * than as something to fix.
 *
 * So it is said, beside the other thing worth doing next, and with the fixing
 * on the same line: the circles as chips to drop them into, or a new circle
 * started with them already in it.
 */
export function Uncircled({
  families,
  circles,
}: {
  families: { id: string; name: string }[];
  circles: { id: string; name: string; color: string }[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  if (families.length === 0) return null;

  async function put(circleId: string, family: { id: string; name: string }) {
    setBusy(`${circleId}\u0000${family.id}`);
    setError('');
    const result = await setCircleMember(circleId, family.id, true);
    setBusy('');
    if (result.error) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <section className={`${card} flex flex-col gap-2 p-0`}>
      <div className="px-5 pt-4">
        <h2 className={sectionHeading}>
          {families.length === 1 ? 'משפחה אחת עוד לא במעגל' : `${families.length} משפחות עוד לא במעגל`}
        </h2>
        {/* What a circle is, before what it does. The old line listed features
            of a thing nobody had defined — and promised one the app does not
            have: nothing is sent to anybody on its own. The reminder is a
            message you write, when you decide to. */}
        <p className="text-xs leading-relaxed text-muted">
          מעגל הוא קבוצת משפחות שמוזמנות יחד בדרך כלל — «משפחות כץ ולוי»,
          «השכנים מהבניין». כולן רואות זו את זו, נכנסות בקישור הזמנה אחד,
          ואפשר לשלוח לכולן הודעה אחת לפני חג.
        </p>
      </div>

      <ul className="divide-y divide-line">
        {families.map((family) => (
          <li key={family.id} className="flex flex-col gap-2 px-5 py-3">
            <span className="flex items-center gap-2 font-semibold break-words text-ink">
              {/* The empty ring is the point: every other family on this screen
                  carries a filled dot for each circle it is in. */}
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full border border-dashed border-muted"
                aria-hidden="true"
              />
              {family.name}
            </span>
            <div className="flex flex-wrap items-center gap-2">
              {circles.map((circle) => (
                <button
                  key={circle.id}
                  type="button"
                  disabled={busy !== ''}
                  onClick={() => put(circle.id, family)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-xs font-bold text-ink transition active:scale-95 disabled:opacity-50"
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/10"
                    style={{ backgroundColor: colorOf(circle.color) }}
                    aria-hidden="true"
                  />
                  <Busy busy={busy === `${circle.id}\u0000${family.id}`}>{circle.name}</Busy>
                </button>
              ))}
              {/* Starting one with them in it, rather than making the circle
                  first and coming back to find them again. */}
              <Link
                href={`/families?with=${encodeURIComponent(family.id)}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-brand/40 bg-brand-wash px-3 py-1 text-xs font-bold text-brand transition active:scale-95"
              >
                <PlusIcon className="h-3.5 w-3.5" />
                מעגל חדש
              </Link>
            </div>
          </li>
        ))}
      </ul>
      <div className="px-5 pb-3">
        <ErrorNote>{error}</ErrorNote>
      </div>
    </section>
  );
}
