import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Title, card, quietButton } from '@/components/ui';
import { findPerson, historyFor } from '@/lib/data';
import { getSessionPhone } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function HistoryPage() {
  const phone = await getSessionPhone();
  if (!phone) redirect('/');

  const person = await findPerson(phone);
  if (!person) redirect('/');

  const past = await historyFor(person.householdId);

  return (
    <div className="flex flex-col gap-5">
      <Title>איפה היינו</Title>

      {past.length === 0 ? (
        <p className="text-muted">עוד לא נאסף כאן כלום. אחרי החג הראשון תופיע כאן שורה.</p>
      ) : (
        <ul className={`${card} divide-y divide-line p-0`}>
          {past.map(({ holiday, answer }) => (
            <li key={holiday.key} className="flex flex-col gap-0.5 px-5 py-4">
              <span className="font-display text-lg font-bold text-ink">{holiday.nameHe}</span>
              <span className="text-muted">
                {answer.kind === 'hosting' ? 'אירחנו' : `היינו אצל ${answer.hostHouseholdName}`}
              </span>
              <span className="text-sm text-muted">{holiday.hebrewDate}</span>
            </li>
          ))}
        </ul>
      )}

      <Link href="/" className={`${quietButton} text-center`}>
        חזרה לחג הקרוב
      </Link>
    </div>
  );
}
