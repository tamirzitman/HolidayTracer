import { redirect } from 'next/navigation';
import { FamiliesManager } from '@/components/FamiliesManager';
import { quietButton } from '@/components/ui';
import { circleOf, findPerson, getHousehold, hiddenFrom, householdPhone } from '@/lib/data';
import { getSessionPhone } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function FamiliesPage() {
  const phone = await getSessionPhone();
  if (!phone) redirect('/');
  const person = await findPerson(phone);
  if (!person) redirect('/');

  const [mine, circle, hidden] = await Promise.all([
    getHousehold(person.householdId),
    circleOf(person.householdId),
    hiddenFrom(person.householdId),
  ]);

  const families = await Promise.all(
    circle.map(async (h) => ({ id: h.id, name: h.name, phone: await householdPhone(h.id) })),
  );

  return (
    <div className="flex flex-col gap-6">
      <FamiliesManager
        householdName={mine?.name ?? ''}
        families={families}
        hidden={hidden.map((h) => ({ id: h.id, name: h.name }))}
      />
    </div>
  );
}
