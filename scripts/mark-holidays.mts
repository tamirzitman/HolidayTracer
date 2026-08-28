/**
 * Turns include on or off for whole kinds of holiday across every year at once,
 * so you don't tick two hundred checkboxes by hand.
 *
 *   npm run mark -- --on erev_pesach,erev_shavuot
 *   npm run mark -- --off purim
 *   npm run mark -- --list          # what's currently on
 *
 * Names are matched against holiday_key with its trailing year removed, so
 * "erev_pesach" covers erev_pesach_5787, erev_pesach_5788 and so on.
 */
import { readFileSync } from 'node:fs';

loadEnv();
const { sheetStore } = await import('../src/lib/sheet.ts');

const TAB = 'Holidays';
const KEY = 0;
const NAME = 1;
const DATE = 3;
const INCLUDE = 6;

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
      if (!process.env[key]) process.env[key] = rawValue.trim().replace(/^["']|["']$/g, '');
    }
  }
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

const base = (key: string) => key.replace(/_\d{4}$/, '');

const rows = await sheetStore().read(TAB);
if (rows.length < 2) {
  console.error('The Holidays tab is empty. Run: npm run seed:holidays');
  process.exit(1);
}
const [headers, ...body] = rows;

if (process.argv.includes('--list')) {
  const on = body.filter((r) => String(r[INCLUDE]).toUpperCase() === 'TRUE');
  const kinds = new Map<string, number>();
  for (const r of on) kinds.set(r[NAME], (kinds.get(r[NAME]) ?? 0) + 1);
  console.log(`${on.length} rows marked include=TRUE:`);
  for (const [name, count] of kinds) console.log(`  ${name} — ${count} year(s)`);
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
  const kind = base(row[KEY] ?? '');
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
  console.error(`No holiday rows match: ${unknown.join(', ')}`);
  console.error('Check the holiday_key column — names are the key without its year.');
  process.exit(1);
}

await sheetStore().replace(TAB, [headers, ...body]);

const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());
const marked = body.filter((r) => String(r[INCLUDE]).toUpperCase() === 'TRUE');
console.log(`${changed} row(s) changed`);
console.log(`${marked.length} marked include=TRUE, ${marked.filter((r) => r[DATE] >= today).length} still upcoming`);
