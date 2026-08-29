import { redirect } from 'next/navigation';
import { signOut } from '@/app/actions';
import { FamiliesManager } from '@/components/FamiliesManager';
import { quietButton } from '@/components/ui';
import { headers } from 'next/headers';
import { circleOf, findPerson, getHousehold, inviteFor, membersByHousehold, suggestionsFor } from '@/lib/data';
import { getSessionPhone } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function FamiliesPage() {
  const phone = await getSessionPhone();
  if (!phone) redirect('/');
  const person = await findPerson(phone);
  if (!person) redirect('/');

  const [mine, circle, members, token, head, suggested] = await Promise.all([
    getHousehold(person.householdId),
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
        householdName={mine?.name ?? ''}
        families={families}
        inviteUrl={`${base}/join/${token}`}
        suggested={suggested.map((s) => ({
          id: s.household.id,
          name: s.household.name,
          seenBy: s.seenBy,
        }))}
      />

      {/* Sign-in is a phone number and nothing else, so signing out is the whole
          of switching to another person — which is how you see the app as
          somebody else without borrowing their phone. */}
      <form action={signOut} className="pb-2 text-center">
        <button type="submit" className={quietButton}>
          יציאה ({mine?.name || 'לא מזוהה'})
        </button>
      </form>
    </div>
  );
}
