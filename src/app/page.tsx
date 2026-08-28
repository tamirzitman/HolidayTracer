import { AnswerForm } from '@/components/AnswerForm';
import { RegisterForm } from '@/components/RegisterForm';
import { SignInForm } from '@/components/SignInForm';
import { Title, card } from '@/components/ui';
import {
  findConflict,
  findPerson,
  getHouseholds,
  getLatestAnswer,
  getNextHoliday,
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

export default async function Page() {
  const phone = await getSessionPhone();
  if (!phone) return <SignInForm />;

  const person = await findPerson(phone);
  if (!person) {
    return <RegisterForm phone={phone} households={await getHouseholds()} />;
  }

  const holiday = await getNextHoliday();
  if (!holiday) {
    return (
      <div className={`${card} flex flex-col gap-2 text-center`}>
        <Title>אין חג קרוב ברשימה</Title>
        <p className="text-muted">כדאי להוסיף עוד תאריכים לגיליון.</p>
      </div>
    );
  }

  const [households, current, guests, conflict] = await Promise.all([
    getHouseholds(),
    getLatestAnswer(holiday.key, person.householdId),
    guestsComingTo(holiday.key, person.householdId),
    findConflict(holiday.key, person.householdId),
  ]);

  // Names and numbers are resolved here so the log itself can stay ids-only.
  const host = current?.hostHouseholdId
    ? {
        name: households.find((h) => h.id === current.hostHouseholdId)?.name ?? current.hostHouseholdId,
        phone: await householdPhone(current.hostHouseholdId),
      }
    : undefined;

  return (
    <AnswerForm
      holiday={holiday}
      households={households}
      current={current}
      host={host}
      daysAway={daysUntil(holiday.date)}
      guests={guests.map((g) => ({ id: g.id, name: g.name }))}
      hostDisagrees={Boolean(conflict)}
    />
  );
}
