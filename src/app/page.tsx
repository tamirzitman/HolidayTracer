import { AnswerForm } from '@/components/AnswerForm';
import { RegisterForm } from '@/components/RegisterForm';
import { SignInForm } from '@/components/SignInForm';
import { Title, card } from '@/components/ui';
import { findPerson, getHouseholds, getLatestAnswer, getNextHoliday, todayInIsrael } from '@/lib/data';
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

  return (
    <AnswerForm
      holiday={holiday}
      households={await getHouseholds()}
      current={await getLatestAnswer(holiday.key, person.householdId)}
      daysAway={daysUntil(holiday.date)}
    />
  );
}
