/**
 * Turns the old pairwise `Connections` into `Circles` and `Members`.
 *
 * Every connected group of households becomes one circle: with the old model
 * everyone in a group could already see everyone else in it, so a group is
 * exactly a circle. Nothing is deleted — Connections is left where it is, and
 * can be removed by hand once the app has been seen working.
 *
 *   npm run to-circles -- --dry
 *   npm run to-circles
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

const dry = process.argv.includes('--dry');
const store = sheetStore();
const at = new Date().toISOString();

const existing = await store.read(TABS.circles);
if (existing.length > 1) {
  console.log(`${TABS.circles} already has ${existing.length - 1} row(s) — nothing to do.`);
  process.exit(0);
}

const rows = await store.read(TABS.connections);
const header = rows[0] ?? [];
const at_ = (name: string) => header.indexOf(name);
const [A, B, ACTION, CIRCLE] = ['household_id', 'connected_to', 'action', 'circle'].map(at_);

// Newest row per pair decides, exactly as the app read it.
const live = new Map<string, { a: string; b: string; circle: string }>();
for (const row of rows.slice(1)) {
  const a = (row[A] ?? '').trim();
  const b = (row[B] ?? '').trim();
  if (!a || !b) continue;
  const action = (row[ACTION] ?? 'add').trim() || 'add';
  const key = `${a}→${b}`;
  if (action === 'add') live.set(key, { a, b, circle: (row[CIRCLE] ?? '').trim() });
  else live.delete(key);
}

// Connected groups: union-find over the surviving links.
const parent = new Map<string, string>();
const find = (x: string): string => {
  if (!parent.has(x)) parent.set(x, x);
  const p = parent.get(x)!;
  if (p === x) return x;
  const root = find(p);
  parent.set(x, root);
  return root;
};
const union = (x: string, y: string) => parent.set(find(x), find(y));

for (const { a, b } of live.values()) union(a, b);

const groups = new Map<string, Set<string>>();
const namedBy = new Map<string, string>();
for (const { a, b, circle } of live.values()) {
  const root = find(a);
  const set = groups.get(root) ?? new Set<string>();
  set.add(a);
  set.add(b);
  groups.set(root, set);
  if (circle && !namedBy.has(root)) namedBy.set(root, circle);
}

const households = await store.read(TABS.households);
const hh = households[0] ?? [];
const [ID, NAME] = ['household_id', 'name'].map((n) => hh.indexOf(n));
const nameOf = new Map(households.slice(1).map((r) => [(r[ID] ?? '').trim(), (r[NAME] ?? '').trim()]));

const circleRows: string[][] = [];
const memberRows: string[][] = [];
let id = 0;
for (const [root, set] of groups) {
  id += 1;
  // The old `circle` column held the inviting household's name, not a circle's:
  // read as a circle it needs the possessive, or it reads as a family.
  const legacy = namedBy.get(root);
  const name = legacy ? `המעגל של ${legacy}` : groups.size === 1 ? 'המשפחה שלנו' : `מעגל ${id}`;
  const owner = [...set][0];
  circleRows.push([String(id), name, owner, at]);
  for (const household of set) memberRows.push([String(id), household, 'add', at, '']);
  console.log(
    `circle ${id} "${name}": ${set.size} households — ` +
      [...set].map((h) => nameOf.get(h) ?? h).join(', '),
  );
}

console.log(`\n${circleRows.length} circle(s), ${memberRows.length} membership row(s)`);
if (dry) {
  console.log('dry run — nothing written');
} else {
  await store.replace(TABS.circles, [[...HEADERS.circles], ...circleRows]);
  await store.replace(TABS.members, [[...HEADERS.members], ...memberRows]);
  console.log('written');
}
