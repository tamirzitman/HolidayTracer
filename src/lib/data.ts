import { cache } from 'react';
import { sheetStore } from './sheet';
import { TABS, type Answer, type AnswerKind, type Holiday, type Household, type Person } from './types';

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

function cell(row: string[], headers: Map<string, number>, name: string): string {
  const i = headers.get(name);
  return i === undefined ? '' : (row[i] ?? '').toString().trim();
}

function isTrue(value: string): boolean {
  const v = value.trim().toLowerCase();
  return v === 'true' || v === '1' || v === 'yes' || v === 'כן';
}

/** Today in Israel, as YYYY-MM-DD — the app's whole notion of "now". */
export function todayInIsrael(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export const getHouseholds = cache(async (): Promise<Household[]> => {
  const { headers, body } = indexRows(await sheetStore().read(TABS.households));
  return body
    .map((row) => ({
      id: cell(row, headers, 'household_id'),
      name: cell(row, headers, 'name'),
      phone: cell(row, headers, 'phone'),
      active: isTrue(cell(row, headers, 'active')),
    }))
    .filter((h) => h.id && h.name && h.active);
});

export async function getHousehold(id: string): Promise<Household | undefined> {
  return (await getHouseholds()).find((h) => h.id === id);
}

export const getPeople = cache(async (): Promise<Person[]> => {
  const { headers, body } = indexRows(await sheetStore().read(TABS.people));
  return body
    .map((row) => ({
      phone: cell(row, headers, 'phone'),
      name: cell(row, headers, 'name'),
      householdId: cell(row, headers, 'household_id'),
    }))
    .filter((p) => p.phone);
});

export async function findPerson(phone: string): Promise<Person | undefined> {
  return (await getPeople()).find((p) => p.phone === phone && p.householdId);
}

export const PEOPLE_HEADERS = ['phone', 'name', 'household_id'];

/**
 * Append a row, writing the header first if the tab is empty. Columns are read
 * by header name, so a tab whose first row is data would silently swallow that
 * row — worth guarding against, since these tabs are edited by hand.
 */
async function appendRow(tab: string, headers: string[], row: string[]): Promise<void> {
  const store = sheetStore();
  if ((await store.read(tab)).length === 0) {
    await store.append(tab, headers);
  }
  await store.append(tab, row);
}

export async function addPerson(person: Person): Promise<void> {
  await appendRow(TABS.people, PEOPLE_HEADERS, [person.phone, person.name, person.householdId]);
}

export const getHolidays = cache(async (): Promise<Holiday[]> => {
  const { headers, body } = indexRows(await sheetStore().read(TABS.holidays));
  return body
    .map((row) => ({
      key: cell(row, headers, 'holiday_key'),
      nameHe: cell(row, headers, 'name_he'),
      type: cell(row, headers, 'type'),
      date: cell(row, headers, 'date'),
      hebrewDate: cell(row, headers, 'hebrew_date'),
      hebrewYear: cell(row, headers, 'hebrew_year'),
      include: isTrue(cell(row, headers, 'include')),
    }))
    .filter((h) => h.key && h.date);
});

/** The earliest included holiday that hasn't passed. Undefined means the tab needs more rows. */
export async function getNextHoliday(): Promise<Holiday | undefined> {
  const today = todayInIsrael();
  return (await getHolidays())
    .filter((h) => h.include && h.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))[0];
}

export const getAnswers = cache(async (): Promise<Answer[]> => {
  const { headers, body } = indexRows(await sheetStore().read(TABS.answers));
  return body
    .map((row) => ({
      timestamp: cell(row, headers, 'timestamp'),
      hebrewYear: cell(row, headers, 'hebrew_year'),
      holidayKey: cell(row, headers, 'holiday_key'),
      holidayName: cell(row, headers, 'holiday_name'),
      byPhone: cell(row, headers, 'by_phone'),
      householdId: cell(row, headers, 'household_id'),
      householdName: cell(row, headers, 'household_name'),
      kind: cell(row, headers, 'kind') as AnswerKind,
      hostHouseholdId: cell(row, headers, 'host_household_id'),
      hostHouseholdName: cell(row, headers, 'host_household_name'),
    }))
    .filter((a) => a.holidayKey && a.householdId);
});

/**
 * The log is append-only, so a household's answer is simply its last row for
 * that holiday. Rows are appended in order; the timestamp breaks ties if a
 * human ever sorts the tab.
 */
export async function getLatestAnswer(
  holidayKey: string,
  householdId: string,
): Promise<Answer | undefined> {
  return (await getAnswers())
    .filter((a) => a.holidayKey === holidayKey && a.householdId === householdId)
    .at(-1);
}

export const ANSWER_HEADERS = [
  'timestamp',
  'hebrew_year',
  'holiday_key',
  'holiday_name',
  'by_phone',
  'household_id',
  'household_name',
  'kind',
  'host_household_id',
  'host_household_name',
];

export async function appendAnswer(answer: Answer): Promise<void> {
  await appendRow(TABS.answers, ANSWER_HEADERS, [
    answer.timestamp,
    answer.hebrewYear,
    answer.holidayKey,
    answer.holidayName,
    answer.byPhone,
    answer.householdId,
    answer.householdName,
    answer.kind,
    answer.hostHouseholdId,
    answer.hostHouseholdName,
  ]);
}
