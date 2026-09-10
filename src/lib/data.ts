import { randomUUID } from 'node:crypto';
import { cache } from 'react';
import { sheetStore } from './sheet';
import {
  HEADERS,
  TABS,
  type Answer,
  type AnswerKind,
  type Holiday,
  type Household,
  type Person,
  type StoredAnswer,
  type Connection,
  type Invite,
  type CircleRow,
  type Occasion,
  type OccasionDate,
} from './types';

/**
 * Columns are looked up by header name, never by position: a person edits this
 * spreadsheet by hand, and reordering or inserting a column must not break the app.
 */
function indexRows(rows: string[][]): { headers: Map<string, number>; body: string[][] } {
  const [header = [], ...body] = rows;
  const headers = new Map<string, number>();
  header.forEach((name, i) => headers.set(name.trim().toLowerCase(), i));
  return { headers, body };
}

const cell = (row: string[], headers: Map<string, number>, name: string): string => {
  const i = headers.get(name);
  return i === undefined ? '' : (row[i] ?? '').toString().trim();
};

const isTrue = (value: string): boolean => ['true', '1', 'yes', 'כן'].includes(value.trim().toLowerCase());

/** Today in Israel, as YYYY-MM-DD — the app's whole notion of "now". */
export function todayInIsrael(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());
}

// ── loading ───────────────────────────────────────────────────────────────────

export type Sheet = {
  holidays: Holiday[];
  households: Household[];
  people: Person[];
  answers: Answer[];
  conflicts: { holidayKey: string; householdId: string; hostHouseholdId: string; status: 'open' | 'resolved' }[];
  connections: Connection[];
  invites: Invite[];
  circles: CircleRow[];
  /**
   * Households that were switched off. They are gone from `households` — no
   * screen should show them — but their ids are kept here so that the next one
   * created never takes an id back. A reused id inherits the old household's
   * connections, answers and circle rows, which is a stranger's family walking
   * into yours.
   */
  retired: string[];
};

const TAB_LIST = [
  TABS.holidays,
  TABS.dates,
  TABS.households,
  TABS.people,
  TABS.answers,
  TABS.conflicts,
  TABS.connections,
  TABS.invites,
  TABS.circles,
];

/**
 * One batched request for the whole spreadsheet, held briefly in memory. Five
 * separate round trips to Google was most of the wait after pressing a button.
 * Any write clears it, so nobody ever sees their own answer go missing.
 *
 * Configurable because the smoke suite otherwise has to sleep out the real
 * delay to test what happens after it — SHEET_TTL_MS=100 turns two 21-second
 * waits into two 100-millisecond ones. Never worth changing in production.
 */
const TTL_MS = Number(process.env.SHEET_TTL_MS) || 20_000;
let memo: { at: number; sheet: Sheet } | undefined;

export function invalidateSheet(): void {
  memo = undefined;
}

/**
 * The catalogue and the calendar, put back together into the occurrences every
 * screen reads.
 *
 * The key is `<id>_<year>`, which is exactly what the Answers tab has held
 * since before the split — so nothing written against the old one-row-per-year
 * shape had to be rewritten to move to this one.
 */
function joinDates(catalogue: Occasion[], dates: OccasionDate[]): Holiday[] {
  const known = new Map(catalogue.map((o) => [o.id, o]));
  return dates
    .map((when) => {
      const what = known.get(when.occasionId);
      if (!what) return undefined;
      return {
        key: `${what.id}_${when.year}`,
        nameHe: what.nameHe,
        type: what.type,
        date: when.date,
        year: when.year,
        include: what.include,
        emoji: what.emoji,
        ownerHouseholdId: what.ownerHouseholdId,
        sharedWith: what.sharedWith,
      };
    })
    .filter((h): h is Holiday => h !== undefined);
}

