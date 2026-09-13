/**
 * Does leaving a circle undo exactly what joining it did — no more, no less?
 *
 * Joining connects a family to everyone in the circle. For a long time leaving
 * undid none of that: a family ticked by accident and unticked twelve seconds
 * later stayed on twelve other families' lists for ever, and no screen admitted
 * it. The fix has to cut in both directions carefully, which is why this exists
 * rather than a single check that the removal "worked":
 *
 *   - what the circle introduced goes,
 *   - what predates the circle stays,
 *   - what another circle still holds stays.
 *
 * Runs against a scratch file in seconds, never a real sheet.
 *
 *   npm run check-leaving
 */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

delete process.env.SHEET_ID;
const here = process.cwd();
process.chdir(mkdtempSync(path.join(tmpdir(), 'ht-leave-')));

const d = await import(`${here}/src/lib/data.ts`);

function seed(n: number) {
  const households: string[][] = [['household_id', 'name', 'active', 'created_by', 'created_at']];
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

let bad = 0;
const check = (label: string, ok: boolean) => {
  console.log(`${ok ? 'PASS ' : 'FAIL '} ${label}`);
  if (!ok) bad += 1;
};
const wait = () => new Promise((r) => setTimeout(r, 5));

// ── the reported bug: ticked by mistake, unticked, still on everyone's list ──
seed(6);
const circle = await d.createCircle('1', 'זיטמן', 'blue', ['2', '3', '4']);
await wait();
await d.addToCircle(circle, '5', '1', 'זיטמן', 'blue');
d.invalidateSheet();
check('joining connects them to everyone in it',
  (await d.isConnected('5', '2')) && (await d.isConnected('2', '5')) && (await d.isConnected('5', '4')));

await wait();
await d.removeFromCircle(circle, '5');
d.invalidateSheet();
check('and leaving takes them off every one of those lists',
  !(await d.isConnected('5', '2')) && !(await d.isConnected('2', '5')) && !(await d.isConnected('5', '4')));
check('while the families who stayed still see each other',
  (await d.isConnected('2', '3')) && (await d.isConnected('1', '4')));

// ── a friendship that predates the circle survives leaving it ───────────────
seed(6);
await d.connect('1', '6');
await wait();
const circle2 = await d.createCircle('1', 'זיטמן', 'blue', ['2', '3']);
await wait();
await d.addToCircle(circle2, '6', '1', 'זיטמן', 'blue');
await wait();
await d.removeFromCircle(circle2, '6');
d.invalidateSheet();
check('a pair who could already see each other before the circle still can',
  (await d.isConnected('1', '6')) && (await d.isConnected('6', '1')));
check('but the ones only the circle introduced are undone',
  !(await d.isConnected('6', '2')) && !(await d.isConnected('2', '6')));

// ── another circle still holding them together wins ─────────────────────────
seed(6);
const a = await d.createCircle('1', 'צד אחד', 'blue', ['2', '3']);
await wait();
const b = await d.createCircle('1', 'צד שני', 'teal', ['2', '4']);
await wait();
await d.removeFromCircle(a, '2');
d.invalidateSheet();
check('two families still sharing another circle keep seeing each other',
  (await d.isConnected('1', '2')) && (await d.isConnected('2', '1')));
check('and the one only the left circle held is undone',
  !(await d.isConnected('2', '3')));

console.log(bad === 0 ? '\n✓ leaving a circle undoes exactly what joining it did' : `\n✗ ${bad} failed`);
process.exitCode = bad === 0 ? 0 : 1;
