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

// One holiday already in the past, with an answer, so the history screen has
// something to show without waiting a year.
const HOLIDAY_HEADER = [
  'holiday_key', 'name_he', 'type', 'date', 'year', 'include',
  'owner_household_id', 'shared_with',
];
// The last column is empty: a seeded holiday belongs to everybody. Only a family's
// own occasion carries an owner.
const PAST = ['erev_pesach_2026', 'ערב פסח', 'ערב חג', '2026-04-01', '2026', 'TRUE', '', ''];
// A second one, deliberately left unanswered, so the history screen has a gap to
// mark as missing.
const GAP = ['erev_shavuot_2026', 'ערב שבועות', 'ערב חג', '2026-05-21', '2026', 'TRUE', '', ''];
sheet.Holidays ??= [HOLIDAY_HEADER];
sheet.Holidays[0] = HOLIDAY_HEADER;
// Occasions added by a previous run would otherwise pile up.
sheet.Holidays = sheet.Holidays.filter((r, i) => i === 0 || !r[6]);
for (const row of [PAST, GAP]) {
  if (!sheet.Holidays.some((r) => r[0] === row[0])) sheet.Holidays.push(row);
}

sheet.Answers = [
  ['timestamp', 'holiday_key', 'kind', 'host_household_id', 'by_phone', 'for_household_id'],
  ['2026-04-01T15:00:00.000Z', 'erev_pesach_2026', 'guest', 'hh_a', '+972501234567', ''],
];
// Everyone who was here before circles saw everyone, so link them all.
const active = sheet.Households.slice(1).filter((r) => r[2] === 'TRUE').map((r) => r[0]);
const now = new Date().toISOString();
sheet.Connections = [['household_id', 'connected_to', 'action', 'at', 'circle']];
for (const a of active) {
  for (const b of active) {
    if (a !== b) sheet.Connections.push([a, b, 'add', now, '']);
  }
}
sheet.Invites = [['token', 'created_by', 'kind', 'created_at', 'circle']];

delete sheet.Conflicts;

writeFileSync(FILE, `${JSON.stringify(sheet, null, 2)}\n`, 'utf8');
console.log(`reset Households, People and Answers in ${FILE}`);
console.log(sheet.Holidays ? `${sheet.Holidays.length - 1} holiday rows kept` : 'run: npm run seed:holidays');
