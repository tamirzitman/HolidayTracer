import { redirect } from 'next/navigation';
import { HistoryList } from '@/components/HistoryList';
import { Title } from '@/components/ui';
import { headers } from 'next/headers';
import { circleOf, findPerson, getHouseholds, historyFor, inviteFor } from '@/lib/data';
import { getSessionPhone } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function HistoryPage() {
  const phone = await getSessionPhone();
  if (!phone) redirect('/');

  const person = await findPerson(phone);
  if (!person) redirect('/');

  const [past, households, circle, token, head] = await Promise.all([
    historyFor(person.householdId),
    getHouseholds(),
    circleOf(person.householdId),
    inviteFor(person.householdId),
    headers(),
  ]);
  const base = `${head.get('x-forwarded-proto') ?? 'http'}://${head.get('host') ?? 'localhost'}`;
  const nameOf = (id: string) => households.find((h) => h.id === id)?.name ?? id;

  const answered = past.filter((entry) => entry.answer !== undefined);
  const count = (kind: string) => answered.filter((entry) => entry.answer!.kind === kind).length;

  return (
    <div className="flex flex-col gap-5">
      <Title>איפה היינו</Title>

      {past.length === 0 ? (
        <p className="text-muted">עוד לא נאסף כאן כלום. אחרי החג הראשון תופיע כאן שורה.</p>
      ) : (
        <>
          <p className="text-center text-sm text-muted">
            {answered.length} מתוך {past.length} חגים מולאו
          </p>

          <div className="grid grid-cols-3 gap-3">
            <Stat value={count('hosting')} label="אירחנו" />
            <Stat value={count('guest')} label="התארחנו" />
            <Stat value={count('away')} label="לא היינו" />
          </div>

          <HistoryList
            entries={past.map(({ holiday, answer, byName }) => ({
              key: holiday.key,
              name: holiday.nameHe,
              date: holiday.date,
              kind: answer?.kind ?? null,
              hostId: answer?.hostHouseholdId ?? '',
              hostName: answer?.hostHouseholdId ? nameOf(answer.hostHouseholdId) : '',
              byName,
            }))}
            families={circle.map((h) => ({ id: h.id, name: h.name }))}
            inviteUrl={`${base}/join/${token}`}
          />
        </>
      )}
    </div>
  );
}

/** A count, not a chart: three numbers need no axes and no colour encoding. */
function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5 rounded-2xl border border-line bg-surface px-2 py-4">
      <span className="font-display text-3xl font-bold tabular-nums text-brand">{value}</span>
      <span className="text-center text-xs font-semibold text-muted">{label}</span>
    </div>
  );
}
