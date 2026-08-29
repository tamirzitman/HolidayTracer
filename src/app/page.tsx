import { headers } from 'next/headers';
import { signOut } from '@/app/actions';
import { formatPhone } from '@/lib/phone';
import { AnswerForm } from '@/components/AnswerForm';
import { SignInForm } from '@/components/SignInForm';
import { Title, card, secondaryButton } from '@/components/ui';
import {
  circleAnswers,
  circleOf,
  findConflict,
  findPerson,
  getHouseholds,
  getLatestAnswer,
  getUpcomingHolidays,
  guestsComingTo,
  inviteFor,
  membersByHousehold,
  todayInIsrael,
} from '@/lib/data';
import { getSessionPhone } from '@/lib/session';

export const dynamic = 'force-dynamic';

/** The app's own address, for the join links that go out over WhatsApp. */
async function origin(): Promise<string> {
  const head = await headers();
  return `${head.get('x-forwarded-proto') ?? 'http'}://${head.get('host') ?? 'localhost'}`;
}

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
    // Two very different things land here, and saying "ask for an invite" to
    // both of them is wrong. A sheet with no families in it is a deployment
    // pointed at the wrong place, not a visitor who has not been invited.
    const empty = (await getHouseholds()).length === 0;

    return (
      <div className={`${card} flex flex-col gap-3 text-center`}>
        <span className="text-4xl" aria-hidden="true">{empty ? '🗂️' : '✉️'}</span>
        <Title>{empty ? 'הגיליון ריק' : 'צריך הזמנה'}</Title>
        {empty ? (
          <p className="text-muted">
            אין אף משפחה בגיליון שהאפליקציה קוראת ממנו. כנראה SHEET_ID מצביע על
            הגיליון הלא נכון, או שהטאבים עוד לא נוצרו.
          </p>
        ) : (
          <p className="text-muted">
            המספר <span dir="ltr" className="font-semibold text-ink">{formatPhone(phone)}</span> לא
            מוכר לנו. בקשו ממשפחה שכבר משתמשת באפליקציה לשלוח לכם קישור הזמנה.
          </p>
        )}

        {/* Without this the screen is a dead end: one wrong digit and there is
            no way back to the sign-in at all. */}
        <form action={signOut}>
          <button type="submit" className={secondaryButton}>
            התחברות עם מספר אחר
          </button>
        </form>
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

  const [households, circle, current, guests, conflict, members, inviteToken, base] =
    await Promise.all([
      getHouseholds(),
      circleOf(person.householdId),
      getLatestAnswer(holiday.key, person.householdId),
      guestsComingTo(holiday.key, person.householdId),
      findConflict(holiday.key, person.householdId),
      membersByHousehold(),
      inviteFor(person.householdId),
      origin(),
    ]);
  const inviteUrl = `${base}/join/${inviteToken}`;
  const whoIsIn = (id: string) => members.get(id) ?? [];

  // Knowing where everyone else is, is the reward for saying where you are.
  const circleStatus = current ? await circleAnswers(holiday.key, person.householdId) : [];

  // Names and numbers are resolved here so the log itself can stay keys-only.
  const host = current?.hostHouseholdId
    ? {
        id: current.hostHouseholdId,
        name: households.find((h) => h.id === current.hostHouseholdId)?.name ?? current.hostHouseholdId,
        members: whoIsIn(current.hostHouseholdId),
      }
    : undefined;

  // Who in our own family answered, so nobody has to guess whether it was them.
  const answeredBy = current
    ? (members.get(person.householdId) ?? []).find((m) => m.phone === current.byPhone)?.name ?? ''
    : '';

  return (
    <AnswerForm
      key={holiday.key}
      holiday={holiday}
      households={circle}
      householdName={households.find((h) => h.id === person.householdId)?.name ?? ''}
      current={current}
      host={host}
      daysAway={daysUntil(holiday.date)}
      answeredBy={answeredBy}
      inviteUrl={inviteUrl}
      guests={guests.map((g) => ({ id: g.id, name: g.name, members: whoIsIn(g.id) }))}
      circleStatus={circleStatus.map((c) => ({
        id: c.household.id,
        name: c.household.name,
        kind: c.kind,
        hostName: c.hostName,
        byName: c.byName,
        members: whoIsIn(c.household.id),
      }))}
      hostDisagrees={Boolean(conflict)}
      earlierKey={at > 0 ? upcoming[at - 1].key : undefined}
      laterKey={at < upcoming.length - 1 ? upcoming[at + 1].key : undefined}
      position={{ index: at, total: upcoming.length }}
    />
  );
}
