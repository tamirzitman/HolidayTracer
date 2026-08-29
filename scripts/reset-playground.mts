/**
 * Puts a scratch sheet back to a known cast of families, so a scenario can be
 * walked through again from the beginning.
 *
 * This wipes Households, People, Answers, Connections, Invites and Conflicts.
 * It therefore refuses to run unless PLAYGROUND=1 is set for the sheet it is
 * pointed at — the guard exists so that a shell with the wrong .env loaded
 * cannot empty the family's real record.
 *
 *   PLAYGROUND=1 SHEET_ID=<scratch sheet> npm run reset
 *
 * Holidays are left alone: seed them once with `npm run seed:holidays`.
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

if (!process.env.PLAYGROUND) {
  console.error('Refusing to run: PLAYGROUND is not set.');
  console.error('This empties every tab but Holidays. Point it at a scratch sheet:');
  console.error('  PLAYGROUND=1 SHEET_ID=<scratch sheet id> npm run reset');
  process.exit(1);
}

const dry = process.argv.includes('--dry');
const store = sheetStore();

// A cast small enough to hold in your head, and wide enough to try things on:
// one family with two people in it, one with a single person, and one that
// nobody has joined — which is the family the invite buttons are for.
const households = [
  ['hh_a', 'דנה ויוסי כהן', 'TRUE'],
  ['hh_b', 'הורים כהן', 'TRUE'],
  ['hh_c', 'רות ואורי לוי', 'TRUE'],
  ['hh_d', 'משפחה שטרם הצטרפה', 'TRUE'],
];
const people = [
  ['+972500000001', 'דנה', 'hh_a'],
  ['+972500000002', 'יוסי', 'hh_a'],
  ['+972500000003', 'הורה', 'hh_b'],
  ['+972500000004', 'רות', 'hh_c'],
];

// Everyone sees everyone except the family nobody has joined, which only hh_a
// added — so the suggestion list has something to suggest.
const linked: [string, string][] = [
  ['hh_a', 'hh_b'],
  ['hh_a', 'hh_c'],
  ['hh_b', 'hh_c'],
  ['hh_a', 'hh_d'],
];
const at = new Date().toISOString();
const connections = linked.flatMap(([a, b]) => [
  [a, b, 'add', at],
  [b, a, 'add', at],
]);

const plan: [string, readonly string[], string[][]][] = [
  [TABS.households, HEADERS.households, households],
  [TABS.people, HEADERS.people, people],
  [TABS.answers, HEADERS.answers, []],
  [TABS.connections, HEADERS.connections, connections],
  [TABS.invites, HEADERS.invites, []],
  [TABS.conflicts, HEADERS.conflicts, []],
];

for (const [tab, headers, rows] of plan) {
  console.log(`${tab}: ${rows.length} row(s)`);
  if (!dry) await store.replace(tab, [[...headers], ...rows]);
}

console.log(dry ? 'dry run — nothing written' : 'done');
console.log('\nSign in as any of these; there is no code to enter:');
for (const [phone, name, household] of people) {
  console.log(`  ${phone}  ${name} — ${households.find((h) => h[0] === household)?.[1]}`);
}
console.log('  any other number  → a newcomer, who needs an invite link');
