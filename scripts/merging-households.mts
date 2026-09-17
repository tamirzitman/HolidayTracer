/**
 * Does merging two rows into one carry everything, and change nothing else?
 *
 * The same family gets typed in twice constantly — once by name from somebody's
 * phone, once when one of them signs up — and the extra row is never empty by
 * then: it is in circles, other families were introduced through it, and it has
 * answered about holidays. So merging is not deleting, and the whole question is
 * whether anything is lost or quietly changed on the way.
 *
 * The rules this holds to, each of which was a real way to get it wrong:
 *
 *   - people, circles, connections, answers, links and their own dates all move,
 *   - an answer that was somebody's last word stays their last word,
 *   - the survivor's own later word is never overwritten by an older one,
 *   - a family anybody deliberately dropped is never handed back,
 *   - the old row is switched off, never deleted, and its id never reused.
 *
 * Runs against a scratch file in seconds, never a real sheet.
 *
 *   npm run check-merging
 */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

delete process.env.SHEET_ID;
const here = process.cwd();
process.chdir(mkdtempSync(path.join(tmpdir(), 'ht-merge-')));

const d = await import(`${here}/src/lib/data.ts`);

type Seed = {
  households?: string[][];
  people?: string[][];
  answers?: string[][];
  connections?: string[][];
  circles?: string[][];
  invites?: string[][];
  holidays?: string[][];
  dates?: string[][];
};

