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
  ['household_id', 'name', 'contact_person_id', 'active'],
  ['hh_parents', 'אבא ואמא', 'p_1', 'TRUE'],
  ['hh_tamir', 'טמיר ואפיק', '', 'TRUE'],
  ['hh_brother', 'אח ואשתו', '', 'TRUE'],
  ['hh_sister', 'אחות ובעלה', '', 'TRUE'],
  ['hh_gone', 'משפחה שכבר לא איתנו', '', 'FALSE'],
];
sheet.People = [
  ['person_id', 'phone', 'name', 'household_id'],
  ['p_1', '+972501234567', 'אבא', 'hh_parents'],
];

// One holiday already in the past, with an answer, so the history screen has
// something to show without waiting a year.
const PAST = ['erev_pesach_2026', 'ערב פסח', 'ערב חג', '2026-04-01', 'י״ד ניסן תשפ״ו', '2026', 'TRUE'];
sheet.Holidays ??= [['holiday_key', 'name_he', 'type', 'date', 'hebrew_date', 'year', 'include']];
if (!sheet.Holidays.some((r) => r[0] === PAST[0])) sheet.Holidays.push(PAST);

sheet.Answers = [
  ['timestamp', 'year', 'holiday_key', 'household_id', 'kind', 'host_household_id', 'by_person_id'],
  ['2026-04-01T15:00:00.000Z', '2026', 'erev_pesach_2026', 'hh_parents', 'guest', 'hh_tamir', 'p_1'],
];
delete sheet.Conflicts;

writeFileSync(FILE, `${JSON.stringify(sheet, null, 2)}\n`, 'utf8');
console.log(`reset Households, People and Answers in ${FILE}`);
console.log(sheet.Holidays ? `${sheet.Holidays.length - 1} holiday rows kept` : 'run: npm run seed:holidays');
