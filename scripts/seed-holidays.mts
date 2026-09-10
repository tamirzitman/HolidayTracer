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
      name: named?.name ?? stripYear(ev.render('he-x-NoNikud')),
      type: named?.type ?? type,
      year,
      date: date.toISOString().slice(0, 10),
    };
  })
  .filter((x): x is { kind: string; row: string[] } => x !== null);

if (process.argv.includes('--list-kinds')) {
  const kinds = new Map<string, string>();
  for (const { kind, name } of all) if (!kinds.has(kind)) kinds.set(kind, name);
  for (const [kind, name] of [...kinds].sort()) console.log(`${kind.padEnd(26)} ${name}`);
  process.exit(0);
}

const wanted = new Set(arg('kinds', DEFAULT_KINDS.join(',')).split(',').filter(Boolean));
const candidates = all.filter((x) => wanted.has(x.kind));

const unknown = [...wanted].filter((k) => !all.some((x) => x.kind === k));
if (unknown.length > 0) {
  console.error(`Unknown holiday kind(s): ${unknown.join(', ')}`);
  console.error('Run with --list-kinds to see what is available.');
  process.exit(1);
}

// Two tabs now, and the difference between them is the point: the catalogue
// says what a holiday is, once, and the Dates tab says when it falls, once per
// year. A rename or a new mark is one row either way — it used to be one row
// per year, and putting a name right meant editing fifteen of them.
const store = sheetStore();
const catalogue = await store.read(TABS.holidays);
const dates = await store.read(TABS.dates);

const at = (header: string[], name: string) => header.indexOf(name);
const catHeader = catalogue[0] ?? [];
const catBody = catalogue.length > 1 ? catalogue.slice(1) : [];
const ID = at(catHeader, 'holiday_id');
const NAME = at(catHeader, 'name_he');
const TYPE = at(catHeader, 'type');
const EMOJI = at(catHeader, 'emoji');

const put = (row: string[], i: number, value: string) => {
  if (i === -1) return false;
  while (row.length <= i) row.push('');
  if (row[i] === value) return false;
  row[i] = value;
  return true;
};

// What each kind is called and what it looks like, applied to the entry that
// stands for every year of it.
let renamed = 0;
let filled = 0;
for (const row of catBody) {
  const kind = row[ID === -1 ? 0 : ID] ?? '';
  const named = NAMES[kind];
  if (EMOJI !== -1 && !(row[EMOJI] ?? '').trim()) {
    put(row, EMOJI, emojiForKind(kind));
    filled += 1;
  }
  if (!named) continue;
  let touched = put(row, NAME, named.name);
  if (named.type) touched = put(row, TYPE, named.type) || touched;
  if (touched) renamed += 1;
}

const known = new Set(catBody.map((row) => row[ID === -1 ? 0 : ID]));
const newEntries: string[][] = [];
for (const { kind, name, type } of candidates) {
  if (known.has(kind) || newEntries.some((r) => r[0] === kind)) continue;
  newEntries.push([kind, NAMES[kind]?.name ?? name, NAMES[kind]?.type ?? type, emojiForKind(kind), 'TRUE', '', '']);
}

const dateHeader = dates[0] ?? [];
const dateBody = dates.length > 1 ? dates.slice(1) : [];
const D_ID = at(dateHeader, 'holiday_id');
const D_YEAR = at(dateHeader, 'year');
const haveDate = new Set(
  dateBody.map((r) => `${r[D_ID === -1 ? 0 : D_ID]}\u0000${r[D_YEAR === -1 ? 1 : D_YEAR]}`),
);
const newDates = candidates
  .filter((c) => !haveDate.has(`${c.kind}\u0000${c.year}`))
  .map((c) => [c.kind, c.year, c.date]);

console.log(`${wanted.size} kind(s) over ${years} years ahead and ${back} back`);
console.log(`catalogue: ${catBody.length} entries, ${newEntries.length} new`);
console.log(`dates:     ${dateBody.length} rows, ${newDates.length} new`);
if (filled > 0) console.log(`${filled} entr(ies) given the mark their kind suggests`);
if (renamed > 0) console.log(`${renamed} entr(ies) renamed to what this family calls them`);

if (process.argv.includes('--dry')) {
  for (const row of [...newEntries, ...newDates].slice(0, 15)) console.log(row.join('\t'));
  console.log('\n--dry: nothing written');
} else {
  await store.replace(TABS.holidays, [[...HEADERS.holidays], ...catBody, ...newEntries]);
  await store.replace(TABS.dates, [
    [...HEADERS.dates],
    ...[...dateBody, ...newDates].sort((a, b) => (a[2] ?? '').localeCompare(b[2] ?? '')),
  ]);
  console.log(`wrote ${catBody.length + newEntries.length} entries and ${dateBody.length + newDates.length} dates`);
}