async function fetchSheet(): Promise<Sheet> {
  const raw = await sheetStore().readMany(TAB_LIST);

  const holidaysTab = indexRows(raw[TABS.holidays] ?? []);
  const datesTab = indexRows(raw[TABS.dates] ?? []);
  const householdsTab = indexRows(raw[TABS.households] ?? []);
  const peopleTab = indexRows(raw[TABS.people] ?? []);
  const answersTab = indexRows(raw[TABS.answers] ?? []);
  const connectionsTab = indexRows(raw[TABS.connections] ?? []);
  const invitesTab = indexRows(raw[TABS.invites] ?? []);
  const circlesTab = indexRows(raw[TABS.circles] ?? []);
  const conflictsTab = indexRows(raw[TABS.conflicts] ?? []);

  const householdOf = new Map(
    peopleTab.body.map((row) => [
      cell(row, peopleTab.headers, 'phone'),
      cell(row, peopleTab.headers, 'household_id'),
    ]),
  );

  // A sheet still in the one-row-per-year shape reads as if it had been split.
  // The app and the spreadsheet are deployed by different hands and never at
  // the same moment, and either of them arriving first without this shows a
  // calendar with nothing in it.
  const old = holidaysTab.headers.has('holiday_key');
  const oldRows = old
    ? holidaysTab.body.map((row) => ({
        id: cell(row, holidaysTab.headers, 'holiday_key').replace(/_\d{4}$/, ''),
        nameHe: cell(row, holidaysTab.headers, 'name_he'),
        type: cell(row, holidaysTab.headers, 'type'),
        emoji: cell(row, holidaysTab.headers, 'emoji'),
        include: isTrue(cell(row, holidaysTab.headers, 'include')),
        ownerHouseholdId: cell(row, holidaysTab.headers, 'owner_household_id'),
        sharedWith: splitIds(cell(row, holidaysTab.headers, 'shared_with')),
        year: cell(row, holidaysTab.headers, 'year'),
        date: cell(row, holidaysTab.headers, 'date'),
      }))
    : [];

  const catalogue = old
    ? [...new Map(oldRows.filter((o) => o.id && o.nameHe).map((o) => [o.id, o] as const)).values()]
    : [
    ...new Map(
      holidaysTab.body
        .map((row) => ({
          id: cell(row, holidaysTab.headers, 'holiday_id'),
          nameHe: cell(row, holidaysTab.headers, 'name_he'),
          type: cell(row, holidaysTab.headers, 'type'),
          emoji: cell(row, holidaysTab.headers, 'emoji'),
          include: isTrue(cell(row, holidaysTab.headers, 'include')),
          ownerHouseholdId: cell(row, holidaysTab.headers, 'owner_household_id'),
          sharedWith: splitIds(cell(row, holidaysTab.headers, 'shared_with')),
        }))
        .filter((o) => o.id && o.nameHe)
        .map((o) => [o.id, o] as const),
    ).values(),
  ];

  const occasionDates = old
    ? oldRows
        .filter((o) => o.id && o.date)
        .map((o) => ({ occasionId: o.id, year: o.year || o.date.slice(0, 4), date: o.date }))
    : [
    ...new Map(
      datesTab.body
        .map((row) => ({
          occasionId: cell(row, datesTab.headers, 'holiday_id'),
          year: cell(row, datesTab.headers, 'year'),
          date: cell(row, datesTab.headers, 'date'),
        }))
        .filter((d) => d.occasionId && d.date)
        .map((d) => [`${d.occasionId}\u0000${d.year || d.date.slice(0, 4)}`, d] as const),
    ).values(),
  ];

  // Collapsed by id, newest row winning, exactly as the holidays below are.
  // Every tab here only ever grows: correcting a family's name appends a row
  // rather than editing one, and without this the family appears once per name
  // it has ever had — which is what a rename looked like from the outside.
  // Collapsing *before* the active check matters too: with it the other way
  // round, a household switched off would be resurrected by whichever older row
  // still said TRUE.
  const allHouseholds = [
    ...new Map(
      householdsTab.body
        .map((row) => ({
          id: cell(row, householdsTab.headers, 'household_id'),
          name: cell(row, householdsTab.headers, 'name'),
          active: isTrue(cell(row, householdsTab.headers, 'active')),
        }))
        .filter((h) => h.id && h.name)
        .map((h) => [h.id, h] as const),
    ).values(),
  ];

  return {
    // One holiday in one year, put back together: the catalogue says what it is
    // called and what it looks like, the Dates tab says when it falls, and the
    // key every answer has always been written against is the two joined.
    //
    // Append-only like everything else, on both tabs: the last row for a
    // holiday, and the last row for a holiday in a year, are the ones that
    // count — so correcting a name or switching an occasion off is another row
    // rather than a rewrite.
    holidays: joinDates(catalogue, occasionDates),

    households: allHouseholds.filter((h) => h.active),
    retired: allHouseholds.filter((h) => !h.active).map((h) => h.id),

    // The same rule, keyed by number: one row per person, the last one written.
    people: [
      ...new Map(
        peopleTab.body
          .map((row) => ({
            phone: cell(row, peopleTab.headers, 'phone'),
            name: cell(row, peopleTab.headers, 'name'),
            householdId: cell(row, peopleTab.headers, 'household_id'),
          }))
          .filter((p) => p.phone)
          .map((p) => [p.phone, p] as const),
      ).values(),
    ],

    answers: answersTab.body
      .map((row) => {
        const byPhone = cell(row, answersTab.headers, 'by_phone');
        const forHouseholdId = cell(row, answersTab.headers, 'for_household_id');
        return {
          timestamp: cell(row, answersTab.headers, 'timestamp'),
          holidayKey: cell(row, answersTab.headers, 'holiday_key'),
          kind: cell(row, answersTab.headers, 'kind') as AnswerKind,
          hostHouseholdId: cell(row, answersTab.headers, 'host_household_id'),
          byPhone,
          forHouseholdId,
          // Normally derived, never stored: whose answer this is follows the
          // person. The exception is an answer recorded for a household by
          // somebody outside it, which names the household outright so that
          // by_phone can go on naming who actually said it.
          householdId: forHouseholdId || householdOf.get(byPhone) || '',
        };
      })
      .filter((a) => a.holidayKey && a.householdId),

    conflicts: conflictsTab.body
      .map((row) => ({
        holidayKey: cell(row, conflictsTab.headers, 'holiday_key'),
        householdId: cell(row, conflictsTab.headers, 'household_id'),
        hostHouseholdId: cell(row, conflictsTab.headers, 'host_household_id'),
        status: (cell(row, conflictsTab.headers, 'status') || 'open') as 'open' | 'resolved',
      }))
      .filter((c) => c.holidayKey && c.householdId),

    connections: connectionsTab.body
      .map((row) => ({
        householdId: cell(row, connectionsTab.headers, 'household_id'),
        connectedTo: cell(row, connectionsTab.headers, 'connected_to'),
        action: (cell(row, connectionsTab.headers, 'action') || 'add') as Connection['action'],
        at: cell(row, connectionsTab.headers, 'at'),
      }))
      .filter((c) => c.householdId && c.connectedTo),

    invites: invitesTab.body
      .map((row) => ({
        token: cell(row, invitesTab.headers, 'token'),
        createdBy: cell(row, invitesTab.headers, 'created_by'),
        // Links written before there were kinds at all are family invites.
        kind: (cell(row, invitesTab.headers, 'kind') || 'family') as Invite['kind'],
        createdAt: cell(row, invitesTab.headers, 'created_at'),
        forPhone: cell(row, invitesTab.headers, 'for_phone'),
        usedAt: cell(row, invitesTab.headers, 'used_at'),
        forHouseholdId: cell(row, invitesTab.headers, 'for_household_id'),
        forCircleId: cell(row, invitesTab.headers, 'for_circle_id'),
      }))
      .filter((i) => i.token && i.createdBy),

    circles: circlesTab.body
      .map((row) => ({
        circleId: cell(row, circlesTab.headers, 'circle_id'),
        householdId: cell(row, circlesTab.headers, 'household_id'),
        action: (cell(row, circlesTab.headers, 'action') || 'add') as CircleRow['action'],
        name: cell(row, circlesTab.headers, 'name'),
        color: cell(row, circlesTab.headers, 'color'),
        addedBy: cell(row, circlesTab.headers, 'added_by'),
        at: cell(row, circlesTab.headers, 'at'),
      }))
      .filter((c) => c.circleId && c.householdId),
  };
}

