/**
 * Undoes leftover connections from `connect-all` that no circle backs today.
 *
 * `connect-all` was run once, before circles existed, to link every household
 * active at the time to every other one so the redesign would not visibly
 * change anything for families already using the app. That is append-only,
 * like everything else here — the rows never went away, and circles since
 * organised those same households into separate groups. Two households can
 * end up seeing each other only because both happened to exist on the day the
 * script ran, with no circle in common now and never having chosen each other
 * directly.
 *
 * This finds exactly those pairs — an 'add' connection with no circle shared
 * by both sides today — and severs them both ways, leaving alone every
 * connection a person actually chose (adding a family by name, claiming one,
 * joining through an invite) and every pair that does share a circle.
 *
 *   npm run sever-stale-mesh                # what it would sever
 *   npm run sever-stale-mesh -- --apply
 *   npm run sever-stale-mesh -- --to <id>
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
const { HEADERS, TABS } = await import('../src/lib/types.ts');
const d = await import('../src/lib/data.ts');

const store = sheetStore();
const sheet = await d.loadSheet();
const nameOf = new Map(sheet.households.map((h) => [h.id, h.name]));

// The fingerprint of a bulk script: many rows sharing one exact timestamp.
// Any run of connect-all shows up this way; an ordinary click through the app
// never produces two rows at the same millisecond, let alone ten.
const byTs = new Map<string, number>();
for (const c of sheet.connections) {
  if (c.action !== 'add') continue;
  byTs.set(c.at, (byTs.get(c.at) ?? 0) + 1);
}
const bulkTimestamps = new Set([...byTs.entries()].filter(([, n]) => n >= 10).map(([ts]) => ts));

if (bulkTimestamps.size === 0) {
  console.log('No bulk-connection batch found — nothing looks like connect-all leftovers.');
  process.exit(0);
}
console.log(`bulk batch(es) found: ${[...bulkTimestamps].join(', ')}\n`);

// Every pair currently sharing at least one circle: nothing here is touched.
const circleMates = new Map<string, Set<string>>();
for (const h of sheet.households) {
  const mine = await d.circlesFor(h.id);
  circleMates.set(h.id, new Set(mine.flatMap((c) => c.members)));
}

const pairs = new Map<string, { a: string; b: string; at: string }>();
for (const c of sheet.connections) {
  if (c.action !== 'add' || !bulkTimestamps.has(c.at)) continue;
  const key = [c.householdId, c.connectedTo].sort().join('|');
  pairs.set(key, { a: c.householdId, b: c.connectedTo, at: c.at });
}

const toSever: { a: string; b: string }[] = [];
for (const { a, b } of pairs.values()) {
  if (!nameOf.has(a) || !nameOf.has(b)) continue; // one side is retired — leave it
  if (circleMates.get(a)?.has(b)) continue; // still share a circle today
  toSever.push({ a, b });
}

console.log(`${pairs.size} bulk-linked pair(s), ${toSever.length} share no circle today:\n`);
for (const { a, b } of toSever) {
  console.log(`  ${(nameOf.get(a) ?? a).padEnd(22)} ×  ${nameOf.get(b) ?? b}`);
}

if (toSever.length === 0) {
  console.log('\nNothing to do.');
  process.exit(0);
}

if (!apply) {
  console.log('\nDry run. Add --apply to sever the pairs above, both directions.');
  process.exit(0);
}

const backupRows = await store.read(TABS.connections);
const backup = `.connections-before-sever-${Date.now()}.json`;
writeFileSync(backup, `${JSON.stringify(backupRows, null, 2)}\n`, 'utf8');
console.log(`\n✓ the tab as it was is in ${backup}`);

const at = new Date().toISOString();
for (const { a, b } of toSever) {
  await store.append(TABS.connections, [a, b, 'remove', at]);
  await store.append(TABS.connections, [b, a, 'remove', at]);
}
console.log(`✓ severed ${toSever.length} pair(s) — ${toSever.length * 2} rows appended`);
