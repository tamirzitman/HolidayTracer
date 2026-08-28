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
  conflicts: string[][];
};

const TAB_LIST = [TABS.holidays, TABS.households, TABS.people, TABS.answers, TABS.conflicts];

/**
 * One batched request for the whole spreadsheet, held briefly in memory. Five
 * separate round trips to Google was most of the wait after pressing a button.
 * Any write clears it, so nobody ever sees their own answer go missing.
 */
const TTL_MS = 20_000;
let memo: { at: number; sheet: Sheet } | undefined;

export function invalidateSheet(): void {
  memo = undefined;
}

async function fetchSheet(): Promise<Sheet> {
  const raw = await sheetStore().readMany(TAB_LIST);

  const holidaysTab = indexRows(raw[TABS.holidays] ?? []);
  const householdsTab = indexRows(raw[TABS.households] ?? []);
  const peopleTab = indexRows(raw[TABS.people] ?? []);
  const answersTab = indexRows(raw[TABS.answers] ?? []);

  const householdOf = new Map(
    peopleTab.body.map((row) => [
      cell(row, peopleTab.headers, 'phone'),
      cell(row, peopleTab.headers, 'household_id'),
    ]),
  );

  return {
    holidays: holidaysTab.body
      .map((row) => ({
        key: cell(row, holidaysTab.headers, 'holiday_key'),
        nameHe: cell(row, holidaysTab.headers, 'name_he'),
        type: cell(row, holidaysTab.headers, 'type'),
        date: cell(row, holidaysTab.headers, 'date'),
        year: cell(row, holidaysTab.headers, 'year'),
        include: isTrue(cell(row, holidaysTab.headers, 'include')),
      }))
      .filter((h) => h.key && h.date),

    households: householdsTab.body
      .map((row) => ({
        id: cell(row, householdsTab.headers, 'household_id'),
        name: cell(row, householdsTab.headers, 'name'),
        active: isTrue(cell(row, householdsTab.headers, 'active')),
      }))
      .filter((h) => h.id && h.name && h.active),

    people: peopleTab.body
      .map((row) => ({
        phone: cell(row, peopleTab.headers, 'phone'),
        name: cell(row, peopleTab.headers, 'name'),
        householdId: cell(row, peopleTab.headers, 'household_id'),
      }))
      .filter((p) => p.phone),

    answers: answersTab.body
      .map((row) => {
        const byPhone = cell(row, answersTab.headers, 'by_phone');
        return {
          timestamp: cell(row, answersTab.headers, 'timestamp'),
          holidayKey: cell(row, answersTab.headers, 'holiday_key'),
          kind: cell(row, answersTab.headers, 'kind') as AnswerKind,
          hostHouseholdId: cell(row, answersTab.headers, 'host_household_id'),
          byPhone,
          // Derived, never stored: whose answer this is follows the person.
          householdId: householdOf.get(byPhone) ?? '',
        };
      })
      .filter((a) => a.holidayKey && a.householdId),

    conflicts: (raw[TABS.conflicts] ?? []).slice(1),
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

/** The earliest included holiday that hasn't passed. Undefined means the tab needs more rows. */
export async function getNextHoliday(): Promise<Holiday | undefined> {
  const today = todayInIsrael();
  return (await loadSheet()).holidays
    .filter((h) => h.include && h.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))[0];
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

/** Households that said they are coming to this one. */
export async function guestsComingTo(holidayKey: string, householdId: string): Promise<Household[]> {
  const sheet = await loadSheet();
  const latest = latestByHousehold(sheet.answers, holidayKey);
  return [...latest.values()]
    .filter((a) => a.kind === 'guest' && a.hostHouseholdId === householdId)
    .map((a) => sheet.households.find((h) => h.id === a.householdId))
    .filter((h): h is Household => h !== undefined);
}

/** Past holidays this household answered for, newest first. */
export async function historyFor(householdId: string): Promise<{ holiday: Holiday; answer: Answer }[]> {
  const sheet = await loadSheet();
  const today = todayInIsrael();
  const holidays = new Map(sheet.holidays.map((h) => [h.key, h]));
  const seen = new Map<string, Answer>();

  for (const a of sheet.answers) {
    if (a.householdId !== householdId) continue;
    const holiday = holidays.get(a.holidayKey);
    if (!holiday || holiday.date >= today) continue;
    seen.set(a.holidayKey, a);
  }

  return [...seen.values()]
    .map((answer) => ({ answer, holiday: holidays.get(answer.holidayKey)! }))
    .sort((a, b) => b.holiday.date.localeCompare(a.holiday.date));
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
 * Rewrites the Conflicts tab, but only when it would actually change — an
 * unchanged tab is two Google requests nobody needed. Derived, so anything typed
 * there by hand is lost on the next answer.
 */
export async function rewriteConflicts(): Promise<void> {
  const sheet = await loadSheet();
  const today = todayInIsrael();
  const detectedAt = new Date().toISOString();

  const rows = sheet.holidays
    .filter((h) => h.date >= today)
    .flatMap((h) => conflictsIn(latestByHousehold(sheet.answers, h.key)))
    .map((c) => [c.holidayKey, c.householdId, c.hostHouseholdId, c.hostKind, c.hostHostHouseholdId]);

  const same =
    sheet.conflicts.length === rows.length &&
    rows.every((row, i) => row.every((v, j) => (sheet.conflicts[i]?.[j] ?? '') === v));
  if (same) return;

  await sheetStore().replace(TABS.conflicts, [
    [...HEADERS.conflicts],
    ...rows.map((row) => [...row, detectedAt]),
  ]);
  invalidateSheet();
}

// ── writes ────────────────────────────────────────────────────────────────────

async function appendRow(tab: string, headers: readonly string[], row: string[]): Promise<void> {
  const store = sheetStore();
  // A tab whose first row is data would have that row read back as the header
  // and silently swallowed, so write headers when the tab is empty.
  if ((await store.read(tab)).length === 0) await store.append(tab, [...headers]);
  await store.append(tab, row);
  invalidateSheet();
}

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
  ]);
}
