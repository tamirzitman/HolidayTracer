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
  ['hh_tamir', 'טמיר ואפיק', 'TRUE'],
  ['hh_brother', 'אח ואשתו', 'TRUE'],
  ['hh_sister', 'אחות ובעלה', 'TRUE'],
  ['hh_gone', 'משפחה שכבר לא איתנו', 'FALSE'],
];
sheet.People = [
  ['phone', 'name', 'household_id'],
  ['+972501234567', 'אבא', 'hh_parents'],
];

// One holiday already in the past, with an answer, so the history screen has
// something to show without waiting a year.
const PAST = ['erev_pesach_2026', 'ערב פסח', 'ערב חג', '2026-04-01', '2026', 'TRUE'];
sheet.Holidays ??= [['holiday_key', 'name_he', 'type', 'date', 'year', 'include']];
if (!sheet.Holidays.some((r) => r[0] === PAST[0])) sheet.Holidays.push(PAST);

sheet.Answers = [
  ['timestamp', 'holiday_key', 'kind', 'host_household_id', 'by_phone'],
  ['2026-04-01T15:00:00.000Z', 'erev_pesach_2026', 'guest', 'hh_tamir', '+972501234567'],
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
sheet.Invites = [['token', 'created_by', 'created_at']];

delete sheet.Conflicts;

writeFileSync(FILE, `${JSON.stringify(sheet, null, 2)}\n`, 'utf8');
console.log(`reset Households, People and Answers in ${FILE}`);
console.log(sheet.Holidays ? `${sheet.Holidays.length - 1} holiday rows kept` : 'run: npm run seed:holidays');
