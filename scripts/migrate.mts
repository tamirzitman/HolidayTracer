/**
 * One-off migration to the simplified shape:
 *   - People keyed by phone, no person_id
 *   - Households without contact_person_id
 *   - Answers reference the phone directly
 *   - Holidays without hebrew_date
 *
 *   npm run migrate -- --dry
 *   npm run migrate
 */
import { readFileSync } from 'node:fs';

loadEnv();
const { sheetStore } = await import('../src/lib/sheet.ts');
const { HEADERS, TABS } = await import('../src/lib/types.ts');

function loadEnv(): void {
  for (const file of ['.env.local', '.env']) {
    let text: string;
    try {
      text = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    for (const line of text.split('\n')) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  }
}

const dry = process.argv.includes('--dry');
const store = sheetStore();
const at = (header: string[], name: string) => header.indexOf(name);
const pick = (row: string[], header: string[], name: string) => {
  const i = at(header, name);
  return i === -1 ? '' : (row[i] ?? '');
};

// People: phone becomes the key; person_id goes away.
const peopleRaw = await store.read(TABS.people);
const pHeader = peopleRaw[0] ?? [];
const idToPhone = new Map<string, string>();
const people = peopleRaw.slice(1).map((row) => {
  const phone = pick(row, pHeader, 'phone');
  const id = pick(row, pHeader, 'person_id');
  if (id) idToPhone.set(id, phone);
  return [phone, pick(row, pHeader, 'name'), pick(row, pHeader, 'household_id')];
});

// Households: contact_person_id was unnecessary — the number comes from People.
const hhRaw = await store.read(TABS.households);
const hHeader = hhRaw[0] ?? [];
const households = hhRaw.slice(1).map((row) => [
  pick(row, hHeader, 'household_id'),
  pick(row, hHeader, 'name'),
  pick(row, hHeader, 'active') || 'TRUE',
]);

// Answers: by_person_id → by_phone.
const ansRaw = await store.read(TABS.answers);
const aHeader = ansRaw[0] ?? [];
const answers = ansRaw.slice(1).map((row) => {
  const byId = pick(row, aHeader, 'by_person_id');
  return [
    pick(row, aHeader, 'timestamp'),
    pick(row, aHeader, 'year'),
    pick(row, aHeader, 'holiday_key'),
    pick(row, aHeader, 'household_id'),
    pick(row, aHeader, 'kind'),
    pick(row, aHeader, 'host_household_id'),
    pick(row, aHeader, 'by_phone') || idToPhone.get(byId) || '',
  ];
});

// Holidays: drop hebrew_date, keep everything else including include.
const holRaw = await store.read(TABS.holidays);
const holHeader = holRaw[0] ?? [];
const holidays = holRaw.slice(1).map((row) => [
  pick(row, holHeader, 'holiday_key'),
  pick(row, holHeader, 'name_he'),
  pick(row, holHeader, 'type'),
  pick(row, holHeader, 'date'),
  pick(row, holHeader, 'year'),
  pick(row, holHeader, 'include') || 'TRUE',
]);

console.log(`people:     ${people.length}`);
for (const p of people) console.log('  ', p.join(' | '));
console.log(`households: ${households.length}`);
for (const h of households) console.log('  ', h.join(' | '));
console.log(`answers:    ${answers.length}`);
for (const a of answers) console.log('  ', a.join(' | '));
console.log(`holidays:   ${holidays.length} (first: ${holidays[0]?.join(' | ')})`);

if (dry) {
  console.log('\n--dry: nothing written');
} else {
  await store.replace(TABS.people, [[...HEADERS.people], ...people]);
  await store.replace(TABS.households, [[...HEADERS.households], ...households]);
  await store.replace(TABS.answers, [[...HEADERS.answers], ...answers]);
  await store.replace(TABS.holidays, [[...HEADERS.holidays], ...holidays]);
  await store.replace(TABS.conflicts, [[...HEADERS.conflicts]]);
  console.log('\nwritten');
}
