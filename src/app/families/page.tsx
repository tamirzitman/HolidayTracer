import { redirect } from 'next/navigation';
import { FamiliesManager } from '@/components/FamiliesManager';
import { NextStep } from '@/components/NextStep';
import {
  circleOf,
  findPerson,
  getHousehold,
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

export default async function FamiliesPage({
  searchParams,
}: {
  searchParams: Promise<{ with?: string }>;
}) {
  // Arrived from "מעגל חדש" beside a family in no circle: the form opens with
  // them ticked, rather than making somebody find them again afterwards.
  const { with: startWith = '' } = await searchParams;
  const phone = await getSessionPhone();
  if (!phone) redirect('/');
  const person = await findPerson(phone);
  if (!person) redirect('/');

  const [circle, members, unanswered, own, circles, tags, standing] =
    await Promise.all([
      circleOf(person.householdId),
      membersByHousehold(),
      unansweredUpcoming(person.householdId),
      getHousehold(person.householdId),
      circlesFor(person.householdId),
      circleTags(person.householdId),
      standings(person.householdId),
    ]);

  const tagged = Object.fromEntries(tags);
  const uncircled = circle.filter((h) => (tags.get(h.id) ?? []).length === 0);
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
        ownName={own?.name ?? 'הבית שלנו'}
        startWith={circle.some((h) => h.id === startWith) ? startWith : ''}
      />
      <NextStep
        step={step}
        uncircled={uncircled.map((h) => ({ id: h.id, name: h.name }))}
        circles={circles.map((c) => ({ id: c.id, name: c.name, color: c.color }))}
      />
    </div>
  );
}