export const loadSheet = cache(async (): Promise<Sheet> => {
  if (memo && Date.now() - memo.at < TTL_MS) return memo.sheet;
  const sheet = await fetchSheet();
  memo = { at: Date.now(), sheet };
  return sheet;
});

// ── reads ─────────────────────────────────────────────────────────────────────

export const getHouseholds = async (): Promise<Household[]> => (await loadSheet()).households;

export async function getHousehold(id: string): Promise<Household | undefined> {
  return (await getHouseholds()).find((h) => h.id === id);
}

export async function findPerson(phone: string): Promise<Person | undefined> {
  return (await loadSheet()).people.find((p) => p.phone === phone && p.householdId);
}

/** The number to call for a family: whoever from it is registered. No extra column needed. */
export async function householdPhone(householdId: string): Promise<string> {
  return (await loadSheet()).people.find((p) => p.householdId === householdId)?.phone ?? '';
}

/**
 * Everyone registered in a family, so a message can be aimed at a person rather
 * than at a household. A family nobody has joined has none — that is exactly
 * what makes it a family to invite rather than one to write to.
 */
export async function membersOf(householdId: string): Promise<{ name: string; phone: string }[]> {
  return (await loadSheet()).people
    .filter((p) => p.householdId === householdId)
    .map((p) => ({ name: p.name, phone: p.phone }));
}

/** Everyone, keyed by household, in one pass — a screen usually needs them all. */
export async function membersByHousehold(): Promise<Map<string, { name: string; phone: string }[]>> {
  const byHousehold = new Map<string, { name: string; phone: string }[]>();
  for (const p of (await loadSheet()).people) {
    const list = byHousehold.get(p.householdId) ?? [];
    list.push({ name: p.name, phone: p.phone });
    byHousehold.set(p.householdId, list);
  }
  return byHousehold;
}

/** "hh_a, hh_b" ⇄ ["hh_a", "hh_b"] — a set in one cell, so the sheet keeps one row per occasion. */
const splitIds = (cell: string): string[] =>
  cell.split(',').map((id) => id.trim()).filter(Boolean);
const joinIds = (ids: string[]): string => ids.join(', ');

/** The person behind a number on an answer — the log itself stores no names. */
const personName = (sheet: Sheet, phone: string): string =>
  sheet.people.find((p) => p.phone === phone)?.name ?? '';

/** Shared holidays have no owner; a family's own occasion is theirs alone. */
const visibleTo = (holiday: Holiday, householdId?: string): boolean =>
  !holiday.ownerHouseholdId ||
  holiday.ownerHouseholdId === householdId ||
  (householdId !== undefined && holiday.sharedWith.includes(householdId));

/** erev_pesach_2027 → erev_pesach */
const holidayKind = (key: string): string => key.replace(/_\d{4}$/, '');

/**
 * One full round of the year: everything from the next holiday up to — but not
 * including — that same holiday's next occurrence. So from erev Rosh Hashana you
 * can step through every holiday until the following Rosh Hashana, and no further.
 */
export async function getUpcomingHolidays(householdId?: string): Promise<Holiday[]> {
  const today = todayInIsrael();
  const included = (await loadSheet()).holidays
    .filter((h) => h.include && h.date >= today && visibleTo(h, householdId))
    .sort((a, b) => a.date.localeCompare(b.date));

  if (included.length === 0) return [];

  // The round is measured against a shared holiday, never one family's own
  // occasion: an occasion has a one-off key that never comes round again, so
  // anchoring on it would open every year in the sheet at once.
  const anchor = included.find((h) => !h.ownerHouseholdId) ?? included[0];
  const from = included.indexOf(anchor);
  const repeatsAt = included.findIndex(
    (h, i) => i > from && holidayKind(h.key) === holidayKind(anchor.key),
  );
  return repeatsAt === -1 ? included : included.slice(0, repeatsAt);
}

/** The log is append-only, so a household's answer is its last row for that holiday. */
export async function getLatestAnswer(
  holidayKey: string,
  householdId: string,
): Promise<Answer | undefined> {
  return (await loadSheet()).answers
    .filter((a) => a.holidayKey === holidayKey && a.householdId === householdId)
    .at(-1);
}

function latestByHousehold(answers: Answer[], holidayKey: string): Map<string, Answer> {
  const latest = new Map<string, Answer>();
  for (const a of answers) if (a.holidayKey === holidayKey) latest.set(a.householdId, a);
  return latest;
}

/**
 * How far ahead an unanswered holiday is worth a nudge. A seder two months
 * away is not something anybody has decided about yet, and a mark that sits
 * on the tab for two months is a mark nobody reads.
 */
const NUDGE_DAYS = 30;

/**
 * Upcoming holidays this household has not answered, nearest first — only the
 * ones close enough to be worth asking about. What the "next step" line counts,
 * and what the tab bar marks.
 */
export async function unansweredUpcoming(householdId: string): Promise<Holiday[]> {
  const sheet = await loadSheet();
  const answered = new Set(
    sheet.answers.filter((a) => a.householdId === householdId).map((a) => a.holidayKey),
  );
  const horizon = new Date(Date.parse(`${todayInIsrael()}T00:00:00Z`) + NUDGE_DAYS * 86_400_000)
    .toISOString()
    .slice(0, 10);
  return (await getUpcomingHolidays(householdId)).filter(
    (h) => !answered.has(h.key) && h.date <= horizon,
  );
}

/** Households that said they are coming to this one. */
export async function guestsComingTo(holidayKey: string, householdId: string): Promise<Household[]> {
  const sheet = await loadSheet();
  const latest = latestByHousehold(sheet.answers, holidayKey);
  return [...latest.values()]
    .filter((a) => a.kind === 'guest' && a.hostHouseholdId === householdId)
    .map((a) => sheet.households.find((h) => h.id === a.householdId))
    .filter((h): h is Household => h !== undefined);
}

