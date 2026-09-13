/**
 * Undoes the connections left behind by families who have left a circle.
 *
 * Joining a circle connects a family to everyone in it. Leaving used to undo
 * none of that, so a family ticked by mistake and unticked seconds later stayed
 * on every other member's list for ever — and nothing on any screen said so.
 * The app does the cleanup itself now; this is for the rows written before it
 * did.
 *
 * It finds them precisely rather than by guesswork: a circle join writes its
 * circle row and its connection rows in the same instant, so the connections a
 * join created are the ones stamped with that join's timestamp. For each family
 * whose newest row in a circle is a removal, those are the pairs to look at.
 *
 * A pair is severed only when all three hold, the same rules the app now uses:
 *   - they are still connected,
 *   - they share no circle today,
 *   - they could not already see each other before that join.
 *
 *   npm run undo-left-circles                # what it would sever
 *   npm run undo-left-circles -- --apply
 *   npm run undo-left-circles -- --to <id>
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

const to = process.argv.indexOf('--to');
if (to !== -1 && process.argv[to + 1]) process.env.SHEET_ID = process.argv[to + 1];
const apply = process.argv.includes('--apply');

const { sheetStore } = await import('../src/lib/sheet.ts');
const { TABS, HEADERS } = await import('../src/lib/types.ts');
const d = await import('../src/lib/data.ts');

const store = sheetStore();
const sheet = await d.loadSheet();
const nameOf = (id: string) => sheet.households.find((h) => h.id === id)?.name ?? id;

// Newest row per circle+household, exactly as the app reads them.
const state = new Map<string, { circleId: string; householdId: string; action: string; name: string; at: string }>();
for (const row of sheet.circles) state.set(`${row.circleId} ${row.householdId}`, row);

/** Everyone in a circle right now. */
const membersOf = (circleId: string) =>
  [...state.values()].filter((r) => r.circleId === circleId && r.action === 'add').map((r) => r.householdId);

/** Whether a pair share any circle today. */
const shareACircle = (a: string, b: string) =>
  [...state.values()].some(
    (r) => r.householdId === a && r.action === 'add' && state.get(`${r.circleId} ${b}`)?.action === 'add',
  );

/** Connected, replayed up to a moment — newest row before it wins. */
const connectedBefore = (a: string, b: string, at: string) => {
  let linked = false;
  for (const c of sheet.connections) {
    if (c.at >= at) continue;
    if (c.householdId === a && c.connectedTo === b) linked = c.action === 'add';
  }
  return linked;
};

const now = new Map<string, string>();
for (const c of sheet.connections) now.set(`${c.householdId} ${c.connectedTo}`, c.action);
const connectedNow = (a: string, b: string) => now.get(`${a} ${b}`) === 'add';

const cut: { a: string; b: string; circle: string }[] = [];

for (const row of state.values()) {
  if (row.action !== 'remove') continue;
  // The join this removal undid: the newest add for the same pair before it.
  const joins = sheet.circles.filter(
    (r) => r.circleId === row.circleId && r.householdId === row.householdId && r.action === 'add' && r.at < row.at,
  );
  const join = joins.at(-1);
  if (!join) continue;

  // The connections that join wrote carry its timestamp exactly.
  const madeThen = sheet.connections.filter(
    (c) => c.at === join.at && c.action === 'add' && (c.householdId === row.householdId || c.connectedTo === row.householdId),
  );
  const others = new Set(
    madeThen.map((c) => (c.householdId === row.householdId ? c.connectedTo : c.householdId)),
  );
  // Anyone in the circle at the time who is still in it counts too, in case the
  // join predates the batched writes and has no matching stamp.
  for (const m of membersOf(row.circleId)) if (m !== row.householdId) others.add(m);

  for (const other of others) {
    if (other === row.householdId) continue;
    if (!connectedNow(row.householdId, other) && !connectedNow(other, row.householdId)) continue;
    if (shareACircle(row.householdId, other)) continue;
    if (connectedBefore(row.householdId, other, join.at)) continue;
    cut.push({ a: row.householdId, b: other, circle: row.name });
  }
}

console.log(`checking ${process.env.SHEET_ID?.slice(0, 12)}…\n`);
if (cut.length === 0) {
  console.log('Nothing left behind — every family who left a circle is off those lists.');
  process.exit(0);
}

console.log(`${cut.length} pair(s) still connected only because of a circle they have left:\n`);
for (const { a, b, circle } of cut) {
  console.log(`  ${nameOf(a).padEnd(22)} ×  ${nameOf(b).padEnd(22)} (left «${circle}»)`);
}

if (!apply) {
  console.log('\nDry run. Add --apply to sever the pairs above, both directions.');
  process.exit(0);
}

const backup = `.connections-before-undo-${Date.now()}.json`;
writeFileSync(backup, `${JSON.stringify(await store.read(TABS.connections), null, 2)}\n`, 'utf8');
console.log(`\n✓ the tab as it was is in ${backup}`);

const at = new Date().toISOString();
const rows = cut.flatMap(({ a, b }) => [
  [a, b, 'remove', at],
  [b, a, 'remove', at],
]);
const header = (await store.read(TABS.connections))[0].map((h) => String(h).trim().toLowerCase());
await store.appendAll(
  TABS.connections,
  rows.map((row) => {
    const placed: string[] = new Array(header.length).fill('');
    HEADERS.connections.forEach((name, i) => {
      const at_ = header.indexOf(name);
      if (at_ !== -1) placed[at_] = row[i] ?? '';
    });
    return placed;
  }),
);
console.log(`✓ severed ${cut.length} pair(s) — ${rows.length} rows appended`);
