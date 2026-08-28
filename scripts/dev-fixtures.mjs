/**
 * Resets .dev-sheet.json — the local stand-in for the Google Sheet used when
 * SHEET_ID isn't set. Households and People are what you'd otherwise type into
 * the real sheet by hand; Holidays comes from `npm run seed:holidays`.
 *
 *   node scripts/dev-fixtures.mjs
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
  ['household_id', 'name', 'phone', 'active'],
  ['hh_parents', 'אבא ואמא', '+972501234567', 'TRUE'],
  ['hh_tamir', 'תמיר ורעיה', '+972521234567', 'TRUE'],
  ['hh_brother', 'אח ואשתו', '+972527654321', 'TRUE'],
  ['hh_sister', 'אחות ובעלה', '+972542221188', 'TRUE'],
  ['hh_gone', 'משפחה שכבר לא איתנו', '+972500000000', 'FALSE'],
];
sheet.People = [
  ['phone', 'name', 'household_id'],
  ['+972501234567', 'אבא', 'hh_parents'],
];
delete sheet.Answers;

writeFileSync(FILE, `${JSON.stringify(sheet, null, 2)}\n`, 'utf8');
console.log(`reset Households and People in ${FILE}`);
console.log(sheet.Holidays ? `${sheet.Holidays.length - 1} holiday rows kept` : 'no Holidays yet — run: npm run seed:holidays');