/**
 * What everyone in my circle has said about this holiday. Shown only once I have
 * answered myself — knowing is the reward for answering.
 */
export type CircleAnswer = {
  household: Household;
  kind: AnswerKind | 'none';
  hostName: string;
  /** Which person actually answered. Empty when nobody has. */
  byName: string;
  /**
   * The answer was given on their behalf by somebody in the circle, not by
   * them. It can be corrected by anyone in the circle; an answer a family gave
   * itself cannot.
   */
  byProxy: boolean;
};

export async function circleAnswers(
  holidayKey: string,
  householdId: string,
): Promise<CircleAnswer[]> {
  const sheet = await loadSheet();
  const latest = latestByHousehold(sheet.answers, holidayKey);
  const nameOf = (id: string) => sheet.households.find((h) => h.id === id)?.name ?? id;

  // Only families this date reaches. On an occasion shared with some of the
  // circle, the rest would otherwise sit at "עוד לא ענו" forever — reading as
  // if they had been asked and ignored it, when they were never asked.
  const holiday = sheet.holidays.find((h) => h.key === holidayKey);
  const asked = (await circleOf(householdId)).filter(
    (h) => !holiday || visibleTo(holiday, h.id),
  );

  return asked.map((household) => {
    const answer = latest.get(household.id);
    return {
      household,
      kind: answer?.kind ?? 'none',
      hostName: answer?.hostHouseholdId ? nameOf(answer.hostHouseholdId) : '',
      byName: answer ? personName(sheet, answer.byPhone) : '',
      byProxy: Boolean(answer?.forHouseholdId),
    };
  });
}

/**
 * Every holiday that has passed, newest first, with what this household said —
 * including the ones it never answered, so a gap can be filled in later.
 */
export async function historyFor(
  householdId: string,
): Promise<{ holiday: Holiday; answer: Answer | undefined; byName: string }[]> {
  const sheet = await loadSheet();
  const today = todayInIsrael();

  const mine = new Map<string, Answer>();
  for (const a of sheet.answers) {
    if (a.householdId === householdId) mine.set(a.holidayKey, a);
  }

  return sheet.holidays
    .filter((h) => h.include && h.date < today && visibleTo(h, householdId))
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((holiday) => {
      const answer = mine.get(holiday.key);
      return { holiday, answer, byName: answer ? personName(sheet, answer.byPhone) : '' };
    });
}

/** A holiday that has already passed, for correcting the record after the fact. */
export async function getPastHoliday(
  key: string,
  householdId?: string,
): Promise<Holiday | undefined> {
  const today = todayInIsrael();
  return (await loadSheet()).holidays.find(
    (h) => h.key === key && h.date < today && visibleTo(h, householdId),
  );
}

