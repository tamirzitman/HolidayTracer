/**
 * Proves that putting a family into a circle costs the same whatever the size
 * of the circle — and that it still connects everybody it should.
 *
 * The cost of every screen in this app is round trips to Google and nothing
 * else, and that cost is invisible when reading the code: a loop that writes
 * one row per family looks exactly like a loop that writes them all at once.
 * This once cost about five round trips per family already in the circle, each
 * awaited in turn, with a re-read of the entire spreadsheet between them —
 * long enough that people thought the app had hung.
 *
 * So it is measured rather than reasoned about. A join into a circle of 4 and a
 * join into a circle of 24 must cost the same; if a loop creeps back in, the
 * second number grows and this fails.
 *
 *   npm run perf-circle
 *
 * Runs against a scratch JSON file, never a real sheet.
 */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Before importing anything that reads it: the local store is chosen by the
// absence of SHEET_ID, and it keeps its file beside the working directory.
delete process.env.SHEET_ID;
process.chdir(mkdtempSync(path.join(tmpdir(), 'holidaytracer-perf-')));

const { resetStoreCalls, storeCalls } = await import('../src/lib/sheet.ts');
const d = await import('../src/lib/data.ts');

/** A sheet with `n` households and nothing else. */
function seed(n: number): void {
  const households: string[][] = [['household_id', 'name', 'active']];
  for (let i = 1; i <= n; i += 1) households.push([String(i), `משפחה ${i}`, 'TRUE']);
  writeFileSync(
    '.dev-sheet.json',
    `${JSON.stringify({
      Households: households,
      People: [['phone', 'name', 'household_id']],
      Answers: [['timestamp', 'holiday_key', 'kind', 'host_household_id', 'by_phone', 'for_household_id']],
      Connections: [['household_id', 'connected_to', 'action', 'at']],
      Invites: [['token', 'created_by', 'kind', 'created_at', 'circle', 'for_phone', 'used_at', 'for_household_id', 'for_circle_id']],
      Circles: [['circle_id', 'household_id', 'action', 'name', 'color', 'added_by', 'at']],
      Holidays: [['holiday_id', 'name_he', 'type', 'emoji', 'include', 'owner_household_id', 'shared_with']],
      Dates: [['holiday_id', 'year', 'date']],
      Conflicts: [['holiday_key', 'household_id', 'host_household_id', 'status', 'at']],
    })}\n`,
    'utf8',
  );
  d.invalidateSheet();
}

const total = (c: Readonly<Record<string, number>>) =>
  c.read + c.readMany + c.append + c.appendAll;

let failed = 0;
const check = (label: string, ok: boolean) => {
  console.log(`${ok ? 'PASS ' : 'FAIL '} ${label}`);
  if (!ok) failed += 1;
};

/** Builds a circle of `size`, then measures one more family joining it. */
async function joinCost(size: number): Promise<{ calls: number; rows: number }> {
  seed(size + 1);
  const members = Array.from({ length: size - 1 }, (_, i) => String(i + 2));
  const circle = await d.createCircle('1', 'מעגל', 'teal', members);

  const newcomer = String(size + 1);
  d.invalidateSheet();
  const before = (await d.loadSheet()).connections.length;

  resetStoreCalls();
  await d.addToCircle(circle, newcomer, '1', 'מעגל', 'teal');
  const calls = total(storeCalls());

  d.invalidateSheet();
  const after = await d.loadSheet();

  // Correctness, not only speed: everybody already in must now see the
  // newcomer, and the newcomer must see all of them.
  const inside = ['1', ...members];
  for (const m of inside) {
    if (!(await d.isConnected(newcomer, m)) || !(await d.isConnected(m, newcomer))) {
      check(`a circle of ${size}: ${m} and the newcomer see each other`, false);
    }
  }
  check(`a circle of ${size}: the newcomer is in it`,
    (await d.circleMembers(circle)).includes(newcomer));
  // Two rows per family already in, and not one more: a pair written twice
  // would be a duplicate the sheet keeps for ever.
  check(`a circle of ${size}: ${size * 2} connection rows, no duplicates`,
    after.connections.length - before === size * 2);

  return { calls, rows: after.connections.length - before };
}

const small = await joinCost(4);
const large = await joinCost(24);

console.log(`\n  joining a circle of  4: ${small.calls} store calls, ${small.rows} rows`);
console.log(`  joining a circle of 24: ${large.calls} store calls, ${large.rows} rows\n`);

check('joining a circle costs the same whatever its size', small.calls === large.calls);
// Generous: the point is that it is a handful and does not scale, not the
// exact number, which a legitimate change might move by one.
check(`and that cost is a handful of round trips (${large.calls})`, large.calls <= 8);

console.log(failed === 0 ? '\n✓ joining a circle does not scale with the circle' : `\n✗ ${failed} failed`);
process.exitCode = failed === 0 ? 0 : 1;
