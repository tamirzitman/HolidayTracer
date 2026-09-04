/**
 * Fills the Holidays tab.
 *
 *   npm run seed:holidays -- --years 10
 *   npm run seed:holidays -- --back 5     # also fill in past years, so history has something to fill
 *   npm run seed:holidays -- --kinds erev_pesach,purim
 *   npm run seed:holidays -- --list-kinds     # what's available to ask for
 *   npm run seed:holidays -- --dry            # print, don't write
 *
 * Only the holidays your family actually gathers for go in, so the tab stays
 * short enough to read. Re-running is safe: existing rows keep their include
 * value, and rows you added by hand are left alone.
 */
import { readFileSync } from 'node:fs';
import { HebrewCalendar, flags, type Event } from '@hebcal/core';

loadEnv();
const { sheetStore } = await import('../src/lib/sheet.ts');
const { HEADERS, TABS } = await import('../src/lib/types.ts');
const { emojiForKind } = await import('../src/lib/holiday-emoji.ts');

/**
 * Where hebcal's own wording is not what gets said at the table.
 *
 * Rosh Hashana is three meals on three consecutive days — the eve, the day
 * after it, and the eve of the second day after that — and naming them as
 * hebcal does ("ראש השנה ב׳" for the third) hides the shape. Applied to rows
 * already in the tab as well as to new ones, so a re-run brings every year into
 * line rather than only the years still to come.
 */
const NAMES: Record<string, { name: string; type?: string }> = {
  rosh_hashana: { name: 'יום ראש השנה' },
  rosh_hashana_ii: { name: 'ערב ראש השנה ב׳', type: 'ערב חג' },
};

/** The kinds this family gathers for. Override with --kinds. */
const DEFAULT_KINDS = [
  'erev_rosh_hashana',
  'rosh_hashana',
  'rosh_hashana_ii',
  'erev_sukkot',
  'erev_pesach',
  'erev_shavuot',
  'yom_haatzma_ut',
  'chanukah_1_candle',
];

/** Minor and modern days a family might still gather for; everything else is filtered out. */
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
      // `key in process.env` — not truthiness: an explicitly empty value is a choice.
      if (!(key in process.env)) process.env[key] = rawValue.trim().replace(/^["']|["']$/g, '');
    }
  }
}

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : (process.argv[i + 1] ?? fallback);
}

/** Hebcal appends a year to some names ("Rosh Hashana 5787"); the tab has its own column. */
const stripYear = (name: string): string => name.replace(/\s+\d{4}$/, '').trim();

const slug = (desc: string): string =>
  stripYear(desc)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

function classify(ev: Event): string | null {
  const f = ev.getFlags();
  if (f & flags.CHOL_HAMOED || f & flags.ROSH_CHODESH) return null;
  if (f & flags.CHAG) return 'חג';
  if (f & flags.EREV && !(f & flags.CHANUKAH_CANDLES)) return 'ערב חג';
  if (EXTRA_OCCASIONS.has(ev.getDesc())) return 'מועד';
  return null;
}

const years = Number(arg('years', '10'));
// Past years are worth seeding: without them the history screen has nothing to
// show and no gap to fill in.
const back = Number(arg('back', '0'));
const now = new Date();
const start = new Date(now.getFullYear() - back, now.getMonth(), now.getDate());
const end = new Date(now.getFullYear() + years, now.getMonth(), now.getDate());

const all = HebrewCalendar.calendar({ start, end, il: true, sedrot: false, candlelighting: false })
  .map((ev) => {
    const type = classify(ev);
    if (!type) return null;
    const date = ev.getDate().greg();
    const year = String(date.getFullYear());
    const kind = slug(ev.getDesc());
    const named = NAMES[kind];
    return {
      kind,
      row: [
        `${kind}_${year}`,
        named?.name ?? stripYear(ev.render('he-x-NoNikud')),
        named?.type ?? type,
        date.toISOString().slice(0, 10),
        year,
        'TRUE',
        '',
        '',
        // Written into the row rather than left to the code, so the column
        // arrives filled in and editing a mark is editing a cell.
        emojiForKind(kind),
      ],
    };
  })
  .filter((x): x is { kind: string; row: string[] } => x !== null);

if (process.argv.includes('--list-kinds')) {
  const kinds = new Map<string, string>();
  for (const { kind, row } of all) if (!kinds.has(kind)) kinds.set(kind, row[1]);
  for (const [kind, name] of [...kinds].sort()) console.log(`${kind.padEnd(26)} ${name}`);
  process.exit(0);
}

const wanted = new Set(arg('kinds', DEFAULT_KINDS.join(',')).split(',').filter(Boolean));
const candidates = all.filter((x) => wanted.has(x.kind)).map((x) => x.row);

const unknown = [...wanted].filter((k) => !all.some((x) => x.kind === k));
if (unknown.length > 0) {
  console.error(`Unknown holiday kind(s): ${unknown.join(', ')}`);
  console.error('Run with --list-kinds to see what is available.');
  process.exit(1);
}

const existing = await sheetStore().read(TABS.holidays);
const existingBody = existing.length > 1 ? existing.slice(1) : [];

// Columns by header name: this tab is edited by hand, and the schema has grown.
const header = existing[0] ?? [];
const at = (name: string) => header.indexOf(name);
const [KEY, NAME, TYPE, EMOJI] = ['holiday_key', 'name_he', 'type', 'emoji'].map(at);
const kindOf = (key: string) => key.replace(/_\d{4}$/, '');
const put = (row: string[], i: number, value: string) => {
  if (i === -1) return false;
  while (row.length <= i) row.push('');
  if (row[i] === value) return false;
  row[i] = value;
  return true;
};

// Rows written before the emoji column existed have an empty cell there. Fill
// in what the kind suggests, so the column reads as something to edit rather
// than something to work out. A mark already typed is never overwritten.
let filled = 0;
if (EMOJI !== -1) {
  for (const row of existingBody) {
    while (row.length <= EMOJI) row.push('');
    if (row[EMOJI].trim()) continue;
    row[EMOJI] = emojiForKind(row[KEY === -1 ? 0 : KEY] ?? '');
    filled += 1;
  }
}

// The renames go across the board — every year already in the tab, not only the
// ones still to come. The key never changes, so answers already given to these
// holidays stay attached to them.
let renamed = 0;
for (const row of existingBody) {
  const named = NAMES[kindOf(row[KEY === -1 ? 0 : KEY] ?? '')];
  if (!named) continue;
  let touched = put(row, NAME, named.name);
  if (named.type) touched = put(row, TYPE, named.type) || touched;
  if (touched) renamed += 1;
}

const known = new Set(existingBody.map((row) => row[0]));
const added = candidates.filter((row) => !known.has(row[0]));
const rows = [...existingBody, ...added].sort((a, b) => (a[3] ?? '').localeCompare(b[3] ?? ''));

console.log(`${wanted.size} kind(s) over ${years} years ahead and ${back} back → ${candidates.length} rows`);
console.log(`${existingBody.length} already in the tab, ${added.length} new`);
if (filled > 0) console.log(`${filled} row(s) given the mark their kind suggests`);
if (renamed > 0) console.log(`${renamed} row(s) renamed to what this family calls them`);

if (process.argv.includes('--dry')) {
  for (const row of added.slice(0, 15)) console.log(row.join('\t'));
  if (added.length > 15) console.log(`… and ${added.length - 15} more`);
  console.log('\n--dry: nothing written');
} else {
  await sheetStore().replace(TABS.holidays, [[...HEADERS.holidays], ...rows]);
  console.log(`wrote ${rows.length} rows to ${TABS.holidays}`);
}
