import { redirect } from 'next/navigation';
import { FamiliesManager } from '@/components/FamiliesManager';
import { quietButton } from '@/components/ui';
import { headers } from 'next/headers';
import { circleOf, findPerson, getHousehold, inviteFor, membersByHousehold } from '@/lib/data';
import { getSessionPhone } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function FamiliesPage() {
  const phone = await getSessionPhone();
  if (!phone) redirect('/');
  const person = await findPerson(phone);
  if (!person) redirect('/');

  const [mine, circle, members, token, head] = await Promise.all([
    getHousehold(person.householdId),
    circleOf(person.householdId),
    membersByHousehold(),
    inviteFor(person.householdId),
    headers(),
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
        householdName={mine?.name ?? ''}
        families={families}
        inviteUrl={`${base}/join/${token}`}
      />
    </div>
  );
}
