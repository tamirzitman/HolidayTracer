import { headers } from 'next/headers';
import { signOut } from '@/app/actions';
import { AnswerForm } from '@/components/AnswerForm';
import { JoinForm } from '@/components/JoinForm';
import { SignInForm } from '@/components/SignInForm';
import { Title, card, quietButton, secondaryButton } from '@/components/ui';
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
    // An empty sheet is a deployment pointed at the wrong place, not a person
    // who has done anything wrong; saying "sign up" to that would be a dead end
    // of its own, since there would be nothing to sign up to.
    if ((await getHouseholds()).length === 0) {
      return (
        <div className={`${card} flex flex-col gap-3 text-center`}>
          <span className="text-4xl" aria-hidden="true">🗂️</span>
          <Title>הגיליון ריק</Title>
          <p className="text-muted">
            אין אף משפחה בגיליון שהאפליקציה קוראת ממנו. כנראה SHEET_ID מצביע על
            הגיליון הלא נכון, או שהטאבים עוד לא נוצרו.
          </p>
          <form action={signOut}>
            <button type="submit" className={secondaryButton}>
              התחברות עם מספר אחר
            </button>
          </form>
        </div>
      );
    }

    // No invite needed. Signing up leaves you with nobody on your list, and the
    // families you add bring the families they know along as suggestions.
    return (
      <div className="flex flex-col gap-4">
        <JoinForm phone={phone} token="" invitedBy="" kind="family" claimable={[]} circle={[]} />
        <form action={signOut} className="text-center">
          <button type="submit" className={quietButton}>
            זה לא המספר שלי
          </button>
        </form>
      </div>
    );
  }

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
