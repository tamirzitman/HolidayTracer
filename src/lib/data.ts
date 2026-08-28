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
  connections: Connection[];
  invites: Invite[];
};

const TAB_LIST = [
  TABS.holidays,
  TABS.households,
  TABS.people,
  TABS.answers,
  TABS.conflicts,
  TABS.connections,
  TABS.invites,
];

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
  const connectionsTab = indexRows(raw[TABS.connections] ?? []);
  const invitesTab = indexRows(raw[TABS.invites] ?? []);

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

    connections: connectionsTab.body
      .map((row) => ({
        householdId: cell(row, connectionsTab.headers, 'household_id'),
        connectedTo: cell(row, connectionsTab.headers, 'connected_to'),
        action: (cell(row, connectionsTab.headers, 'action') || 'add') as 'add' | 'remove',
        at: cell(row, connectionsTab.headers, 'at'),
      }))
      .filter((c) => c.householdId && c.connectedTo),

    invites: invitesTab.body
      .map((row) => ({
        token: cell(row, invitesTab.headers, 'token'),
        createdBy: cell(row, invitesTab.headers, 'created_by'),
        // Links written before there were two kinds are family invites.
        kind: (cell(row, invitesTab.headers, 'kind') || 'family') as 'family' | 'household',
        createdAt: cell(row, invitesTab.headers, 'created_at'),
      }))
      .filter((i) => i.token && i.createdBy),
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

/** erev_pesach_2027 → erev_pesach */
const holidayKind = (key: string): string => key.replace(/_\d{4}$/, '');

/**
 * One full round of the year: everything from the next holiday up to — but not
 * including — that same holiday's next occurrence. So from erev Rosh Hashana you
 * can step through every holiday until the following Rosh Hashana, and no further.
 */
export async function getUpcomingHolidays(): Promise<Holiday[]> {
  const today = todayInIsrael();
  const included = (await loadSheet()).holidays
    .filter((h) => h.include && h.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (included.length === 0) return [];

  const first = included[0];
  const repeatsAt = included.findIndex((h, i) => i > 0 && holidayKind(h.key) === holidayKind(first.key));
  return repeatsAt === -1 ? included : included.slice(0, repeatsAt);
}

/** The earliest included holiday that hasn't passed. Undefined means the tab needs more rows. */
export async function getNextHoliday(): Promise<Holiday | undefined> {
  return (await getUpcomingHolidays())[0];
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

/**
 * What everyone in my circle has said about this holiday. Shown only once I have
 * answered myself — knowing is the reward for answering.
 */
export type CircleAnswer = {
  household: Household;
  kind: AnswerKind | 'none';
  hostName: string;
};

export async function circleAnswers(
  holidayKey: string,
  householdId: string,
): Promise<CircleAnswer[]> {
  const sheet = await loadSheet();
  const latest = latestByHousehold(sheet.answers, holidayKey);
  const nameOf = (id: string) => sheet.households.find((h) => h.id === id)?.name ?? id;

  return (await circleOf(householdId)).map((household) => {
    const answer = latest.get(household.id);
    return {
      household,
      kind: answer?.kind ?? 'none',
      hostName: answer?.hostHouseholdId ? nameOf(answer.hostHouseholdId) : '',
    };
  });
}

/**
 * Every holiday that has passed, newest first, with what this household said —
 * including the ones it never answered, so a gap can be filled in later.
 */
export async function historyFor(
  householdId: string,
): Promise<{ holiday: Holiday; answer: Answer | undefined }[]> {
  const sheet = await loadSheet();
  const today = todayInIsrael();

  const mine = new Map<string, Answer>();
  for (const a of sheet.answers) {
    if (a.householdId === householdId) mine.set(a.holidayKey, a);
  }

  return sheet.holidays
    .filter((h) => h.include && h.date < today)
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((holiday) => ({ holiday, answer: mine.get(holiday.key) }));
}

/** A holiday that has already passed, for correcting the record after the fact. */
export async function getPastHoliday(key: string): Promise<Holiday | undefined> {
  const today = todayInIsrael();
  return (await loadSheet()).holidays.find((h) => h.key === key && h.date < today);
}

// ── writing ───────────────────────────────────────────────────────────────────

async function appendRow(tab: string, headers: readonly string[], row: string[]): Promise<void> {
  const store = sheetStore();
  // A tab whose first row is data would have that row read back as the header
  // and silently swallowed, so write headers when the tab is empty.
  if ((await store.read(tab)).length === 0) await store.append(tab, [...headers]);
  await store.append(tab, row);
  invalidateSheet();
}

// ── circles ───────────────────────────────────────────────────────────────────

/** Latest event wins, so hiding a family and adding it back both just append. */
function connectionState(connections: Connection[], householdId: string): Map<string, 'add' | 'remove'> {
  const state = new Map<string, 'add' | 'remove'>();
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

export async function isConnected(a: string, b: string): Promise<boolean> {
  return connectionState((await loadSheet()).connections, a).get(b) === 'add';
}

/** Introducing two families is mutual; hiding one is not. */
export async function connect(a: string, b: string): Promise<void> {
  const at = new Date().toISOString();
  await appendRow(TABS.connections, HEADERS.connections, [a, b, 'add', at]);
  await appendRow(TABS.connections, HEADERS.connections, [b, a, 'add', at]);
}

export async function hideFamily(mine: string, theirs: string): Promise<void> {
  await appendRow(TABS.connections, HEADERS.connections, [
    mine,
    theirs,
    'remove',
    new Date().toISOString(),
  ]);
}

/** Undo a hide. Only my side changes — theirs never stopped. */
export async function showFamily(mine: string, theirs: string): Promise<void> {
  await appendRow(TABS.connections, HEADERS.connections, [
    mine,
    theirs,
    'add',
    new Date().toISOString(),
  ]);
}

/** Families I hid — so hiding is a choice I can take back, not a dead end. */
export async function hiddenFrom(householdId: string): Promise<Household[]> {
  const sheet = await loadSheet();
  const state = connectionState(sheet.connections, householdId);
  return sheet.households.filter((h) => state.get(h.id) === 'remove');
}

export async function createInvite(
  householdId: string,
  kind: 'family' | 'household',
): Promise<string> {
  const token = randomUUID().replace(/-/g, '').slice(0, 12);
  await appendRow(TABS.invites, HEADERS.invites, [
    token,
    householdId,
    kind,
    new Date().toISOString(),
  ]);
  return token;
}

/** Reusable: a link in the family group should bring in more than one household. */
export async function readInvite(
  token: string,
): Promise<{ household: Household; kind: 'family' | 'household' } | undefined> {
  const sheet = await loadSheet();
  const invite = sheet.invites.find((i) => i.token === token);
  if (!invite) return undefined;
  const household = sheet.households.find((h) => h.id === invite.createdBy);
  return household ? { household, kind: invite.kind } : undefined;
}

export async function addHousehold(name: string): Promise<string> {
  const used = (await loadSheet()).households
    .map((h) => Number(h.id))
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
