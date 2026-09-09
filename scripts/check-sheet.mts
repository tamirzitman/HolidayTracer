/**
 * Reads a sheet and says whether it still matches what the code assumes of it.
 *
 * Nothing here writes. The app reads this spreadsheet by header name and treats
 * every tab as append-only, which means a person editing it by hand can leave it
 * in a shape the code cannot see is wrong: a column renamed, a row deleted
 * rather than switched off, a number typed without its +. Each of those reads as
 * "empty" or "gone" somewhere far from where the mistake was made.
 *
 *   npm run check-sheet                  # the sheet in SHEET_ID
 *   npm run check-sheet -- --to <id>     # somewhere else
 *
 * The one that has actually bitten: a household row deleted outright. The id it
 * held goes back into circulation, and the next family created inherits every
 * invitation, connection and answer still naming it. Switching a household off
 * keeps the row, and `addHousehold` counts those — so this looks for ids that
 * are named somewhere and have no row at all.
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

const at = process.argv.indexOf('--to');
if (at !== -1 && process.argv[at + 1]) process.env.SHEET_ID = process.argv[at + 1];

const store = sheetStore();
const tabs = ['Households', 'People', 'Answers', 'Connections', 'Invites', 'Circles', 'Holidays'];
const raw: Record<string, string[][]> = Object.fromEntries(
  await Promise.all(tabs.map(async (t) => [t, await store.read(t)] as const)),
);

const head = (tab: string) => (raw[tab][0] ?? []).map((h) => String(h).trim().toLowerCase());
const body = (tab: string) => raw[tab].slice(1);
const at_ = (tab: string, name: string) => head(tab).indexOf(name);
const cell = (row: string[], tab: string, name: string) => {
  const i = at_(tab, name);
  return i === -1 ? '' : String(row[i] ?? '').trim();
};

const wrong: string[] = [];
const say = (s: string) => wrong.push(s);

// ── every column the code writes is on the tab ───────────────────────────────
for (const key of Object.keys(TABS) as (keyof typeof TABS)[]) {
  const tab = TABS[key];
  const have = raw[tab] ? head(tab) : (await store.read(tab))[0]?.map((h) => String(h).trim().toLowerCase()) ?? [];
  const missing = HEADERS[key].filter((h) => !have.includes(h));
  if (missing.length) say(`${tab}: no column named ${missing.join(', ')} — npm run align adds it`);
}

// ── households: which ids exist, and which are merely switched off ───────────
const households = new Map<string, { name: string; active: boolean }>();
for (const r of body('Households')) {
  const id = cell(r, 'Households', 'household_id');
  const name = cell(r, 'Households', 'name');
  if (!id || !name) continue;
  // Append-only: the newest row for an id is the one that counts.
  households.set(id, { name, active: ['true', '1', 'yes', 'כן'].includes(cell(r, 'Households', 'active').toLowerCase()) });
}
const live = new Map([...households].filter(([, h]) => h.active));

// ── every id named anywhere has a row, live or retired ──────────────────────
const named = new Map<string, string[]>();
const name_ = (id: string, where: string) => {
  if (id) named.set(id, [...(named.get(id) ?? []), where]);
};
for (const r of body('Connections')) {
  name_(cell(r, 'Connections', 'household_id'), 'Connections');
  name_(cell(r, 'Connections', 'connected_to'), 'Connections');
}
for (const r of body('Invites')) {
  name_(cell(r, 'Invites', 'created_by'), 'Invites.created_by');
  name_(cell(r, 'Invites', 'for_household_id'), 'Invites.for_household_id');
}
for (const r of body('Answers')) {
  name_(cell(r, 'Answers', 'host_household_id'), 'Answers.host');
  name_(cell(r, 'Answers', 'for_household_id'), 'Answers.for');
}
for (const r of body('People')) name_(cell(r, 'People', 'household_id'), 'People');
for (const r of body('Circles')) name_(cell(r, 'Circles', 'household_id'), 'Circles');

for (const [id, where] of named) {
  if (households.has(id)) continue;
  say(
    `id "${id}" is named by ${where.length} row(s) (${[...new Set(where)].join(', ')}) and has no row on Households — ` +
      'add one with active=FALSE rather than leaving the id free',
  );
}

// ── the next id must belong to nobody ───────────────────────────────────────
const numeric = [...households.keys()].map(Number).filter(Number.isInteger);
const next = String(Math.max(0, ...numeric) + 1);
if (named.has(next)) {
  say(`the next id "${next}" is already named by ${named.get(next)!.length} row(s) — the next family created would inherit them`);
}

// ── an 'add' connection points both ways ────────────────────────────────────
const link = new Map<string, string>();
for (const r of body('Connections')) {
  link.set(`${cell(r, 'Connections', 'household_id')}>${cell(r, 'Connections', 'connected_to')}`, cell(r, 'Connections', 'action'));
}
for (const [pair, action] of link) {
  if (action !== 'add') continue;
  const [a, b] = pair.split('>');
  if (link.get(`${b}>${a}`) !== 'add') {
    say(`${live.get(a)?.name ?? a} has ${live.get(b)?.name ?? b} on their list, but not the other way round`);
  }
}

// ── numbers in the shape the code writes ────────────────────────────────────
for (const r of body('People')) {
  const phone = cell(r, 'People', 'phone');
  if (!/^\+972\d{9}$/.test(phone)) {
    say(`phone "${phone}" is not the shape the app writes (+972…) — a leading + typed by hand is eaten as a formula unless it is '+972…`);
  }
}

// ── answers said by somebody the sheet knows, about a holiday it has ────────
const phones = new Set(body('People').map((r) => cell(r, 'People', 'phone')));
const keys = new Set(body('Holidays').map((r) => cell(r, 'Holidays', 'holiday_key')));
for (const r of body('Answers')) {
  const by = cell(r, 'Answers', 'by_phone');
  if (by && !phones.has(by)) say(`an answer is signed ${by}, who is not on People`);
  const key = cell(r, 'Answers', 'holiday_key');
  if (key && !keys.has(key)) say(`an answer names holiday "${key}", which is not on Holidays`);
}

// ── kinds the code knows ────────────────────────────────────────────────────
for (const r of body('Invites')) {
  const kind = cell(r, 'Invites', 'kind');
  if (kind && !['family', 'household', 'circle'].includes(kind)) say(`invite kind "${kind}" is not one the code knows`);
}

console.log(`checking ${process.env.SHEET_ID?.slice(0, 12)}…\n`);
for (const tab of tabs) console.log(`  ${tab.padEnd(12)} ${String(body(tab).length).padStart(4)} rows`);
console.log(`\n  households ${live.size} live, ${households.size - live.size} retired · next id ${next}`);
console.log(`  people ${body('People').length} signed in · circles ${body('Circles').length} rows\n`);

if (wrong.length === 0) {
  console.log('✓ the sheet matches what the code expects of it');
} else {
  console.log(`✗ ${wrong.length} thing(s) to look at:`);
  for (const w of wrong) console.log(`  • ${w}`);
  process.exitCode = 1;
}
