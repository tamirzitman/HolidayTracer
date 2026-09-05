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
  conflicts: { holidayKey: string; householdId: string; hostHouseholdId: string; status: 'open' | 'resolved' }[];
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

async function fetchSheet(): Promise<Sheet> {
  const raw = await sheetStore().readMany(TAB_LIST);

  const holidaysTab = indexRows(raw[TABS.holidays] ?? []);
  const householdsTab = indexRows(raw[TABS.households] ?? []);
  const peopleTab = indexRows(raw[TABS.people] ?? []);
  const answersTab = indexRows(raw[TABS.answers] ?? []);
  const connectionsTab = indexRows(raw[TABS.connections] ?? []);
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
            emoji: cell(row, holidaysTab.headers, 'emoji'),
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
        // Links written before there were two kinds are family invites.
        kind: (cell(row, invitesTab.headers, 'kind') || 'family') as 'family' | 'household',
        createdAt: cell(row, invitesTab.headers, 'created_at'),
        forPhone: cell(row, invitesTab.headers, 'for_phone'),
        usedAt: cell(row, invitesTab.headers, 'used_at'),
        forHouseholdId: cell(row, invitesTab.headers, 'for_household_id'),
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
    // No mark chosen: the kind decides, until somebody types one in the sheet.
    '',
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
    // Carried, not dropped: an emoji typed into the sheet must survive a change
    // of audience, or editing one thing would quietly undo the other.
    holiday.emoji,
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
    holiday.emoji,
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

/**
 * Families that the families you know all know, and you don't.
 *
 * Circles overlap heavily — a brother's list is most of yours, a parent's may
 * be all of it — but the overlap drifts as people add families of their own.
 * Rather than ask anyone to keep the lists in step, this reads the overlap off
 * the connections that already exist: a household in several of your families'
 * circles but not in yours is almost certainly one of yours too. The count is
 * the evidence, and it is what the list is ordered by.
 */
export async function suggestionsFor(
  householdId: string,
): Promise<{ household: Household; seenBy: string[] }[]> {
  const sheet = await loadSheet();
  const mine = await circleOf(householdId);
  const state = connectionState(sheet.connections, householdId);

  // Turned down before, so don't offer it again. A suggestion that keeps coming
  // back is worse than no suggestion: the families you have decided against are
  // exactly the ones your families will keep vouching for. `reconsider` is not
  // here: that is a hiding undone, and they belong back among the offers.
  const known = new Set([
    householdId,
    ...mine.map((h) => h.id),
    ...[...state.entries()].filter(([, action]) => action === 'remove').map(([id]) => id),
  ]);

  // Who vouches, by name. A count answers "how many" when the useful question
  // is "who" — and with a handful of families the names are shorter to read
  // than the number is to interpret.
  const seenBy = new Map<string, string[]>();
  for (const family of mine) {
    for (const theirs of await circleOf(family.id)) {
      if (known.has(theirs.id)) continue;
      seenBy.set(theirs.id, [...(seenBy.get(theirs.id) ?? []), family.name]);
    }
  }

  // Everyone one of your families knows is offered, ordered by how many of them
  // vouch. A threshold that rose with the size of your circle — two vouchers
  // once you had two families — took offers away at the exact moment you acted
  // on one: accept a suggestion and the rest of that family's circle vanished,
  // which reads as the app losing them rather than as a rule. Ranking says
  // "these two are surer" without hiding the rest, and the ✕ is there for the
  // ones you do not want.
  return [...seenBy.entries()]
    .map(([id, who]) => ({
      household: sheet.households.find((h) => h.id === id),
      seenBy: [...who].sort((a, b) => a.localeCompare(b, 'he')),
    }))
    .filter((s): s is { household: Household; seenBy: string[] } => s.household !== undefined)
    .sort(
      (a, b) =>
        b.seenBy.length - a.seenBy.length ||
        a.household.name.localeCompare(b.household.name, 'he'),
    );
}

/**
 * Families hidden from the suggestions. Kept reachable because dismissing one
 * is a tap next to "הוספה" and the two are easy to confuse — a hiding nobody
 * can see is a mistake nobody can undo.
 */
export async function hiddenSuggestions(householdId: string): Promise<Household[]> {
  const sheet = await loadSheet();
  const state = connectionState(sheet.connections, householdId);
  return [...state.entries()]
    .filter(([, action]) => action === 'remove')
    .map(([id]) => sheet.households.find((h) => h.id === id))
    .filter((h): h is Household => h !== undefined && h.active)
    .sort((a, b) => a.name.localeCompare(b.name, 'he'));
}

/** Undoing a hiding: back among the suggestions, still not connected. */
export async function restoreSuggestion(householdId: string, other: string): Promise<void> {
  await appendRow(TABS.connections, HEADERS.connections, [
    householdId,
    other,
    'reconsider',
    new Date().toISOString(),
  ]);
}

/**
 * Whether anybody else knows this household: a second person in it, or a
 * connection in either direction. The sign-in gate protects relationships, not
 * numbers — a household nobody knows has nothing to impersonate, so it is not
 * locked, and somebody who registered alone an hour ago can still get in from
 * their other phone. The moment they are connected to anyone, it locks.
 */
export async function knownToOthers(householdId: string): Promise<boolean> {
  const sheet = await loadSheet();
  if (sheet.people.filter((p) => p.householdId === householdId).length > 1) return true;

  // Newest row per pair, in either direction: a connection is written both ways
  // when made, but a one-way remove exists too.
  const state = new Map<string, Connection['action']>();
  for (const c of sheet.connections) {
    if (c.householdId === householdId || c.connectedTo === householdId) {
      state.set(`${c.householdId}→${c.connectedTo}`, c.action);
    }
  }
  return [...state.values()].includes('add');
}

export async function isConnected(a: string, b: string): Promise<boolean> {
  return connectionState((await loadSheet()).connections, a).get(b) === 'add';
}

/**
 * Turning down a suggestion, for good. One-way on purpose: deciding a family is
 * not yours says nothing about whether you belong on theirs, and it is not a
 * deletion — a newer 'add' row, from taking them up later or from a number
 * typed in, wins over it.
 */
export async function dismissSuggestion(householdId: string, other: string): Promise<void> {
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
  kind: 'family' | 'household',
  /** Aimed at one number, which makes the link single-use. */
  forPhone = '',
  /** Aimed at a family already on the list, which makes it single-use too. */
  forHouseholdId = '',
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
 * The family's standing invite link, made once and reused. Every unregistered
 * family on a screen carries an invite button, and minting a token per button
 * per page load would fill the tab with links nobody ever opens. Reuse is
 * already the semantics: a token names who is inviting, not who is invited.
 */
export async function inviteFor(householdId: string): Promise<string> {
  const existing = (await loadSheet()).invites
    .filter(
      (i) =>
        i.createdBy === householdId &&
        i.kind === 'family' &&
        // Never a targeted one: those are spent by whoever they were sent to.
        !i.forPhone &&
        !i.forHouseholdId &&
        !expired(i),
    )
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
export async function readInvite(
  token: string,
): Promise<
  | {
      household: Household;
      kind: 'family' | 'household';
      forPhone: string;
      /** The family this link makes them, when it names one. */
      forHousehold: Household | undefined;
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
  return {
    household,
    kind: invite.kind,
    forPhone: invite.forPhone,
    forHousehold: invite.forHouseholdId
      ? sheet.households.find((h) => h.id === invite.forHouseholdId)
      : undefined,
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
