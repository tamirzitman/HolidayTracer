/**
 * End-to-end smoke test, against a real browser.
 *
 *   npm run seed:holidays        # once, if .dev-sheet.json has no Holidays
 *   npm run build && SESSION_SECRET=test npm start -- --port 3111
 *   npm run test:smoke
 */
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// Start from known fixtures: a half-finished earlier run would otherwise leave
// answers behind and the first assertion would fail for the wrong reason.
execFileSync(process.execPath, ['scripts/dev-fixtures.mjs'], { stdio: 'ignore' });

const BASE = process.env.SMOKE_URL ?? 'http://localhost:3111';
const SHEET = '.dev-sheet.json';
const DAD = '050-123-4567';
const NEWCOMER = `05${String(Date.now()).slice(-8)}`;

const sheet = () => JSON.parse(readFileSync(SHEET, 'utf8'));
const rows = (tab) => (sheet()[tab] ?? []).slice(1);

let failures = 0;
function check(label, ok) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) failures += 1;
}

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const open = async () => (await browser.newContext({ viewport: { width: 390, height: 820 } })).newPage();

// ── an unknown number cannot let itself in ───────────────────────────────────
const stranger = await open();
await stranger.goto(BASE);
await stranger.fill('input[name=phone]', '050-000-0000');
await stranger.click('button[type=submit]');
await stranger.waitForSelector('text=צריך הזמנה');
check('joining without an invite is refused', await stranger.isVisible('text=צריך הזמנה'));

// ── the circle is hidden until you answer ────────────────────────────────────
const dad = await open();
await dad.goto(BASE);
await dad.fill('input[name=phone]', DAD);
await dad.click('button[type=submit]');
await dad.waitForSelector('text=איפה אתם בחג?');
check('a known number goes straight to the question', await dad.isVisible('text=איפה אתם בחג?'));
check('nobody else is shown before you answer', !(await dad.isVisible('text=איפה כולם')));

await dad.click('text=אנחנו מארחים');
await dad.waitForSelector('text=איפה כולם');
check('answering reveals where everyone is', await dad.isVisible('text=איפה כולם'));
check('and the circle lists the other families', await dad.isVisible('text=טמיר ואפיק'));

// ── invite a family that is not in the app at all ────────────────────────────
await dad.click('nav >> text=המשפחות');
await dad.waitForURL('**/families');
check('the tab bar reaches the families screen', await dad.isVisible('text=המשפחות שלי'));
const beforeInvite = rows('Invites').length;
await dad.click('text=הזמנת משפחה');
await dad.waitForSelector('text=שליחה בוואטסאפ');
check('an invite link is created', rows('Invites').length === beforeInvite + 1);
check('the invite is a family invite', rows('Invites').at(-1)[2] === 'family');
const token = rows('Invites').at(-1)[0];

const newcomer = await open();
await newcomer.goto(`${BASE}/join/${token}`);
await newcomer.fill('input[name=phone]', NEWCOMER);
await newcomer.click('button[type=submit]');
await newcomer.waitForSelector('input[name=householdName]');
check('the invite names who invited them', await newcomer.isVisible('text=אבא ואמא'));
check('and asks for no phone number', !(await newcomer.isVisible('input[name=joinPhone]')));
await newcomer.fill('input[name=name]', 'דנה');
await newcomer.fill('input[name=householdName]', 'דנה ויוסי');
await newcomer.click('button[type=submit]');
await newcomer.waitForSelector('text=איפה אתם בחג?');
check('the newcomer is in', rows('Households').some((r) => r[1] === 'דנה ויוסי'));

// ── connections are not inherited ────────────────────────────────────────────
await newcomer.click('text=מתארחים אצל…');
await newcomer.waitForSelector('select[name=hostHouseholdId]');
const options = await newcomer.$$eval('select[name=hostHouseholdId] option', (els) =>
  els.map((e) => e.textContent.trim()).filter((t) => t !== 'בחרו משפחה'),
);
check(`the newcomer sees only who invited them (${options.join(', ') || 'none'})`,
  options.length === 1 && options[0] === 'אבא ואמא');

await newcomer.selectOption('select[name=hostHouseholdId]', { label: 'אבא ואמא' });
await newcomer.click('button[type=submit]');
await newcomer.waitForSelector('text=מתארחים אצל אבא ואמא');
check('the newcomer can answer for the family that invited them',
  await newcomer.isVisible('text=מתארחים אצל אבא ואמא'));

await dad.goto(BASE);
check('and they show up as coming', await dad.isVisible('text=דנה ויוסי'));

