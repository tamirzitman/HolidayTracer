/**
 * One-off migration: denormalised tabs → ids only, Hebrew years → Gregorian.
 *
 *   npm run migrate -- --dry
 *   npm run migrate
 *
 * Old Answers rows carried names and phone numbers copied out of other tabs, and
 * keyed holidays by Hebrew year. This rewrites them to reference ids, remapping
 * each holiday key by its kind and the year it actually falls in.
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
const col = (header: string[], name: string) => header.indexOf(name);

// ── People: give everyone an id ───────────────────────────────────────────────
const peopleRaw = await store.read(TABS.people);
const pHeader = peopleRaw[0] ?? [];
const phoneToPerson = new Map<string, string>();
const people = (peopleRaw.slice(1) ?? []).map((row, i) => {
  const id = `p_${i + 1}`;
  const phone = row[col(pHeader, 'phone')] ?? '';
  phoneToPerson.set(phone, id);
  return [id, phone, row[col(pHeader, 'name')] ?? '', row[col(pHeader, 'household_id')] ?? ''];
});

// ── Households: drop the copied phone, point at a contact person ──────────────
const hhRaw = await store.read(TABS.households);
const hHeader = hhRaw[0] ?? [];
const households = (hhRaw.slice(1) ?? []).map((row) => {
  const id = row[col(hHeader, 'household_id')] ?? '';
  const firstMember = people.find((p) => p[3] === id);
  return [id, row[col(hHeader, 'name')] ?? '', firstMember?.[0] ?? '', row[col(hHeader, 'active')] ?? 'TRUE'];
});

// ── Holidays: remember old key → date, then start the tab fresh ───────────────
const holRaw = await store.read(TABS.holidays);
const holHeader = holRaw[0] ?? [];
const oldHolidayDate = new Map<string, string>();
for (const row of holRaw.slice(1)) {
  oldHolidayDate.set(row[col(holHeader, 'holiday_key')] ?? '', row[col(holHeader, 'date')] ?? '');
}

const kindOf = (key: string) => key.replace(/_\d{4}$/, '');
const remapKey = (oldKey: string): string | undefined => {
  const date = oldHolidayDate.get(oldKey);
  return date ? `${kindOf(oldKey)}_${date.slice(0, 4)}` : undefined;
};

// ── Answers: ids only, Gregorian year ─────────────────────────────────────────
const ansRaw = await store.read(TABS.answers);
const aHeader = ansRaw[0] ?? [];
const dropped: string[] = [];
const answers = ansRaw.slice(1).flatMap((row) => {
  const oldKey = row[col(aHeader, 'holiday_key')] ?? '';
  const newKey = remapKey(oldKey);
  if (!newKey) {
    dropped.push(oldKey);
    return [];
  }
  const date = oldHolidayDate.get(oldKey) ?? '';
  return [[
    row[col(aHeader, 'timestamp')] ?? '',
    date.slice(0, 4),
    newKey,
    row[col(aHeader, 'household_id')] ?? '',
    row[col(aHeader, 'kind')] ?? '',
    row[col(aHeader, 'host_household_id')] ?? '',
    phoneToPerson.get(row[col(aHeader, 'by_phone')] ?? '') ?? '',
  ]];
});

console.log(`people:     ${people.length}`);
for (const p of people) console.log('  ', p.join(' | '));
console.log(`households: ${households.length}`);
for (const h of households) console.log('  ', h.join(' | '));
console.log(`answers:    ${answers.length}${dropped.length ? ` (${dropped.length} unmappable: ${dropped.join(', ')})` : ''}`);
for (const a of answers) console.log('  ', a.join(' | '));

if (dry) {
  console.log('\n--dry: nothing written');
} else {
  await store.replace(TABS.people, [[...HEADERS.people], ...people]);
  await store.replace(TABS.households, [[...HEADERS.households], ...households]);
  await store.replace(TABS.answers, [[...HEADERS.answers], ...answers]);
  await store.replace(TABS.conflicts, [[...HEADERS.conflicts]]);
  await store.replace(TABS.holidays, [[...HEADERS.holidays]]);
  console.log('\nwritten. Holidays is now empty — run: npm run seed:holidays');
}
