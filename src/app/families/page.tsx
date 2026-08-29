import { redirect } from 'next/navigation';
import { FamiliesManager } from '@/components/FamiliesManager';
import { headers } from 'next/headers';
import {
  circleNames,
  circlesOf,
  findPerson,
  inviteFor,
  membersByHousehold,
  suggestionsFor,
} from '@/lib/data';
import { getSessionPhone } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function FamiliesPage() {
  const phone = await getSessionPhone();
  if (!phone) redirect('/');
  const person = await findPerson(phone);
  if (!person) redirect('/');

  const [circles, members, token, head, suggested, knownCircles] = await Promise.all([
    circlesOf(person.householdId),
    membersByHousehold(),
    inviteFor(person.householdId),
    headers(),
    suggestionsFor(person.householdId),
    circleNames(person.householdId),
  ]);

  const base = `${head.get('x-forwarded-proto') ?? 'http'}://${head.get('host') ?? 'localhost'}`;
  // Grouped the way the family actually is: one list per circle.
  const grouped = circles.map((c) => ({
    name: c.name,
    families: c.families.map((h) => ({
      id: h.id,
      name: h.name,
      members: members.get(h.id) ?? [],
    })),
  }));

  return (
    <div className="flex flex-col gap-6">
      <FamiliesManager
        circles={grouped}
        inviteUrl={`${base}/join/${token}`}
        knownCircles={knownCircles}
        suggested={suggested.map((s) => ({
          id: s.household.id,
          name: s.household.name,
          seenBy: s.seenBy,
        }))}
      />
    </div>
  );
}
