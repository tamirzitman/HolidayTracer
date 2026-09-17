/**
 * Two rows that are one family, made one.
 *
 * The app can do this itself, from a family's row on "המעגלים שלי" — but only
 * for a household nobody has signed into, because where a signed-in person
 * lives is theirs to say. This is for everything else: two rows that both have
 * people in them, a household nobody on the list can see any more, a tidy-up
 * done from the outside.
 *
 * It plans the merge with the very code the app uses (`planMerge`), so what it
 * prints is what the app would write, and it prints before it writes anything:
 *
 *   npm run merge-households -- --into 38 15          # what it would do
 *   npm run merge-households -- --into 38 15 --apply
 *   npm run merge-households -- --into 9 20 21 --apply
 *   npm run merge-households -- --into 38 15 --to <sheet_id>
 *
 * The id after --into is the household that stays. Every other id is folded
 * into it and switched off. Nothing is deleted and no id is ever reused.
 */
import { readFileSync, writeFileSync } from 'node:fs';

loadEnv();

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

const argv = process.argv.slice(2);
const to = argv.indexOf('--to');
if (to !== -1 && argv[to + 1]) process.env.SHEET_ID = argv[to + 1];
const apply = argv.includes('--apply');

const intoAt = argv.indexOf('--into');
const intoId = intoAt === -1 ? '' : argv[intoAt + 1];
// Everything that is not a flag and not a flag's value. Written this way so
// that argument order never decides who survives — only --into does.
const values = new Set([intoAt === -1 ? -1 : intoAt + 1, to === -1 ? -1 : to + 1]);
const fromIds = argv.filter((a, i) => !a.startsWith('--') && !values.has(i));

if (!intoId || fromIds.length === 0) {
  console.error('usage: npm run merge-households -- --into <household_id> <household_id>… [--apply]');
  process.exit(1);
}

const { sheetStore } = await import('../src/lib/sheet.ts');
const { TABS, HEADERS } = await import('../src/lib/types.ts');
const d = await import('../src/lib/data.ts');

const store = sheetStore();
const sheet = await d.loadSheet();
const nameOf = (id: string) => sheet.households.find((h) => h.id === id)?.name ?? `«${id}»`;

const into = sheet.households.find((h) => h.id === intoId);
if (!into) {
  console.error(`No active household ${intoId}. A retired one cannot take anybody in.`);
  process.exit(1);
}
const missing = fromIds.filter((id) => !sheet.households.some((h) => h.id === id));
if (missing.length > 0) {
  console.error(`No active household ${missing.join(', ')} — nothing to fold in.`);
  process.exit(1);
}

const plan = d.planMerge(sheet, intoId, fromIds, new Date().toISOString());
const { effect } = plan;

const joined = new Set(sheet.people.map((p) => p.householdId));
console.log(`sheet ${process.env.SHEET_ID?.slice(0, 12)}…\n`);
console.log(`keeping   ${into.name}  (${intoId})`);
for (const id of fromIds) {
  console.log(`folding   ${nameOf(id)}  (${id})${joined.has(id) ? '  — somebody has signed in as them' : ''}`);
}

console.log('\nwhat moves:');
console.log(`  people        ${effect.people}`);
console.log(`  connections   ${effect.connections}`);
console.log(`  circles       ${effect.circles}`);
console.log(`  answers       ${effect.answers}`);
console.log(`  invites       ${effect.invites}`);
console.log(`  occasions     ${effect.occasions}`);
if (effect.kept > 0) {
  console.log(`  left alone    ${effect.kept}  (the surviving household's own later word stands)`);
}

const tabs: [string, readonly string[], string[][]][] = [
  [TABS.people, HEADERS.people, plan.people],
  [TABS.connections, HEADERS.connections, plan.connections],
  [TABS.circles, HEADERS.circles, plan.circles],
  [TABS.answers, HEADERS.answers, plan.answers],
  [TABS.invites, HEADERS.invites, plan.invites],
  [TABS.holidays, HEADERS.holidays, plan.holidays],
  [TABS.households, HEADERS.households, plan.households],
];

console.log('\nrows it would append:');
for (const [tab, , rows] of tabs) {
  if (rows.length === 0) continue;
  console.log(`\n  === ${tab} (${rows.length}) ===`);
  for (const row of rows) console.log(`    ${row.join(' | ')}`);
}
if (tabs.every(([, , rows]) => rows.length === 0)) {
  console.log('  nothing — these households are already one, or there is nothing to move.');
  process.exit(0);
}

if (!apply) {
  console.log('\nDry run. Add --apply to append the rows above.');
  process.exit(0);
}

// Every tab this touches, as it stands, before it is touched. Rows are only
// ever appended, so this is enough to put any of them back by hand.
const stamp = Date.now();
for (const [tab, , rows] of tabs) {
  if (rows.length === 0) continue;
  const file = `.${tab.toLowerCase()}-before-merge-${stamp}.json`;
  writeFileSync(file, `${JSON.stringify(await store.read(tab), null, 2)}\n`, 'utf8');
  console.log(`\n✓ ${tab} as it was is in ${file}`);
}

await d.mergeHouseholds(intoId, fromIds);
console.log(`\n✓ ${fromIds.length} household(s) folded into ${into.name}, and switched off.`);
console.log('  Run npm run check-sheet to see that nothing is left pointing at them.');