// ── both say they are at the other, and the sheet records it ─────────────────
// The Conflicts tab is an event log now: rows are appended, never rewritten, so
// two families answering at once cannot erase each other.
const conflictState = () => {
  const state = new Map();
  for (const r of rows('Conflicts')) state.set(`${r[0]}|${r[1]}|${r[2]}`, r[3]);
  return state;
};

await dad.goto(BASE);
await dad.click('text=שינוי תשובה');
await dad.waitForSelector('text=מתארחים אצל…');
await dad.click('text=מתארחים אצל…');
await dad.waitForSelector('select[name=hostHouseholdId]');
await dad.selectOption('select[name=hostHouseholdId]', { label: 'דנה ויוסי' });
await dad.click('button[type=submit]');
await dad.waitForSelector('text=מתארחים אצל דנה ויוסי');

await newcomer.reload();
check('the guest is warned their host is not hosting',
  await newcomer.isVisible('text=שימו לב — הם ענו שהם מתארחים'));

const newcomerHousehold = rows('Households').at(-1)[0];
const KEY = `erev_rosh_hashana_2026|${newcomerHousehold}|hh_parents`;
check(`the contradiction is written to the sheet (${rows('Conflicts').length} rows)`,
  conflictState().get(KEY) === 'open');

const openedRows = rows('Conflicts').length;
await dad.click('text=שינוי תשובה');
await dad.waitForSelector('text=אנחנו מארחים');
await dad.click('text=אנחנו מארחים');
await dad.waitForSelector('text=מגיעים אליכם');
check('resolving it is recorded as resolved', conflictState().get(KEY) === 'resolved');
check('and nothing was erased to do it — the tab only grew',
  rows('Conflicts').length > openedRows &&
    rows('Conflicts').some((r) => r[3] === 'open'));

await newcomer.reload();
check('the warning is gone for the guest',
  !(await newcomer.isVisible('text=שימו לב — הם ענו שהם מתארחים')));

// ── hiding is one-sided ──────────────────────────────────────────────────────
await dad.click('nav >> text=המשפחות');
await dad.waitForURL('**/families');
const hideRow = dad.locator('li', { hasText: 'אח ואשתו' });
await hideRow.locator('text=הסתרה').click();
await dad.waitForTimeout(1200);
await dad.goto(BASE);
await dad.click('text=שינוי תשובה');
await dad.waitForSelector('text=מתארחים אצל…');
await dad.click('text=מתארחים אצל…');
await dad.waitForSelector('select[name=hostHouseholdId]');
const afterHide = await dad.$$eval('select[name=hostHouseholdId] option', (els) =>
  els.map((e) => e.textContent.trim()),
);
check('a hidden family leaves your list', !afterHide.includes('אח ואשתו'));

const brotherStillSees = rows('Connections').filter(
  (r) => r[0] === 'hh_brother' && r[1] === 'hh_parents',
);
check('but they still see you', brotherStillSees.at(-1)?.[2] === 'add');

// ── hiding can be taken back ─────────────────────────────────────────────────
await dad.goto(`${BASE}/families`);
check('hidden families are listed separately', await dad.isVisible('text=מוסתרות'));
await dad.locator('section:has-text("מוסתרות") li', { hasText: 'אח ואשתו' }).locator('text=החזרה').click();
await dad.waitForTimeout(1200);
await dad.goto(`${BASE}/families`);
const backInList = await dad.locator('section').first().innerText();
check('bringing one back returns it to the list', backInList.includes('אח ואשתו'));

// ── adding a family from the question screen ─────────────────────────────────
// The case this exists for: answering on the night, and the host is not listed.
const beforeAdd = rows('Households').length;
await dad.goto(BASE);
await dad.click('text=שינוי תשובה');
await dad.waitForSelector('text=מתארחים אצל…');
await dad.click('text=מתארחים אצל…');
await dad.click('text=לא מוצאים? הוסיפו משפחה');
await dad.fill('input[name=familyName]', 'משפחת כהן');
await dad.click('text=הוספה');
await dad.waitForTimeout(1500);
check('a family can be added while answering', rows('Households').length === beforeAdd + 1);

await dad.goto(BASE);
await dad.click('text=שינוי תשובה');
await dad.waitForSelector('text=מתארחים אצל…');
await dad.click('text=מתארחים אצל…');
await dad.waitForSelector('select[name=hostHouseholdId]');
const withCohen = await dad.$$eval('select[name=hostHouseholdId] option', (els) =>
  els.map((e) => e.textContent.trim()),
);
check('and is immediately pickable', withCohen.includes('משפחת כהן'));
await dad.selectOption('select[name=hostHouseholdId]', { label: 'משפחת כהן' });
await dad.click('button[type=submit]');
await dad.waitForSelector('text=מתארחים אצל משפחת כהן');
check('answering at them works', await dad.isVisible('text=מתארחים אצל משפחת כהן'));

