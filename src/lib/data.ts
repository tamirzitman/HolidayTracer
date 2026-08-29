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
  type Circle,
  type Membership,
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
  conflicts: { holidayKey: string; householdId: string; hostHouseholdId: string; status: 'open' | 'resolved' }[];
  circles: Circle[];
  members: Membership[];
  invites: Invite[];
};

const TAB_LIST = [
  TABS.holidays,
  TABS.households,
  TABS.people,
  TABS.answers,
  TABS.conflicts,
  TABS.circles,
  TABS.members,
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
  const circlesTab = indexRows(raw[TABS.circles] ?? []);
  const membersTab = indexRows(raw[TABS.members] ?? []);
  const invitesTab = indexRows(raw[TABS.invites] ?? []);
  const conflictsTab = indexRows(raw[TABS.conflicts] ?? []);

  const householdOf = new Map(
    peopleTab.body.map((row) => [
      cell(row, peopleTab.headers, 'phone'),
      cell(row, peopleTab.headers, 'household_id'),
    ]),
  );

  return {
    // Append-only like everything else: the last row for a key is the one that counts,
    // so switching an occasion off is another row rather than a rewrite.
    holidays: [
      ...new Map(
        holidaysTab.body
          .map((row) => ({
            key: cell(row, holidaysTab.headers, 'holiday_key'),
            nameHe: cell(row, holidaysTab.headers, 'name_he'),
            type: cell(row, holidaysTab.headers, 'type'),
            date: cell(row, holidaysTab.headers, 'date'),
            year: cell(row, holidaysTab.headers, 'year'),
            include: isTrue(cell(row, holidaysTab.headers, 'include')),
            ownerHouseholdId: cell(row, holidaysTab.headers, 'owner_household_id'),
            sharedWith: splitIds(cell(row, holidaysTab.headers, 'shared_with')),
          }))
          .filter((h) => h.key && h.date)
          .map((h) => [h.key, h] as const),
      ).values(),
    ],

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

    // Append-only like the rest: the last row for an id wins, so renaming is
    // another row rather than an edit.
    circles: [...new Map(circlesTab.body
      .map((row) => ({
        id: cell(row, circlesTab.headers, 'circle_id'),
        name: cell(row, circlesTab.headers, 'name'),
        createdBy: cell(row, circlesTab.headers, 'created_by'),
        createdAt: cell(row, circlesTab.headers, 'created_at'),
      }))
      .filter((c) => c.id)
      .map((c) => [c.id, c] as const)).values()],

    members: membersTab.body
      .map((row) => ({
        circleId: cell(row, membersTab.headers, 'circle_id'),
        householdId: cell(row, membersTab.headers, 'household_id'),
        action: (cell(row, membersTab.headers, 'action') || 'add') as Membership['action'],
        at: cell(row, membersTab.headers, 'at'),
        holidayKey: cell(row, membersTab.headers, 'holiday_key'),
      }))
      .filter((m) => m.circleId && m.householdId),

    invites: invitesTab.body
      .map((row) => ({
        token: cell(row, invitesTab.headers, 'token'),
        createdBy: cell(row, invitesTab.headers, 'created_by'),
        // Links written before there were two kinds are family invites.
        kind: (cell(row, invitesTab.headers, 'kind') || 'family') as 'family' | 'household',
        createdAt: cell(row, invitesTab.headers, 'created_at'),
        circleId: cell(row, invitesTab.headers, 'circle_id'),
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
  /** Which person in that family actually answered. Empty when nobody has. */
  byName: string;
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
  const asked = (await circleOf(householdId, holidayKey)).filter(
    (h) => !holiday || visibleTo(holiday, h.id),
  );

  return asked.map((household) => {
    const answer = latest.get(household.id);
    return {
      household,
      kind: answer?.kind ?? 'none',
      hostName: answer?.hostHouseholdId ? nameOf(answer.hostHouseholdId) : '',
      byName: answer ? personName(sheet, answer.byPhone) : '',
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

export async function addOccasion(
  householdId: string,
  name: string,
  date: string,
  sharedWith: string[],
): Promise<void> {
  const key = `own_${householdId}_${date.replace(/-/g, '')}_${Date.now().toString(36)}`;
  await appendRow(TABS.holidays, HEADERS.holidays, [
    key,
    name,
    'מועד',
    date,
    date.slice(0, 4),
    'TRUE',
    householdId,
    joinIds(sharedWith),
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
    holiday.key,
    holiday.nameHe,
    holiday.type,
    holiday.date,
    holiday.year,
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
    holiday.key,
    holiday.nameHe,
    holiday.type,
    holiday.date,
    holiday.year,
    'FALSE',
    householdId,
    joinIds(holiday.sharedWith),
  ]);
}

// ── writing ───────────────────────────────────────────────────────────────────

async function appendRow(tab: string, headers: readonly string[], row: string[]): Promise<void> {
  await appendRows(tab, headers, [row]);
}

/**
 * Tabs known to have a header row already. The check below costs a round trip,
 * and a tab that has one can never lose it — everything here only appends — so
 * it is worth asking once per process rather than once per write.
 */
const headed = new Set<string>();

/** The same, in one request. Moving eight families should cost one round trip. */
async function appendRows(
  tab: string,
  headers: readonly string[],
  rows: string[][],
): Promise<void> {
  if (rows.length === 0) return;
  const store = sheetStore();
  // A tab whose first row is data would have that row read back as the header
  // and silently swallowed, so write headers when the tab is empty.
  if (!headed.has(tab)) {
    if ((await store.read(tab)).length === 0) await store.append(tab, [...headers]);
    headed.add(tab);
  }
  await store.appendMany(tab, rows);
  invalidateSheet();
}

// ── circles ───────────────────────────────────────────────────────────────────

/** Latest event wins. Rows are only ever appended, never rewritten. */
/**
 * Who is in a circle: the newest standing row per household decides, and then a
 * holiday's own rows are laid over the top. Being out for one seder is not the
 * same as leaving, and the app should not make you choose between them.
 */
function membersIn(sheet: Sheet, circleId: string, holidayKey = ''): Set<string> {
  const state = new Map<string, Membership['action']>();
  for (const m of sheet.members) {
    if (m.circleId !== circleId) continue;
    if (m.holidayKey && m.holidayKey !== holidayKey) continue;
    // Standing rows first, then this holiday's, so the exception wins.
    if (!m.holidayKey || m.holidayKey === holidayKey) state.set(m.householdId, m.action);
  }
  return new Set([...state.entries()].filter(([, a]) => a === 'add').map(([id]) => id));
}

/** The circles this household is in. */
export async function circleIdsOf(householdId: string): Promise<string[]> {
  const sheet = await loadSheet();
  return sheet.circles.filter((c) => membersIn(sheet, c.id).has(householdId)).map((c) => c.id);
}

/**
 * The circles this household is in, each with the other families in it.
 *
 * This is the shape everything is arranged around. A household is in as many
 * circles as it needs — one per side of the family — and they do not mix. A
 * family met through two circles appears in both, which is right: the same aunt
 * can be on both sides.
 */
export async function circlesOf(
  householdId: string,
  /** Reads the circle as it stands for one holiday: a family taken out of this
   *  seder alone is missing here and nowhere else. */
  holidayKey = '',
): Promise<{ id: string; name: string; families: Household[] }[]> {
  const sheet = await loadSheet();
  const byId = new Map(sheet.households.map((h) => [h.id, h]));

  // Membership is judged standing-only: being away from one seder does not take
  // you out of the circle, so the circle still shows on your screen.
  return sheet.circles
    .filter((c) => membersIn(sheet, c.id).has(householdId))
    .map((c) => ({
      id: c.id,
      name: c.name,
      families: [...membersIn(sheet, c.id, holidayKey)]
        .filter((id) => id !== householdId)
        .map((id) => byId.get(id))
        .filter((h): h is Household => h !== undefined),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'he'));
}

/** Everyone this household can answer at: every circle it is in, flattened. */
export async function circleOf(householdId: string, holidayKey = ''): Promise<Household[]> {
  const seen = new Map<string, Household>();
  for (const circle of await circlesOf(householdId, holidayKey)) {
    for (const family of circle.families) seen.set(family.id, family);
  }
  return [...seen.values()];
}

/**
 * Families who are in your circles but out of this one holiday — the cousins who
 * are at the other side's seder this year. Kept apart from leaving a circle,
 * which is a different thing entirely.
 */
export async function awayFrom(householdId: string, holidayKey: string): Promise<Household[]> {
  if (!holidayKey) return [];
  const here = new Set((await circleOf(householdId, holidayKey)).map((h) => h.id));
  return (await circleOf(householdId)).filter((h) => !here.has(h.id));
}

/** Two families can answer at each other when they share a circle. */
export async function isConnected(a: string, b: string): Promise<boolean> {
  const sheet = await loadSheet();
  return sheet.circles.some((c) => {
    const members = membersIn(sheet, c.id);
    return members.has(a) && members.has(b);
  });
}

/**
 * The families a newcomer arriving on this invite could say they belong to: the
 * family that invited them, and everyone in that family's circles.
 *
 * Matching on the phone number is not enough to keep one family from becoming
 * two. The number somebody typed in when they added a family belongs to one
 * person in it, and the one who actually signs up may be their partner, with a
 * number nobody has ever entered. So the newcomer is shown the families already
 * on the list and can simply say which one is theirs.
 *
 * Families nobody has signed into come first: those are the ones added by name
 * alone, and the likeliest thing a newcomer is here to claim.
 */
export async function claimableIn(householdId: string): Promise<Household[]> {
  const sheet = await loadSheet();
  const joined = new Set(sheet.people.map((p) => p.householdId));
  const inviter = sheet.households.find((h) => h.id === householdId);
  const all = inviter ? [inviter, ...(await circleOf(householdId))] : await circleOf(householdId);
  return [...all.filter((h) => !joined.has(h.id)), ...all.filter((h) => joined.has(h.id))];
}

export async function createCircle(name: string, createdBy: string): Promise<string> {
  const used = (await loadSheet()).circles
    .map((c) => Number(c.id))
    .filter((n) => Number.isInteger(n));
  const id = String(Math.max(0, ...used) + 1);
  await appendRow(TABS.circles, HEADERS.circles, [
    id,
    name,
    createdBy,
    new Date().toISOString(),
  ]);
  await joinCircle(id, createdBy);
  return id;
}

export async function joinCircle(
  circleId: string,
  householdId: string,
  holidayKey = '',
): Promise<void> {
  await setMembership(circleId, householdId, 'add', holidayKey);
}

/** Out of the circle — for good, or for one holiday when a key is given. */
export async function leaveCircle(
  circleId: string,
  householdId: string,
  holidayKey = '',
): Promise<void> {
  await setMembership(circleId, householdId, 'remove', holidayKey);
}

/**
 * Several households in or out of a circle at once, and the only way any of the
 * bulk edits reach the sheet: one appended block, so ticking eight families and
 * pressing once costs what one family used to.
 */
export async function setMemberships(
  circleId: string,
  householdIds: string[],
  action: Membership['action'],
  holidayKey = '',
): Promise<void> {
  const at = new Date().toISOString();
  await appendRows(
    TABS.members,
    HEADERS.members,
    householdIds.map((householdId) => [circleId, householdId, action, at, holidayKey]),
  );
}

/** Arbitrary membership rows in one block, for edits that span several circles. */
export async function appendMemberships(
  rows: { circleId: string; householdId: string; action: Membership['action']; at: string; holidayKey?: string }[],
): Promise<void> {
  await appendRows(
    TABS.members,
    HEADERS.members,
    rows.map((r) => [r.circleId, r.householdId, r.action, r.at, r.holidayKey ?? '']),
  );
}

/**
 * A family out of one circle and into another, in a single block. Both halves
 * land in the same tab, so the move cannot half-happen and leave somebody in
 * neither circle.
 */
export async function moveMemberships(
  from: string,
  to: string,
  householdIds: string[],
): Promise<void> {
  const at = new Date().toISOString();
  await appendRows(TABS.members, HEADERS.members, [
    ...householdIds.map((id) => [from, id, 'remove', at, '']),
    ...householdIds.map((id) => [to, id, 'add', at, '']),
  ]);
}

/**
 * Deleting a circle. Nothing is erased — everyone is taken out of it, and a
 * circle nobody is in is a circle nobody can see, so it leaves every screen at
 * once while the rows that made it stay readable in the sheet.
 */
export async function emptyCircle(circleId: string): Promise<void> {
  const sheet = await loadSheet();
  await setMemberships(circleId, [...membersIn(sheet, circleId)], 'remove');
}

async function setMembership(
  circleId: string,
  householdId: string,
  action: Membership['action'],
  holidayKey: string,
): Promise<void> {
  await appendRow(TABS.members, HEADERS.members, [
    circleId,
    householdId,
    action,
    new Date().toISOString(),
    holidayKey,
  ]);
}

export async function renameCircle(circleId: string, name: string): Promise<void> {
  const circle = (await loadSheet()).circles.find((c) => c.id === circleId);
  if (!circle) return;
  await appendRow(TABS.circles, HEADERS.circles, [
    circle.id,
    name,
    circle.createdBy,
    circle.createdAt,
  ]);
}

/**
 * Turning down a suggested circle, for good. Recorded rather than forgotten,
 * because the circles you have decided against are exactly the ones your
 * families will keep vouching for. Not a deletion: a later `add` wins over it.
 */
export async function declineCircle(circleId: string, householdId: string): Promise<void> {
  await setMembership(circleId, householdId, 'declined', '');
}

/**
 * Circles worth being in: ones the families you already know belong to.
 *
 * Two families have to be in it before it is offered — one family's other
 * circle is theirs, not yours — except when your own circles are too few to
 * reach two, where the first suggestion is what gets a new household started.
 */
export async function suggestionsFor(
  householdId: string,
): Promise<{ circle: Circle; seenBy: number }[]> {
  const sheet = await loadSheet();
  const mine = await circleIdsOf(householdId);
  const family = await circleOf(householdId);

  const decided = new Set(
    sheet.members
      .filter((m) => m.householdId === householdId && m.action !== 'add')
      .map((m) => m.circleId),
  );

  const seenBy = new Map<string, number>();
  for (const c of sheet.circles) {
    if (mine.includes(c.id) || decided.has(c.id)) continue;
    const members = membersIn(sheet, c.id);
    const overlap = family.filter((h) => members.has(h.id)).length;
    if (overlap > 0) seenBy.set(c.id, overlap);
  }

  const enough = Math.min(2, Math.max(1, family.length));
  return [...seenBy.entries()]
    .filter(([, count]) => count >= enough)
    .map(([id, count]) => ({ circle: sheet.circles.find((c) => c.id === id), seenBy: count }))
    .filter((s): s is { circle: Circle; seenBy: number } => s.circle !== undefined)
    .sort((a, b) => b.seenBy - a.seenBy || a.circle.name.localeCompare(b.circle.name, 'he'));
}

export async function createInvite(
  householdId: string,
  kind: 'family' | 'household',
  circleId = '',
): Promise<string> {
  const token = randomUUID().replace(/-/g, '').slice(0, 12);
  await appendRow(TABS.invites, HEADERS.invites, [
    token,
    householdId,
    kind,
    new Date().toISOString(),
    circleId,
  ]);
  return token;
}

/**
 * The family's standing invite link, made once and reused. Every unregistered
 * family on a screen carries an invite button, and minting a token per button
 * per page load would fill the tab with links nobody ever opens. Reuse is
 * already the semantics: a token names who is inviting, not who is invited.
 */
export async function inviteFor(householdId: string): Promise<string> {
  const existing = (await loadSheet()).invites
    .filter((i) => i.createdBy === householdId && i.kind === 'family' && !expired(i))
    .at(-1);
  return existing?.token ?? createInvite(householdId, 'family');
}

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

/** Reusable: a link in the family group should bring in more than one household. */
export async function readInvite(
  token: string,
): Promise<{ household: Household; kind: 'family' | 'household'; circleId: string } | undefined> {
  const sheet = await loadSheet();
  const invite = sheet.invites.find((i) => i.token === token);
  if (!invite || expired(invite)) return undefined;
  const household = sheet.households.find((h) => h.id === invite.createdBy);
  return household ? { household, kind: invite.kind, circleId: invite.circleId } : undefined;
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
