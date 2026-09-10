/**
 * Turns a holiday on or off.
 *
 *   npm run mark -- --on erev_pesach,erev_shavuot
 *   npm run mark -- --off purim
 *   npm run mark -- --list          # what's currently on
 *
 * One row each, now that the catalogue says what a holiday is once rather than
 * once per year — this used to walk every year of it and set the same cell
 * fifteen times.
 */
import { readFileSync } from 'node:fs';

loadEnv();
const { sheetStore } = await import('../src/lib/sheet.ts');

const TAB = 'Holidays';

function loadEnv(): void {
  for (const file of ['.env.local', '.env']) {
    let text: string;
    try {
      text = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    for (const line of text.split('\n')) {
      const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
      if (!match) continue;
      const [, key, rawValue] = match;
      // `key in process.env` — not truthiness: an explicitly empty value is a choice.
      if (!(key in process.env)) process.env[key] = rawValue.trim().replace(/^["']|["']$/g, '');
    }
  }
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

const rows = await sheetStore().read(TAB);
if (rows.length < 2) {
  console.error('The Holidays tab is empty. Run: npm run seed:holidays');
  process.exit(1);
}
const [headers, ...body] = rows;
// By header name, like everything else that reads this spreadsheet: a person
// edits it by hand, and a column moved must not silently mark the wrong cell.
const at = (name: string) => headers.map((h) => String(h).trim().toLowerCase()).indexOf(name);
const ID = at('holiday_id');
const NAME = at('name_he');
const INCLUDE = at('include');

if (process.argv.includes('--list')) {
  const on = body.filter((r) => String(r[INCLUDE]).toUpperCase() === 'TRUE');
  console.log(`${on.length} holiday(s) marked include=TRUE:`);
  for (const r of on) console.log(`  ${String(r[ID]).padEnd(24)} ${r[NAME]}`);
  process.exit(0);
}

const on = (arg('on') ?? '').split(',').filter(Boolean);
const off = (arg('off') ?? '').split(',').filter(Boolean);
if (on.length === 0 && off.length === 0) {
  console.error('Nothing to do. Pass --on, --off or --list.');
  process.exit(1);
}

let changed = 0;
const touched = new Set<string>();
for (const row of body) {
  const kind = String(row[ID] ?? '');
  const want = on.includes(kind) ? 'TRUE' : off.includes(kind) ? 'FALSE' : undefined;
  if (want === undefined) continue;
  touched.add(kind);
  if (row[INCLUDE] !== want) {
    row[INCLUDE] = want;
    changed += 1;
  }
}

const unknown = [...on, ...off].filter((k) => !touched.has(k));
if (unknown.length > 0) {
  console.error(`No holiday matches: ${unknown.join(', ')}`);
  console.error('Check the holiday_id column — one row per holiday, whatever the year.');
  process.exit(1);
}

await sheetStore().replace(TAB, [headers, ...body]);

const marked = body.filter((r) => String(r[INCLUDE]).toUpperCase() === 'TRUE');
console.log(`${changed} holiday(s) changed`);
console.log(`${marked.length} of ${body.length} marked include=TRUE`);
