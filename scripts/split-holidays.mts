/**
 * Takes a Holidays tab apart into the two it should have been.
 *
 * It used to be one row per holiday per year, with the name, the kind and the
 * mark copied into every one: 8 holidays over 15 years is 108 rows, and
 * correcting a name meant editing 15 of them by hand and hoping they still
 * agreed. Afterwards:
 *
 *   Holidays   holiday_id | name_he | type | emoji | include | owner | shared_with
 *   Dates      holiday_id | year | date
 *
 * The id is the old key with its year taken off, so the key every answer was
 * written against — `<id>_<year>` — comes back out of the join unchanged, and
 * nothing on the Answers tab has to be touched.
 *
 *   npm run split-holidays                  # what it would write
 *   npm run split-holidays -- --apply
 *   npm run split-holidays -- --to <id>     # a sheet other than SHEET_ID
 *
 * Safe to run twice: a tab already split is left alone. The old contents are
 * written to a file first either way.
 */
import { readFileSync, writeFileSync } from 'node:fs';

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

const to = process.argv.indexOf('--to');
if (to !== -1 && process.argv[to + 1]) process.env.SHEET_ID = process.argv[to + 1];
const apply = process.argv.includes('--apply');

const store = sheetStore();
const rows = await store.read(TABS.holidays);
const header = (rows[0] ?? []).map((h) => String(h).trim().toLowerCase());
const body = rows.slice(1);

if (header.includes('holiday_id') && !header.includes('holiday_key')) {
  console.log('Already split — the Holidays tab is a catalogue. Nothing to do.');
  process.exit(0);
}
if (!header.includes('holiday_key')) {
  console.error('This does not look like a Holidays tab: no holiday_key column.');
  process.exit(1);
}

const at = (name: string) => header.indexOf(name);
const cell = (row: string[], name: string) => {
  const i = at(name);
  return i === -1 ? '' : String(row[i] ?? '').trim();
};

/** The key with its year taken off. Every seeded key ends in one. */
const idOf = (key: string) => key.replace(/_\d{4}$/, '');

// Newest row per key wins, exactly as the app reads it — so a holiday switched
// off, renamed or reshared by a later row is carried over as it stands now and
// not as it was first written.
const latest = new Map<string, string[]>();
for (const row of body) {
  const key = cell(row, 'holiday_key');
  if (key) latest.set(key, row);
}

const catalogue = new Map<string, string[]>();
const dates: string[][] = [];
const disagreed: string[] = [];

for (const [key, row] of latest) {
  const id = idOf(key);
  const entry = [
    id,
    cell(row, 'name_he'),
    cell(row, 'type'),
    cell(row, 'emoji'),
    cell(row, 'include') || 'TRUE',
    cell(row, 'owner_household_id'),
    cell(row, 'shared_with'),
  ];
  const already = catalogue.get(id);
  if (already) {
    // The years disagreed about something that is meant to be true of all of
    // them. Say so rather than picking one quietly.
    for (const [i, field] of ['name', 'type', 'emoji', 'include'].entries()) {
      if (already[i + 1] !== entry[i + 1]) {
        disagreed.push(`${id}: ${field} is "${already[i + 1]}" in one year and "${entry[i + 1]}" in another`);
      }
    }
  } else {
    catalogue.set(id, entry);
  }
  const date = cell(row, 'date');
  if (date) dates.push([id, cell(row, 'year') || date.slice(0, 4), date]);
}

dates.sort((a, b) => a[2].localeCompare(b[2]));

console.log(`${body.length} rows → ${catalogue.size} holidays and ${dates.length} dates\n`);
for (const entry of catalogue.values()) {
  const years = dates.filter((d) => d[0] === entry[0]).length;
  console.log(`  ${entry[0].padEnd(26)} ${entry[1].padEnd(18)} ${entry[3] || '·'}  ${years} year(s)`);
}
if (disagreed.length > 0) {
  console.log(`\n! ${disagreed.length} disagreement(s) between years — the first year seen wins:`);
  for (const d of disagreed) console.log(`  ${d}`);
}

if (!apply) {
  console.log('\nDry run. Add --apply to write the two tabs.');
  process.exit(0);
}

const backup = `.holidays-before-split-${Date.now()}.json`;
writeFileSync(backup, `${JSON.stringify(rows, null, 2)}\n`, 'utf8');
console.log(`\n✓ the tab as it was is in ${backup}`);

await store.replace(TABS.holidays, [[...HEADERS.holidays], ...catalogue.values()]);
await store.replace(TABS.dates, [[...HEADERS.dates], ...dates]);
console.log(`✓ Holidays: ${catalogue.size} rows`);
console.log(`✓ Dates:    ${dates.length} rows`);
