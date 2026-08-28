/**
 * Links every existing household to every other one, once.
 *
 *   npm run connect-all -- --dry
 *   npm run connect-all
 *
 * Before circles, everyone saw everyone. This preserves exactly that for the
 * families already using the app, so nothing appears to change for them. New
 * households arrive through an invite and are connected only to their inviter.
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

const store = sheetStore();
const at = (header: string[], name: string) => header.indexOf(name);

const hhRows = await store.read(TABS.households);
const hhHeader = hhRows[0] ?? [];
const ids = hhRows
  .slice(1)
  .filter((r) => String(r[at(hhHeader, 'active')] ?? '').toUpperCase() === 'TRUE')
  .map((r) => r[at(hhHeader, 'household_id')] ?? '')
  .filter(Boolean);

const existing = await store.read(TABS.connections);
const existingHeader = existing[0] ?? [];
const known = new Set(
  existing.slice(1).map((r) => `${r[at(existingHeader, 'household_id')]}→${r[at(existingHeader, 'connected_to')]}`),
);

const now = new Date().toISOString();
const rows: string[][] = [];
for (const a of ids) {
  for (const b of ids) {
    if (a === b || known.has(`${a}→${b}`)) continue;
    rows.push([a, b, 'add', now]);
  }
}

console.log(`${ids.length} active households → ${rows.length} new one-way links`);

if (process.argv.includes('--dry')) {
  console.log('--dry: nothing written');
} else {
  const body = existing.length > 1 ? existing.slice(1) : [];
  await store.replace(TABS.connections, [[...HEADERS.connections], ...body, ...rows]);
  console.log(`wrote ${body.length + rows.length} rows to ${TABS.connections}`);
}