/** Six households, and whatever else a case needs on top. */
function seed(extra: Seed = {}) {
  const households: string[][] = [['household_id', 'name', 'active', 'created_by', 'created_at']];
  for (let i = 1; i <= 6; i += 1) households.push([String(i), `משפחה ${i}`, 'TRUE']);
  writeFileSync(
    '.dev-sheet.json',
    `${JSON.stringify({
      Households: [...households, ...(extra.households ?? [])],
      People: [['phone', 'name', 'household_id'], ...(extra.people ?? [])],
      Answers: [
        ['timestamp', 'holiday_key', 'kind', 'host_household_id', 'by_phone', 'for_household_id'],
        ...(extra.answers ?? []),
      ],
      Connections: [['household_id', 'connected_to', 'action', 'at'], ...(extra.connections ?? [])],
      Invites: [
        ['token', 'created_by', 'kind', 'created_at', 'for_phone', 'used_at', 'for_household_id', 'for_circle_id'],
        ...(extra.invites ?? []),
      ],
      Circles: [
        ['circle_id', 'household_id', 'action', 'name', 'color', 'added_by', 'at'],
        ...(extra.circles ?? []),
      ],
      Holidays: [
        ['holiday_id', 'name_he', 'type', 'emoji', 'include', 'owner_household_id', 'shared_with'],
        ...(extra.holidays ?? []),
      ],
      Dates: [['holiday_id', 'year', 'date'], ...(extra.dates ?? [])],
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

const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

// ── the reported case: a family added once too many ─────────────────────────
// 5 is the name somebody typed in; 6 is the row the family actually signed into.
seed({
  people: [['+972500000006', 'רוני', '6']],
  answers: [[ago(90), 'pesach_2026', 'away', '', '+972500000001', '5']],
  circles: [
    ['c1', '1', 'add', 'מעגל', 'blue', '1', ago(120)],
    ['c1', '5', 'add', 'מעגל', 'blue', '1', ago(120)],
  ],
  connections: [
    ['1', '5', 'add', ago(120)],
    ['5', '1', 'add', ago(120)],
    ['5', '2', 'add', ago(110)],
    ['2', '5', 'add', ago(110)],
  ],
});
await d.mergeHouseholds('6', ['5']);
d.invalidateSheet();
let sheet = await d.loadSheet();

check('the row folded in is switched off, not deleted',
  !sheet.households.some((h: { id: string }) => h.id === '5') && sheet.retired.includes('5'));
check('the surviving row is untouched',
  sheet.households.some((h: { id: string }) => h.id === '6'));
check('what was said about them is now said about the survivor',
  (await d.getLatestAnswer('pesach_2026', '6'))?.kind === 'away');
// The old row's answer is still on the tab, naming the old id — nothing here is
// ever rewritten. It is invisible because the household is switched off, which
// is the only thing that has to be true.
check('and the household it was said about is off every list',
  !(await d.circleOf('1')).some((h: { id: string }) => h.id === '5'));
check('the families they knew are the survivor’s families now',
  (await d.isConnected('6', '2')) && (await d.isConnected('2', '6')));
check('and the circle they were in is the survivor’s circle',
  (await d.circleMembers('c1')).includes('6') && !(await d.circleMembers('c1')).includes('5'));
check('a new household never takes the retired id back',
  (await d.addHousehold('משפחה חדשה', '+972500000001')) !== '5');

// ── the survivor’s own later word stands ────────────────────────────────
seed({
  people: [['+972500000006', 'רוני', '6']],
  answers: [
    [ago(90), 'pesach_2026', 'away', '', '+972500000001', '5'],
    [ago(30), 'pesach_2026', 'hosting', '6', '+972500000006', ''],
  ],
});
await d.mergeHouseholds('6', ['5']);
d.invalidateSheet();
check('an older answer from the row folded in never overwrites a newer one',
  (await d.getLatestAnswer('pesach_2026', '6'))?.kind === 'hosting');

// ── and an older word of the survivor’s does not stand in the way ──────
seed({
  people: [['+972500000006', 'רוני', '6']],
  answers: [
    [ago(90), 'pesach_2026', 'hosting', '6', '+972500000006', ''],
    [ago(30), 'pesach_2026', 'away', '', '+972500000001', '5'],
  ],
});
await d.mergeHouseholds('6', ['5']);
d.invalidateSheet();
check('the later of the two answers is the one that survives',
  (await d.getLatestAnswer('pesach_2026', '6'))?.kind === 'away');

// ── a superseded answer is not dragged back to the top of the tab ───────────
seed({
  people: [
    ['+972500000006', 'רוני', '6'],
    ['+972500000002', 'דנה', '2'],
  ],
  answers: [
    [ago(90), 'pesach_2026', 'guest', '5', '+972500000002', ''],
    [ago(60), 'pesach_2026', 'away', '', '+972500000002', ''],
  ],
});
await d.mergeHouseholds('6', ['5']);
d.invalidateSheet();
check('a guest who has since changed their mind is left as they are',
  (await d.getLatestAnswer('pesach_2026', '2'))?.kind === 'away');

// ── a guest at the old row is a guest at the survivor ───────────────────────
seed({
  people: [
    ['+972500000006', 'רוני', '6'],
    ['+972500000002', 'דנה', '2'],
  ],
  answers: [[ago(60), 'pesach_2026', 'guest', '5', '+972500000002', '']],
});
await d.mergeHouseholds('6', ['5']);
d.invalidateSheet();
const guestAnswer = await d.getLatestAnswer('pesach_2026', '2');
check('a family eating at the old row is eating at the survivor',
  guestAnswer?.kind === 'guest' && guestAnswer?.hostHouseholdId === '6');
check('and the survivor can see who is coming',
  (await d.guestsComingTo('pesach_2026', '6')).some((h: { id: string }) => h.id === '2'));

// ── the people in it, and everything their number ever said ─────────────────
seed({
  people: [
    ['+972500000005', 'יהונתן', '5'],
    ['+972500000006', 'רוני', '6'],
  ],
  answers: [[ago(60), 'sukkot_2026', 'hosting', '5', '+972500000005', '']],
});
await d.mergeHouseholds('6', ['5']);
d.invalidateSheet();
check('a person in the old household is in the surviving one',
  (await d.findPerson('+972500000005'))?.householdId === '6');
check('and what they answered is the surviving household’s answer',
  (await d.getLatestAnswer('sukkot_2026', '6'))?.kind === 'hosting');

// ── a family anybody dropped on purpose is not handed back ──────────────────
seed({
  people: [['+972500000006', 'רוני', '6']],
  connections: [
    ['5', '3', 'add', ago(120)],
    ['3', '5', 'add', ago(120)],
    ['6', '3', 'add', ago(100)],
    ['3', '6', 'add', ago(100)],
    ['6', '3', 'remove', ago(20)],
  ],
});
await d.mergeHouseholds('6', ['5']);
d.invalidateSheet();
check('a family the survivor took off its list stays off it',
  !(await d.isConnected('6', '3')));
check('while the other side of that one-way removal is untouched',
  await d.isConnected('3', '6'));

// ── their own date, and who it was shared with ──────────────────────────────
seed({
  people: [['+972500000006', 'רוני', '6']],
  holidays: [
    ['yom_huledet', 'יום הולדת', 'family', '🎂', 'TRUE', '5', '1, 2'],
    ['piknik', 'פיקניק', 'family', '🧺', 'TRUE', '1', '5, 2'],
  ],
  dates: [
    ['yom_huledet', '2026', '2026-12-01'],
    ['piknik', '2026', '2026-12-08'],
  ],
});
await d.mergeHouseholds('6', ['5']);
d.invalidateSheet();
sheet = await d.loadSheet();
const own = sheet.holidays.find((h: { key: string }) => h.key === 'yom_huledet_2026');
const shared = sheet.holidays.find((h: { key: string }) => h.key === 'piknik_2026');
check('a date of their own belongs to the surviving household',
  own?.ownerHouseholdId === '6');
check('and a date shared with them is shared with the survivor',
  shared?.sharedWith.includes('6') && !shared?.sharedWith.includes('5'));

// ── a link aimed at the old row still works ─────────────────────────────────
seed({
  people: [['+972500000001', 'תמיר', '1']],
  invites: [['tok', '1', 'family', new Date().toISOString(), '', '', '5', '']],
});
await d.mergeHouseholds('6', ['5']);
d.invalidateSheet();
check('a link that named the old household now names the survivor',
  (await d.readInvite('tok'))?.forHousehold?.id === '6');

// ── a link the survivor itself sent, aimed at the row being folded in ───────
seed({
  people: [['+972500000006', 'רוני', '6']],
  invites: [['tok', '6', 'family', new Date().toISOString(), '', '', '5', '']],
});
await d.mergeHouseholds('6', ['5']);
d.invalidateSheet();
const turned = await d.readInvite('tok');
check('a link that would have named its own sender becomes an invitation to join them',
  turned?.kind === 'household' && turned?.household.id === '6');

// ── several rows into one, in one go ────────────────────────────────────────
seed({
  people: [['+972500000004', 'רמי', '4']],
  circles: [
    ['c1', '5', 'add', 'צד אחד', 'blue', '5', ago(120)],
    ['c2', '6', 'add', 'צד שני', 'teal', '6', ago(120)],
  ],
  connections: [
    ['5', '2', 'add', ago(120)],
    ['2', '5', 'add', ago(120)],
    ['6', '3', 'add', ago(120)],
    ['3', '6', 'add', ago(120)],
  ],
});
await d.mergeHouseholds('4', ['5', '6']);
d.invalidateSheet();
sheet = await d.loadSheet();
check('two households fold into one in a single go',
  sheet.retired.includes('5') && sheet.retired.includes('6'));
check('and the survivor inherits both their worlds',
  (await d.isConnected('4', '2')) && (await d.isConnected('4', '3')) &&
    (await d.circleMembers('c1')).includes('4') && (await d.circleMembers('c2')).includes('4'));

// ── what it refuses to do ───────────────────────────────────────────────────
seed({ people: [['+972500000006', 'רוני', '6']] });
const nothing = await d.mergeHouseholds('6', ['6']);
check('a household is never merged into itself', nothing.people === 0 && nothing.from.length === 0);
const missing = await d.mergeHouseholds('6', ['404']);
check('and a household that does not exist is nobody', missing.from.length === 0);
d.invalidateSheet();
check('neither of which touched the sheet',
  (await d.loadSheet()).households.length === 6);
await wait();

console.log(bad === 0 ? '\n✓ merging carries everything and changes nothing else' : `\n✗ ${bad} failed`);
process.exitCode = bad === 0 ? 0 : 1;
