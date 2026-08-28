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
await dad.goto(`${BASE}/families`);
await dad.waitForSelector('text=המשפחות שלי');
const beforeInvite = rows('Invites').length;
await dad.click('text=יצירת קישור הזמנה');
await dad.waitForSelector('text=/\\/join\\//');
check('an invite link is created', rows('Invites').length === beforeInvite + 1);
const token = rows('Invites').at(-1)[0];

const newcomer = await open();
await newcomer.goto(`${BASE}/join/${token}`);
await newcomer.fill('input[name=phone]', NEWCOMER);
await newcomer.click('button[type=submit]');
await newcomer.waitForSelector('input[name=householdName]');
check('the invite names who invited them', await newcomer.isVisible('text=אבא ואמא'));
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

// ── hiding is one-sided ──────────────────────────────────────────────────────
await dad.goto(`${BASE}/families`);
await dad.waitForSelector('text=המשפחות שלי');
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

// ── stepping between holidays still works ────────────────────────────────────
await dad.goto(BASE);
const firstHoliday = (await dad.innerText('.font-display')).trim();
await dad.click('[aria-label="החג הבא"]');
await dad.waitForURL(/\?h=rosh_hashana_ii_2026/);
check(`the arrow moves to the next holiday (${firstHoliday} → ${(await dad.innerText('.font-display')).trim()})`,
  (await dad.innerText('.font-display')).trim() !== firstHoliday);

// ── the log stays keys-only ──────────────────────────────────────────────────
const a = rows('Answers').at(-1);
check(`the log holds five columns and no names (${a.join(' | ')})`,
  a.length === 5 && !a.some((v) => /[֐-׿]/.test(v)));

await browser.close();
console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exitCode = failures ? 1 : 0;