/** The occasions this family added for itself. */
export async function occasionsOf(householdId: string): Promise<Holiday[]> {
  return (await loadSheet()).holidays
    .filter((h) => h.ownerHouseholdId === householdId)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * A family's own occasion: what it is, and when it falls this year. Two rows,
 * because they are two different facts — and because next year's date can be
 * added later without saying what the occasion is all over again.
 */
export async function addOccasion(
  householdId: string,
  name: string,
  date: string,
  sharedWith: string[],
): Promise<void> {
  const id = `own_${householdId}_${date.replace(/-/g, '')}_${Date.now().toString(36)}`;
  await appendRow(TABS.holidays, HEADERS.holidays, [
    id,
    name,
    'מועד',
    // No mark chosen: the kind decides, until somebody picks one.
    '',
    'TRUE',
    householdId,
    joinIds(sharedWith),
  ]);
  await appendRow(TABS.dates, HEADERS.dates, [id, date.slice(0, 4), date]);
}

/** The catalogue entry behind a key, for the writers that change one field of it. */
async function occasionBehind(key: string): Promise<Holiday | undefined> {
  return (await loadSheet()).holidays.find((h) => h.key === key);
}

/**
 * The id the key was built from. `<id>_<year>`, and the year is the last four
 * digits — so this is the key with its year taken off again.
 */
const occasionId = (key: string): string => key.replace(/_\d{4}$/, '');

/**
 * Correcting what an occasion is called, or the mark beside it. One row on the
 * catalogue, and every year of it changes at once — which is the whole reason
 * the catalogue exists: the name used to be copied into a row per year, and
 * putting it right meant editing all of them.
 */
export async function renameOccasion(key: string, name: string, emoji: string): Promise<void> {
  const holiday = await occasionBehind(key);
  if (!holiday) return;
  await appendRow(TABS.holidays, HEADERS.holidays, [
    occasionId(key),
    name.trim() || holiday.nameHe,
    holiday.type,
    emoji,
    'TRUE',
    holiday.ownerHouseholdId,
    joinIds(holiday.sharedWith),
  ]);
}

/**
 * Changing who sees an occasion. Append-only like everything else: a newer row
 * for the same key wins, so the audience can be widened or narrowed without
 * rewriting anything.
 */
export async function shareOccasion(
  householdId: string,
  key: string,
  sharedWith: string[],
): Promise<void> {
  const holiday = (await loadSheet()).holidays.find(
    (h) => h.key === key && h.ownerHouseholdId === householdId,
  );
  if (!holiday) return;
  await appendRow(TABS.holidays, HEADERS.holidays, [
    occasionId(key),
    holiday.nameHe,
    holiday.type,
    // Carried, not dropped: a mark somebody chose must survive a change of
    // audience, or editing one thing would quietly undo the other.
    holiday.emoji,
    'TRUE',
    householdId,
    joinIds(sharedWith),
  ]);
}

/** Another row with include=FALSE, rather than deleting one. */
export async function removeOccasion(householdId: string, key: string): Promise<void> {
  const holiday = (await loadSheet()).holidays.find(
    (h) => h.key === key && h.ownerHouseholdId === householdId,
  );
  if (!holiday) return;
  await appendRow(TABS.holidays, HEADERS.holidays, [
    occasionId(key),
    holiday.nameHe,
    holiday.type,
    holiday.emoji,
    'FALSE',
    householdId,
    joinIds(holiday.sharedWith),
  ]);
}

// ── writing ───────────────────────────────────────────────────────────────────

async function appendRow(tab: string, headers: readonly string[], row: string[]): Promise<void> {
  const store = sheetStore();
  const existing = await store.read(tab);
  // A tab whose first row is data would have that row read back as the header
  // and silently swallowed, so write headers when the tab is empty.
  if (existing.length === 0) {
    await store.append(tab, [...headers]);
    await store.append(tab, row);
    invalidateSheet();
    return;
  }

  // Placed by header name, the same way every read resolves them. Writing by
  // position instead was the same bug in reverse: one spare column somebody
  // added — or left behind — shifted every value after it into the next
  // column along, so an invite's number landed in the column beside the one
  // the gate reads and no link aimed at anybody could ever let them in.
  const sheetHeaders = (existing[0] ?? []).map((name) => String(name).trim().toLowerCase());
  const placed: string[] = new Array(sheetHeaders.length).fill('');
  const homeless: string[] = [];
  headers.forEach((name, i) => {
    const at = sheetHeaders.indexOf(name);
    // A column the sheet has never heard of: keep the value rather than drop
    // it silently, past the end where `npm run align-headers` will show it.
    if (at === -1) homeless.push(row[i] ?? '');
    else placed[at] = row[i] ?? '';
  });

  await store.append(tab, [...placed, ...homeless]);
  invalidateSheet();
}

// ── circles ───────────────────────────────────────────────────────────────────

/** Latest event wins. Rows are only ever appended, never rewritten. */
function connectionState(
  connections: Connection[],
  householdId: string,
): Map<string, Connection['action']> {
  const state = new Map<string, Connection['action']>();
  for (const c of connections) {
    if (c.householdId === householdId) state.set(c.connectedTo, c.action);
  }
  return state;
}

/** The families this household can see — its whole world in the app. */
export async function circleOf(householdId: string): Promise<Household[]> {
  const sheet = await loadSheet();
  const state = connectionState(sheet.connections, householdId);
  return sheet.households.filter((h) => h.id !== householdId && state.get(h.id) === 'add');
}

/**
 * The families a newcomer arriving on this invite could say they belong to:
 * the family that invited them, and everyone that family is connected to.
 *
 * Matching on the phone number is not enough to keep one family from becoming
 * two. The number somebody typed in when they added a family belongs to one
 * person in it, and the one who actually signs up may be their partner, with a
 * number nobody has ever entered. So the newcomer is shown the families already
 * on the list and can simply say which one is theirs; joining then appends them
 * to that household rather than opening a second row beside it.
 *
 * The two kinds mean different things and are told apart by `joined`:
 * a family nobody has signed into is one added by name, and claiming it means
 * being the first of them here; a family somebody has already signed into means
 * joining a relative who beat you to it.
 *
 * The inviting household is deliberately not among them. They are the ones who
 * sent the link, so they are the one family the opener certainly is not — and
 * picking them would have quietly filed a cousin inside somebody else's
 * household. Joining the inviter's own household is a different invitation
 * (`kind: 'household'`), which never reaches this list.
 */
export async function claimableIn(
  householdId: string,
): Promise<{ household: Household; joined: boolean }[]> {
  const sheet = await loadSheet();
  const joined = new Set(sheet.people.map((p) => p.householdId));
  return (await circleOf(householdId))
    .map((household) => ({ household, joined: joined.has(household.id) }))
    // Added by name and never signed into: the likeliest thing to be claimed.
    .sort((a, b) => Number(a.joined) - Number(b.joined));
}

/**
 * A family somebody has already added by name, that nobody has ever signed into,
 * going by the name being registered right now.
 *
 * Adding a family by name alone leaves a household with nobody in it. When those
 * people later arrive at the front door — no link, just their number — there is
 * nothing to match them on, and the app would open a second household beside the
 * one already bearing their name: they end up connected to nobody, and whoever
 * added them goes on looking at an empty row. Matching the name they type is
 * the one thread between the two, and it is only ever offered as a question.
 *
 * Only households nobody has signed into. A family with people in it is a family
 * to impersonate, and joining one of those needs a link aimed at your number.
 */
export async function unjoinedNamed(name: string): Promise<Household | undefined> {
  const sheet = await loadSheet();
  const joined = new Set(sheet.people.map((p) => p.householdId));
  const wanted = name.trim().replace(/\s+/g, ' ').toLowerCase();
  if (!wanted) return undefined;
  return sheet.households.find(
    (h) => !joined.has(h.id) && h.name.trim().replace(/\s+/g, ' ').toLowerCase() === wanted,
  );
}

// ── circles ───────────────────────────────────────────────────────────────────

/**
 * The newest row for every (circle, household) pair. Membership, the name and
 * the colour all live on the same row, so joining, leaving and renaming are one
 * kind of write and the latest one wins — the same rule as everywhere else here.
 */
function circleState(rows: CircleRow[]): Map<string, CircleRow> {
  const state = new Map<string, CircleRow>();
  for (const row of rows) state.set(`${row.circleId}\u0000${row.householdId}`, row);
  return state;
}

/** Everyone currently in a circle. */
export async function circleMembers(circleId: string): Promise<string[]> {
  const state = circleState((await loadSheet()).circles);
  return [...state.values()]
    .filter((r) => r.circleId === circleId && r.action === 'add')
    .map((r) => r.householdId);
}

export type MyCircle = {
  id: string;
  /** What we call it. Somebody else in it may call it something else entirely. */
  name: string;
  color: string;
  /** Households in it, ourselves excluded — the ones worth showing on a row. */
  members: string[];
};

/**
 * The circles we are in, as we see them.
 *
 * The name and the colour come off our own row, because both are ours: "צד אבא"
 * is the wrong name for the people on the other side of it, and a circle nobody
 * can rename would be a label imposed on them.
 */
export async function circlesFor(householdId: string): Promise<MyCircle[]> {
  const state = circleState((await loadSheet()).circles);
  const rows = [...state.values()];
  const mine = rows.filter((r) => r.householdId === householdId && r.action === 'add');
  return mine
    .map((row) => ({
      id: row.circleId,
      name: row.name,
      color: row.color,
      members: rows
        .filter((r) => r.circleId === row.circleId && r.action === 'add' && r.householdId !== householdId)
        .map((r) => r.householdId),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'he'));
}

/** Which of our circles each household is in, for the dots on their row. */
export async function circleTags(
  householdId: string,
): Promise<Map<string, { id: string; name: string; color: string }[]>> {
  const tags = new Map<string, { id: string; name: string; color: string }[]>();
  for (const circle of await circlesFor(householdId)) {
    for (const member of circle.members) {
      tags.set(member, [
        ...(tags.get(member) ?? []),
        { id: circle.id, name: circle.name, color: circle.color },
      ]);
    }
  }
  return tags;
}

/**
 * A new circle, with us in it.
 *
 * We are a member of our own circle on purpose: the rule that makes circles
 * worth anything is "somebody in a circle I am also in", and a circle its own
 * author stands outside of would do nothing for them.
 */
export async function createCircle(
  householdId: string,
  name: string,
  color: string,
  members: string[],
): Promise<string> {
  const id = randomUUID().replace(/-/g, '').slice(0, 12);
  const at = new Date().toISOString();
  const all = [householdId, ...members.filter((m) => m !== householdId)];
  for (const member of all) {
    await appendRow(TABS.circles, HEADERS.circles, [
      id,
      member,
      'add',
      name,
      color,
      householdId,
      at,
    ]);
  }

  // A circle is a claim that these families belong together, so they are
  // introduced to each other on the spot rather than suggested to each other
  // one at a time.
  for (const a of all) {
    for (const b of all) {
      if (a >= b) continue;
      if (!(await isConnected(a, b))) await connect(a, b);
    }
  }
  return id;
}

/**
 * Bringing a family into a circle. Anyone in it may — the same as connecting,
 * which nobody has to approve either. The name they arrive with is ours, as a
 * starting point they can change; the colour likewise.
 */
export async function addToCircle(
  circleId: string,
  householdId: string,
  addedBy: string,
  name: string,
  color: string,
): Promise<void> {
  const already = await circleMembers(circleId);
  await appendRow(TABS.circles, HEADERS.circles, [
    circleId,
    householdId,
    'add',
    name,
    color,
    addedBy,
    new Date().toISOString(),
  ]);

  // Joining a circle is joining the families in it. Offering them afterwards as
  // suggestions asked the newcomer to accept, one at a time, the very thing
  // being put in the circle already said — and left whoever added them looking
  // at a circle whose members could not see each other.
  for (const other of already) {
    if (other === householdId) continue;
    if (!(await isConnected(householdId, other))) await connect(householdId, other);
  }
}

/** Who put this household in this circle, if they are in it at all. */
export async function whoAdded(circleId: string, householdId: string): Promise<string | undefined> {
  const row = circleState((await loadSheet()).circles).get(`${circleId}\u0000${householdId}`);
  return row?.action === 'add' ? row.addedBy : undefined;
}

/** Out of the circle. Their own row, so their name and colour go with them. */
export async function removeFromCircle(circleId: string, householdId: string): Promise<void> {
  const row = circleState((await loadSheet()).circles).get(`${circleId}\u0000${householdId}`);
  if (!row || row.action !== 'add') return;
  await appendRow(TABS.circles, HEADERS.circles, [
    circleId,
    householdId,
    'remove',
    row.name,
    row.color,
    row.addedBy,
    new Date().toISOString(),
  ]);
}

/** Our own name and colour for a circle. Nobody else's view of it changes. */
export async function labelCircle(
  circleId: string,
  householdId: string,
  name: string,
  color: string,
): Promise<void> {
  const row = circleState((await loadSheet()).circles).get(`${circleId}\u0000${householdId}`);
  if (!row || row.action !== 'add') return;
  await appendRow(TABS.circles, HEADERS.circles, [
    circleId,
    householdId,
    'add',
    name,
    color,
    row.addedBy,
    new Date().toISOString(),
  ]);
}

export async function isConnected(a: string, b: string): Promise<boolean> {
  return connectionState((await loadSheet()).connections, a).get(b) === 'add';
}

/**
 * Taking a family off our own list. One-way on purpose: deciding a family is
 * not ours says nothing about whether we belong on theirs, and it is not a
 * deletion — a newer 'add' row, from a circle or a number typed in, wins over
 * it, so this can be undone by simply meeting them again.
 */
export async function disconnectFrom(householdId: string, other: string): Promise<void> {
  await appendRow(TABS.connections, HEADERS.connections, [
    householdId,
    other,
    'remove',
    new Date().toISOString(),
  ]);
}

/** Introducing two families is mutual; hiding one is not. */
export async function connect(a: string, b: string): Promise<void> {
  const at = new Date().toISOString();
  await appendRow(TABS.connections, HEADERS.connections, [a, b, 'add', at]);
  await appendRow(TABS.connections, HEADERS.connections, [b, a, 'add', at]);
}

export async function createInvite(
  householdId: string,
  kind: Invite['kind'],
  /** Aimed at one number, which makes the link single-use. */
  forPhone = '',
  /** Aimed at a family already on the list, which makes it single-use too. */
  forHouseholdId = '',
  /** The circle it joins them to. Reusable on purpose: a circle link is for a group. */
  forCircleId = '',
): Promise<string> {
  const token = randomUUID().replace(/-/g, '').slice(0, 12);
  await appendRow(TABS.invites, HEADERS.invites, [
    token,
    householdId,
    kind,
    new Date().toISOString(),
    forPhone,
    '',
    forHouseholdId,
    forCircleId,
  ]);
  return token;
}

/**
 * Spending a personal link. Append-only like everything else: a newer row for
 * the token carries the time it was used, and the newest row is the one read.
 */
export async function spendInvite(token: string): Promise<void> {
  const invite = latestInvite(await loadSheet(), token);
  // Aimed at somebody — a number, or a family on the list — so it is theirs
  // alone and is done once they are in. A general link is untouched.
  if (!invite || invite.usedAt || (!invite.forPhone && !invite.forHouseholdId)) return;
  await appendRow(TABS.invites, HEADERS.invites, [
    invite.token,
    invite.createdBy,
    invite.kind,
    invite.createdAt,
    invite.forPhone,
    new Date().toISOString(),
    invite.forHouseholdId,
  ]);
}

/** The newest row wins, so a link that has been spent reads as spent. */
const latestInvite = (sheet: Sheet, token: string): Invite | undefined =>
  sheet.invites.filter((i) => i.token === token).at(-1);


/**
 * How long an invite stays good for.
 *
 * These links travel: they are pasted into family WhatsApp groups and forwarded
 * on, and one from last year sitting in a group is a way into your circle that
 * nobody remembers leaving open. Two weeks is longer than any invitation stays
 * interesting and short enough that a stale link is dead.
 */
const INVITE_DAYS = 14;

const expired = (invite: { createdAt: string }): boolean => {
  const at = Date.parse(invite.createdAt);
  return Number.isFinite(at) && Date.now() - at > INVITE_DAYS * 86_400_000;
};

/**
 * A general link is reusable — one in a family group should bring in more than
 * one household, and an invitation to our own house may be meant for a partner
 * as well as a grown child. A link aimed at one number is not: it is spent once
 * that person is in, so forwarding it brings nobody else.
 *
 * Either way, a link that no longer works is not a wall. The join screen falls
 * back to ordinary sign-up, so somebody holding a dead link still gets the app;
 * they simply arrive introduced to nobody.
 */
/**
 * A circle as an invitation carries it: what to call it, and exactly which
 * households are in it.
 *
 * The members are the whole of what an opener is shown. A circle link says
 * "you are one of us" — the families in the circle are the ones they might
 * *be*, and the inviter's other families are nobody's business on the way in.
 */
export type InvitedCircle = {
  id: string;
  name: string;
  color: string;
  members: { household: Household; joined: boolean }[];
};

export async function readInvite(
  token: string,
): Promise<
  | {
      household: Household;
      kind: Invite['kind'];
      forPhone: string;
      /** The family this link makes them, when it names one. */
      forHousehold: Household | undefined;
      /** The circle this link joins, when it is a circle link. */
      circle: InvitedCircle | undefined;
    }
  | undefined
> {
  let sheet = await loadSheet();
  let invite = latestInvite(sheet, token);
  // A link is opened seconds after it is made, often from a different server
  // than the one that wrote it — and each server keeps its own copy of the
  // sheet for a short while. A token that is not in this copy is far more
  // likely to be newer than the copy than to be made up, so look once more
  // before calling it dead: a dead link falls back to sign-up, and a live one
  // wrongly called dead would turn a person away.
  if (!invite) {
    invalidateSheet();
    sheet = await loadSheet();
    invite = latestInvite(sheet, token);
  }
  if (!invite || expired(invite) || invite.usedAt) return undefined;
  const household = sheet.households.find((h) => h.id === invite.createdBy);
  if (!household) return undefined;
  // The circle as the inviter has it: their name and colour for it are the ones
  // in the message, so they are what the opener should see on the way in. Their
  // own to change afterwards, like everyone else's.
  let circle: InvitedCircle | undefined;
  if (invite.kind === 'circle' && invite.forCircleId) {
    const rows = [...circleState(sheet.circles).values()].filter(
      (r) => r.circleId === invite.forCircleId && r.action === 'add',
    );
    const mine = rows.find((r) => r.householdId === invite.createdBy);
    if (!mine) return undefined;
    const joined = new Set(sheet.people.map((p) => p.householdId));
    circle = {
      id: invite.forCircleId,
      name: mine.name,
      color: mine.color,
      members: rows
        .map((r) => sheet.households.find((h) => h.id === r.householdId))
        .filter((h): h is Household => h !== undefined)
        .map((h) => ({ household: h, joined: joined.has(h.id) }))
        // A family added by name that nobody has signed into is the likeliest
        // thing for an opener to be, so it is offered first.
        .sort((a, b) => Number(a.joined) - Number(b.joined)),
    };
  }

  return {
    household,
    kind: invite.kind,
    forPhone: invite.forPhone,
    forHousehold: invite.forHouseholdId
      ? sheet.households.find((h) => h.id === invite.forHouseholdId)
      : undefined,
    circle,
  };
}

/**
 * A newer row for the same household id. Append-only like everything else, so
 * the name somebody else guessed at stays in the log and the correction wins.
 */
export async function renameHousehold(householdId: string, name: string): Promise<void> {
  const household = (await loadSheet()).households.find((h) => h.id === householdId);
  if (!household) return;
  await appendRow(TABS.households, HEADERS.households, [
    householdId,
    name,
    household.active ? 'TRUE' : 'FALSE',
  ]);
}

/**
 * What a family added by name can still have done to it.
 *
 * A household typed in by mistake should be correctable, and a household that
 * has become somebody's real record should not — the line between the two is
 * whether anybody has arrived in it or anything has been said about it.
 */
export type FamilyStanding = {
  /** We are the household that put them on the list. */
  addedByUs: boolean;
  /** Somebody has signed in as them. Then the name is theirs to change, not ours. */
  joined: boolean;
  /** An answer names them — theirs, or somebody's about them. Then it is a record. */
  answeredFor: boolean;
};

/**
 * Who first put this household on anybody's list.
 *
 * Not stored: creating a family writes `us → them` before anything else can
 * mention them, so the earliest connection pointing at them names whoever
 * added them. A household nobody ever connected to is nobody's.
 */
function addedBy(sheet: Sheet, householdId: string): string | undefined {
  return sheet.connections.find((c) => c.connectedTo === householdId)?.householdId;
}

export async function standingOf(
  householdId: string,
  us: string,
): Promise<FamilyStanding> {
  const sheet = await loadSheet();
  return {
    addedByUs: addedBy(sheet, householdId) === us,
    joined: sheet.people.some((p) => p.householdId === householdId),
    answeredFor: sheet.answers.some(
      (a) => a.householdId === householdId || a.hostHouseholdId === householdId,
    ),
  };
}

/** The standing of every family on our list, for the rows that show them. */
export async function standings(us: string): Promise<Map<string, FamilyStanding>> {
  const sheet = await loadSheet();
  const joined = new Set(sheet.people.map((p) => p.householdId));
  const spokenOf = new Set(
    sheet.answers.flatMap((a) => [a.householdId, a.hostHouseholdId]).filter(Boolean),
  );
  const standing = new Map<string, FamilyStanding>();
  for (const household of sheet.households) {
    standing.set(household.id, {
      addedByUs: addedBy(sheet, household.id) === us,
      joined: joined.has(household.id),
      answeredFor: spokenOf.has(household.id),
    });
  }
  return standing;
}

/**
 * Taking a household off the list for good — the row stays, switched off, like
 * everything else here. Only ever for a family nobody has joined and nothing
 * has been said about, so what is lost is the name and nothing more.
 */
export async function deactivateHousehold(householdId: string): Promise<void> {
  const sheet = await loadSheet();
  const household = sheet.households.find((h) => h.id === householdId);
  if (!household) return;

  // Out of the circles first, while the household is still readable. A circle
  // counts its members by their rows, so one left behind would have the circle
  // claim a family it cannot show.
  const inCircles = [...circleState(sheet.circles).values()].filter(
    (r) => r.householdId === householdId && r.action === 'add',
  );
  for (const row of inCircles) await removeFromCircle(row.circleId, householdId);

  await appendRow(TABS.households, HEADERS.households, [householdId, household.name, 'FALSE']);
}

export async function addHousehold(name: string): Promise<string> {
  const sheet = await loadSheet();
  // Retired households count. Their rows are still on the tab, and so are the
  // connections, answers and circle memberships that named them — hand the id
  // out again and the next family created inherits somebody else's world.
  const used = [...sheet.households.map((h) => h.id), ...sheet.retired]
    .map(Number)
    .filter((n) => Number.isInteger(n));
  const id = String(Math.max(0, ...used) + 1);
  await appendRow(TABS.households, HEADERS.households, [id, name, 'TRUE']);
  return id;
}

// ── conflicts ─────────────────────────────────────────────────────────────────

/**
 * The one contradiction worth catching: a household is a guest at a family whose
 * own newest answer isn't "hosting". A host who simply hasn't answered yet is
 * not a conflict — that's an unanswered question, not a disagreement.
 */
export type Conflict = {
  holidayKey: string;
  householdId: string;
  hostHouseholdId: string;
  hostKind: string;
  hostHostHouseholdId: string;
};

function conflictsIn(latest: Map<string, Answer>): Conflict[] {
  const found: Conflict[] = [];
  for (const a of latest.values()) {
    if (a.kind !== 'guest') continue;
    const host = latest.get(a.hostHouseholdId);
    if (!host || host.kind === 'hosting') continue;
    found.push({
      holidayKey: a.holidayKey,
      householdId: a.householdId,
      hostHouseholdId: a.hostHouseholdId,
      hostKind: host.kind,
      hostHostHouseholdId: host.hostHouseholdId,
    });
  }
  return found;
}

/** The quiet line shown to one household under its own answer. */
export async function findConflict(
  holidayKey: string,
  householdId: string,
): Promise<Conflict | undefined> {
  const sheet = await loadSheet();
  return conflictsIn(latestByHousehold(sheet.answers, holidayKey)).find(
    (c) => c.householdId === householdId,
  );
}

/**
 * The Conflicts tab is an event log, not a snapshot: rows are only ever
 * appended. It used to be cleared and written again on every answer, so two
 * families answering at the same moment could erase each other's rows — and erev
 * chag is precisely when everyone answers at once.
 *
 * The newest row for a holiday + household + host is its state, the same rule
 * the answers themselves follow.
 */
export async function recordConflicts(): Promise<void> {
  // Called straight after an answer, so read past the memo rather than around it.
  invalidateSheet();
  const sheet = await loadSheet();
  const today = todayInIsrael();

  const open = new Set<string>();
  for (const holiday of sheet.holidays.filter((h) => h.date >= today)) {
    for (const c of conflictsIn(latestByHousehold(sheet.answers, holiday.key))) {
      open.add(`${c.holidayKey}|${c.householdId}|${c.hostHouseholdId}`);
    }
  }

  const recorded = new Map<string, 'open' | 'resolved'>();
  for (const c of sheet.conflicts) {
    recorded.set(`${c.holidayKey}|${c.householdId}|${c.hostHouseholdId}`, c.status);
  }

  const at = new Date().toISOString();
  const rows: string[][] = [];

  // Only what changed: a contradiction that has appeared, or one now settled.
  for (const key of open) {
    if (recorded.get(key) !== 'open') rows.push([...key.split('|'), 'open', at]);
  }
  for (const [key, status] of recorded) {
    if (status === 'open' && !open.has(key)) rows.push([...key.split('|'), 'resolved', at]);
  }

  for (const row of rows) {
    await appendRow(TABS.conflicts, HEADERS.conflicts, row);
  }
}

// ── writes ────────────────────────────────────────────────────────────────────

export async function addPerson(person: Person): Promise<void> {
  await appendRow(TABS.people, HEADERS.people, [person.phone, person.name, person.householdId]);
}

export async function appendAnswer(answer: StoredAnswer): Promise<void> {
  await appendRow(TABS.answers, HEADERS.answers, [
    answer.timestamp,
    answer.holidayKey,
    answer.kind,
    answer.hostHouseholdId,
    answer.byPhone,
    answer.forHouseholdId,
  ]);
}
