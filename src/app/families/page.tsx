import { redirect } from 'next/navigation';
import { FamiliesManager } from '@/components/FamiliesManager';
import { headers } from 'next/headers';
import { circleOf, findPerson, inviteFor, membersByHousehold, suggestionsFor } from '@/lib/data';
import { getSessionPhone } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function FamiliesPage() {
  const phone = await getSessionPhone();
  if (!phone) redirect('/');
  const person = await findPerson(phone);
  if (!person) redirect('/');

  const [circle, members, token, head, suggested] = await Promise.all([
    circleOf(person.householdId),
    membersByHousehold(),
    inviteFor(person.householdId),
    headers(),
    suggestionsFor(person.householdId),
  ]);

  const base = `${head.get('x-forwarded-proto') ?? 'http'}://${head.get('host') ?? 'localhost'}`;
  const families = circle.map((h) => ({
    id: h.id,
    name: h.name,
    members: members.get(h.id) ?? [],
  }));

  return (
    <div className="flex flex-col gap-6">
      <FamiliesManager
        families={families}
        inviteUrl={`${base}/join/${token}`}
        suggested={suggested.map((s) => ({
          id: s.household.id,
          name: s.household.name,
          seenBy: s.seenBy,
        }))}
      />
    </div>
  );
}
