/**
 * Brings the sheet's header rows up to date with HEADERS.
 *
 * Columns are read by name, never by position, so a tab that is missing a newly
 * added column reads it as empty — nothing breaks, but nothing can be written to
 * it either. This adds the missing names to row 1 and leaves every data row
 * exactly as it is. Safe to run twice.
 *
 *   npm run align -- --dry
 *   npm run align
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

for (const [name, tab] of Object.entries(TABS) as [keyof typeof HEADERS, string][]) {
  const rows = await store.read(tab);
  const wanted = [...HEADERS[name]];

  if (rows.length === 0) {
    console.log(`${tab}: empty — writing headers`);
    if (!dry) await store.replace(tab, [wanted]);
    continue;
  }

  const header = rows[0];
  const missing = wanted.filter((column) => !header.includes(column));
  if (missing.length === 0) {
    console.log(`${tab}: already has ${header.length} columns, nothing to do`);
    continue;
  }

  // Appended at the end, so every existing cell keeps the column it is under.
  const next = [[...header, ...missing], ...rows.slice(1)];
  console.log(`${tab}: adding ${missing.join(', ')} (${rows.length - 1} data rows kept)`);
  if (!dry) await store.replace(tab, next);
}

console.log(dry ? 'dry run — nothing written' : 'done');