await dad.goto(`${BASE}/families`);
check('a family nobody has joined is marked', await dad.isVisible('text=טרם הצטרפו'));

// nothing is inherited: the newcomer never sees them
await newcomer.goto(BASE);
await newcomer.click('text=שינוי תשובה');
await newcomer.waitForSelector('text=מתארחים אצל…');
await newcomer.click('text=מתארחים אצל…');
await newcomer.waitForSelector('select[name=hostHouseholdId]');
const newcomerSees = await newcomer.$$eval('select[name=hostHouseholdId] option', (els) =>
  els.map((e) => e.textContent.trim()),
);
check('and nobody else inherits them', !newcomerSees.includes('משפחת כהן'));

// ── picking families out of the address book ─────────────────────────────────
// Chromium has no Contact Picker, so we hand the page one. What is being tested
// is what the app does with the contacts, not the browser's picker.
const UNKNOWN = '054-000-1122';
await dad.context().addInitScript(
  ([known, unknown]) => {
    Object.defineProperty(navigator, 'contacts', {
      value: {
        select: async () => [
          { name: ['דנה'], tel: [known] },
          { name: ['שכנים'], tel: [unknown] },
        ],
      },
      configurable: true,
    });
  },
  [NEWCOMER, UNKNOWN],
);

await dad.goto(`${BASE}/families`);
const danaRow = dad.locator('li', { hasText: 'דנה ויוסי' });
await danaRow.locator('text=הסתרה').click();
await dad.waitForTimeout(1200);

await dad.goto(`${BASE}/families`);
check('the picker appears when the browser has one', await dad.isVisible('text=בחירה מאנשי הקשר'));
await dad.click('text=בחירה מאנשי הקשר');
await dad.waitForSelector('text=נוספו:');
check('a contact already in the app is connected', await dad.isVisible('text=נוספו: דנה ויוסי'));
check('a contact who is not gets an invite', await dad.isVisible('text=שכנים'));
const inviteHref = await dad.getAttribute('li:has-text("שכנים") >> a', 'href');
check(`the invite is addressed to their number (${inviteHref?.slice(0, 24)}…)`,
  Boolean(inviteHref?.startsWith('https://wa.me/972540001122?text=')));

// ── stepping between holidays still works ────────────────────────────────────
await dad.goto(BASE);
const firstHoliday = (await dad.innerText('.font-display')).trim();
await dad.click('[aria-label="החג הבא"]');
await dad.waitForURL(/\?h=rosh_hashana_ii_2026/);
check(`the arrow moves to the next holiday (${firstHoliday} → ${(await dad.innerText('.font-display')).trim()})`,
  (await dad.innerText('.font-display')).trim() !== firstHoliday);

// ── history: counts, and correcting the record ───────────────────────────────
await dad.click('nav >> text=היסטוריה');
await dad.waitForURL('**/history');
check('past holidays are listed', await dad.isVisible('text=ערב פסח'));

const stats = await dad.$$eval('.tabular-nums', (els) => els.map((e) => e.textContent.trim()));
check(`three counts, and they add up (${stats.join(' / ')})`,
  stats.length === 3 && Number(stats[0]) + Number(stats[1]) === Number(stats[2]));

const beforeEdit = rows('Answers').length;
const pastRow = dad.locator('li', { hasText: 'ערב פסח' });
await pastRow.getByText('עריכה').click();
// It opens on the answer that is already there — a guest — so switch first.
await pastRow.getByRole('button', { name: 'בעצם אירחנו' }).click();
await pastRow.getByRole('button', { name: 'אירחנו', exact: true }).click();
await dad.waitForTimeout(1500);
check('editing a past holiday appends rather than overwrites',
  rows('Answers').length === beforeEdit + 1);

await dad.goto(`${BASE}/history`);
const corrected = await dad.$$eval('.tabular-nums', (els) => els.map((e) => e.textContent.trim()));
check(`the counts follow the correction (${stats.join('/')} → ${corrected.join('/')})`,
  Number(corrected[0]) === Number(stats[0]) + 1);

// ── the log stays keys-only ──────────────────────────────────────────────────
const a = rows('Answers').at(-1);
check(`the log holds five columns and no names (${a.join(' | ')})`,
  a.length === 5 && !a.some((v) => /[֐-׿]/.test(v)));

await browser.close();
console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exitCode = failures ? 1 : 0;
