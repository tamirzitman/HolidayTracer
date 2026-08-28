import { redirect } from 'next/navigation';
import { HistoryList } from '@/components/HistoryList';
import { Title } from '@/components/ui';
import { circleOf, findPerson, getHouseholds, historyFor } from '@/lib/data';
import { getSessionPhone } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function HistoryPage() {
  const phone = await getSessionPhone();
  if (!phone) redirect('/');

  const person = await findPerson(phone);
  if (!person) redirect('/');

  const [past, households, circle] = await Promise.all([
    historyFor(person.householdId),
    getHouseholds(),
    circleOf(person.householdId),
  ]);
  const nameOf = (id: string) => households.find((h) => h.id === id)?.name ?? id;

  const answered = past.filter((entry) => entry.answer !== undefined);
  const hosted = answered.filter((entry) => entry.answer!.kind === 'hosting').length;

  // Who we ended up with most often — the one thing a raw count doesn't say.
  const visits = new Map<string, number>();
  for (const { answer } of answered) {
    if (answer!.kind !== 'guest' || !answer!.hostHouseholdId) continue;
    visits.set(answer!.hostHouseholdId, (visits.get(answer!.hostHouseholdId) ?? 0) + 1);
  }
  const favourite = [...visits.entries()].sort((a, b) => b[1] - a[1])[0];

  return (
    <div className="flex flex-col gap-5">
      <Title>איפה היינו</Title>

      {past.length === 0 ? (
        <p className="text-muted">עוד לא נאסף כאן כלום. אחרי החג הראשון תופיע כאן שורה.</p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Stat value={hosted} label="אירחנו" />
            <Stat value={answered.length - hosted} label="התארחנו" />
            <Stat value={answered.length} label="סה״כ חגים" />
          </div>

          {favourite && (
            <p className="text-center text-sm text-muted">
              הכי הרבה אצל <span className="font-bold text-ink">{nameOf(favourite[0])}</span> —{' '}
              {favourite[1] === 1 ? 'פעם אחת' : `${favourite[1]} פעמים`}
            </p>
          )}

          <HistoryList
            entries={past.map(({ holiday, answer }) => ({
              key: holiday.key,
              name: holiday.nameHe,
              date: holiday.date,
              kind: answer?.kind ?? null,
              hostId: answer?.hostHouseholdId ?? '',
              hostName: answer?.hostHouseholdId ? nameOf(answer.hostHouseholdId) : '',
            }))}
            families={circle.map((h) => ({ id: h.id, name: h.name }))}
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
