/**
 * Every raw row across every tab that names one household id — its own row on
 * Households, and everywhere else it is mentioned. For following up on
 * whatever find-floating.mts turns up: who added a household, to which
 * circle, and when.
 *
 * Nothing here writes.
 *
 *   npm run inspect-household -- <household_id>
 *   npm run inspect-household -- <household_id> --to <sheet_id>
 */
import { readFileSync } from 'node:fs';

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

const at = process.argv.indexOf('--to');
if (at !== -1 && process.argv[at + 1]) process.env.SHEET_ID = process.argv[at + 1];

const id = process.argv.find((a, i) => i >= 2 && !a.startsWith('--') && process.argv[i - 1] !== '--to');
if (!id) {
  console.error('usage: npm run inspect-household -- <household_id>');
  process.exit(1);
}

const { sheetStore } = await import('../src/lib/sheet.ts');
const store = sheetStore();

const tabs = ['Households', 'People', 'Connections', 'Circles', 'Answers', 'Invites', 'Conflicts'];
let found = false;
for (const tab of tabs) {
  const rows = await store.read(tab);
  const header = rows[0] ?? [];
  const matches = rows.slice(1).filter((r) => r.includes(id));
  if (matches.length === 0) continue;
  found = true;
  console.log(`\n=== ${tab} (${matches.length} row(s) mention ${id}) ===`);
  console.log(`  ${header.join(' | ')}`);
  for (const r of matches) console.log(`  ${r.join(' | ')}`);
}
if (!found) console.log(`Nothing anywhere mentions ${id}.`);
