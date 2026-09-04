import { redirect } from 'next/navigation';
import { FamiliesManager } from '@/components/FamiliesManager';
import { headers } from 'next/headers';
import { NextStep } from '@/components/NextStep';
import {
  circleOf,
  findPerson,
  getHousehold,
  inviteFor,
  membersByHousehold,
  hiddenSuggestions,
  suggestionsFor,
  unansweredUpcoming,
} from '@/lib/data';
import { nextStep } from '@/lib/next-step';
import { getSessionPhone } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function FamiliesPage() {
  const phone = await getSessionPhone();
  if (!phone) redirect('/');
  const person = await findPerson(phone);
  if (!person) redirect('/');

  const [circle, members, token, head, suggested, unanswered, hidden, own] = await Promise.all([
    circleOf(person.householdId),
    membersByHousehold(),
    inviteFor(person.householdId),
    headers(),
    suggestionsFor(person.householdId),
    unansweredUpcoming(person.householdId),
    hiddenSuggestions(person.householdId),
    getHousehold(person.householdId),
  ]);

  const base = `${head.get('x-forwarded-proto') ?? 'http'}://${head.get('host') ?? 'localhost'}`;
  const families = circle.map((h) => ({
    id: h.id,
    name: h.name,
    members: members.get(h.id) ?? [],
  }));

  const step = nextStep({
    circleSize: circle.length,
    suggestions: suggested.length,
    unanswered: unanswered.length,
    nextHolidayKey: unanswered[0]?.key,
    nextHolidayName: unanswered[0]?.nameHe,
    on: 'families',
  });

  return (
    <div className="flex flex-col gap-6">
      <FamiliesManager
        families={families}
        ownMembers={members.get(person.householdId) ?? []}
        inviteUrl={`${base}/join/${token}`}
        suggested={suggested.map((s) => ({
          id: s.household.id,
          name: s.household.name,
          seenBy: s.seenBy,
        }))}
        hidden={hidden.map((h) => ({ id: h.id, name: h.name }))}
        ownName={own?.name ?? 'הבית שלנו'}
      />
      <NextStep step={step} />
    </div>
  );
}
