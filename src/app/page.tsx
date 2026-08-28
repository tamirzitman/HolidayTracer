import { AnswerForm } from '@/components/AnswerForm';
import { SignInForm } from '@/components/SignInForm';
import { Title, card } from '@/components/ui';
import {
  circleAnswers,
  circleOf,
  findConflict,
  findPerson,
  getHouseholds,
  getLatestAnswer,
  getUpcomingHolidays,
  guestsComingTo,
  householdPhone,
  todayInIsrael,
} from '@/lib/data';
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
    // Joining is by invitation only, so there is nothing to fill in here.
    return (
      <div className={`${card} flex flex-col gap-2 text-center`}>
        <span className="text-4xl" aria-hidden="true">✉️</span>
        <Title>צריך הזמנה</Title>
        <p className="text-muted">
          בקשו ממשפחה שכבר משתמשת באפליקציה לשלוח לכם קישור הזמנה.
        </p>
      </div>
    );
  }

  // Scoped to this family, so its own occasions are in the round and nobody
  // else's are.
  const upcoming = await getUpcomingHolidays(person.householdId);
  if (upcoming.length === 0) {
    return (
      <div className={`${card} flex flex-col gap-2 text-center`}>
        <Title>אין חג קרוב ברשימה</Title>
        <p className="text-muted">כדאי להוסיף עוד תאריכים לגיליון.</p>
      </div>
    );
  }

  // Which holiday is on screen comes from the URL, so the arrows are plain links
  // and a half-finished answer can't be lost to a stray tap.
  const requested = (await searchParams).h;
  const at = Math.max(0, upcoming.findIndex((h) => h.key === requested));
  const holiday = upcoming[at];

  const [households, circle, current, guests, conflict] = await Promise.all([
    getHouseholds(),
    circleOf(person.householdId),
    getLatestAnswer(holiday.key, person.householdId),
    guestsComingTo(holiday.key, person.householdId),
    findConflict(holiday.key, person.householdId),
  ]);

  // Knowing where everyone else is, is the reward for saying where you are.
  const circleStatus = current ? await circleAnswers(holiday.key, person.householdId) : [];

  // Names and numbers are resolved here so the log itself can stay keys-only.
  const host = current?.hostHouseholdId
    ? {
        name: households.find((h) => h.id === current.hostHouseholdId)?.name ?? current.hostHouseholdId,
        phone: await householdPhone(current.hostHouseholdId),
      }
    : undefined;

  return (
    <AnswerForm
      key={holiday.key}
      holiday={holiday}
      households={circle}
      householdName={households.find((h) => h.id === person.householdId)?.name ?? ''}
      current={current}
      host={host}
      daysAway={daysUntil(holiday.date)}
      guests={guests.map((g) => ({ id: g.id, name: g.name }))}
      circleStatus={circleStatus.map((c) => ({
        id: c.household.id,
        name: c.household.name,
        kind: c.kind,
        hostName: c.hostName,
      }))}
      hostDisagrees={Boolean(conflict)}
      earlierKey={at > 0 ? upcoming[at - 1].key : undefined}
      laterKey={at < upcoming.length - 1 ? upcoming[at + 1].key : undefined}
    />
  );
}
