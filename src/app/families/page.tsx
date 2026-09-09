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
  circlesFor,
  circleTags,
  standings,
  unansweredUpcoming,
} from '@/lib/data';
import { byCircle } from '@/lib/circle-order';
import { nextStep } from '@/lib/next-step';
import { getSessionPhone } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function FamiliesPage() {
  const phone = await getSessionPhone();
  if (!phone) redirect('/');
  const person = await findPerson(phone);
  if (!person) redirect('/');

  const [circle, members, token, head, unanswered, own, circles, tags, standing] =
    await Promise.all([
      circleOf(person.householdId),
      membersByHousehold(),
      inviteFor(person.householdId),
      headers(),
      unansweredUpcoming(person.householdId),
      getHousehold(person.householdId),
      circlesFor(person.householdId),
      circleTags(person.householdId),
      standings(person.householdId),
    ]);

  const base = `${head.get('x-forwarded-proto') ?? 'http'}://${head.get('host') ?? 'localhost'}`;
  const tagged = Object.fromEntries(tags);
  // One order for the whole list, wherever it is shown: several circles first,
  // then gathered by which circles they are in.
  const families = byCircle(
    circle.map((h) => ({ id: h.id, name: h.name, members: members.get(h.id) ?? [] })),
    tagged,
  );

  const step = nextStep({
    circleSize: circle.length,
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
        circles={circles}
        tags={tagged}
        standing={Object.fromEntries(standing)}
        inviteUrl={`${base}/join/${token}`}
        ownName={own?.name ?? 'הבית שלנו'}
      />
      <NextStep step={step} />
    </div>
  );
}
