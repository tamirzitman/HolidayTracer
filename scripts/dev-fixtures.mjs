/**
 * Resets .dev-sheet.json — the local stand-in for the Google Sheet used when
 * SHEET_ID isn't set. Households and People are what you'd otherwise type into
 * the real sheet by hand; Holidays comes from `npm run seed:holidays`.
 *
 *   npm run fixtures
 */
import { readFileSync, writeFileSync } from 'node:fs';

const FILE = '.dev-sheet.json';

let sheet = {};
try {
  sheet = JSON.parse(readFileSync(FILE, 'utf8'));
} catch {
  // first run
}

sheet.Households = [
  ['household_id', 'name', 'active'],
  ['hh_parents', 'אבא ואמא', 'TRUE'],
  ['hh_a', 'דנה ויוסי', 'TRUE'],
  ['hh_brother', 'אח ואשתו', 'TRUE'],
  ['hh_sister', 'אחות ובעלה', 'TRUE'],
  ['hh_gone', 'משפחה שכבר לא איתנו', 'FALSE'],
];
// One family with two people in it, so the WhatsApp mark has somebody to open a
// chat with — and has to ask which of them you meant.
sheet.People = [
  ['phone', 'name', 'household_id'],
  ['+972501234567', 'אבא', 'hh_parents'],
  ['+972502223333', 'דנה', 'hh_a'],
  ['+972504445555', 'יוסי', 'hh_a'],
];

// What a holiday is, said once — and when it falls, said once per year. Two
// tabs, because the second is the only thing a year changes.
const HOLIDAY_HEADER = [
  'holiday_id', 'name_he', 'type', 'emoji', 'include', 'owner_household_id', 'shared_with',
];
const DATE_HEADER = ['holiday_id', 'year', 'date'];
// owner_household_id is empty: a seeded holiday belongs to everybody, and only a
// family's own occasion carries an owner. emoji is empty too, so these exercise
// the fallback to the mark the code knows for the kind.
const CATALOGUE = [
  ['erev_pesach', 'ערב פסח', 'ערב חג', '', 'TRUE', '', ''],
  ['erev_shavuot', 'ערב שבועות', 'ערב חג', '', 'TRUE', '', ''],
  ['erev_rosh_hashana', 'ערב ראש השנה', 'ערב חג', '', 'TRUE', '', ''],
];
// One holiday already in the past, with an answer, so the history screen has
// something to show without waiting a year; a second left unanswered, so there
// is a gap to mark as missing; and one still to come, to be asked about.
const DATES = [
  ['erev_pesach', '2026', '2026-04-01'],
  ['erev_shavuot', '2026', '2026-05-21'],
  ['erev_rosh_hashana', '2026', '2026-09-11'],
];
// A sheet written before the split has one row per holiday per year, with the
// name and the mark copied into each. Take it apart rather than throwing the
// seeded calendar away.
if ((sheet.Holidays?.[0] ?? []).includes('holiday_key')) {
  const old = sheet.Holidays.slice(1);
  const seen = new Set();
  const entries = [];
  const dates = [];
  for (const r of old) {
    const id = String(r[0]).replace(/_\d{4}$/, '');
    if (!seen.has(id)) {
      seen.add(id);
      entries.push([id, r[1], r[2], r[8] ?? '', r[5] ?? 'TRUE', r[6] ?? '', r[7] ?? '']);
    }
    dates.push([id, r[4] || String(r[3]).slice(0, 4), r[3]]);
  }
  sheet.Holidays = [HOLIDAY_HEADER, ...entries];
  sheet.Dates = [DATE_HEADER, ...dates];
}

// Occasions a previous run added would otherwise pile up — and so would their
// dates, which are keyed by the same id.
const mine = new Set(
  (sheet.Holidays ?? []).slice(1).filter((r) => r[5] || r[6]).map((r) => r[0]),
);
const keptEntries = (sheet.Holidays ?? []).slice(1).filter((r) => !mine.has(r[0]));
const keptDates = (sheet.Dates ?? []).slice(1).filter((r) => !mine.has(r[0]));

sheet.Holidays = [
  HOLIDAY_HEADER,
  ...keptEntries,
  ...CATALOGUE.filter((c) => !keptEntries.some((r) => r[0] === c[0])),
];
sheet.Dates = [
  DATE_HEADER,
  ...keptDates,
  ...DATES.filter((d) => !keptDates.some((r) => r[0] === d[0] && r[1] === d[1])),
];
// A mark a previous run typed in would still be there, so the fallback to the
// code's own mark would never be what is on screen. Blank is the known state.
for (const row of sheet.Holidays.slice(1)) row[3] = '';

sheet.Answers = [
  ['timestamp', 'holiday_key', 'kind', 'host_household_id', 'by_phone', 'for_household_id'],
  ['2026-04-01T15:00:00.000Z', 'erev_pesach_2026', 'guest', 'hh_a', '+972501234567', ''],
];
// Everyone who was here before circles saw everyone, so link them all.
const active = sheet.Households.slice(1).filter((r) => r[2] === 'TRUE').map((r) => r[0]);
const now = new Date().toISOString();
sheet.Connections = [['household_id', 'connected_to', 'action', 'at']];
for (const a of active) {
  for (const b of active) {
    if (a !== b) sheet.Connections.push([a, b, 'add', now]);
  }
}
// A spare column the code has never heard of, on purpose. The real sheet grew
// one — left behind by a feature that was reverted — and rows written by
// position rather than by header name landed one column over from then on, so
// no invite aimed at a number could let anybody in. The suite carries the same
// trap so that can never pass unnoticed again.
sheet.Invites = [
  ['token', 'created_by', 'kind', 'created_at', 'circle', 'for_phone', 'used_at', 'for_household_id',
    'for_circle_id'],
];

sheet.Circles = [
  ['circle_id', 'household_id', 'action', 'name', 'color', 'added_by', 'at'],
];

delete sheet.Conflicts;

writeFileSync(FILE, `${JSON.stringify(sheet, null, 2)}\n`, 'utf8');
console.log(`reset Households, People and Answers in ${FILE}`);
console.log(sheet.Holidays ? `${sheet.Holidays.length - 1} holiday rows kept` : 'run: npm run seed:holidays');
