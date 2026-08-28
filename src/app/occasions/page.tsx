import { redirect } from 'next/navigation';
import { OccasionsManager } from '@/components/OccasionsManager';
import { findPerson, occasionsOf, todayInIsrael } from '@/lib/data';
import { getSessionPhone } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function OccasionsPage() {
  const phone = await getSessionPhone();
  if (!phone) redirect('/');
  const person = await findPerson(phone);
  if (!person) redirect('/');

  const mine = await occasionsOf(person.householdId);

  return (
    <OccasionsManager
      today={todayInIsrael()}
      occasions={mine
        .filter((o) => o.include)
        .map((o) => ({ key: o.key, name: o.nameHe, date: o.date }))}
    />
  );
}
