import { redirect } from 'next/navigation';
import { FamiliesManager } from '@/components/FamiliesManager';
import {
  circleOf,
  circlesOf,
  findPerson,
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

  // The invite link is made per circle, on demand, so there is none to fetch here.
  const [circles, members, suggested, everyone] = await Promise.all([
    circlesOf(person.householdId),
    membersByHousehold(),
    suggestionsFor(person.householdId),
    circleOf(person.householdId),
  ]);

  // Grouped the way the family actually is: one list per circle.
  const grouped = circles.map((c) => ({
    id: c.id,
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
        everyone={everyone.map((h) => ({ id: h.id, name: h.name }))}
        suggested={suggested.map((s) => ({
          id: s.circle.id,
          name: s.circle.name,
          seenBy: s.seenBy,
        }))}
      />
    </div>
  );
}
