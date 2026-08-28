/**
 * Fills the Holidays tab with candidate dates, once.
 *
 * Every row lands with include = FALSE. You then flip TRUE on the dates that
 * actually matter for a family meal — that decision lives in the spreadsheet,
 * not in the app, which is why this runs here and not at runtime.
 *
 *   npm run seed:holidays -- --years 10
 *   npm run seed:holidays -- --dry      # print, don't write
 *
 * Re-running is safe: existing rows keep their include value, and rows you
 * added by hand are left alone.
 */
import { readFileSync } from 'node:fs';
import { HebrewCalendar, flags, type Event } from '@hebcal/core';

loadEnv();
const { sheetStore } = await import('../src/lib/sheet.ts');

const HEADERS = ['holiday_key', 'name_he', 'type', 'date', 'hebrew_date', 'hebrew_year', 'include'];
const TAB = 'Holidays';

/** Minor and modern days a family might still gather for. Everything else is filtered out. */
const EXTRA_OCCASIONS = new Set([
  'Purim',
  'Chanukah: 1 Candle',
  "Yom HaAtzma'ut",
  'Lag BaOmer',
  'Tu BiShvat',
]);

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
      if (process.env[key]) continue;
      process.env[key] = rawValue.trim().replace(/^["']|["']$/g, '');
    }
  }
}

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : (process.argv[i + 1] ?? fallback);
}

/** Hebcal appends the year to some names ("Rosh Hashana 5787"); the tab has its own column. */
function stripYear(name: string): string {
  return name.replace(/\s+\d{4}$/, '').trim();
}

function slug(desc: string): string {
  return stripYear(desc)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function classify(ev: Event): string | null {
  const f = ev.getFlags();
  if (f & flags.CHOL_HAMOED || f & flags.ROSH_CHODESH) return null;
  if (f & flags.CHAG) return 'חג';
  if (f & flags.EREV && !(f & flags.CHANUKAH_CANDLES)) return 'ערב חג';
  if (EXTRA_OCCASIONS.has(ev.getDesc())) return 'מועד';
  return null;
}

const years = Number(arg('years', '10'));
const dryRun = process.argv.includes('--dry');
const start = new Date();
const end = new Date(start.getFullYear() + years, start.getMonth(), start.getDate());

const candidates = HebrewCalendar.calendar({
  start,
  end,
  il: true,
  sedrot: false,
  candlelighting: false,
})
  .map((ev) => {
    const type = classify(ev);
    if (!type) return null;
    const date = ev.getDate();
    const hebrewYear = String(date.getFullYear());
    return [
      `${slug(ev.getDesc())}_${hebrewYear}`,
      stripYear(ev.render('he-x-NoNikud')),
      type,
      date.greg().toISOString().slice(0, 10),
      date.renderGematriya(true),
      hebrewYear,
      'FALSE',
    ];
  })
  .filter((row): row is string[] => row !== null);

// Keep whatever is already in the tab — including include flags somebody has
// already set, and rows added by hand — then add only what's genuinely new.
const existing = await sheetStore().read(TAB);
const existingBody = existing.length > 1 ? existing.slice(1) : [];
const known = new Set(existingBody.map((row) => row[0]));

const added = candidates.filter((row) => !known.has(row[0]));
const rows = [...existingBody, ...added].sort((a, b) => (a[3] ?? '').localeCompare(b[3] ?? ''));

console.log(`${candidates.length} candidates over ${years} years`);
console.log(`${existingBody.length} rows already in the tab, ${added.length} new`);

if (dryRun) {
  for (const row of added.slice(0, 20)) console.log(row.join('\t'));
  if (added.length > 20) console.log(`… and ${added.length - 20} more`);
  console.log('\n--dry: nothing written');
} else {
  await sheetStore().replace(TAB, [HEADERS, ...rows]);
  console.log(`wrote ${rows.length} rows to ${TAB}`);
}
