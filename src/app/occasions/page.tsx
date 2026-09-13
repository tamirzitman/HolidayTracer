import { redirect } from 'next/navigation';
import { OccasionsManager } from '@/components/OccasionsManager';
import { circleOf, circlesFor, circleTags, findPerson, occasionsOf, todayInIsrael } from '@/lib/data';
import { getSessionPhone } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function OccasionsPage() {
  const phone = await getSessionPhone();
  if (!phone) redirect('/');
  const person = await findPerson(phone);
  if (!person) redirect('/');

  const [mine, circle, circles, tags] = await Promise.all([
    occasionsOf(person.householdId),
    circleOf(person.householdId),
    circlesFor(person.householdId),
    circleTags(person.householdId),
  ]);

  return (
    <OccasionsManager
      today={todayInIsrael()}
      circle={circle.map((h) => ({ id: h.id, name: h.name }))}
      circles={circles}
      tags={Object.fromEntries(tags)}
      occasions={mine
        .filter((o) => o.include)
        .map((o) => ({
          key: o.key,
          name: o.nameHe,
          emoji: o.emoji,
          date: o.date,
          sharedWith: o.sharedWith,
        }))}
    />
  );
}
