/**
 * End-to-end smoke test of phases 1 and 2, against a real browser.
 *
 *   npm run seed:holidays        # once, if .dev-sheet.json has no Holidays
 *   npm run fixtures             # families, plus one past holiday for the history
 *   # mark an upcoming holiday include=TRUE in .dev-sheet.json
 *   npm run build && SESSION_SECRET=test npm start -- --port 3111
 *   npm run test:smoke
 */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const BASE = process.env.SMOKE_URL ?? 'http://localhost:3111';
const SHEET = '.dev-sheet.json';
// Nobody has registered this one, so the run is repeatable.
const NEW_PHONE = `05${String(Date.now()).slice(-8)}`;
const DAD_PHONE = '050-123-4567';

const sheet = () => JSON.parse(readFileSync(SHEET, 'utf8'));
const rows = (tab) => (sheet()[tab] ?? []).slice(1);

let failures = 0;
function check(label, ok) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) failures += 1;
}

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const open = async () => (await browser.newContext({ viewport: { width: 390, height: 780 } })).newPage();

// ── the brother: a number the sheet has never seen ────────────────────────────
const brother = await open();
await brother.goto(BASE);
await brother.fill('input[name=phone]', NEW_PHONE);
await brother.click('button[type=submit]');
await brother.waitForSelector('select[name=householdId]');
check('unknown number lands on registration', await brother.isVisible('text=נעים להכיר'));

const options = await brother.$$eval('select[name=householdId] option', (els) =>
  els.map((e) => e.textContent.trim()).filter((t) => t !== 'בחרו מהרשימה'),
);
const activeInSheet = rows('Households').filter((r) => r[2] === 'TRUE').map((r) => r[1]);
check(`dropdown lists exactly the active families (${options.join(', ')})`,
  options.length === activeInSheet.length && activeInSheet.every((n) => options.includes(n)));
check('no way to create a family from the app', !(await brother.isVisible('text=משפחה חדשה')));

await brother.fill('input[name=name]', 'אח');
await brother.selectOption('select[name=householdId]', 'hh_brother');
await brother.click('button[type=submit]');
await brother.waitForSelector('text=איפה אתם בחג?');
check('a People row was appended', rows('People').some((r) => r[1] === 'אח' && r[2] === 'hh_brother'));

const holidayName = (await brother.innerText('.font-display')).trim();
check(`next holiday is the soonest included one (${holidayName})`, holidayName.length > 0);

// ── the brother is a guest at the parents ─────────────────────────────────────
const before = rows('Answers').length;
await brother.click('text=מתארחים אצל…');
await brother.waitForSelector('select[name=hostHouseholdId]');
await brother.selectOption('select[name=hostHouseholdId]', 'hh_parents');
await brother.click('button[type=submit]');
await brother.waitForSelector('text=מתארחים אצל אבא ואמא');
check('answer shown back', await brother.isVisible('text=מתארחים אצל אבא ואמא'));
check('host phone offered to call', await brother.isVisible('a[href="tel:+972501234567"]'));
check('exactly one row appended', rows('Answers').length === before + 1);

const a = rows('Answers').at(-1);
check(`answer row is right (${a.join(' | ')})`,
  a[1] === 'erev_rosh_hashana_2026' && a[2] === 'guest' && a[3] === 'hh_parents');
check(`the log holds five columns and nothing derivable (${a.length})`, a.length === 5);
check('the log stores no names', !a.some((v) => /[\u0590-\u05FF]/.test(v)));
check('the answer records who answered, by phone', /^\+\d{9,}$/.test(a[4]));

// ── the parents host, and see who is coming ───────────────────────────────────
const dad = await open();
await dad.goto(BASE);
await dad.fill('input[name=phone]', DAD_PHONE);
await dad.click('button[type=submit]');
await dad.waitForSelector('text=איפה אתם בחג?');
check('a known number skips registration', !(await dad.isVisible('select[name=householdId]')));

await dad.click('text=אנחנו מארחים');
await dad.waitForSelector('text=מגיעים אליכם');
check('hosting shows who is coming', await dad.isVisible('text=אח ואשתו'));

// ── the parents change their mind: now the brother is going nowhere ───────────
await dad.click('text=שינוי תשובה');
await dad.waitForSelector('text=מתארחים אצל…');
await dad.click('text=מתארחים אצל…');
await dad.waitForSelector('select[name=hostHouseholdId]');
await dad.selectOption('select[name=hostHouseholdId]', 'hh_sister');
await dad.click('button[type=submit]');
await dad.waitForSelector('text=מתארחים אצל אחות ובעלה');

await brother.reload();
check('the guest is warned their host is not hosting',
  await brother.isVisible('text=שימו לב — הם ענו שהם מתארחים'));

const conflicts = rows('Conflicts');
check(`the conflict reached the sheet (${conflicts.length} row)`,
  conflicts.length === 1 && conflicts[0][1] === 'hh_brother' && conflicts[0][2] === 'hh_parents');
check('the answering household is shown on screen', await brother.isVisible('text=אח ואשתו'));

// ── the conflict clears itself when the parents host again ───────────────────
await dad.click('text=שינוי תשובה');
await dad.waitForSelector('text=אנחנו מארחים');
await dad.click('text=אנחנו מארחים');
await dad.waitForSelector('text=מגיעים אליכם');
check('the conflict row is removed once it is resolved', rows('Conflicts').length === 0);

await brother.reload();
check('and the warning disappears for the guest',
  !(await brother.isVisible('text=שימו לב — הם ענו שהם מתארחים')));

// ── history ──────────────────────────────────────────────────────────────────
await dad.click('text=איפה היינו בחגים קודמים');
await dad.waitForURL('**/history');
check('past holidays are listed', await dad.isVisible('text=היינו אצל טמיר ואפיק'));
check('the upcoming holiday is not in the history', !(await dad.isVisible(`text=${holidayName}`)));

// ── the cookie remembers, and nonsense is refused ────────────────────────────
const again = await open();
await again.goto(BASE);
check('a fresh browser is asked to sign in', await again.isVisible('input[name=phone]'));
await dad.goto(BASE);
check('returning visit skips sign-in entirely', !(await dad.isVisible('input[name=phone]')));

await again.fill('input[name=phone]', '123');
await again.click('button[type=submit]');
await again.waitForSelector('[role=alert]');
check(`nonsense number is rejected (${(await again.innerText('[role=alert]')).trim()})`,
  (await again.innerText('[role=alert]')).trim() === 'מספר הטלפון לא נראה תקין');

await browser.close();
console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exitCode = failures ? 1 : 0;
