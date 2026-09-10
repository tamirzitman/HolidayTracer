import Link from 'next/link';
import { signOut } from '@/app/actions';
import { AnswerForm } from '@/components/AnswerForm';
import { JoinForm } from '@/components/JoinForm';
import { SignInForm } from '@/components/SignInForm';
import { OccasionIcon, Title, card } from '@/components/ui';
import {
  circleAnswers,
  circleOf,
  findConflict,
  findPerson,
  getHouseholds,
  getLatestAnswer,
  getUpcomingHolidays,
  guestsComingTo,
  membersByHousehold,
  todayInIsrael,
  unansweredUpcoming,
  circleTags,
  circlesFor,
} from '@/lib/data';
import { byCircle } from '@/lib/circle-order';
import { nextStep } from '@/lib/next-step';
import { getSessionPhone } from '@/lib/session';

export const dynamic = 'force-dynamic';

function daysUntil(date: string): number {
  const from = Date.parse(`${todayInIsrael()}T00:00:00Z`);
  const to = Date.parse(`${date}T00:00:00Z`);
  return Math.round((to - from) / 86_400_000);
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ h?: string }>;
}) {
  const phone = await getSessionPhone();
  if (!phone) return <SignInForm />;

  const person = await findPerson(phone);
  if (!person) {
    // No invite needed, and no household needs to exist first: registering
    // opens one. A sheet with nothing in it is simply an app nobody has signed
    // up to yet — it used to be met with "the spreadsheet is empty, check your
    // SHEET_ID", which turned the first person ever to arrive away from the
    // thing they were trying to start.
    return (
      <JoinForm
        phone={phone}
        token=""
        invitedBy=""
        kind="family"
        circleName=""
        claimable={[]}
        joiningAs=""
        onLeave={signOut}
      />
    );
  }

  const upcoming = await getUpcomingHolidays(person.householdId);
  if (upcoming.length === 0) {
    return (
      <div className={`${card} flex flex-col items-center gap-3 text-center`}>
        <Title>אין חג קרוב</Title>
        {/* Not "add dates to the spreadsheet": the person reading this is a
            family member, and where the dates live is not their business. What
            they can do about it is add an occasion of their own. */}
        <p className="text-muted">כל המועדים הקרובים כבר עברו. אפשר להוסיף מועד משלכם.</p>
        <Link
          href="/occasions"
          className="inline-flex items-center gap-2 text-sm font-bold text-brand"
        >
          <OccasionIcon />
          המועדים שלנו
        </Link>
      </div>
    );
  }

  // Which holiday is on screen comes from the URL, so the arrows are plain links
  // and a half-finished answer can't be lost to a stray tap.
  const requested = (await searchParams).h;
  const at = Math.max(0, upcoming.findIndex((h) => h.key === requested));
  const holiday = upcoming[at];

  const [households, circle, current, guests, conflict, members] =
    await Promise.all([
      getHouseholds(),
      circleOf(person.householdId),
      getLatestAnswer(holiday.key, person.householdId),
      guestsComingTo(holiday.key, person.householdId),
      findConflict(holiday.key, person.householdId),
      membersByHousehold(),
    ]);
  const whoIsIn = (id: string) => members.get(id) ?? [];

  // Knowing where everyone else is, is the reward for saying where you are.
  const circleStatus = current ? await circleAnswers(holiday.key, person.householdId) : [];

  const [unanswered, tags, circles] = await Promise.all([
    unansweredUpcoming(person.householdId),
    circleTags(person.householdId),
    circlesFor(person.householdId),
  ]);
  const tagged = Object.fromEntries(tags);

  const step = nextStep({
    circleSize: circle.length,
    unanswered: unanswered.length,
    nextHolidayKey: unanswered[0]?.key,
    nextHolidayName: unanswered[0]?.nameHe,
    on: 'holiday',
  });

  // Names and numbers are resolved here so the log itself can stay keys-only.
  const host = current?.hostHouseholdId
    ? {
        id: current.hostHouseholdId,
        name: households.find((h) => h.id === current.hostHouseholdId)?.name ?? current.hostHouseholdId,
        members: whoIsIn(current.hostHouseholdId),
      }
    : undefined;

  // Who answered, so nobody has to guess whether it was them. An answer recorded
  // by a guest saying they are coming is credited to that guest, who is not in
  // this household — so it is looked up across everyone, and marked as implied.
  const answeredBy = current
    ? [...members.values()].flat().find((m) => m.phone === current.byPhone)?.name ?? ''
    : '';
  const impliedByGuest = Boolean(current?.forHouseholdId);

  return (
    <AnswerForm
      key={holiday.key}
      holiday={holiday}
      households={byCircle(circle, tagged)}
      current={current}
      host={host}
      daysAway={daysUntil(holiday.date)}
      answeredBy={answeredBy}
      impliedByGuest={impliedByGuest}
      guests={guests.map((g) => ({ id: g.id, name: g.name, members: whoIsIn(g.id) }))}
      circleStatus={byCircle(
        circleStatus.map((c) => ({
          id: c.household.id,
          name: c.household.name,
          kind: c.kind,
          hostName: c.hostName,
          byName: c.byName,
          byProxy: c.byProxy,
          members: whoIsIn(c.household.id),
        })),
        tagged,
      )}
      circleSize={circle.length}
      tags={tagged}
      circles={circles}
      us={{
        id: person.householdId,
        name: households.find((h) => h.id === person.householdId)?.name ?? 'אנחנו',
      }}
      hostDisagrees={Boolean(conflict)}
      earlierKey={at > 0 ? upcoming[at - 1].key : undefined}
      laterKey={at < upcoming.length - 1 ? upcoming[at + 1].key : undefined}
      position={{ index: at, total: upcoming.length }}
      nextStep={step}
    />
  );
}
